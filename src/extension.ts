import * as vscode from 'vscode';
import * as dap from './dap';
import { isRawStruct, substituteStructName, evaluate, getVariables, getScopes, getPointersCount, getStructNameFromType, ILogger, isValidPointer } from './utils';

export interface IVariable {
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

export class NodeVarFacade {
    private readonly nodeTypes: Set<string> = new Set<string>(['Node', 'Expr']);
    /* 
     * Update stored node types for internal usage from provided
     * node tag file. i.e. `nodes.h' or `nodetags.h'.
     */
    updateNodeTypesFromFile(file: vscode.TextDocument) {
        for (let lineNo = 0; lineNo < file.lineCount; lineNo++) {
            const line = file.lineAt(lineNo);
            if (line.isEmptyOrWhitespace) {
                continue;
            }

            const text = line.text.trim();
            if (!text.startsWith('T_')) {
                continue;
            }

            const tag = text.replaceAll(',', '').replace('T_', '').split(' ', 1)[0];
            if (tag.trim() === '') {
                continue;
            }

            this.nodeTypes.add(tag);
        }
    }

    /**
     * Check provided type is derived from Node. That is, we can obtain
     * NodeTag from it.
     * 
     * @param type Type of variable
     * @returns true if provided type is derived from Node
     */
    isNodeVar(type: string) {
        /* 
         * Valid Node variable must have type in this form:
         * [const] [struct] NAME *
         * 
         * Optional `const' and `struct' keywords follows NAME - target struct name.
         * If NAME in our nodeTypes set - this is what we want. But also, we
         * should take number of pointers into account, because:
         *  - If this is a raw struct (no pointers) - no casting needed because 
         *      it's size (and fields) is already known
         *  - As for pointer - only single `*' creates valid Node* variable that we can 
         *      work with
         */
        return getPointersCount(type) === 1
            && this.nodeTypes.has(getStructNameFromType(type));
    }

    /**
     * Check variable can be casted to Node and it's value is valid
     * 
     * @param variable Variable to test
     * @returns true if variable is of Node type with valid value
     */
    isValidNodeVar(variable: IVariable) {
        return this.isNodeVar(variable.type) && isValidPointer(variable.value);
    }
}


export class NodePreviewTreeViewProvider implements vscode.TreeDataProvider<IVariable> {
    constructor(private log: ILogger, private nodeVars: NodeVarFacade) { }

    /* https://code.visualstudio.com/api/extension-guides/tree-view#updating-tree-view-content */
    private _onDidChangeTreeData = new vscode.EventEmitter<IVariable | undefined | null | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    async getTreeItem(variable: IVariable) {
        const validPointer = isValidPointer(variable.value);

        let collapsibleState = vscode.TreeItemCollapsibleState.None;

        /* 
         * We expand Node variable or plain struct (not pointer).
         */
        if (validPointer || isRawStruct(variable)) {
            collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
        }

        /* ListCell is not Node, but we should expand this array */
        if (validPointer &&
            variable.type === 'ListCell *' &&
            variable.name === 'elements' &&
            variable.parent?.type.indexOf('List *') !== -1) {
            collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
        }

        /* TODO: проверить планировщик */

        return {
            label: `${variable.name}: ${variable.type} = `,
            description: variable.value,
            collapsibleState,
            tooltip: variable.declaredType
                ? `Declared type: ${variable.declaredType}`
                : undefined,
        } as vscode.TreeItem;
    }

    getFrame(element?: IVariable | undefined): number | undefined {
        if (element) {
            return element.frameId;
        }

        return (vscode.debug.activeStackItem as vscode.DebugStackFrame | undefined)?.frameId;
    }

    async getChildren(element?: IVariable | undefined) {
        const session = vscode.debug.activeDebugSession;
        if (!session) {
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

    async getRealNodeTag(nodeVariable: IVariable, session: vscode.DebugSession) {
        const response = await evaluate(session, `((Node*)(${nodeVariable.evaluateName}))->type`, nodeVariable.frameId);
        return response.result;
    }

    async castToNode(nodeVariable: IVariable, nodeTag: string, session: vscode.DebugSession) {
        let structName = nodeTag.replace('T_', '').trim();

        /* T_IntList and T_OidList are T_List */
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
        let subvariables: dap.DebugVariable[] | undefined;

        if (this.nodeVars.isValidNodeVar(element)) {
            const nodeTag = await this.getRealNodeTag(element, session);

            /* 
             * Debugger can return random numbers for NodeTag if there was garbage
             */
            if (!/\d+/.test(nodeTag)) {
                variable = await this.castToNode(element, nodeTag, session);
            }
        }

        /* Some types may have intrinsics */

        /* List */
        if (element.type === 'ListCell *' &&
            element.parent?.type === 'List *' &&
            isValidPointer(element.value)) {
            const listLength = Number((await evaluate(session, `(${element.parent.evaluateName})->length`, element.parent.frameId)).result);
            if (Number.isNaN(listLength)) {
                this.log.warn(`fail to obtain list size for ${element.parent.name}`);
            }

            if (0 < listLength) {
                const listTag = (await evaluate(session, `(${element.parent.evaluateName})->type`, element.parent.frameId)).result;
                if (listTag === 'T_List') {
                    /* 
                     * Most `List`s are of Node type, so small performance optimization - 
                     * treat `elements` as Node* array (pointer has compatible size).
                     * Later we can observe each independently, but not now.
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
                     * We can not just cast `elements' to int* or Oid* 
                     * due to padding in `union'. For these we iterate 
                     * each element and evaluate each item independently
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


                    const variables: dap.DebugVariable[] = [];
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

        /* PlannerInfo */

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
}

export async function dumpVariableToLogCommand(args: any, log: ILogger) {
    const session = vscode.debug.activeDebugSession;
    if (!session) {
        vscode.window.showWarningMessage('Can not dump variable - no active debug session!');
        return;
    }

    const variable = args.variable;
    if (!variable) {
        log.info('Variable info not present in args');
        return;
    }

    const frameId = (vscode.debug.activeStackItem as vscode.DebugStackFrame | undefined)?.frameId;
    if (frameId === undefined) {
        log.info('Could not find active stack frame');
        return;
    }

    /* Simple `pprint(Node*) call, just like in gdb */
    await evaluate(session, `-exec call pprint(${variable.evaluateName})`, frameId);
}