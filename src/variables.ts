import * as vscode from 'vscode';
import * as utils from "./utils";
import * as dap from "./dap";
import * as constants from './constants';

export interface AliasInfo {
    alias: string;
    type: string;
}

/**
 * Registry for all known `NodeTag' enum values 
 */
export class NodeVarRegistry {
    /**
     * Known NodeTag values (without T_ prefix)
     */
    nodeTags: Set<string> = new Set<string>(constants.getDefaultNodeTags());

    /**
     * Known aliases for Node variables - `typedef'
     */
    aliases: Map<string, string> = new Map(constants.getDefaultAliases());

    /* 
     * Update stored node types for internal usage from provided
     * node tag file. i.e. `nodes.h' or `nodetags.h'.
     */
    updateNodeTypesFromFile(file: vscode.TextDocument) {
        let added = 0;
        for (let lineNo = 0; lineNo < file.lineCount; lineNo++) {
            /* 
             * NodeTag enum value has following representation:
             * 
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

            const tag = text.replace(',', '')
                            .replace('T_', '')
                            .split(' ', 1)[0];
            if (tag.trim() === '') {
                continue;
            }

            this.nodeTags.add(tag);
            added++;
        }
        return added;
    }

    addAliases(aliases: AliasInfo[]) {
        aliases.forEach(a => {
            this.aliases.set(a.alias.trim(), a.type.trim());
        });
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
         * 
         * Also, there might be aliases - check them also
         */
        let typeName = utils.getStructNameFromType(type);
        if (this.nodeTags.has(typeName) && utils.getPointersCount(type) === 1) {
            /* [const] [struct] NAME * */
            return true;
        }

        const alias = this.aliases.get(typeName);
        if (alias) {
            /* typedef NAME *ALIAS */
            type = utils.substituteStructName(type, alias);
            typeName = utils.getStructNameFromType(type);
            return this.nodeTags.has(typeName)
                && utils.getPointersCount(type) === 1;
        }

        return false;
    }

    /**
     * Check if passed string is valid NodeTag and registered NodeTag
     * 
     * @param tag String to test
     */
    isNodeTag(tag: string) {
        return this.nodeTags.has(tag);
    }
}

export interface ArraySpecialMemberInfo {
    typeName: string;
    memberName: string;
    lengthExpr: string;
}

export class SpecialMemberRegistry {
    /**
     * Double map: Type name -> (Member Name -> Info Object).
     */
    arraySpecialMembers: Map<string, Map<string, ArraySpecialMemberInfo>>;

    constructor() {
        this.arraySpecialMembers = new Map();
        this.addArraySpecialMembers(constants.getArraySpecialMembers());
    }

    addArraySpecialMembers(elements: ArraySpecialMemberInfo[]) {
        for (const element of elements) {
            const typeMap = this.arraySpecialMembers.get(element.typeName);
            if (typeMap === undefined) {
                this.arraySpecialMembers.set(element.typeName, new Map([
                    [element.memberName, element]
                ]));
            } else {
                typeMap.set(element.memberName, element);
            }
        }
    }

    getArraySpecialMember(parentType: string, memberName: string) {
        const parentTypeName = utils.getStructNameFromType(parentType);
        const membersMap = this.arraySpecialMembers.get(parentTypeName);
        if (membersMap === undefined) {
            return;
        }

        const info = membersMap.get(memberName);
        if (info === undefined) {
            return;
        }

        return info;
    }
}

export interface ExecContext {
    nodeVarRegistry: NodeVarRegistry;
    specialMemberRegistry: SpecialMemberRegistry;
    debug: utils.IDebuggerFacade;
}

export abstract class Variable {
    /** 
     * Raw variable name (variable/struct member)
     */
    name: string;

    /**
     * Real variable type (maybe with tag inspection)
     */
    type: string;

    /**
     * Evaluate value of variable.
     * May be empty for structs (no pointers)
     */
    value: string;

    /**
     * Parent of this variable.
     * May be undefined for usual variables, and 
     * must be defined if current element - member
     */
    parent?: Variable;

