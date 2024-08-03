import * as vscode from 'vscode';
import * as dap from './dap';
import * as utils from './utils';
import * as sm from './special_member';

export interface IVariable {
    /* 
    * Expression to access variable
    */
    evaluateName: string;
    /* 
    * Memory address of variable value
    */
    memoryReference: string;
    /**
     * Real tag of node without 'T_' prefix.
     */
    nodeTag: string | undefined;
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
            /* 
             * NodeTag has following representation:
             * [spaces] T_*tag_name* [= *number*],
             * 
             * We must obtain only *tag_name* part, because 'T_' prefix
             * is constant and not important and *number* also not 
             * important because we must focus on words, not numbers - if
             * there was garbage in structure, Node->type will be random numbers.
             * That is how we find garbage.
             */
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
        return utils.getPointersCount(type) === 1
            && this.nodeTypes.has(utils.getStructNameFromType(type));
    }

    /**
     * Check if passed string is valid NodeTag and registered NodeTag
     * 
     * @param tag String to test
     */
    isNodeTag(tag: string) {
        return this.nodeTypes.has(tag);
    }

    /**
     * Check variable can be casted to Node and it's value is valid
     * 
     * @param variable Variable to test
     * @returns true if variable is of Node type with valid value
     */
    isValidNodeVar(variable: IVariable) {
        return this.isNodeVar(variable.type) && utils.isValidPointer(variable.value);
    }
}

export class NodePreviewTreeViewProvider implements vscode.TreeDataProvider<IVariable> {
    /**
     * Double map: NodeTag -> (Member Name -> SpecialMember object).
     */
    private readonly specialMembers: Map<string, Map<string, sm.SpecialMember>>;
    
    constructor(
        private log: utils.ILogger,
        private nodeVars: NodeVarFacade,
        private debug: utils.IDebuggerFacade) {
        this.specialMembers = new Map();
    }

    /**
     * Add new special members to existing.
     * 
     * @param members Special members to add
     */
    addSpecialMembers(members: sm.SpecialMember[]) {
        for (const member of members) {
            if (!this.nodeVars.isNodeTag(member.nodeTag)) {
                this.log.warn(`NodeTag ${member.nodeTag} does not exists`);
                continue;
            }

            const typeMembers = this.specialMembers.get(member.nodeTag);
            if (!typeMembers) {
                this.specialMembers.set(member.nodeTag, new Map([[member.memberName, member]]));
                continue;
            }

            typeMembers.set(member.memberName, member);
        }
    }

    /* https://code.visualstudio.com/api/extension-guides/tree-view#updating-tree-view-content */
    private _onDidChangeTreeData = new vscode.EventEmitter<IVariable | undefined | null | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getSpecialMember(variable: IVariable): sm.SpecialMember | undefined {
        if (!variable.parent?.nodeTag) {
            return;
        }

        const typeMembers = this.specialMembers.get(variable.parent.nodeTag);
        if (!typeMembers?.size) {
            return;
        }
        if (!typeMembers?.size) {
            return;
        }

        const specialMember = typeMembers.get(variable.name);
        if (!specialMember) {
            return;
        }

        if (!specialMember.isSpecialMember(variable)) {
            return;
        }

        return specialMember;
    }

    async getTreeItem(variable: IVariable) {
        const validPointer = utils.isValidPointer(variable.value);
        let collapsibleState = vscode.TreeItemCollapsibleState.None;

        if (utils.isRawStruct(variable)) {
            /* Raw structs must have members and can not have 'inheritance' */
            collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
        } else if (validPointer) {
            if (this.nodeVars.isNodeVar(variable.type)) {
                /* All Node variables can be expanded - they have members */
                collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
            } else {
                /* Also treat special variables */
                const specialVariable = this.getSpecialMember(variable);
                if (specialVariable) {
                    if (specialVariable.isExpandable(variable)) {
                        collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
                    }
                }
            }
        }

        let label = undefined;
        if (variable.nodeTag) {
            const declaredTag = utils.getStructNameFromType(variable.type);
            if (declaredTag !== variable.nodeTag) {
                label = `${variable.name}: ${variable.type} [${variable.nodeTag}] = `;
            }
        }
        if (!label) {
            label = `${variable.name}: ${variable.type} = `;
        }

        return {
            label,
            description: variable.value,
            collapsibleState,
            tooltip: variable.declaredType
                ? `Declared type: ${variable.declaredType}\nReal NodeTag: ${variable.nodeTag ?? "???"}`
                : undefined,
        } as vscode.TreeItem;
    }

    getNodeTagFromType(type: string) {
        return utils.getStructNameFromType(type);
    }

    getFrame(element?: IVariable | undefined): number | undefined {
        if (element) {
            return element.frameId;
        }

        return (vscode.debug.activeStackItem as vscode.DebugStackFrame | undefined)?.frameId;
    }

