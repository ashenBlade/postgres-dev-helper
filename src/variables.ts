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
     * Known NodeTags that represents Expr nodes.
     * Required for Exprs representation in tree view as expressions
     */
    exprs: Set<string> = new Set<string>(constants.getDisplayedExprs())

    /**
     * Known aliases for Node variables - `typedef RealType* Alias'
     */
    aliases: Map<string, string> = new Map(constants.getDefaultAliases());

    /* 
     * Known references of Bitmapset.
     * Map: field_name -> BitmapsetReference
     */
    bmsRefs: Map<string, constants.BitmapsetReference> = new Map(constants.getWellKnownBitmapsetReferences());

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
         * Aliases must be checked at start. So do not handle them here
         */
        let typeName = utils.getStructNameFromType(type);

        /* [const] [struct] NAME * */
        return this.nodeTags.has(typeName) && utils.getPointersCount(type) === 1
    }

    /**
     * Check if passed string is valid NodeTag and registered NodeTag
     * 
     * @param tag String to test
     */
    isNodeTag(tag: string) {
        return this.nodeTags.has(tag);
    }

    findBmsReference(bms: BitmapSetSpecialMember) {
        return this.bmsRefs.get(bms.name);
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

/**
 * Context of current execution.
 */
export interface ExecContext {
    /**
     * Registry about NodeTag variables information
     */
    nodeVarRegistry: NodeVarRegistry;

    /**
     * Registry with information of Special Members
     */
    specialMemberRegistry: SpecialMemberRegistry;

    /**
     * Facade for debugger interface (TAP)
     */
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

    /* 
     * Cached variables. 
     * If undefined - `getChildren` was not called;
     * If length == 0 - no children (scalar variable)
     */
    children: Variable[] | undefined;

    /**
     * Execution context for current session.
     */
    context: ExecContext;

    /**
     * Shortcut for `this.context.debug`
     */
    get debug() {
        return this.context.debug;
    }

    constructor(name: string, value: string, type: string, context: ExecContext, parent: Variable | undefined) {
        this.parent = parent ?? undefined;
        this.name = name;
        this.value = value;
        this.type = type;
        this.context = context;
    }

    /**
     * Get children of this variable
     * 
     * @returns Array of child variables or undefined if no children
     */
    async getChildren(): Promise<Variable[] | undefined> {
        try {
            if (this.children != undefined) {
                /* 
                * return `undefined` if no children - scalar variable
                */
                return this.children.length
                        ? this.children
                        : undefined;
            }

            const children = await this.doGetChildren();
            if (children) {
                this.children = children;
            } else {
                this.children = [];
            }

            return children;
        } catch (error: any) {
            /* 
            * Calls to debugger with some evaluations might be time consumptive
            * and user will perform step before we end up computation.
            * In such case, we will get exception with messages like:
            * - "Cannot evaluate expression on the specified stack frame."
            * - "Unable to perform this action because the process is running."
            * 
            * I do not know whether these messages are translated, so
            * just checking 'error.message' does not look like a solid solution.
            * In the end, we just catch all VS Code exceptions (they have
            * 'CodeExpectedError' in name, at least exceptions with messages
            * above).
            */
            if (error.name === 'CodeExpectedError') {
                return;
            } else {
                throw error;
            }
        }
    }

    abstract doGetChildren(): Promise<Variable[] | undefined>;
    protected isExpandable() {
        /* Pointer to struct */
        if (utils.isValidPointer(this.value) && !utils.isBuiltInType(this.type)) {
            return true;
        }
        
        /* Embedded or top level structs */
        if (utils.isRawStruct(this)) {
            return true;
        }
        
        /* Fixed size array: type[size] */
        if (utils.isFixedSizeArray(this)) {
            return true;
        }

        return false;
    }

    protected async getDescription() {
        return this.value;
    }

    /**
     * Create {@link vscode.TreeItem TreeItem} for variables view
     */
    async getTreeItem(): Promise<vscode.TreeItem> {
        return {
            label: `${this.name}: ${this.type} = `,
            description: await this.getDescription(),
            collapsibleState: this.isExpandable()
                ? vscode.TreeItemCollapsibleState.Collapsed
                : vscode.TreeItemCollapsibleState.None,
        }
    }

    /**
     * Utility function to handle type aliases.
     * This is required to properly handle other types.
     * 
     * For example, `MemoryContext' - alias for `MemoryContextData *'
     * and it does not have is's own NodeTag. So when performing
     * cast we get subtle error because we cast to type `AllocSetContext'
     * (without pointer).
     */
    private static getRealType(debugVariable: dap.DebugVariable, context: ExecContext) {
        const structName = utils.getStructNameFromType(debugVariable.type);
        const alias = context.nodeVarRegistry.aliases.get(structName);
        if (!alias) {
            return debugVariable.type;
        }

        const resultType = utils.substituteStructName(debugVariable.type, alias);
        return resultType;
    }

    static async create(debugVariable: dap.DebugVariable, frameId: number,
                        context: ExecContext, logger: utils.ILogger,
                        parent?: Variable): Promise<RealVariable | undefined> {
        /* 
         * We pass RealVariable - not generic Variable, 
         * because if we want to use this function - if means 
         * we create it using debugger interface and this variable
         * is real
         */
        const args: RealVariableArgs = {
            ...debugVariable,
            frameId,
            parent,
            context
        };
        if (utils.isRawStruct(debugVariable) ||
            !utils.isValidPointer(debugVariable.value)) {
            if (utils.isNull(debugVariable.value) && debugVariable.type === 'List *') {
                /* Empty List is NIL == NULL == '0x0' */
                return new ListNodeTagVariable('List', args, logger);
            }

            return new RealVariable(args, logger);
        }

        const realType = Variable.getRealType(debugVariable, context);

        /* 
         * PostgreSQL versions prior 16 do not have Bitmapset Node.
         * So handle Bitmapset (with Relids) here.
         */
        if (BitmapSetSpecialMember.isBitmapset(realType)) {
            return new BitmapSetSpecialMember(logger, args);
        }

        /* NodeTag variables: Node, List, Bitmapset etc.. */
        if (context.nodeVarRegistry.isNodeVar(realType)) {
            const nodeTagVar = await NodeTagVariable.create(debugVariable, frameId,
                                                            context, logger, parent);
            if (nodeTagVar) {
                return nodeTagVar;
            }
        }

        /* Special members */
        if (parent?.type && parent instanceof RealVariable) {
            const specialMember = context.specialMemberRegistry
                .getArraySpecialMember(parent.type, debugVariable.name);
            if (specialMember) {
                return new ArraySpecialMember(parent, specialMember, {
                    ...debugVariable,
                    frameId: frameId,
                    parent: parent,
                    context
                }, logger) as RealVariable;
            }
        }

        /* At the end - it is simple variable */
        return new RealVariable(args, logger);
    }

    static async getVariables(variablesReference: number, frameId: number,
                              context: ExecContext, logger: utils.ILogger,
                              parent?: RealVariable): Promise<Variable[] | undefined> {
        const debugVariables = await context.debug.getMembers(variablesReference);
        if (!debugVariables) {
            return;
        }

        const variables = await Promise.all(debugVariables.map(variable =>
            Variable.create(variable, frameId, context, logger, parent))
        );
        return variables.filter(x => x !== undefined);
    }

    static async mapVariables(debugVariables: dap.DebugVariable[],
                              frameId: number,
                              context: ExecContext,
                              logger: utils.ILogger,
                              parent?: RealVariable): Promise<Variable[] | undefined> {
        const variables = await (Promise.all(debugVariables.map(v =>
            Variable.create(v, frameId, context, logger, parent))
        ));
        return variables.filter(v => v !== undefined);
    }
}

/* 
 * Special class to store top level variables, extracted from this frame. 
 * Must not be returned 
 */
export class VariablesRoot extends Variable {
    static variableRootName = '$variables root$'
    
    constructor(public topLevelVariables: Variable[], context: ExecContext) {
        super(VariablesRoot.variableRootName, '', '', context, undefined);
     }

    async doGetChildren(): Promise<Variable[] | undefined> {
        return undefined;
    }
}

class ScalarVariable extends Variable {
    tooltip?: string;
    constructor(name: string, value: string, type: string, context: ExecContext, parent?: Variable, tooltip?: string) {
        super(name, value, type, context, parent);
        this.tooltip = tooltip;
    }

    async doGetChildren(): Promise<Variable[] | undefined> {
        return;
    }

    async getTreeItem() {
        const item = await super.getTreeItem();
        item.tooltip = this.tooltip;
        return item;
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
    context: ExecContext;
}

/**
 * Generic class to specify error occurred during debugger
 * evaluation or error in logic after that
 */
class EvaluationError extends Error {
    /**
     * Evaluation error message, not exception message
     */
    evalError?: string;
    
    constructor(message: string, evalError?: string) {
        if (evalError) {
            super(`${message}: ${evalError}`);
        } else {
            super(message);
        }
        this.evalError = evalError;
    }
}

/**
 * Specified member was not found in some variable's members
 */
class NoMemberFoundError extends EvaluationError {
    constructor(readonly member: string) {
        super(`member ${member} does not exists`); 
    }
}

/**
 * Evaluation produced unexpected results.
 */
class UnexpectedOutputError extends EvaluationError { }

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

    /**
     * Cached members of this variable
     */
    members?: Variable[];

    constructor(args: RealVariableArgs, logger: utils.ILogger) {
        super(args.name, args.value, args.type, args.context, args.parent);
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
            context: this.context
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
    async doGetChildren(): Promise<Variable[] | undefined> {
        if (this.members) {
            return this.members;
        }

        this.members = await Variable.getVariables(this.variablesReference, this.frameId,
                                                   this.context, this.logger, this);
        return this.members;        
    }

    /**
     * Function, used to get only members of this variable - without any artificial members.
     * This is required in situations, when getting children from the code to
     * prevent infinite loops.
     * 
     * NOTE: code is the same as in 'doGetChildren' to prevent future errors,
     *       if someday i decide to override default implementation of one
     *       of these functions (work in both sides)
     */
    async getRealMembers(): Promise<Variable[] | undefined> {
        if (this.members) {
            return this.members;
        }

        this.members = await this.doGetRealMembers();
        return this.members;
    }

    protected async doGetRealMembers() {
        return await Variable.getVariables(this.variablesReference, this.frameId,
                                           this.context, this.logger, this)
    }

    protected async getArrayMembers(expression: string, length: number) {
        const variables = await this.debug.getArrayVariables(expression,
                                                             length, this.frameId);
        return await Variable.mapVariables(variables, this.frameId, this.context,
                                           this.logger, this);
    }

    protected async evaluate(expr: string) {
        return await this.debug.evaluate(expr, this.frameId);
    }

    /**
     * Get *real* member of this var `this->member`.
     * Prefer this method as more optimized.
     * 
     * @param member member name of this var
     * @returns Variable that represent member of this var
     */
    async getMember(member: string) {
        /* 
         * Use `getRealMember`, not `getChildren` in order to
         * prevent infinite loops when getting member
         * of one var from another.
         */
        const members = await this.getRealMembers();
        if (members === undefined) {
            throw new NoMemberFoundError(member);
        }

        const m = members.find(v => v.name === member);
        if (m === undefined) {
            throw new NoMemberFoundError(member);
        }

        return m;
    }

    /**
     * Get elements of member `this->member`.
     * You should use this function, because NIL is valid
     * List representation, but this extension treats it as
     * RealVariable, not ListNodeTagVariable.
     * 
     * @param member member name of this var
     * @returns Elements of list array
     */
    async getListMemberElements(member: string) {
        const m = await this.getMember(member);
        if (m instanceof ListNodeTagVariable) {
            const elements = await m.getListElements();
            if (elements === undefined) {
                throw new UnexpectedOutputError(`failed to get elements from List member ${member}`);
            }
            return elements;
        }

        /* NIL means 0x0, so List will be RealVariable */
        if (utils.isNull(m.value)) {
            return [];
        }

        throw new UnexpectedOutputError(`member ${member} is not valid List`);
    }

    /**
     * Get raw 'value' field of `this->member`.
     * 
     * @param member member name of this var
     * @returns 'value' field
     */
    async getMemberValue(member: string) {
        const m = await this.getMember(member);
        return m.value;
    }

    /**
     * Get string value of `char *` member `this->member`.
     * If that was NULL, then `null` returned.
     * 
     * @param member member name of this var
     * @returns string value of member
     */
    async getMemberValueCharString(member: string) {
        const value = await this.getMemberValue(member);
        const str = utils.extractStringFromResult(value);
        if (str !== null) {
            return str;
        }
        if (utils.isNull(value)) {
            return null;
        }

        throw new UnexpectedOutputError(`member ${member} output is not valid char string`, value);
    }

    /**
     * Get value of enum member `this->member`.
     * If failed throws UnexpectedOutputError.
     * 
     * NOTE: var does not know, what valid enum values for this type are,
     *       so it returns anything, that looks like valid enum value.
     * 
     * @param member member name of this var
     * @returns Enum value of this member as string
     */
    async getMemberValueEnum(member: string) {
        const value = await this.getMemberValue(member);
        if (!utils.isEnumResult(value)) {
            throw new UnexpectedOutputError(`member ${member} output is not enum`, value);
        }
        return value;
    }

    /**
     * Get bool value of `this->member`.
     * If failed throw UnexpectedOutputError.
     * 
     * @param member member name of this var
     * @returns Bool value of member
     */
    async getMemberValueBool(member: string) {
        const value = await this.getMemberValue(member);
        const result = utils.extractBoolFromValue(value);
        if (result === null) {
            throw new UnexpectedOutputError(`member ${member} output is not bool`, value);
        }
        return result;
    }

    /**
     * Get number value of `this->member`. 
     * If failed throws UnexpectedOutputError.
     * 
     * @param member member name of this var
     * @returns Number value of this member
     */
    async getMemberValueNumber(member: string) {
        const value = await this.getMemberValue(member);
        const num = Number(value);
        if (Number.isNaN(num)) {
            throw new UnexpectedOutputError(`member ${member} output is not number`, value);
        }
        return num;
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

        /* 
         * Also try find aliases for some NodeTags
         */
        const alias = this.context.nodeVarRegistry.aliases.get(this.realNodeTag);
        if (alias) {
            return utils.substituteStructName(this.type, alias);
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

    async getTreeItem() {
        return {
            label: this.tagsMatch()
                ? `${this.name}: ${this.type} = `
                : `${this.name}: ${this.type} [${this.realNodeTag}] = `,
            description: await this.getDescription(),
            collapsibleState: this.isExpandable()
                ? vscode.TreeItemCollapsibleState.Collapsed
                : vscode.TreeItemCollapsibleState.None,
        };
    }

    private async castToType(type: string) {
        const newVarExpression = `((${type})${this.evaluateName})`;
        const response = await this.debug.evaluate(newVarExpression, this.frameId);
        this.variablesReference = response.variablesReference;
    }

    private async castToTag(tag: string) {
        /* 
         * We should substitute current type with target, because 
         * there may be qualifiers such `struct' or `const'
         */
        const resultType = utils.substituteStructName(this.type, tag);
        await this.castToType(resultType);
    }

    private async getMembersImpl(): Promise<Variable[] | undefined> {
        const debugVariables = await this.debug.getMembers(this.variablesReference);
        return await Variable.mapVariables(debugVariables, this.frameId, this.context,
                                           this.logger, this);
    }

    async doGetChildren() {
        if (!this.tagsMatch()) {
            await this.castToTag(this.realNodeTag);
        }

        let members = await this.getMembersImpl();

        if (members?.length) {
            return members;
        }

        /*
         * If declared type has `struct' qualifier, we
         * can fail cast, because of invalid type specifier.
         * i.e. declared - `struct Path*' and real node tag
         * is `T_NestPath'. This will create `struct NestPath*',
         * but in versions prior to 14 NestPath is typedef
         * for another struct, so there is no struct NestPath.
         */
        if (this.type.indexOf('struct') !== -1) {
            const structLessType = this.type.replace('struct', '');
            await this.castToType(structLessType);
            members = await this.getMembersImpl();
        }
        return members;
    }

    protected async doGetRealMembers() {
        if (!this.tagsMatch()) {
            await this.castToTag(this.realNodeTag);
        }

        let members = await this.getMembersImpl();

        if (members?.length) {
            return members;
        }

        /*
         * If declared type has `struct' qualifier, we
         * can fail cast, because of invalid type specifier.
         * i.e. declared - `struct Path*' and real node tag
         * is `T_NestPath'. This will create `struct NestPath*',
         * but in versions prior to 14 NestPath is typedef
         * for another struct, so there is no struct NestPath.
         */
        if (this.type.indexOf('struct') !== -1) {
            const structLessType = this.type.replace('struct', '');
            await this.castToType(structLessType);
            members = await this.getMembersImpl();
        }
        return members;
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

    static async create(variable: dap.DebugVariable, frameId: number,
                        context: ExecContext, logger: utils.ILogger,
                        parent?: Variable): Promise<NodeTagVariable | undefined> {
        const getRealNodeTag = async () => {
            const nodeTagExpression = `((Node*)(${variable.evaluateName}))->type`;
            const response = await context.debug.evaluate(nodeTagExpression, frameId);
            let realTag = response.result?.replace('T_', '');
            if (!this.isValidNodeTag(realTag)) {
                return;
            }
            return realTag;
        }
                            
        if (!context.nodeVarRegistry.isNodeVar(variable.type)) {
            return;
        }

        let realTag = await getRealNodeTag();
        if (!realTag) {
            return;
        }

        const args: RealVariableArgs = {
            ...variable,
            frameId,
            parent,
            context
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
            return new BitmapSetSpecialMember(logger, args);
        }

        /* Expressions with it's representation */
        if (context.nodeVarRegistry.exprs.has(realTag)) {
            if (realTag === 'TargetEntry') {
                return new TargetEntryVariable(args, logger);
            }

            return new ExprNodeVariable(realTag, args, logger);
        }

        /* Display expressions in EquivalenceMember and RestrictInfo */
        if (realTag === 'EquivalenceMember') {
            return new EquivalenceMemberVariable(args, logger);
        }

        if (realTag === 'RestrictInfo') {
            return new RestrictInfoVariable(args, logger);
        }

        return new NodeTagVariable(realTag, args, logger);
    }
}

/**
 * Used only inside ExprNodeVariable in order not to pass huge type specification.
 * Created as container to postpone 'rtable' evaluation.
 */
class RangeTableContainer {
    rtableSearched: boolean = false;
    rtable: NodeTagVariable[] | undefined;
}

/**
 * Subtypes of Expr node, that can be displayed with text representation of it's expression
 */
class ExprNodeVariable extends NodeTagVariable {
    /**
     * String representation of expression.
     */
    protected repr?: string;

    /**
     * Evaluate expression and parse string from result.
     * If result is not correct string result output, then null returned.
     */
    private async evalStringResult(expr: string) {
        const result = await this.debug.evaluate(expr, this.frameId);
        return utils.extractStringFromResult(result.result);
    }

    /**
     * Run `get_func_name(this->oidMember)` and get output as string.
     */
    private async getFuncName(oidMember: string) {
        const result = await this.evaluate(`get_func_name(((${this.realNodeTag} *)${this.value})->${oidMember})`);
        return utils.extractStringFromResult(result.result);
    }

    /**
     * Run `get_opname(this->oidMember)` and get output as string.
     */
    private async getOpName(oidMember: string) {
        const result = await this.evaluate(`get_opname(((${this.realNodeTag} *)${this.value})->${oidMember})`);
        return utils.extractStringFromResult(result.result);
    }

    /**
     * Get elements of member 'this->member' and return list
     * of repr for each element
     */
    private async getListMemberElementsReprs(member: string, rtable: RangeTableContainer) {
        const elements = await this.getListMemberElements(member);
        
        const reprs = [];
        for (const elem of elements) {
            reprs.push(await this.getReprPlaceholder(elem, rtable));
        }

        return reprs;
    }

    /**
     * Get repr of 'this->member'
     */
    private async getMemberRepr(member: string, rtable: RangeTableContainer) {
        const exprMember = await this.getMember(member);
        return await this.getReprPlaceholder(exprMember, rtable);
    }

    /**
     * These are used as placeholders for repr, when we had
     * error during evaluation. This is done to give more
     * context, so developer can understand what the expression is.
     */
    private static exprPlaceholders = new Map<string, string>([
        ['Aggref', 'AGGREF'],
        ['AlternativeSubPlan', 'ALT_SUBPLAN'],
        ['ArrayCoerceExpr', 'ARRAY_COERCE'],
        ['ArrayExpr', 'ARRAY[]'],
        ['ArrayRef', 'ARRAY_REF'],
        ['BoolExpr', 'BOOL_EXPR'],
        ['BooleanTest', 'BOOL_TEST'],
        ['CaseExpr', 'CASE'],
        ['CaseTestExpr', 'CASE_TEST'],
        ['CaseWhen', 'CASE_WHEN'],
        ['CoalesceExpr', 'COALESCE'],
        ['CoerceToDomain', 'COERCE_DOMAIN'],
        ['CoerceToDomainValue', 'COERCE_DOMAIN_VAL'],
        ['CoerceViaIO', 'COERCE_IO'],
        ['CollateExpr', 'COLLATE'],
        ['Const', 'CONST'],
        ['ConvertRowtypeExpr', 'CONVERT_ROWTYPE'],
        ['CurrentOfExpr', 'CURRENT_OF'],
        ['DistinctExpr', 'DISTINCT'],
        ['FieldSelect', 'FIELD_SELECT'],
        ['FieldStore', 'FIELD_STORE'],
        ['FuncExpr', 'FUNC()'],
        ['GroupingFunc', 'GROUPING'],
        ['InferenceElem', 'INFER_ELEM'],
        ['JsonConstructorExpr', 'JSON_CTOR'],
        ['JsonExpr', 'JSON'],
        ['JsonValueExpr', 'JSON_VALUE'],
        ['MergeSupportFunc', 'MERGE_SUPPORT'],
        ['MinMaxExpr', 'MIN_MAX'],
        ['NamedArgExpr', 'NAMED_ARG'],
        ['NextValueExpr', 'NEXTVAL'],
        ['NullIfExpr', 'NULL_IF'],
        ['NullTest', 'NULL_TEST'],
        ['OpExpr', 'OP_EXPR'],
        ['Param', 'PARAM'],
        ['RelabelType', 'RELABEL_TYPE'],
        ['RowCompareExpr', 'ROW_COMPARE'],
        ['RowExpr', 'ROW()'],
        ['SQLValueFunctionOp', 'SQL_VAL_FUNC()'],
        ['ScalarArrayOpExpr', 'SCALAR_ARRAY_OP'],
        ['SetToDefault', 'SET_DEFAULT'],
        ['SubLink', 'SUB_LINK'],
        ['SubPlan', 'SUB_PLAN'],
        ['SubscriptingRef', 'SUBSCRIPT'],
        ['Var', 'VAR'],
        ['WindowFunc', 'WINDOW'],
        ['WindowFuncRunCondition', 'WINDOW_F_RUN_COND'],
        ['XmlExpr', 'XML'],
        ['XmlExprOp', 'XML_OP'],
    ]);

    /* 
     * Get placeholder in expression tree for given variable
     */
    private getExprPlaceholder(variable: Variable) {
        /* 
         * When some variable appears in Expr, but we
         * do not have logic to format representation this
         * function is called to fullfil this with some
         * meaningful word/placeholder.
         * 
         * Ordinarily, there will be other Exprs, for
         * which we do not have implementation
         */

        if (!(variable instanceof NodeTagVariable)) {
            return 'EXPR';
        }

        return ExprNodeVariable.exprPlaceholders.get(variable.realNodeTag) ?? 'EXPR';
    }

    /**
     * Auxiliary function to get repr of Variable with 
     * max details if failed. This is
     */
    private async getReprPlaceholder(variable: Variable, rtable: RangeTableContainer) {
        if (variable instanceof ExprNodeVariable) {
            return await variable.getReprInternal(rtable);
        } else {
            return this.getExprPlaceholder(variable);
        }
    }

    private async formatVarExpr(rtable: RangeTableContainer) {
        const varno = await this.getMemberValueNumber('varno');

        let relname: string, 
            attname: string;
        switch (varno) {
            case -1:
            case 65000:
                /* INNER_VAR */
                relname = 'INNER';
                attname = '?';
                break;
            case -2:
            case 65001:
                /* OUTER_VAR */
                relname = 'OUTER';
                attname = '?';
                break;
            case -3:
            case 65002:
                /* INDEX_VAR */
                relname = 'INDEX';
                attname = '?';
                break;
            default:
                if (!rtable.rtableSearched) {
                    if (!rtable.rtable) {
                        rtable.rtable = await this.findRtable() as NodeTagVariable[] | undefined;
                        rtable.rtableSearched = true;
                    }
                }

                if (rtable.rtable) {
                    if (!(varno > 0 && varno <= rtable.rtable.length)) {
                        /* This was an Assert */
                        throw new EvaluationError('failed to get RTEs from range table');
                    }
    
                    const rte = rtable.rtable[varno - 1];
                    /* 'rte.value' will be pointer to RTE struct */
                    relname = await this.evalStringResult(`((RangeTblEntry *)${rte.value})->eref->aliasname`) ?? '???';
                    attname = await this.evalStringResult(`get_rte_attribute_name(((RangeTblEntry *)${rte.value}), ((Var *)${this.value})->varattno)`) ?? '???';
                    break;
                } else {
                    relname = '???';
                    attname = '???';
                }

        }

        return `${relname}.${attname}`;
    }

    private async formatConst(rtable: RangeTableContainer) {
        const palloc = async (size: string) => {
            let result = await this.evaluate(`palloc(${size})`);
            
            if (!utils.isValidPointer(result.result)) {
                if (utils.isNull(result.result)) {
                    throw new EvaluationError('failed to allocate memory using palloc: no memory');
                }

                if (result.result.startsWith('-var-create')) {
                    /* On older systems palloc is a macro for MemoryContextAlloc */
                    result = await this.evaluate(`MemoryContextAlloc(CurrentMemoryContext, ${size})`);
                    if (utils.isValidPointer(result.result)) {
                        return result.result;
                    }
                    throw new EvaluationError('failed to allocate memory using MemoryContextAlloc', result.result);
                }

                throw new EvaluationError('failed to allocate memory using palloc', result.result);
            }

            return result.result;
        }

        const pfree = async (ptr: string) => {
            await this.debug.evaluate(`pfree((void *)${ptr})`, this.frameId);
        }

        const evalOid = async (expr: string) => {
            const res = await this.evaluate(expr);
            const oid = Number(res.result);
            if (Number.isNaN(oid)) {
                throw new EvaluationError(`failed to get Oid from expr: ${expr}`, res.result);
            }

            return oid;
        }
        
        const evalStrWithPtr = async (expr: string) => {
            const result = await this.debug.evaluate(expr, this.frameId);
            const str = utils.extractStringFromResult(result.result);
            if (str === null) {
                throw new EvaluationError(`failed to get string from expr: ${expr}`, result.result);
            }
            
            const ptr = utils.extractPtrFromStringResult(result.result);
            if (ptr === null) {
                throw new EvaluationError(`failed to get pointer from expr: ${expr}`, result.result);
            }
            return [str, ptr];
        }

        const legacyOidOutputFunctionCall = async (funcOid: number) => {
            /* 
             * Older systems do not have OidOutputFunctionCall().
             * But, luckily, it's very simple to write it by our selves.
             */
            
            const fmgrInfo = await palloc('sizeof(FmgrInfo)');
            /* Init FmgrInfo */
            await this.evaluate(`fmgr_info(${funcOid}, (void *)${fmgrInfo})`);
            
            /* Call function */
            const [str, ptr] = await evalStrWithPtr(`(char *)((Pointer) FunctionCall1(((void *)${fmgrInfo}), ((Const *)${this.value})->constvalue))`);
            await pfree(ptr);
            return str;
        }

        if (await this.getMemberValueBool('constisnull')) {
            return 'NULL';
        }

        const tupoutput = await palloc('sizeof(Oid)');
        const tupIsVarlena = await palloc('sizeof(Oid)');

        /* 
         * Older system have 4 param - tupOIParam.
         * We pass it also even on modern systems - anyway only thing
         * we want is 'tupoutput'.
         * Hope, debugger will not invalidate the stack after that...
         */
        const tupIOParam = await palloc('sizeof(Oid)');

        /* 
         * WARN: I do not why, but you MUST cast pointers as 'void *',
         *       not 'Oid *' or '_Bool *'.
         *       Otherwise, passed pointers will have some offset
         *       (*orig_value* + offset), so written values will
         *       be stored in random place.
         */
        await this.evaluate(`getTypeOutputInfo(((Const *)${this.value})->consttype, ((void *)${tupoutput}), ((void *)${tupIOParam}), ((void *)${tupIsVarlena}))`);

        const funcOid = await evalOid(`*((Oid *)${tupoutput})`);
        if (funcOid === 0) {
            /* Invalid function */
            return '???';
        }
        
        let repr;
        try {
            const [str, ptr] = await evalStrWithPtr(`OidOutputFunctionCall(${funcOid}, ((Const *)${this.value})->constvalue)`);
            await pfree(ptr);
            repr = str;
        } catch (e) {
            if (!(e instanceof EvaluationError)) {
                throw e;
            }

            repr = await legacyOidOutputFunctionCall(funcOid);
        }

        await pfree(tupoutput);
        await pfree(tupIsVarlena);
        await pfree(tupIOParam);

        return repr;
    }

    private async formatOpExpr(rtable: RangeTableContainer) {
        const opname = await this.getOpName('opno') ?? '(invalid op)';
        const args = await this.getListMemberElements('args');
        if (args.length === 0) {
            throw new UnexpectedOutputError('OpExpr contains no args');
        }

        let data;
        if (args.length > 1) {
            data = [
                await this.getReprPlaceholder(args[0], rtable),
                opname,
                await this.getReprPlaceholder(args[1], rtable),
            ]
        } else {
            data = [
                opname,
                await this.getReprPlaceholder(args[0], rtable)
            ]
        }

        return data.join(' ');
    }

    private async formatFuncExpr(rtable: RangeTableContainer) {
        const funcname = await this.getFuncName('funcid') ?? '(invalid func)';

        const args = await this.getListMemberElements('args');

        const coerceType = await this.getMemberValueEnum('funcformat');

        switch (coerceType) {
            case 'COERCE_EXPLICIT_CALL':
            case 'COERCE_SQL_SYNTAX':
            case 'COERCE_DONTCARE':
                /* 
                 * It's hard to represent COERCE_SQL_SYNTAX, because there are
                 * multiple SQL features with different features (like
                 * EXTRACT(x FROM y)) and most of them depend on Oid's of
                 * types.
                 * Example you can see in src/backend/utils/adt/ruleutils.c.
                 * So i decided to simplify it to level of just function call
                 */
                const argsExpressions: string[] = [];
                for (const arg of args) {
                    argsExpressions.push(await this.getReprPlaceholder(arg, rtable));
                }

                return `${funcname}(${argsExpressions.join(', ')})`;
            case 'COERCE_EXPLICIT_CAST':
                const argRepr = await this.getReprPlaceholder(args[0], rtable);
                return `${argRepr}::${funcname}`;
            case 'COERCE_IMPLICIT_CAST':
                /* User did not request explicit cast, so show as simple expr */
                return await this.getReprPlaceholder(args[0], rtable);
            }
        return '???';
    }

    private async formatAggref(rtable: RangeTableContainer) {
        const funcname = await this.getFuncName('aggfnoid') ?? '(invalid func)';

        const argsMember = await this.getMember('args');
        const reprs = await this.getListMemberElementsReprs('args', rtable);
        
        let args;
        if (reprs.length === 0) {
            /* If agg function called with '*', then 'args' is NIL */
            args = '*';
        } else {
            args = reprs.join(', ');
        }


        return `${funcname}(${args})`;
    }

    private async formatTargetEntry(rtable: RangeTableContainer) {
        /* NOTE: keep return type annotation, because now compiler can not
         *       handle such recursion correctly
         */
        const expr = await this.getMember('expr');
        return await this.getReprPlaceholder(expr, rtable);
    }

    private async formatScalarArrayOpExpr(rtable: RangeTableContainer) {
        const opname = await this.getOpName('opno') ?? '(invalid op)';

        const useOr = await this.getMemberValueBool('useOr');
        const args = await this.getListMemberElements('args');
        if (args.length !== 2) {
            throw new EvaluationError(`ScalarArrayOpExpr should contain 2 arguments, given: ${args.length}`);
        }

        const [scalar, array] = args;
        const scalarRepr = await this.getReprPlaceholder(scalar, rtable);
        const arrayRepr = await this.getReprPlaceholder(array, rtable);
        const funcname = useOr ? 'ANY' : 'ALL';

        return `${scalarRepr} ${opname} ${funcname}(${arrayRepr})`;
    }

    private async formatBoolExpr(rtable: RangeTableContainer) {
        const boolOp = await this.getMemberValueEnum('boolop')
        const args = await this.getListMemberElements('args');

        if (boolOp === 'NOT_EXPR') {
            const exprRepr = await this.getReprPlaceholder(args[0], rtable);
            return `NOT ${exprRepr}`;
        }

        const argsReprs = [];
        for (const arg of args) {
            argsReprs.push(await this.getReprPlaceholder(arg, rtable));
        }

        let joinExpr;
        switch (boolOp) {
            case 'AND_EXPR':
                joinExpr = ' AND ';
                break;
            case 'OR_EXPR':
                joinExpr = ' OR ';
                break;
            default:
                joinExpr = ' ??? ';
                break;
        }

        return argsReprs.join(joinExpr);
    }

    private async formatCoalesceExpr(rtable: RangeTableContainer) {
        const args = await this.getListMemberElements('args');
        const argsReprs = [];
        for (const arg of args) {
            argsReprs.push(await this.getReprPlaceholder(arg, rtable));
        }

        return `COALESCE(${argsReprs.join(', ')})`;
    }

    private async formatNullTest(rtable: RangeTableContainer) {
        const expr = await this.getMember('arg');
        const innerRepr = await this.getReprPlaceholder(expr, rtable);
        
        const testType = await this.getMemberValueEnum('nulltesttype');
        let testSql;
        switch (testType) {
            case 'IS_NULL':
                testSql = 'IS NULL';
                break;
            case 'IS_NOT_NULL':
                testSql = 'IS NOT NULL';
                break;
            default:
                testSql = '???';
                break;
        }
        return `${innerRepr} ${testSql}`;
    }

    private async formatBooleanTest(rtable: RangeTableContainer) {
        const arg = await this.getMember('arg');
        const innerRepr = await this.getReprPlaceholder(arg, rtable);
        
        const testType = await this.getMemberValueEnum('booltesttype');
        let test;
        switch (testType) {
            case 'IS_TRUE':
                test = 'IS TRUE';
                break;
            case 'IS_NOT_TRUE':
                test = 'IS NOT TRUE';
                break;
            case 'IS_FALSE':
                test = 'IS FALSE';
                break;
            case 'IS_NOT_FALSE':
                test = 'IS NOT FALSE';
                break;
            case 'IS_UNKNOWN':
                test = 'IS NULL';
                break;
            case 'IS_NOT_UNKNOWN':
                test = 'IS NOT NULL';
                break;
            default:
                test = 'IS ???';
                break;
        }

        return `${innerRepr} ${test}`;
    }

    private async formatArrayExpr(rtable: RangeTableContainer) {
        const reprs = await this.getListMemberElementsReprs('elements', rtable);
        return `ARRAY[${reprs.join(', ')}]`;
    }

    private async formatSqlValueFunction(rtable: RangeTableContainer) {
        const getTypmod = async () => {
            return await this.getMemberValueNumber('typmod');
        }
        const funcOp = await this.getMemberValueEnum('op');
        let funcname;
        switch (funcOp) {
            case 'SVFOP_CURRENT_DATE':
                funcname = 'CURRENT_DATE';
                break;
            case 'SVFOP_CURRENT_TIME':
                funcname = 'CURRENT_TIME';
                break;
            case 'SVFOP_CURRENT_TIME_N':
                funcname = `CURRENT_TIME(${await getTypmod()})`;
                break;
            case 'SVFOP_CURRENT_TIMESTAMP':
                funcname = 'CURRENT_TIMESTAMP';
                break;
            case 'SVFOP_CURRENT_TIMESTAMP_N':
                funcname = `CURRENT_TIMESTAMP(${await getTypmod()})`;
                break;
            case 'SVFOP_LOCALTIME':
                funcname = 'LOCALTIME';
                break;
            case 'SVFOP_LOCALTIME_N':
                funcname = `LOCALTIME(${await getTypmod()})`;
                break;
            case 'SVFOP_LOCALTIMESTAMP':
                funcname = 'LOCALTIMESTAMP';
                break;
            case 'SVFOP_LOCALTIMESTAMP_N':
                funcname = `LOCALTIMESTAMP(${await getTypmod()})`;
                break;
            case 'SVFOP_CURRENT_ROLE':
                funcname = 'CURRENT_ROLE';
                break;
            case 'SVFOP_CURRENT_USER':
                funcname = 'CURRENT_USER';
                break;
            case 'SVFOP_USER':
                funcname = 'USER';
                break;
            case 'SVFOP_SESSION_USER':
                funcname = 'SESSION_USER';
                break;
            case 'SVFOP_CURRENT_CATALOG':
                funcname = 'CURRENT_CATALOG';
                break;
            case 'SVFOP_CURRENT_SCHEMA':
                funcname = 'CURRENT_SCHEMA';
                break;
            default:
                funcname = '???';
                break;
        }

        return funcname;
    }

    private async formatMinMaxExpr(rtable: RangeTableContainer) {
        const op = await this.getMemberValueEnum('op');
        const argsReprs = await this.getListMemberElementsReprs('args', rtable);

        let funcname;
        switch (op) {
            case 'IS_GREATEST':
                funcname = 'GREATEST';
                break;
            case 'IS_LEAST':
                funcname = 'LEAST';
                break;
            default:
                funcname = '???';
                break;
        }

        return `${funcname}(${argsReprs.join(', ')})`;
    }

    private async formatRowExpr(rtable: RangeTableContainer) {
        const reprs = await this.getListMemberElementsReprs('args', rtable);
        return `ROW(${reprs.join(', ')})`;
    }

    private async formatDistinctExpr(rtable: RangeTableContainer) {
        const reprs = await this.getListMemberElementsReprs('args', rtable);
        if (reprs.length != 2) {
            throw new EvaluationError('should be 2 arguments for DistinctExpr');
        }

        const [left, right] = reprs;
        return `${left} IS DISTINCT FROM ${right}`;
    }

    private async formatNullIfExpr(rtable: RangeTableContainer) {
        const reprs = await this.getListMemberElementsReprs('args', rtable);
        if (reprs.length != 2) {
            throw new EvaluationError('should be 2 arguments for NullIf');
        }

        const [left, right] = reprs;
        return `NULLIF(${left}, ${right})`;
    }

    private async formatNamedArgExpr(rtable: RangeTableContainer) {
        const arg = await this.getMemberRepr('arg', rtable);
        const name = await this.getMemberValueCharString('name');
        return `${name} => ${arg}`;
    }

    private async formatGroupingFunc(rtable: RangeTableContainer) {
        const reprs = await this.getListMemberElementsReprs('args', rtable);
        return `GROUPING(${reprs.join(', ')})`;
    }

    private async formatWindowFunc(rtable: RangeTableContainer) {
        const funcname = await this.getFuncName('winfnoid') ?? '(invalid func)';
        const reprs = await this.getListMemberElementsReprs('args', rtable);
        let repr = `${funcname}(${reprs.join(', ')})`
        try {
            const filterRepr = await this.getMemberRepr('aggfilter', rtable);
            repr += ` FILTER (${filterRepr})`;
        } catch (e) {
            if (!(e instanceof EvaluationError)) {
                throw e;
            }
        }
        
        return repr;
    }

    private async formatSubscriptingRef(rtable: RangeTableContainer) {
        const exprRepr = await this.getMemberRepr('refexpr', rtable);
        const upperIndices = await this.getListMemberElements('refupperindexpr');
        let lowerIndices = null;
        try {
            lowerIndices = await this.getListMemberElements('reflowerindexpr');
        } catch (e) {
            if (!(e instanceof EvaluationError)) {
                throw e;
            }
        }

        const indicesReprs = [];
        if (lowerIndices !== null) {
            for (let i = 0; i < upperIndices.length; i++) {
                const upper = upperIndices[i];
                const lower = lowerIndices[i];
                let index = '[';
                if (!utils.isNull(lower.value)) {
                    index += await this.getReprPlaceholder(lower, rtable);
                }
                index += ':';
                if (!utils.isNull(upper.value)) {
                    index += await this.getReprPlaceholder(upper, rtable);
                }
                index += ']';
                indicesReprs.push(index);
            }
        } else {
            for (let i = 0; i < upperIndices.length; i++) {
                const upper = upperIndices[i];
                const index = await this.getReprPlaceholder(upper, rtable);
                indicesReprs.push(`[${index}]`);
            }
        }

        return `(${exprRepr}${indicesReprs.join('')})`;
    }

    private async formatXmlExpr(rtable: RangeTableContainer) {
        const getArgNameListOfStrings = async () => {
        /* Get List of T_String elements and take their 'sval' values */
        const list = await this.getListMemberElements('arg_names');
        const values = [];
        for (const entry of list) {
            if (entry instanceof NodeTagVariable) {
                if (entry.realNodeTag === 'String') {
                    const sval = (await entry.getRealMembers() ?? []).find(v => v.name === 'sval');
                    if (sval) {
                        values.push(utils.extractStringFromResult(sval.value) ?? 'NULL');
                    } else {
                        values.push('???')
                    }
                } else if (entry instanceof ExprNodeVariable) {
                    values.push(await entry.getReprInternal(rtable));
                } else {
                    values.push('???');
                }
            } else {
                values.push('???');
            }
        }
        return values;
        }
        
        const xmlOp = await this.getMemberValueEnum('op');
        switch (xmlOp) {
            case 'IS_XMLELEMENT':
                {
                    let namedArgs: string[] | null;
                    let argNames: string[] | null;
                    try {
                        namedArgs = await this.getListMemberElementsReprs('named_args', rtable);
                        argNames = await getArgNameListOfStrings();
                    } catch (e) {
                        if (e instanceof EvaluationError) {
                            namedArgs = null;
                            argNames = null;
                        } else {
                            throw e;
                        }
                    }
                    let args: string[] | null;
                    try {
                        args = await this.getListMemberElementsReprs('args', rtable);
                    } catch (e) {
                        if (e instanceof EvaluationError) {
                            args = null;
                        } else {
                            throw e;
                        }
                    }
                    const name = await this.getMemberValueCharString('name');
                    let repr = `XMLELEMENT(name ${name ?? 'NULL'}`;
                    if (namedArgs && argNames && namedArgs.length === argNames.length) {
                        let xmlattributes = [];
                        for (let i = 0; i < namedArgs.length; i++) {
                            const arg = namedArgs[i];
                            const name = argNames[i];
                            xmlattributes.push(`${arg} AS ${name}`);
                        }
                        repr += `, XMLATTRIBUTES(${xmlattributes.join(', ')})`;
                    }
    
                    if (args) {
                        repr += `, ${args.join(', ')}`;
                    }
                    repr += ')';
                    return repr;
                }
            case 'IS_XMLFOREST':
                {
                    let namedArgs: string[] | null;
                    let argNames: string[] | null;
                    try {
                        namedArgs = await this.getListMemberElementsReprs('named_args', rtable);
                        argNames = await getArgNameListOfStrings();
                    } catch (e) {
                        if (e instanceof EvaluationError) {
                            namedArgs = null;
                            argNames = null;
                        } else {
                            throw e;
                        }
                    }
                    let repr = 'XMLFOREST(';
                    if (namedArgs && argNames && namedArgs.length === argNames.length) {
                        let xmlattributes = [];
                        for (let i = 0; i < namedArgs.length; i++) {
                            const arg = namedArgs[i];
                            const name = argNames[i];
                            xmlattributes.push(`${arg} AS ${name}`);
                        }
                        repr += `${xmlattributes.join(', ')}`;
                    }
                    repr += ')';
                    return repr;
                }
            case 'IS_XMLCONCAT':
                {
                    let args: string[] | null;
                    try {
                        args = await this.getListMemberElementsReprs('args', rtable);
                    } catch (e) {
                        if (e instanceof EvaluationError) {
                            args = null;
                        } else {
                            throw e;
                        }
                    }

                    let repr = 'XMLCONCAT(';
                    if (args) {
                        repr += args.join(', ');
                    }
                    repr += ')';
                    return repr;
                }
            case 'IS_XMLPARSE':
                {
                    const option = await this.getMemberValueEnum('xmloption');
                    const args = await this.getListMemberElementsReprs('args', rtable);
                    if (!args) {
                        return 'XMLPARSE()';
                    }

                    const data = args[0];
                    return `XMLPARSE(${option === 'XMLOPTION_DOCUMENT' ? 'DOCUMENT' : 'CONTENT'} ${data})`;
                }
            case 'IS_XMLPI':
                {
                    const name = await this.getMemberValueCharString('name');
                    const args = await this.getListMemberElementsReprs('args', rtable);
                    let repr = `XMLPI(NAME ${name}`;
                    if (args) {
                        repr += `, ${args.join(', ')}`;
                    }
                    repr += ')';
                    return repr;
                }
            case 'IS_XMLROOT':
                {
                    const args = await this.getListMemberElementsReprs('args', rtable);
                    let repr = 'XMLROOT(';
                    if (1 <= args.length) {
                        repr += args[0];
                    }
                    
                    if (2 <= args.length) {
                        repr += `, ${args[1]}`;
                    }

                    if (3 <= args.length) {
                        repr += `, ${args[2]}`;
                    }

                    repr += ')';
                    return repr;
                }
            case 'IS_XMLSERIALIZE':
                {
                    const option = await this.getMemberValueEnum('xmloption');
                    const args = await this.getListMemberElementsReprs('args', rtable);
                    const indent = await this.getMemberValueBool('indent');
                    let repr = 'XMLSERIALIZE(';
                    if (args) {
                        repr += option === 'XMLOPTION_DOCUMENT' ? 'DOCUMENT ' : 'CONTENT ';
                        repr += args[0];
                    }

                    if (indent) {
                        repr += ' INDENT';
                    }
                    repr += ')';
                    return repr;
                }
                break;
            case 'IS_DOCUMENT':
                {
                    const args = await this.getListMemberElementsReprs('args', rtable);
                    if (args) {
                        return `${args[0]} IS DOCUMENT`;
                    } else {
                        return '??? IS DOCUMENT';
                    }
                }
            }
        return '???';
    }

    private async formatSubLink(rtable: RangeTableContainer) {
        const type = await this.getMemberValueEnum('subLinkType');
        if (type === 'EXISTS_SUBLINK') {
            return 'EXISTS(...)';
        }
        
        if (type === 'CTE_SUBLINK') {
            return 'CTE(...)';
        }

        if (type === 'EXPR_SUBLINK' || type === 'MULTIEXPR_SUBLINK') {
            return '(...)';
        }

        if (type === 'ARRAY_SUBLINK') {
            return 'ARRAY(...)';
        }
        
        const getOpExprLeftRepr = async (v: Variable) => {
            /* 
             * This function is used to obtain first argument from OpExpr.
             * Mimics `get_leftop` semantics.
             */
            if (!(v instanceof NodeTagVariable && v.realNodeTag === 'OpExpr')) {
                return '???';
            }

            const elements = await v.getListMemberElements('args')
            if (elements.length) {
                const left = elements[0];
                if (left instanceof ExprNodeVariable) {
                    return await left.getReprInternal(rtable);
                }
            }

            return '???';
        }

        const testexpr = await this.getMember('testexpr');
        if (!(testexpr instanceof NodeTagVariable)) {
            throw new EvaluationError('Failed to get SubLink->testexpr');
        }

        /* 
         * Depending on attribute count we might have:
         * - OpExpr - single attribute
         * - BoolExpr - mulitple OpExprs (in same form as OpExpr)
         * - RowCompareExpr - list of attributes
         */
        let leftReprs: string[];
        if (testexpr.realNodeTag === 'OpExpr') {
            leftReprs = [await getOpExprLeftRepr(testexpr)];
        } else if (testexpr.realNodeTag === 'BoolExpr') {
            const elements = await testexpr.getListMemberElements('args')
            const reprs: string[] = [];
            for (const e of elements) {
                reprs.push(await getOpExprLeftRepr(e));
            }

            leftReprs = reprs;
        } else {
            /* testexpr.realNodeTag === 'RowCompareExpr' */

            /* For RowCompareExpr in SubLink we will have all Param in 'rargs' */
            const largs = await testexpr.getListMemberElements('largs');
            const reprs = [];
            for (const arg of largs) {
                reprs.push(await this.getReprPlaceholder(arg, rtable));
            }
            leftReprs = reprs;
        }

        /* SubLink->operName[0]->sval */
        let opname = '???';
        const elements = await this.getListMemberElements('operName');
        if (elements?.length && elements[0] instanceof RealVariable) {
            /* Depending of PG version, it can be Value or String (now) */
            try {
                /* Try String */
                const sval = await elements[0].getMember('sval');
                opname = utils.extractStringFromResult(sval.value) ?? '???';
            } catch (e) {
                if (!(e instanceof NoMemberFoundError)) {
                    throw e;
                }
            }

            /* Try Value */
            opname = await this.evalStringResult(`((Value *)${elements[0].value})->val.str`) ?? '???';
        }

        /* Maybe, there are no reprs in array, so 'join' seems safe here */
        const leftRepr = leftReprs.length > 1 || leftReprs.length === 0 
                            ? `ROW(${leftReprs.join(', ')})` 
                            : leftReprs[0];

        let funcname;
        switch (type) {
            case 'ALL_SUBLINK':
                funcname = 'ALL';
                break;
            case 'ANY_SUBLINK':
                funcname = 'ANY';
                break;
            case 'ROWCOMPARE_SUBLINK':
                funcname = '';
                break;
            default:
                funcname = '???';
                break;
        }
        return `${leftRepr} ${opname} ${funcname}(...)`;
    }

    private async formatRowCompareExpr(rtable: RangeTableContainer) {
        const getReprs = async (arr: string[], member: string) => {
            const elements = await this.getListMemberElementsReprs(member, rtable);
            for (const e of elements) {
                arr.push(e);
            }
        }

        const compareType = await this.getMemberValueEnum('rctype');
        const leftReprs: string[] = [];
        const rightReprs: string[] = [];

        await getReprs(leftReprs, 'largs');
        await getReprs(rightReprs, 'rargs');

        let opname;
        switch (compareType) {
            case 'ROWCOMPARE_LT':
                opname = '<'
                break;
            case 'ROWCOMPARE_LE':
                opname = '<=';
                break;
            case 'ROWCOMPARE_EQ':
                opname = '=';
                break;
            case 'ROWCOMPARE_GE':
                opname = '>=';
                break;
            case 'ROWCOMPARE_GT':
                opname = '>';
                break;
            case 'ROWCOMPARE_NE':
                opname = '<>';
                break;
            default:
                opname = '???';
                break;
        }

        return `ROW(${leftReprs.join(', ')}) ${opname} ROW(${rightReprs.join(', ')})`;
    }

    private async delegateFormatToMember(member: string, rtable: RangeTableContainer) {
        /* 
         * Repr of some exprs is same as repr of their field.
         * For such cases use this function in order not to
         * product many other functions.
         */
        return await this.getMemberRepr(member, rtable);
    }

    private async formatParam(rtable: RangeTableContainer) {
        const paramNum = await this.getMemberValueNumber('paramid');
        return `PARAM$${paramNum}`;
    }

    private async formatJsonExpr(rtable: RangeTableContainer) {
        const op = await this.getMemberValueEnum('op');
        switch (op) {
            case 'JSON_EXISTS_OP':
                return 'JSON_EXISTS(...)';
            case 'JSON_QUERY_OP':
                return 'JSON_QUERY(...)';
            case 'JSON_VALUE_OP':
                return 'JSON_VALUE(...)';
            case 'JSON_TABLE_OP':
                return 'JSON_TABLE(...)'
            default:
                const trailing = op.lastIndexOf('_OP');
                if (trailing === -1) {
                    return `${op}(...)`
                }
                return `${op.substring(0, trailing)}(...)`;
        }
    }

    private async formatJsonConstructorExpr(rtable: RangeTableContainer) {
        const ctorType = await this.getMemberValueEnum('type');
        const args = await this.getListMemberElementsReprs('args', rtable);
        if (ctorType === 'JSCTOR_JSON_OBJECTAGG' || ctorType === 'JSCTOR_JSON_ARRAYAGG') {
            /* 
             * At runtime these function are rewritten and extracting
             * arguments from actual FuncExpr/WindowExpr to recreate
             * function repr "as it was meant" seems overhead.
             * So show already rewritten function - we can do it already.
             */
            return await this.getMemberRepr('func', rtable);
        }

        let funcname;
        switch (ctorType) {
            case 'JSCTOR_JSON_OBJECT':
                funcname = 'JSON_OBJECT';
                break;
            case 'JSCTOR_JSON_ARRAY':
                funcname = 'JSON_ARRAY';
                break;
            case 'JSCTOR_JSON_PARSE':
                funcname = 'JSON';
                break;
            case 'JSCTOR_JSON_SCALAR':
                funcname = 'JSON_SCALAR';
                break;
            case 'JSCTOR_JSON_SERIALIZE':
                funcname = 'JSON_SERIALIZE';
                break;
            default:
                {
                    const idx = ctorType.indexOf('JSCTOR_');
                    if (idx !== -1) {
                        funcname = ctorType.substring(7);
                    } else {
                        funcname = ctorType;
                    }
                }
                break;
        }

        let argsRepr;
        if (ctorType === 'JSCTOR_JSON_OBJECT') {
            let comma = false;
            argsRepr = '';
            for (let i = 0; i < args.length - 1; i++) {
                const arg = args[i];
                argsRepr += arg;
                argsRepr += comma ? ', ' : ' : ';
                comma = !comma;
            }

            argsRepr += args[args.length - 1];
        } else {
            argsRepr = args.join(', ');
        }

        return `${funcname}(${argsRepr})`;
    }

    private async formatJsonIsPredicate(rtable: RangeTableContainer) {
        const expr = await this.getMemberRepr('expr', rtable);
        const jsonType = await this.getMemberValueEnum('item_type');
        switch (jsonType) {
            case 'JS_TYPE_ANY':
                return `${expr} IS JSON`;
            case 'JS_TYPE_OBJECT':
                return `${expr} IS JSON OBJECT`;
            case 'JS_TYPE_ARRAY':
                return `${expr} IS JSON ARRAY`;
            case 'JS_TYPE_SCALAR':
                return `${expr} IS JSON SCALAR`;
            default:
                return `${expr} IS JSON ???`;
        }
    }

    private async formatWindowFuncRunCondition(rtable: RangeTableContainer) {
        const wfuncLeft = await this.getMemberValueBool('wfunc_left');
        const expr = await this.getMemberRepr('arg', rtable);
        const opname = await this.getOpName('opno') ?? '(invalid op)';
        let left, right;
        if (wfuncLeft) {
            left = 'WINDOW';
            right = expr;
        } else {
            left = expr;
            right = 'WINDOW';
        }

        return `${left} ${opname} ${right}`;
    }

    private async formatCaseWhen(rtable: RangeTableContainer) {
        const when = await this.getMemberRepr('expr', rtable);
        const then = await this.getMemberRepr('result', rtable);
        return `WHEN ${when} THEN ${then}`;
    }

    private async formatFieldSelect(rtable: RangeTableContainer) {
        /* 
         * This is hard to determine name of field using only
         * attribute number - there are many manipulations should occur.
         * For example, see src/backend/utils/adt/ruleutils.c:get_name_for_var_field.
         * 
         * For now, just print container expr and '???' as field.
         * I think, in the end developers will understand which field is used.
         */
        const expr = await this.getMemberRepr('arg', rtable);
        return `${expr}.???`;
    }

    private async formatFieldStore(rtable: RangeTableContainer) {
        const expr = await this.getMemberRepr('arg', rtable);
        return `${expr}.??? = ???`;
    }

    private async formatCurrentOfExpr(rtable: RangeTableContainer) {
        const sval = await this.getMemberValueCharString('cursor_name');
        return `CURRENT OF ${sval === null ? 'NULL' : sval}`;
    }

    private async formatExpr(rtable: RangeTableContainer): Promise<string> {
        /* 
         * WARN: if you add/remove something here do not forget to update 
         *       src/constants.ts:getDisplayedExprs
         */
        try {
            switch (this.realNodeTag) {
                case 'Var':
                    return await this.formatVarExpr(rtable);
                case 'Const':
                    return await this.formatConst(rtable);
                case 'OpExpr':
                    return await this.formatOpExpr(rtable);
                case 'FuncExpr':
                    return await this.formatFuncExpr(rtable);
                case 'Aggref':
                    return await this.formatAggref(rtable);
                case 'TargetEntry':
                    return await this.formatTargetEntry(rtable);
                case 'ScalarArrayOpExpr':
                    return await this.formatScalarArrayOpExpr(rtable);
                case 'BoolExpr':
                    return await this.formatBoolExpr(rtable);
                case 'BooleanTest':
                    return await this.formatBooleanTest(rtable);
                case 'CoalesceExpr':
                    return await this.formatCoalesceExpr(rtable);
                case 'Param':
                    return await this.formatParam(rtable);
                case 'NullTest':
                    return await this.formatNullTest(rtable);
                case 'ArrayExpr':
                    return await this.formatArrayExpr(rtable);
                case 'SQLValueFunction':
                    return await this.formatSqlValueFunction(rtable);
                case 'MinMaxExpr':
                    return await this.formatMinMaxExpr(rtable);
                case 'RowExpr':
                    return await this.formatRowExpr(rtable);
                case 'DistinctExpr':
                    return await this.formatDistinctExpr(rtable);
                case 'NullIfExpr':
                    return await this.formatNullIfExpr(rtable);
                case 'NamedArgExpr':
                    return await this.formatNamedArgExpr(rtable);
                case 'GroupingFunc':
                    return await this.formatGroupingFunc(rtable);
                case 'WindowFunc':
                    return await this.formatWindowFunc(rtable);
                case 'SubscriptingRef':
                case 'ArrayRef':
                    return await this.formatSubscriptingRef(rtable);
                case 'XmlExpr':
                    return await this.formatXmlExpr(rtable);
                case 'SubLink':
                    return await this.formatSubLink(rtable);
                case 'RowCompareExpr':
                    return await this.formatRowCompareExpr(rtable);
                case 'ArrayCoerceExpr':
                    return await this.delegateFormatToMember('arg', rtable);
                case 'CoerseToDomain':
                    return await this.delegateFormatToMember('arg', rtable);
                case 'ConvertRowtypeExpr':
                    return await this.delegateFormatToMember('arg', rtable);
                case 'CollateExpr':
                    return await this.delegateFormatToMember('arg', rtable);
                case 'CoerceViaIO':
                    return await this.delegateFormatToMember('arg', rtable);
                case 'RelabelType':
                    return await this.delegateFormatToMember('arg', rtable);
                case 'JsonExpr':
                    return await this.formatJsonExpr(rtable);
                case 'JsonValueExpr':
                    return await this.delegateFormatToMember('raw_expr', rtable);
                case 'JsonConstructorExpr':
                    return await this.formatJsonConstructorExpr(rtable);
                case 'JsonIsPredicate':
                    return await this.formatJsonIsPredicate(rtable);
                case 'WindowFuncRunCondition':
                    return await this.formatWindowFuncRunCondition(rtable);
                case 'CaseWhen':
                    return await this.formatCaseWhen(rtable);
                case 'FieldSelect':
                    return await this.formatFieldSelect(rtable);
                case 'FieldStore':
                    return await this.formatFieldStore(rtable);
                case 'CurrentOfExpr':
                    return await this.formatCurrentOfExpr(rtable);
                case 'InferenceElem':
                    return await this.delegateFormatToMember('expr', rtable);
                
                /* 
                 * Some Exprs i will not add, i.e.:
                 * - SubPlan - too bulky, to extract some data
                 * - AlternativeSubPlan - same as above
                 * - CaseExpr - too big for small field in editor
                 * 
                 * For such, we have placeholders. I think, that's enough.
                 */
            }
        } catch (error) {
            if (!(error instanceof EvaluationError)) {
                throw error;
            }

            this.logger.debug('failed repr for %s', this.realNodeTag, error);
        }
        return this.getExprPlaceholder(this);
    }

    /* 
     * Entry point to get text representation of Expr during
     * recursive repr evaluation.
     * This is speed up, because of already found 'rtable' passing.
     */
    private async getReprInternal(rtable: RangeTableContainer) {
        if (this.repr) {
            return this.repr;
        }

        const repr = await this.formatExpr(rtable);
        this.repr = repr;
        return repr;
    }

    /**
     * Global entry point to get text representation of Expression.
     * 
     * @returns text representation of Expr node
     */
    async getRepr() {
        if (this.repr) {
            return this.repr;
        }

        const rtable = new RangeTableContainer();
        return await this.getReprInternal(rtable);
    }

    private async findRtable() {
        /* 
         * We can go in 2 ways: PlannderInfo->parse (Query)->rtable or Query->rtable
         */
        let node = this.parent;
        while (node) {
            if (node instanceof VariablesRoot) {
                node = node.topLevelVariables.find(v => 
                                ((v instanceof NodeTagVariable && 
                                 (v.realNodeTag === 'PlannerInfo' || v.realNodeTag === 'Query'))));
                if (!node) {
                    /* No more variables */
                    return;
                }

                break;
            } else if (node instanceof NodeTagVariable &&
                       (node.realNodeTag === 'PlannerInfo' || node.realNodeTag === 'Query')) {
                break;
            }

            node = node.parent;
        }

        if (!(node && node instanceof NodeTagVariable)) {
            return;
        }

        const query = node.realNodeTag === 'Query' 
                            ? node 
                            : await node.getMember('parse');

        if (!(query && query instanceof NodeTagVariable)) {
            return;
        }

        return await query.getListMemberElements('rtable');
    }

    async doGetChildren() {
        const expr = await this.getRepr();
        if (!expr) {
            return await super.doGetChildren();
        }

        /* Add representation field first in a row */
        const exprVariable = new ScalarVariable('$expr$', expr, '', this.context, this as Variable, expr)
        const children = await super.doGetChildren() ?? [];
        children.unshift(exprVariable);
        return children;
    }
}

class EquivalenceMemberVariable extends NodeTagVariable {
    constructor(args: RealVariableArgs, logger: utils.ILogger) {
        super('EquivalenceMember', args, logger);
    }
    
    private async findExpr(children: Variable[]): Promise<ExprNodeVariable | null> {
        for (const child of children) {
            if (child.name === 'em_expr') {
                if (child instanceof ExprNodeVariable) {
                    return child;
                } else {
                    break;
                }
            }
        }
        return null;
    }

    async getDescription() {
        const children = await this.getRealMembers();
        if (!children) {
            return await super.getDescription();
        }

        const expr = await this.findExpr(children);
        if (!expr) {
            return await super.getDescription();
        }

        const repr = await expr.getRepr();
        if (!repr) {
            return await super.getDescription();
        }

        return repr;
    }
}

class RestrictInfoVariable extends NodeTagVariable {
    constructor(args: RealVariableArgs, logger: utils.ILogger) {
        super('RestrictInfo', args, logger);
    }

    private async findExpr(children: Variable[]): Promise<ExprNodeVariable | null> {
        for (const child of children) {
            if (child.name === 'clause') {
                if (child instanceof ExprNodeVariable) {
                    return child;
                } else {
                    break;
                }
            }
        }
        return null;
    }

    async getDescription() {
        const children = await this.getRealMembers();
        if (!children) {
            return await super.getDescription();
        }

        const expr = await this.findExpr(children);
        if (!expr) {
            return await super.getDescription();
        }

        const repr = await expr.getRepr();
        if (!repr) {
            return await super.getDescription();
        }

        return repr;
    }
}

class TargetEntryVariable extends ExprNodeVariable {
    constructor(args: RealVariableArgs, logger: utils.ILogger) {
        super('TargetEntry', args, logger);
    }

    async getDescription() {
        const repr = await this.getRepr();
        if (!repr) {
            return await super.getDescription();
        }

        return repr;
    }
}

class ListElementsMember extends RealVariable {
    /* 
     * Members of this list
     */
    members: Variable[] | undefined;
    
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

    constructor(listParent: ListNodeTagVariable, cellValue: string, realType: string, 
                logger: utils.ILogger, args: RealVariableArgs) {
        super(args, logger);
        this.listParent = listParent;
        this.cellValue = cellValue;
        this.realType = realType;
    }

    async getNodeElements() {
        const length = await this.listParent.getListLength();
        if (!length) {
            return;
        }

        const listType = this.listParent.getMemberExpression('elements');
        const expression = `(Node **)(${listType})`;
        return super.getArrayMembers(expression, length);
    }

    async getIntegerElements() {
        const length = await this.listParent.getListLength();
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
            const response = await this.debug.evaluate(expression, this.frameId);
            elements.push(new RealVariable({
                name: `[${i}]` /* array elements behaviour */,
                type: this.realType,
                evaluateName: expression,
                variablesReference: response.variablesReference,
                value: response.result,
                memoryReference: response.memoryReference,
                frameId: this.frameId,
                context: this.context,
                parent: this,
            }, this.logger));
        }

        return elements;
    }

    async doGetChildren() {
        if (this.members !== undefined) {
            return this.members;
        }

        this.members = await (this.listParent.realNodeTag === 'List'
            ? this.getNodeElements()
            : this.getIntegerElements());

        return this.members;
    }

    protected isExpandable(): boolean {
        return true;
    }
}

/* 
 * Show elements of List for Linked List implementation (head/tail).
 * Suitable for Postgres version prior to 13.
 */
class LinkedListElementsMember extends Variable {
    /* Members of this List */
    members: Variable[] | undefined;
    
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
                realType: string, context: ExecContext, logger: utils.ILogger) {
        super('$elements$', '', '', context, listParent);
        this.logger = logger; 
        this.listParent = listParent;
        this.cellValue = cellValue;
        this.realType = realType;
    }

    async getLinkedListElements() {
        /* 
        * Traverse through linked list until we get NULL
        * and read each element from List manually.
        * So we do not need to evaluate length.
        */
        const elements: dap.DebugVariable[] = [];
        const headExpression = this.listParent.getMemberExpression('head');
        let evaluateName = headExpression;
        let cell = await this.debug.evaluate(headExpression, this.frameId);
        let i = 0;
        do {
            const valueExpression = `(${this.realType})((${evaluateName})->data.${this.cellValue})`;
            const response = await this.debug.evaluate(valueExpression, this.frameId);
            elements.push({
                name: `[${i}]`,
                value: response.result,
                type: this.realType,
                evaluateName: valueExpression,
                variablesReference: response.variablesReference,
                memoryReference: response.memoryReference,
            });
            evaluateName = `${evaluateName}->next`;
            cell = await this.debug.evaluate(evaluateName, this.frameId);
            ++i;
        } while (!utils.isNull(cell.result));

        return await Variable.mapVariables(elements, this.frameId, this.context,
                                        this.logger, this.listParent);
    }

    async doGetChildren() {
        if (this.members !== undefined) {
            return this.members;
        }

        this.members = await this.getLinkedListElements();
        return this.members;
    }

    protected isExpandable(): boolean {
        return true;
    }
}

/**
 * Special class to represent various Lists: Node, int, Oid, Xid...
 */
export class ListNodeTagVariable extends NodeTagVariable {
    listElements: ListElementsMember | LinkedListElementsMember | undefined;
    
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
                this.logger.warn('failed to determine List tag for %s->elements. using int value',
                                 this.name);
                break;
        }

        return new ListElementsMember(this, cellValue, realType, this.logger, {
            ...dv,
            frameId: this.frameId,
            parent: this,
            context: this.context
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
                this.logger.warn('failed to determine List tag for %s->elements. using int value',
                                 this.name);
                break;
        }

        return new LinkedListElementsMember(this, cellValue, realType, 
                                            this.context, this.logger);
    }

    override computeRealType(): string {
        const declaredTag = utils.getStructNameFromType(this.type);
        if (declaredTag !== 'List') {
            return utils.substituteStructName(this.type, 'List');
        }
        return this.type;
    }

    private async castToList() {
        const realType = this.getRealType();
        const castExpression = `(${realType}) (${this.evaluateName})`;
        const response = await this.debug.evaluate(castExpression, this.frameId);
        if (!Number.isInteger(response.variablesReference)) {
            this.logger.warn('failed to cast %s to List*: %s',
                             this.evaluateName, response.result);
            return;
        }

        /* Also update type - it will be used  */
        this.variablesReference = response.variablesReference;
    }

    async doGetChildren() {
        if (!this.tagsMatch()) {
            await this.castToList();
        }

        const debugVariables = await this.debug.getMembers(this.variablesReference);
        if (!debugVariables) {
            return;
        }

        /* Replace `elements' variable with special case */
        const members: Variable[] = [];
        let isArrayImplementation = false;
        for (let i = 0; i < debugVariables.length; i++) {
            const dv = debugVariables[i];
            if (dv.name === 'elements') {
                this.listElements = this.createArrayNodeElementsMember(dv);
                members.push(this.listElements);
                isArrayImplementation = true;
            } else {
                if (dv.name === 'initial_elements') {
                    /* Do not want to see this member */
                    continue;
                }

                const v = await Variable.create(dv, this.frameId, this.context,
                                                this.logger, this);
                if (v) {
                    members.push(v);
                }
            }
        }

        if (!isArrayImplementation) {
            this.listElements = this.createLinkedListNodeElementsMember();
            members.push(this.listElements);
        }

        return members;
    }

    async getListLength() {
        const lengthExpression = this.getMemberExpression('length');
        const evalResult = await this.debug.evaluate(lengthExpression, this.frameId);
        const length = Number(evalResult.result);
        if (Number.isNaN(length)) {
            this.logger.warn('failed to obtain list size for %s', this.name);
            return;
        }
        return length;
    }

    async getListElements() {
        if (!this.listElements) {
            /* Initialize members */
            await this.getChildren();
            if (!this.listElements) {
                /* Failed to initialize */
                return;
            }
        }

        return await this.listElements.getChildren();
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

    async doGetChildren() {
        const lengthExpression = this.formatLengthExpression();
        const evalResult = await this.debug.evaluate(lengthExpression,
                                                        this.frameId);
        const arrayLength = Number(evalResult.result);
        if (Number.isNaN(arrayLength)) {
            this.logger.warn('failed to obtain array size using %s',
                             lengthExpression);
            return;
        }

        if (arrayLength === 0) {
            return;
        }

        const memberExpression = this.formatMemberExpression();
        const debugVariables = await this.debug.getArrayVariables(memberExpression,
                                                                     arrayLength, this.frameId);
        return await Variable.mapVariables(debugVariables, this.frameId, this.context,
                                           this.logger, this);
    }
}

/* 
 * Bitmapset* variable
 */
class BitmapSetSpecialMember extends NodeTagVariable {
    constructor(logger: utils.ILogger, args: RealVariableArgs) {
        super('Bitmapset', args, logger);
    }

    async isValidSet() {
        const expression = `bms_is_valid_set(${this.evaluateName})`;
        const response = await this.debug.evaluate(expression, this.frameId);
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
                /* 
                 * Need to check functions that are called to
                 * get set elements
                 */
                if (bp.functionName === 'bms_next_member' ||
                    bp.functionName === 'bms_first_member') {
                    this.logger.debug('found breakpoint at %s - bms elements not shown',
                                      bp.functionName);
                    return false;    
                }
            }
        }
        return true;
    }


    async getSetElements(): Promise<number[] | undefined> {
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
        if (!await this.isValidSet()) {
            return;
        }

        /* 
         * Most likely, we use new Bitmapset API, 
         * but fallback with old-styled 
         */
        let result = await this.getSetElementsNextMember();
        if (result === undefined) {
            result = await this.getSetElementsFirstMember();
        }
        return result;
    }

    private async getSetElementsNextMember(): Promise<number[] | undefined> {
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
            const response = await this.debug.evaluate(expression, this.frameId);
            number = Number(response.result);
            if (Number.isNaN(number)) {
                this.logger.warn('failed to get set elements for %s', this.name);
                return;
            }

            if (number < 0) {
                break;
            }

            numbers.push(number);
        } while (number > 0);
        return numbers;
    }

    private async getSetElementsFirstMember(): Promise<number[] | undefined> {
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
        const tmpSet = await this.debug.evaluate(`bms_copy(${this.evaluateName})`,
                                                 this.frameId);

        if (!utils.isValidPointer(tmpSet.result)) {
            return;
        }

        let number = -1;
        const numbers = [];
        do {
            const expression = `bms_first_member((Bitmapset*)${tmpSet.result})`;
            const response = await this.debug.evaluate(expression, this.frameId);
            number = Number(response.result);
            if (Number.isNaN(number)) {
                this.logger.warn('failed to get set elements for %s', this.name);
                return;
            }

            if (number < 0) {
                break;
            }

            numbers.push(number);
        } while (number > 0);

        await this.debug.evaluate(`pfree((Bitmapset*)${tmpSet.result})`, this.frameId);

        return numbers;
    }

    async getBmsRef() {
        if (!this.parent) {
            return;
        }

        const ref = this.context.nodeVarRegistry.findBmsReference(this);
        if (!ref) {
            return;
        }

        let type;
        if (this.parent instanceof NodeTagVariable) {
            type = await this.parent.getRealType();
        } else {
            type = this.parent.type;
        }
        if (!(utils.getStructNameFromType(type) === ref.type &&
              utils.getPointersCount(type) === 1)) {
            return;
        }

        return ref;
    }

    async doGetChildren() {
        /* All existing members */
        const members = await Variable.getVariables(this.variablesReference,
                                                    this.frameId, this.context,
                                                    this.logger, this);
        if (members === undefined || members.length === 0) {
            return;
        }

        /* + Set elements */
        const setMembers = await this.getSetElements();
        if (setMembers === undefined) {
            return members;
        }

        const ref = await this.getBmsRef();

        members.push(new ScalarVariable('$length$', setMembers.length.toString(),
                                        'int', this.context, this));
        members.push(new BitmapSetSpecialMember.BmsArrayVariable(this, setMembers, ref));
        return members;
    }

    static BmsElementVariable = class extends Variable {
        /* 
         * `value` as number. needed for refs
         */
        relid: number;

        bmsParent: BitmapSetSpecialMember;
        
        constructor(index: number,
                    parent: Variable,
                    bmsParent: BitmapSetSpecialMember,
                    value: number,
                    context: ExecContext,
                    private ref?: constants.BitmapsetReference) {
            super(`[${index}]`, value.toString(), 'int', context, parent);
            this.relid = value;
            this.bmsParent = bmsParent;
        }

        findStartElement() {
            if (this.ref!.start === 'Self') {
                return this.bmsParent.parent;
            } else if (this.ref!.start === 'Parent') {
                return this.bmsParent.parent?.parent;
            }

            /* Find PlannerInfo in parents */
            let parent = this.bmsParent.parent;
            
            while (parent) {
                if (parent.type.indexOf('PlannerInfo') !== -1 && 
                    parent instanceof NodeTagVariable &&
                    parent.realNodeTag === 'PlannerInfo') {
                    return parent;
                }

                /* 
                 * If this is last variable, it must be VariablesRoot.
                 * As last chance, find 'PlannerInfo' in declared variables,
                 * not direct parent
                 */
                if (!parent.parent) {
                    if (parent.name === VariablesRoot.variableRootName &&
                        parent instanceof VariablesRoot) {
                        for (const v of parent.topLevelVariables) {
                            if (v.type.indexOf('PlannerInfo') !== -1 &&
                                v instanceof NodeTagVariable &&
                                v.realNodeTag === 'PlannerInfo') {
                                return v;
                            }
                        }
                    }
                }

                parent = parent.parent;
            }

            return undefined;
        }

        async findReferenceFields() {
            if (!this.ref) {
                return;
            }

            const root = this.findStartElement();
            if (!root) {
                return;
            }

            const resultFields: [Variable, number?][] = [];

            for (const path of this.ref.paths) {
                let variable: Variable = root;
                for (const p of path.path) {
                    const members = await variable.getChildren();
                    if (!members) {
                        break;
                    }
    
                    const member = members.find((v) => v.name === p);
                    if (!member) {
                        break;
                    }
    
                    variable = member;
                }

                if (variable) {
                    resultFields.push([variable, path.indexDelta]);
                }
            }
            
            if (resultFields.length) {
                return resultFields;
            }
            return;
        }

        async getArrayElement(field: Variable, indexDelta?: number) {
            const index = this.relid + (indexDelta ?? 0);

            if (field instanceof ListNodeTagVariable) {
                const members = await field.getListElements();
                if (members && index < members.length) {
                    return members[index];
                }
            } else if (field instanceof ArraySpecialMember) {
                const members = await field.getChildren();
                if (members && index < members.length) {
                    return members[index];
                }
            } else if (field instanceof RealVariable) {
                if (field.type === 'List *') {
                    /* Empty List * will be created as RealVariable */
                    return;
                }
                const expr = `(${field.evaluateName})[${index}]`;
                const result = await this.debug.evaluate(expr, this.bmsParent.frameId);
                if (result.result) {
                    return await Variable.create({
                        ...result,
                        name: `ref(${field.name})`,
                        value: result.result,
                        evaluateName: expr 
                    }, this.bmsParent.frameId, this.context, this.bmsParent.logger, this);
                }
            }
        }

        async doGetChildren(): Promise<Variable[] | undefined> {
            if (!this.ref) {
                return;
            }

            const fields = await this.findReferenceFields();
            
            if (!fields) {
                return;
            }

            const values = [];
            for (const [field, delta] of fields) {
                const value = await this.getArrayElement(field, delta);
                if (value) {
                    values.push(value)
                }
            }

            return values.length ? values : undefined;
        }

        protected isExpandable(): boolean {
            return this.ref !== undefined;
        }
    }

    static BmsArrayVariable = class extends Variable {
        setElements: number[];
        bmsParent: BitmapSetSpecialMember;
        constructor(parent: BitmapSetSpecialMember, 
                    setElements: number[],
                    private ref?: constants.BitmapsetReference) {
            super('$elements$', '', '', parent.context, parent);
            this.setElements = setElements;
            this.bmsParent = parent;
        }

        async doGetChildren(): Promise<Variable[] | undefined> {
            return this.setElements.map((se, i) => new BitmapSetSpecialMember.BmsElementVariable(i, this, this.bmsParent, se, this.context, this.ref))
        }

        protected isExpandable(): boolean {
            return true;
        }

        async getTreeItem() {
            return {
                label: '$elements$',
                collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
            } as vscode.TreeItem;
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