    constructor(name: string, value: string, type: string, parent?: Variable) {
        this.parent = parent;
        this.name = name;
        this.value = value;
        this.type = type;
    }

    /**
     * Get children of this variable
     * 
     * @param debug Debugger facade
     * @returns Array of child variables or undefined if no children
     */
    abstract getChildren(context: ExecContext): Promise<Variable[] | undefined>;

    protected isExpandable() {
        /* First check it is valid pointer - they appear more often */
        return (
            utils.isValidPointer(this.value) && !utils.isBuiltInType(this.type)
        ) || utils.isRawStruct(this);
    }

    /**
     * Create {@link vscode.TreeItem TreeItem} for variables view
     */
    getTreeItem(): vscode.TreeItem {
        return {
            label: `${this.name}: ${this.type} = `,
            description: this.value,
            collapsibleState: this.isExpandable()
                ? vscode.TreeItemCollapsibleState.Collapsed
                : vscode.TreeItemCollapsibleState.None,
        }
    }

    static async createVariable(
                    debugVariable: dap.DebugVariable, frameId: number,
                    context: ExecContext, logger: utils.ILogger,
                    parent?: RealVariable): Promise<RealVariable | undefined> {
        /* 
         * We pass RealVariable - not generic Variable, 
         * because if we want to use this function - if means 
         * we create it using debugger interface and this variable
         * is real
         */
        if (utils.isRawStruct(debugVariable) ||
            !utils.isValidPointer(debugVariable.value)) {
            return new RealVariable({
                ...debugVariable,
                frameId,
                parent
            }, logger);
        }

        /* 
         * PostgreSQL versions prior 16 do not have Bitmapset Node.
         * So handle Bitmapset (with Relids) here.
         */
        if (BitmapSetSpecialMember.isBitmapset(debugVariable.type)) {
            return new BitmapSetSpecialMember(logger, {
                ...debugVariable,
                frameId,
                parent
            });
        }

        /* NodeTag variables: Node, List, Bitmapset etc.. */
        if (context.nodeVarRegistry.isNodeVar(debugVariable.type)) {
            const nodeTagVar = await NodeTagVariable
                .createNodeTagVariable(debugVariable, frameId,
                                       context, logger, parent);
            if (nodeTagVar) {
                return nodeTagVar;
            }
        }

        /* Special members */
        if (parent?.type) {
            const specialMember = context.specialMemberRegistry
                .getArraySpecialMember(parent.type, debugVariable.name);
            if (specialMember) {
                return new ArraySpecialMember(parent, specialMember, {
                    ...debugVariable,
                    frameId: parent.frameId,
                    parent: parent,
                }, logger) as RealVariable;
            }
        }

        /* At the end - it is simple variable */
        return new RealVariable({
            ...debugVariable,
            frameId,
            parent
        }, logger);
    }

    static async getVariables(variablesReference: number, frameId: number,
                              context: ExecContext, logger: utils.ILogger,
                              parent?: RealVariable): Promise<Variable[] | undefined> {
        const debugVariables = await context.debug.getMembers(variablesReference);
        if (!debugVariables) {
            return;
        }

        const variables = await Promise.all(debugVariables.map(variable =>
            Variable.createVariable(variable, frameId, context, logger, parent))
        );
        return variables.filter(x => x !== undefined);
    }

    static async mapVariables(debugVariables: dap.DebugVariable[], frameId: number,
                              context: ExecContext, logger: utils.ILogger,
                              parent?: RealVariable): Promise<Variable[] | undefined> {
        const variables = await (Promise.all(debugVariables.map(v =>
            Variable.createVariable(v, frameId, context, logger, parent))
        ));
        return variables.filter(v => v !== undefined);
    }
}

class ScalarVariable extends Variable {
    constructor(name: string, value: string, type: string, parent?: Variable) {
        super(name, value, type, parent);
    }

    async getChildren(_: ExecContext): Promise<Variable[] | undefined> {
        return;
    }
}

interface RealVariableArgs {
    evaluateName: string;
    memoryReference?: string;
    name: string;
    type: string;
    value: string;
    variablesReference: number;
    frameId: number;
    parent?: Variable;
}

/**
 * Base class for all real variables in variables view.
 * There may be artificial variables - they just exist.
 */
export class RealVariable extends Variable {
    protected readonly logger: utils.ILogger;