    async getChildren(element?: IVariable | undefined) {
        if (!this.debug.isInDebug) {
            return;
        }

        const subvariables = element
            ? await this.getVariableMembers(element)
            : await this.getTopLevelVariables();

        if (!subvariables) {
            return subvariables;
        }

        /* 
         * Process all children and obtain real node tags where possible.
         * Do not evaluate members right now, because it will help further.
         */
        for (const variable of subvariables.filter(v => this.nodeVars.isValidNodeVar(v))) {
            const realNodeTag = await this.getRealNodeTag(variable);
            if (!this.isValidNodeTag(realNodeTag)) {
                /* Garbage */
                variable.nodeTag = undefined;
                continue;
            }
            variable.nodeTag = realNodeTag;
        }

        return subvariables;
    }

    isValidNodeTag(nodeTag: string) {
        /* 
         * Valid NodeTag must contain only alphabetical characters.
         * Note: it does not contain 'T_' prefix - we strip it always.
         */
        return /^[a-zA-Z]+$/.test(nodeTag);
    }

    async getRealNodeTag(nodeVariable: IVariable) {
        const response = await this.debug.evaluate(`((Node*)(${nodeVariable.evaluateName}))->type`, nodeVariable.frameId);
        if (response.result.startsWith('T_')) {
            const nodeTag = response.result.substring(2);
            return nodeTag;
        }
        return response.result;
    }

    async castToNode(variable: IVariable, targetNodeTag: string) {
        let structName = targetNodeTag.trim();

        /* T_IntList and T_OidList are struct List */
        if (structName === 'IntList' || structName === 'OidList') {
            structName = 'List';
        }

        /* If real and declared types equal - return early */
        if (variable.type.indexOf(structName) !== -1) {
            variable.nodeTag = targetNodeTag;
            return variable;
        }

        const resultType = utils.substituteStructName(variable.type, structName);
        const newVarExpression = `((${resultType})${variable.evaluateName})`;
        const response = await this.debug.evaluate(newVarExpression, variable.frameId);
        return {
            ...variable,
            nodeTag: targetNodeTag,
            evaluateName: newVarExpression,
            type: resultType,
            declaredType: variable.type,
            memoryReference: response.memoryReference,
            value: response.result,
            variablesReference: response.variablesReference,
        } as IVariable;
    }

    async getTopLevelVariables() {
        const frame = vscode.debug.activeStackItem as vscode.DebugStackFrame | undefined;
        if (!frame || !frame.frameId) {
            return;
        }

        const scopes = await this.debug.getScopes(frame.frameId);
        const variables = (await Promise.all(scopes
            .filter(s => s.presentationHint === 'locals' || s.presentationHint === 'arguments')
            .map(s => this.debug.getVariables(s.variablesReference))))
            .reduce((cur, acc) => [...acc, ...cur], [])
            .map(v => ({
                ...v,
                declaredType: v.type,
                parent: undefined,
                frameId: frame.frameId,
            } as IVariable));
        return variables;
    }

    async getVariableMembers(element: IVariable) {
        let variable = element;
        let subvariables: dap.DebugVariable[] | undefined;

        if (variable.nodeTag !== undefined) {
            variable = await this.castToNode(element, variable.nodeTag);
        }

        const specialMember = this.getSpecialMember(variable);
        if (specialMember) {
            const processResult = await specialMember.visitMember(variable, this.debug);
            if (processResult) {
                [variable, subvariables] = processResult;
            }
        }

        if (!subvariables) {
            subvariables = await this.debug.getVariables(variable.variablesReference);
        }

        return subvariables!.map(v => ({
            ...v,
            frameId: variable.frameId,
            parent: variable,
        }) as IVariable);
    }
}

export async function dumpVariableToLogCommand(args: any, log: utils.ILogger, debug: utils.IDebuggerFacade) {
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

    try {
        /* Simple `pprint(Node*) call, just like in gdb */
        await debug.evaluate(`-exec call pprint(${variable.evaluateName})`, frameId);
    } catch (err: any) {
        log.error(`could not dump variable ${variable.name} to log`, err);
    }
}

export class Configuration {
    static ExtensionName = 'postgresql-hacker-helper';
    static ExtensionPrettyName = 'PostgreSQL Hacker Helper';
    static ConfigSections = {
        TopLevelSection: `${this.ExtensionName}`,
        NodeTagFiles: 'nodeTagFiles',
        LogLevel: 'logLevel',
        fullSection: (section: string) => `${this.ExtensionName}.${section}`,
    };
    static Commands = {
        DumpNodeToLog: `${this.ExtensionName}.dumpNodeToLog`,
        OpenConfigFile: `${this.ExtensionName}.openConfigurationFile`,
        RefreshPostgresVariables: `${this.ExtensionName}.refreshPostgresVariablesView`
    };
    static Views = {
        NodePreviewTreeView: `${this.ExtensionName}.node-tree-view`
    }
    static ExtensionSettingsFileName = 'pgsql_hacker_helper_properties.json'
}