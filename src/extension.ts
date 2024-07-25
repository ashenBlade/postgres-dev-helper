import * as vscode from 'vscode';
import { EvaluateArguments, EvaluateResponse, VariablesArguments, VariablesResponse, DebugVariable, ScopesResponse, ScopesArguments, Scope } from './dap';

export function activate(context: vscode.ExtensionContext) {    
    if (!vscode.workspace.workspaceFolders) {
        return;
    }

    const ExtensionName = 'postgresql-hacker-helper';
    const log = vscode.window.createOutputChannel(ExtensionName, 'log');
    let nodeTypes = new Set<string>(['Expr', 'Node']);

    vscode.workspace.workspaceFolders.forEach(folder => {
        ['/src/include/nodes/nodes.h', '/src/include/nodes/nodetags.h'].forEach(path => {
            vscode.workspace.openTextDocument(vscode.Uri.file(folder.uri.fsPath + path)).then(document => {
                const text = document.getText();
                try {
                    text.split('\n')
                        .map(line => line.trim())
                        .filter(line => line.startsWith("T_"))
                        .map(line => line.replaceAll(',', '').replace('T_', '').split(' ', 1)[0])
                        .forEach(tag => nodeTypes.add(tag));
                } catch (err: any) {
                    log.appendLine(`ERROR: could not initialize node tags array - ${err.toString()}`);
                }
            }, _ => {
                log.appendLine(`WARN: could not open file ${path} to obtain node tags`);
            });
        });
    });

    function getStructNameFromType(type: string) {
        /* [const] [struct] NAME [*]+ */
        let index = 0;
        const typeParts = type.split(' ');
        if (typeParts[0] === 'const') {
            if (typeParts[1] === 'struct') {
                index = 2;
            } 
            index = 1;
        } else if (typeParts[0] === 'struct') {
            index = 1;
        }
        return typeParts[index];
    }

    function substituteStructName(type: string, struct: string) {
        /* [const] [struct] NAME [*]+ */
        let index = 0;
        const typeParts = type.split(' ');
        if (typeParts[0] === 'const') {
            if (typeParts[1] === 'struct') {
                index = 2;
            } 
            index = 1;
        } else if (typeParts[0] === 'struct') {
            index = 1;
        }
        typeParts[index] = struct;
        return typeParts.join(' ');
    }

    function isNodeVar(variable: IVariable | DebugVariable) {
        return nodeTypes.has(getStructNameFromType(variable.type));
    }

    function isValidNodeValue(value: string) {
        /* Looks like memory address but not NULL */
        return /^0x[0-9abcdef]+$/i.test(value) && value !== '0x0';
    }

    function isValidNodeVar(variable: IVariable) {
        return isNodeVar(variable) && isValidNodeValue(variable.value);
    }

    async function evaluate(session: vscode.DebugSession, expression: string, frameId: number, context?: string): Promise<EvaluateResponse> {
        context ??= 'repl';
        return await session.customRequest('evaluate', { expression, context, frameId } as EvaluateArguments);
    }

    async function getVariables(session: vscode.DebugSession, variablesReference: number): Promise<DebugVariable[]> {
        const response: VariablesResponse = await session.customRequest('variables', { variablesReference } as VariablesArguments);
        return response.variables;
    }

    async function getScopes(session: vscode.DebugSession, frameId: number): Promise<Scope[]> {
        const response: ScopesResponse = await session.customRequest('scopes', { frameId } as ScopesArguments);
        return response.scopes;
    }

    interface IVariable {
        /* 
         * Expression to access variable
         */
        evaluateName: string;
        /* 
         * Memory address of variable value
         */
        memoryReference: string;
        /* 
         * Raw variable name (variable/struct member)
         */
        name: string;
        /* 
         * Real variable type (maybe with tag inspection)
         */
        type: string;
        /* 
         * Declared type of variable
         */
        declaredType?: string;
        /* 
         * Evaluate value of variable.
         * May be empty for structs (no pointers)
         */
        value: string;
        /* 
         * Number to use in requests to work with DAP.
         * I.e. get subvariables
         */
        variablesReference: number;
        /* 
         * Id of frame, where we should access this variable
         */
        frameId: number;
        /* 
         * Parent of this variable.
         * May be undefined for usual variables, and 
         * must be defined if current element - member
         */
        parent?: IVariable
    }
    
    class NodeTreeViewProvider implements vscode.TreeDataProvider<IVariable> {
        /* https://code.visualstudio.com/api/extension-guides/tree-view#updating-tree-view-content */
        private _onDidChangeTreeData = new vscode.EventEmitter<IVariable | undefined | null | void>();
        readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
        refresh(): void {
            this._onDidChangeTreeData.fire();
        }

        async getTreeItem(element: IVariable) {
            const isNodeType = isNodeVar(element);
            
            let collapsibleState = vscode.TreeItemCollapsibleState.None;
            if (isNodeType || element.value === '') {
                collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
            }
            
            /* ListCell is not Node, but we can expand this array */
            if (element.type === 'ListCell *' &&
                element.name === 'elements' &&
                element.parent?.type === 'List *') {
                collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
            }
            
            return { 
                label: `${element.name}: ${element.type} = `,
                description: element.value,
                collapsibleState,
                tooltip: element.declaredType
                    ? `Declared type: ${element.declaredType}`
                    : undefined,
            } as vscode.TreeItem;
        }
        
        getFrame(element?: IVariable | undefined): number | undefined {
            if (element) {
                return element.frameId;
            }

            return (vscode.debug.activeStackItem as vscode.DebugStackFrame | undefined)?.frameId;
        } 

        async getRealNodeTag(nodeVariable: IVariable, session: vscode.DebugSession) {
            const response = await evaluate(session, `((Node*)(${nodeVariable.evaluateName}))->type`, nodeVariable.frameId);
            return response.result;
        }

        async castToNode(nodeVariable: IVariable, nodeTag: string, session: vscode.DebugSession) {
            let structName = nodeTag.replace('T_', '').trim();
            
            /* T_IntList and T_OidList are List */
            if (structName === 'IntList' || structName === 'OidList') {
                structName = 'List';
            }
            
            /* If real and declared types equal - return early */
            if (nodeVariable.type.indexOf(structName) !== -1) {
                return nodeVariable;
            }
            
            const resultType = substituteStructName(nodeVariable.type, structName);
            const newVarExpression = `((${resultType})${nodeVariable.evaluateName})`;
            const response = await evaluate(session, newVarExpression, nodeVariable.frameId);
            return {
                ...nodeVariable,
                evaluateName: newVarExpression,
                type: resultType,
                declaredType: nodeVariable.type,
                memoryReference: response.memoryReference,
                value: response.result,
                variablesReference: response.variablesReference,
            } as IVariable;
        }

        async getTopLevelVariables(session: vscode.DebugSession) {
            const frame = vscode.debug.activeStackItem as vscode.DebugStackFrame | undefined;
            if (!frame || !frame.frameId) {
                return;
            }

            const scopes = await getScopes(session, frame.frameId);
            const variables = (await Promise.all(scopes
                .filter(s => s.presentationHint === 'locals' || s.presentationHint === 'arguments')
                .map(s => getVariables(session, s.variablesReference))))
                .reduce((cur, acc) => [...acc, ...cur], [])
                .map(v => ({
                    ...v,
                    declaredType: v.type,
                    parent: undefined,
                    frameId: frame.frameId,
                } as IVariable));
            return variables;
        }

        async getVariableMembers(element: IVariable, session: vscode.DebugSession) {
            let variable = element;
            let subvariables: DebugVariable[] | undefined;
            
            if (isValidNodeVar(element)) {
                const nodeTag = await this.getRealNodeTag(element, session);
                /* 
                 * Debugger can return random numbers for NodeTag if there was garbage
                 */
                if (!/\d+/.test(nodeTag)) {
                    variable = await this.castToNode(element, nodeTag, session);
                }
            }

            /* Some types may have intrinsics */

            /* List* */
            if (element.type === 'ListCell *' &&
                element.parent?.type === 'List *' &&
                isValidNodeValue(element.value)
            ) {
                const listLength = Number((await evaluate(session, `(${element.parent.evaluateName})->length`, element.parent.frameId)).result);
                if (Number.isNaN(listLength)) {
                    log.appendLine(`Fail to obtain list size for ${element.parent.name}`);
                }
                if (0 < listLength) {
                    const listTag = (await evaluate(session, `(${element.parent.evaluateName})->type`, element.parent.frameId)).result;
                    if (listTag === 'T_List') {
                        /* 
                         * Most `List`s are of Node type, so
                         * small performance optimization - treat `elements`
                         * as Node* array (pointer has compatible size)
                         */
                        const expression = `(Node **)(${element.evaluateName}), ${listLength}`;

                        const response = await evaluate(session, expression, element.frameId);
                        variable = {
                            ...element,
                            type: 'Node **',
                            declaredType: element.type,
                            evaluateName: expression,
                            variablesReference: response.variablesReference,
                        } as IVariable;
                    } else {
                        /* 
                         * We can not just cast `elements` to int* or Oid* 
                         * due to padding in `union`.
                         * For these we iterate each element and evaluate each 
                         * item independently
                         */
                        let fieldName;
                        let realType;
                        if (listTag === 'T_IntList') {
                            fieldName = 'int_value';
                            realType = 'int';
                        } else {
                            fieldName = 'oid_value';
                            realType = 'Oid';
                        }
                        

                        const variables: DebugVariable[] = [];
                        const frameId = element.frameId;
                        for (let i = 0; i < listLength; i++) {
                            const expression = `(${element.evaluateName})[${i}].${fieldName}`;
                            const response = await evaluate(session, expression, frameId);
                            variables.push({
                                name: `[${i}]`,
                                type: realType,
                                evaluateName: expression,
                                variablesReference: response.variablesReference,
                                value: response.result,
                                memoryReference: response.memoryReference,
                            });
                        }
                        subvariables = variables;
                    }
                }
            }
            
            /* PlannerInfo* */
            if ((element.name === 'simple_rel_array' || element.name === 'simple_rte_array')
                 && element.parent?.type === 'PlannerInfo *') {
                const memberExpression = `(${element.parent.evaluateName})->simple_rel_array_size`;
                const rteArrayLength = Number((await evaluate(session, memberExpression, element.parent.frameId)).result);
                if (0 < rteArrayLength) {
                    const response = await evaluate(session, `${element.evaluateName}, ${rteArrayLength}`, element.frameId);
                    variable = {
                        ...variable,
                        variablesReference: response.variablesReference
                    };
                }
            }

            if (!subvariables) {
                subvariables = await getVariables(session, variable.variablesReference);
            }

            return subvariables!.map(v => ({
                ...v,
                frameId: variable.frameId,
                parent: variable,
            }) as IVariable);
        }

        async getChildren(element?: IVariable | undefined) {
            const session = vscode.debug.activeDebugSession;
            if (!session) {
                log.appendLine('WARN: No active debug session found');
                return;
            }

            if (element) {
                return await this.getVariableMembers(element, session);
            } else {
                return await this.getTopLevelVariables(session);
            }
        }

        getParent(element: IVariable): vscode.ProviderResult<IVariable> {
            return element.parent;
        }
    }

    const dumpVarsToLogCmd = vscode.commands.registerCommand(`${ExtensionName}.dumpNodeToLog`, async (args) => {
        const session = vscode.debug.activeDebugSession;
        if (!session) {
            vscode.window.showInformationMessage('no active debug session');
            return;
        }

        const variable = args.variable;
        if (!variable) {
            log.appendLine('Variable info not present in args');
            return;
        }
        
        const frameId = (vscode.debug.activeStackItem as vscode.DebugStackFrame | undefined)?.frameId;
        if (frameId === undefined) {
            log.appendLine('Could not find active stack frame');
            return;
        }

        /* Simple `pprint(Node*) call, just like in gdb */
        await evaluate(session, `-exec call pprint(${variable.evaluateName})`, frameId);
    });
    
    const dataProvider = new NodeTreeViewProvider();
    const treeDisposable = vscode.window.registerTreeDataProvider(`${ExtensionName}.node-tree-view`, dataProvider);
    vscode.debug.onDidChangeActiveStackItem(() => dataProvider.refresh(), context.subscriptions);
    
    context.subscriptions.push(dumpVarsToLogCmd);
    context.subscriptions.push(treeDisposable);
    context.subscriptions.push(log);
}

export function deactivate() {}