    /**
     * Expression to access variable
     */
    evaluateName: string;

    /** 
     * Memory address of variable value
     */
    memoryReference?: string;

    /**
     * Number to use in requests to work with DAP.
     * I.e. get subvariables
     */
    variablesReference: number;

    /**
     * Id of frame, where we should access this variable
     */
    frameId: number;

    constructor(args: RealVariableArgs, logger: utils.ILogger) {
        super(args.name, args.value, args.type, args.parent);
        this.logger = logger;
        this.evaluateName = args.evaluateName;
        this.memoryReference = args.memoryReference;
        this.variablesReference = args.variablesReference;
        this.frameId = args.frameId;
        this.parent = args.parent;
    }

    getRealVariableArgs(): RealVariableArgs {
        return {
            evaluateName: this.evaluateName,
            memoryReference: this.memoryReference,
            name: this.name,
            type: this.type,
            value: this.value,
            variablesReference: this.variablesReference,
            frameId: this.frameId,
            parent: this.parent,
        }
    }

    /**
     * Check that {@link value value} is valid pointer value
     */
    protected isValidPointer() {
        return utils.isValidPointer(this.value);
    }

    /**
     * Base implementation which just get variables using 
     * {@link variablesReference variablesReference } field
     */
    async getChildren(context: ExecContext): Promise<Variable[] | undefined> {
        return Variable.getVariables(this.variablesReference, this.frameId,
                                     context, this.logger, this);
    }

    protected async getArrayMembers(expression: string, length: number,
                                    context: ExecContext) {
        const variables = await context.debug.getArrayVariables(expression,
                                                                length, this.frameId);
        return await Variable.mapVariables(variables, this.frameId, context,
                                           this.logger, this);
    }
}

/**
 * Variable/member with `NodeTag' assigned.
 * We should examine it to get real NodeTag because it 
 * may be different from declared type.
 */
export class NodeTagVariable extends RealVariable {
    /**
     * Real tag of node without 'T_' prefix.
     * @example AggPath
     */
    realNodeTag: string;

    /**
     * Real type of Node variable. May be equal to declared type if NodeTags
     * are equal. 
     * 
     * Evaluated lazily - use {@link getRealType getRealType()} function to 
     * get value
     * 
     * @example `OpExpr *' was `Node *'
     */
    realType: string | undefined;

    constructor(realNodeTag: string, args: RealVariableArgs, logger: utils.ILogger) {
        super(args, logger);
        this.realNodeTag = realNodeTag.replace('T_', '');
    }

    protected computeRealType() {
        const tagFromType = utils.getStructNameFromType(this.type);
        if (tagFromType === this.realNodeTag) {
            return this.type;
        }

        return utils.substituteStructName(this.type, this.realNodeTag);
    }

    getRealType(): string {
        if (!this.realType) {
            this.realType = this.computeRealType();
        }

        return this.realType;
    }

    /**
     * Whether real NodeTag match with declared type
     */
    protected tagsMatch() {
        return utils.getStructNameFromType(this.type) === this.realNodeTag;
    }

    protected isExpandable(): boolean {
        return this.isValidPointer();
    }

    getTreeItem(): vscode.TreeItem {
        return {
            label: this.tagsMatch()
                ? `${this.name}: ${this.type} = `
                : `${this.name}: ${this.type} [${this.realNodeTag}] = `,
            description: this.value,
            collapsibleState: this.isExpandable()
                ? vscode.TreeItemCollapsibleState.Collapsed
                : vscode.TreeItemCollapsibleState.None,
        };
    }

    async castToRealTag(debug: utils.IDebuggerFacade) {
        /* 
         * We should substitute current type with target, because 
         * there may be qualifiers such `struct' or `const'
         */
        const resultType = utils.substituteStructName(this.type, this.realNodeTag);
        const newVarExpression = `((${resultType})${this.evaluateName})`;
        const response = await debug.evaluate(newVarExpression, this.frameId);
        this.variablesReference = response.variablesReference;
    }

    async getChildren(context: ExecContext): Promise<Variable[] | undefined> {
        if (!this.tagsMatch()) {
            await this.castToRealTag(context.debug);
        }

        const debugVariables = await context.debug.getMembers(this.variablesReference);
        return (await Promise.all(debugVariables.map(dv => Variable.createVariable(dv, this.frameId, context, this.logger, this as RealVariable))))
            .filter(d => d !== undefined);
    }

    static isValidNodeTag(tag: string) {
        /* 
         * Valid NodeTag must contain only alphabetical characters.
         * Note: it does not contain 'T_' prefix - we strip it always.
         */
        return /^[a-zA-Z]+$/.test(tag);
    }

    static getTagFromType(type: string) {
        return utils.getStructNameFromType(type);
    }

    static async getRealNodeTag(variable: dap.DebugVariable, frameId: number, context: ExecContext) {
        const response = await context.debug.evaluate(`((Node*)(${variable.evaluateName}))->type`, frameId);
        let realTag = response.result?.replace('T_', '');
        if (!this.isValidNodeTag(realTag)) {
            return;
        }
        return realTag;
    }

    static async createNodeTagVariable(variable: dap.DebugVariable, frameId: number,
                                       context: ExecContext, logger: utils.ILogger,
                                       parent?: Variable) {
        if (!context.nodeVarRegistry.isNodeVar(variable.type)) {
            return;
        }

        let realTag = await this.getRealNodeTag(variable, frameId, context);
        if (!realTag) {
            return;
        }

        const args: RealVariableArgs = {
            ...variable,
            frameId,
            parent,
        };

        realTag = realTag.replace('T_', '');

        /* List */
        if (realTag.indexOf('List') !== -1) {
            /* Real type must be List (for IntList etc...) */
            switch (realTag) {
                case 'List':
                case 'OidList':
                case 'XidList':
                case 'IntList':
                    return new ListNodeTagVariable(realTag, args, logger);
            }
        }

        /* Bitmapset */
        if (realTag === 'Bitmapset') {
            return new BitmapSetSpecialMember(logger, {
                ...variable,
                frameId,
                parent
            });
        }

        return new NodeTagVariable(realTag, {
            ...variable,
            frameId,
            parent,
        }, logger);
    }
}

/**
 * Special class to represent various Lists: Node, int, Oid, Xid...
*/
export class ListNodeTagVariable extends NodeTagVariable {
    constructor(nodeTag: string, args: RealVariableArgs, logger: utils.ILogger) {
        super(nodeTag, args, logger);
    }

    getMemberExpression(member: string) {
        return `((${this.getRealType()})${this.value})->${member}`
    }

    protected isExpandable(): boolean {
        return true;
    }

    private createArrayNodeElementsMember(dv: dap.DebugVariable) {
        /* Default safe values */
        let cellValue = 'int_value';
        let realType = 'int';

        switch (this.realNodeTag) {
            case 'List':
                cellValue = 'ptr_value';
                realType = 'Node *';
                break;
            case 'IntList':
                break;
            case 'OidList':
                cellValue = 'oid_value';
                realType = 'Oid';
                break;
            case 'XidList':
                cellValue = 'xid_value';
                realType = 'TransactionId';
                break;
            default:
                this.logger.warn(`failed to determine List tag for ${this.name}->elements. using int value`);
                break;
        }

        return new ListNodeTagVariable.ListElementsMember(this, cellValue, realType, this.logger, {
            ...dv,
            frameId: this.frameId,
            parent: this,
        });
    }

    private createLinkedListNodeElementsMember() {
        /* Default safe values */
        let cellValue = 'int_value';
        let realType = 'int';

        switch (this.realNodeTag) {
            case 'List':
                cellValue = 'ptr_value';
                realType = 'Node *';
                break;
            case 'IntList':
                break;
            case 'OidList':
                cellValue = 'oid_value';
                realType = 'Oid';
                break;
            case 'XidList':
                cellValue = 'xid_value';
                realType = 'TransactionId';
                break;
            default:
                this.logger.warn(`failed to determine List tag for ${this.name}->elements. using int value`);
                break;
        }

        return new ListNodeTagVariable.LinkedListElementsMember(this, cellValue,
                                                                realType, this.logger);
    }

    override computeRealType(): string {
        const declaredTag = utils.getStructNameFromType(this.type);
        if (declaredTag !== 'List') {
            return utils.substituteStructName(this.type, 'List');
        }
        return this.type;
    }

    private async castToList(context: ExecContext) {
        const realType = this.getRealType();
        const castExpression = `(${realType}) (${this.evaluateName})`;
        const response = await context.debug.evaluate(castExpression, this.frameId);
        if (!Number.isInteger(response.variablesReference)) {
            this.logger.warn(`failed to cast ${this.evaluateName} to List*: ${response.result}`);
            return;
        }

        /* Also update type - it will be used  */
        this.variablesReference = response.variablesReference;
    }

    async getChildren(context: ExecContext) {
        if (!this.tagsMatch()) {
            await this.castToList(context);
        }

        const debugVariables = await context.debug.getMembers(this.variablesReference);
        if (!debugVariables) {
            return;
        }

        /* Replace `elements' variable with special case */
        const members: Variable[] = [];
        let isArrayImplementation = false;
        for (let i = 0; i < debugVariables.length; i++) {
            const dv = debugVariables[i];
            if (dv.name === 'elements') {
                members.push(this.createArrayNodeElementsMember(dv));
                isArrayImplementation = true;
            } else {
                const v = await Variable.createVariable(dv, this.frameId, context,
                                                        this.logger, this);
                if (v) {
                    members.push(v);
                }
            }
        }

        if (!isArrayImplementation) {
            members.push(this.createLinkedListNodeElementsMember());
        }

        return members;
    }

    /**
     * Show `elements' member of List struct of Node* values
    */
    private static ListElementsMember = class extends RealVariable {
        /**
         * Member of ListCell to use.
         * @example int_value, oid_value
        */
        cellValue: string;

        /**
         * Real type of stored data
         * @example int, Oid
        */
        realType: string;

        listParent: ListNodeTagVariable;

        constructor(listParent: ListNodeTagVariable, cellValue: string, realType: string, logger: utils.ILogger, args: RealVariableArgs) {
            super(args, logger);
            this.listParent = listParent;
            this.cellValue = cellValue;
            this.realType = realType;
        }

        private async getListLength(context: ExecContext) {
            const lengthExpression = this.listParent.getMemberExpression('length');
            const evalResult = await context.debug.evaluate(lengthExpression,
                this.listParent.frameId);
            const length = Number(evalResult.result);
            if (Number.isNaN(length)) {
                this.logger.warn(`failed to obtain list size for ${this.listParent.name}`);
                return;
            }
            return length;
        }

        async getNodeElements(context: ExecContext) {
            const length = await this.getListLength(context);
            if (!length) {
                return;
            }

            const expression = `(Node **)(${this.listParent.getMemberExpression('elements')})`;
            return super.getArrayMembers(expression, length, context);
        }

        async getIntegerElements(context: ExecContext) {
            const length = await this.getListLength(context);
            if (!length) {
                return;
            }

            /* 
            * We can not just cast `elements' to int* or Oid* 
            * due to padding in `union'. For these we iterate 
            * each element and evaluate each item independently
            */
            const elements: RealVariable[] = [];
            for (let i = 0; i < length; i++) {
                const expression = `(${this.evaluateName})[${i}].${this.cellValue}`;
                const response = await context.debug.evaluate(expression, this.frameId);
                elements.push(new RealVariable({
                    name: `[${i}]` /* array elements behaviour */,
                    type: this.realType,
                    evaluateName: expression,
                    variablesReference: response.variablesReference,
                    value: response.result,
                    memoryReference: response.memoryReference,
                    frameId: this.frameId,
                    parent: this
                }, this.logger));
            }

            return elements;
        }

        async getChildren(context: ExecContext) {
            return this.listParent.realNodeTag === 'List'
                ? this.getNodeElements(context)
                : this.getIntegerElements(context);
        }

        protected isExpandable(): boolean {
            return true;
        }
    }

    /* 
     * Show elements of List for Linked List implementation (head/tail).
     * Suitable for Postgres version prior to 13.
     */
    private static LinkedListElementsMember = class extends Variable {
        /**
         * Member of ListCell to use.
         * @example int_value, oid_value, ptr_value, xid_value
         */
        cellValue: string;

        /**
         * Real type of stored data
         * @example int, Oid, Node *, Xid
         */
        realType: string;

        /**
         * List structure we observing
         */
        listParent: ListNodeTagVariable;

        logger: utils.ILogger;

        get frameId(): number {
            return this.listParent.frameId;
        }

        constructor(listParent: ListNodeTagVariable, cellValue: string,
                    realType: string, logger: utils.ILogger) {
            super('$elements$', '', '', listParent);
            this.logger = logger; 
            this.listParent = listParent;
            this.cellValue = cellValue;
            this.realType = realType;
        }

        async getLinkedListElements(context: ExecContext) {
            /* 
             * Traverse through linked list until we get NULL
             * and read each element from List manually.
             * So we do not need to evaluate length.
             */
            const elements: dap.DebugVariable[] = [];
            const headExpression = this.listParent.getMemberExpression('head');
            let evaluateName = headExpression;
            let cell = await context.debug.evaluate(headExpression, this.frameId);
            let i = 0;
            do {
                const valueExpression = `(${this.realType})((${evaluateName})->data.${this.cellValue})`;
                const response = await context.debug.evaluate(valueExpression, this.frameId);
                elements.push({
                    name: `[${i}]`,
                    value: response.result,
                    type: this.realType,
                    evaluateName: valueExpression,
                    variablesReference: response.variablesReference,
                    memoryReference: response.memoryReference,
                });
                evaluateName = `${evaluateName}->next`;
                cell = await context.debug.evaluate(evaluateName, this.frameId);
                ++i;
            } while (!utils.isNull(cell.result));

            return await Variable.mapVariables(elements, this.frameId, context,
                                               this.logger, this.listParent);
        }

        async getChildren(context: ExecContext) {
            return await this.getLinkedListElements(context);
        }

        protected isExpandable(): boolean {
            return true;
        }
    }
}


export class ArraySpecialMember extends RealVariable {
    /**
     * Expression to evaluate to obtain array length.
     * Appended to target struct from right.
     * First element is length member name, but after
     * can be correction expressions i.e. '+ 1'.
     */
    info: ArraySpecialMemberInfo;
    parent: RealVariable;

    constructor(parent: RealVariable, info: ArraySpecialMemberInfo,
                args: RealVariableArgs, logger: utils.ILogger) {
        super(args, logger);
        this.info = info;
        this.parent = parent;
    }

    formatLengthExpression() {
        return `(${this.parent.evaluateName})->${this.info.lengthExpr}`;
    }

    formatMemberExpression() {
        return `(${this.parent.evaluateName})->${this.info.memberName}`;
    }

    async getChildren(context: ExecContext) {
        const lengthExpression = this.formatLengthExpression();
        const evalResult = await context.debug.evaluate(lengthExpression,
                                                        this.frameId);
        const arrayLength = Number(evalResult.result);
        if (Number.isNaN(arrayLength)) {
            this.logger.warn(`failed to obtain array size using ${lengthExpression}`);
            return;
        }

        if (arrayLength === 0) {
            return;
        }

        const memberExpression = this.formatMemberExpression();
        const debugVariables = await context.debug.getArrayVariables(memberExpression,
                                                                     arrayLength, this.frameId);
        return await Variable.mapVariables(debugVariables, this.frameId, context,
                                           this.logger, this);
    }
}

class BitmapSetSpecialMember extends NodeTagVariable {
    constructor(logger: utils.ILogger, args: RealVariableArgs) {
        super('Bitmapset', args, logger);
    }

    async isValidSet(debug: utils.IDebuggerFacade) {
        const expression = `bms_is_valid_set(${this.evaluateName})`;
        const response = await debug.evaluate(expression, this.frameId);
        if (!response.type) {
            /* 
             * `bms_is_valid_set' introduced in 17.
             * On other versions `type` member will be not set (undefined).
             * We assume it is valid, because for NULL variables we do not
             * create Variable instances.
             */
            return true;
        }
        return response.result === 'true';
    }

    safeToObserve() {
        if (vscode.debug.breakpoints.length === 0) {
            /* Strange but OK */
            return true;
        }

        /*
         * Fastest way I found is just to iterate all breakpoints and check
         * - no bp in bitmapset.c source code for line breakpoints
         * - no bp for bms_next_member function for function breakpoints
         *
         * I have found only these 2 subclasses of breakpoints. 
         * Seems that it is enough.
         */
        for (const bp of vscode.debug.breakpoints) {
            if (!bp.enabled) {
                continue;
            }

            if (bp instanceof vscode.SourceBreakpoint) {
                if (bp.location.uri.path.endsWith('bitmapset.c')) {
                    this.logger.debug('found breakpoint at bitmapset.c - set elements not shown');
                    return false;
                }
            } else if (bp instanceof vscode.FunctionBreakpoint) {
                /* Need to check only bms_next_member */
                if (bp.functionName === 'bms_next_member') {
                    this.logger.debug('found breakpoint at bms_next_member - set elements not shown');
                    return false;
                }
            }
        }
        return true;
    }


    async getSetElements(debug: utils.IDebuggerFacade): Promise<number[] | undefined> {
        /* 
         * Must check we do not have breakpoints set in `bms_next_member`.
         * Otherwise, we will get infinite recursion and backend will crash.
         */
        if (!this.safeToObserve()) {
            return;
        }

        /* 
         * We MUST check validity of set, because otherwise
         * `Assert` will fail and whole backend will crash
         */
        if (!await this.isValidSet(debug)) {
            return;
        }

        /* 
         * Most likely, we use new Bitmapset API, 
         * but fallback with old-styled 
         */
        let result = await this.getSetElementsNextMember(debug);
        if (result === undefined) {
            result = await this.getSetElementsFirstMember(debug);
        }
        return result;
    }

    private async getSetElementsNextMember(debug: utils.IDebuggerFacade): Promise<number[] | undefined> {
        /* 
         * Current style (from 9.3) of reading Bitmapset values:
         * 
         * Bitmapset *bms;
         * int x = -1;
         * while ((x = bms_next_member(bms, x)) > 0)
         * {
         *    ...
         * }
         */
        
        let number = -1;
        const numbers = [];
        do {
            const expression = `bms_next_member(${this.evaluateName}, ${number})`;
            const response = await debug.evaluate(expression, this.frameId);
            number = Number(response.result);
            if (Number.isNaN(number)) {
                this.logger.warn(`failed to get set elements for ${this.name}`);
                return;
            }

            if (number < 0) {
                break;
            }

            numbers.push(number);
        } while (number > 0);
        return numbers;
    }

    private async getSetElementsFirstMember(debug: utils.IDebuggerFacade): Promise<number[] | undefined> {
        /*
         * Old style (prior to 9.2) of reading Bitmapset values:
         * 
         * Bitmapset *bms;
         * Bitmapset *tmp;
         * tmp = bms_copy(bms);
         * 
         * int x;
         * while ((x = bms_first_member(tmp)) > 0)
         * {
         *    ...
         * }
         * 
         * pfree(tmp);
         */
        const tmpSet = await debug.evaluate(`bms_copy(${this.evaluateName})`,
                                            this.frameId);

        if (!utils.isValidPointer(tmpSet.result)) {
            return;
        }

        let number = -1;
        const numbers = [];
        do {
            const expression = `bms_first_member((Bitmapset*)${tmpSet.result})`;
            const response = await debug.evaluate(expression, this.frameId);
            number = Number(response.result);
            if (Number.isNaN(number)) {
                this.logger.warn(`failed to get set elements for ${this.name}`);
                return;
            }

            if (number < 0) {
                break;
            }

            numbers.push(number);
        } while (number > 0);

        await debug.evaluate(`pfree((Bitmapset*)${tmpSet.result})`, this.frameId);

        return numbers;
    }

    async getChildren(context: ExecContext) {
        /* All existing members */
        const members = await Variable.getVariables(this.variablesReference,
                                                    this.frameId, context,
                                                    this.logger, this);
        if (members === undefined || members.length === 0) {
            return;
        }

        /* + Set elements */
        const setMembers = await this.getSetElements(context.debug);
        if (setMembers === undefined) {
            return members;
        }

        members.push(new ScalarVariable('$length$', setMembers.length.toString(),
                                        'int', this));
        members.push(new BitmapSetSpecialMember.BmsArrayVariable(this, setMembers));
        return members;
    }

    static BmsElementVariable = class extends Variable {
        constructor(index: number, value: number, parent: Variable) {
            super(`[${index}]`, value.toString(), 'int', parent);
        }

        async getChildren(context: ExecContext): Promise<Variable[] | undefined> {
            return;
        }

        protected isExpandable(): boolean {
            return false;
        }
    }

    static BmsArrayVariable = class extends Variable {
        setElements: number[];
        constructor(parent: BitmapSetSpecialMember, setElements: number[]) {
            super('$elements$', '', '', parent);
            this.setElements = setElements;
        }

        async getChildren(context: ExecContext): Promise<Variable[] | undefined> {
            return this.setElements.map((se, i) => new BitmapSetSpecialMember.BmsElementVariable(i, se, this))
        }

        protected isExpandable(): boolean {
            return true;
        }

        getTreeItem(): vscode.TreeItem {
            return {
                label: '$elements$',
                collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
            }
        }
    }

    static isBitmapset(type: string) {
        const typename = utils.getStructNameFromType(type);
        if (typename === 'Bitmapset') {
            /* Bitmapset* */
            return utils.getPointersCount(type) === 1;
        } else if (typename === 'Relids') {
            /* Relids */
            return utils.getPointersCount(type) === 0;
        }
        return false;
    }
}

/**
 * Create {@link NodeTagVariable SpecialMember} object with required type
 * from parsed JSON object in settings file.
 * If there is error occured (i.e. invalid configuration) - it will throw 
 * exception with message describing error.
 * 
 * @param object parsed JSON object of special member from setting file
 */
export function createArraySpecialMemberInfo(object: any): ArraySpecialMemberInfo {
    let typeName = object.nodeTag;
    if (!typeName) {
        throw new Error("nodeTag field not provided");
    }

    if (typeof typeName !== 'string') {
        throw new Error(`nodeTag type must be string, given: ${typeof typeName}`);
    }

    typeName = typeName.trim().replace('T_', '');

    /* NodeTag used also as type name, so it must be valid identifier */
    if (!utils.isValidIdentifier(typeName)) {
        throw new Error(`nodeTag must be valid identifier. given: ${object.nodeTag}`);
    }

    let arrayMemberName = object.memberName;
    if (!arrayMemberName) {
        throw new Error(`memberName field not provided for type with NodeTag: ${object.nodeTag}`);
    }

    if (typeof arrayMemberName !== 'string') {
        throw new Error(`memberName field must be string for type with NodeTag: ${object.nodeTag}`);
    }

    arrayMemberName = arrayMemberName.trim();
    if (!utils.isValidIdentifier(arrayMemberName)) {
        throw new Error(`memberName field ${arrayMemberName} is not valid identifier - contains invalid characters`)
    }

    let lengthExpr = object.lengthExpression;
    if (!lengthExpr) {
        throw new Error(`lengthExpression not provided for: ${object.nodeTag}->${arrayMemberName}`);
    }

    if (typeof lengthExpr !== 'string') {
        throw new Error(`lengthExpression field must be string for: ${object.nodeTag}->${arrayMemberName}`);
    }

    lengthExpr = lengthExpr.trim();
    if (!lengthExpr) {
        throw new Error('lengthExpression can not be empty string');
    }

    return { typeName, memberName: arrayMemberName, lengthExpr };
}