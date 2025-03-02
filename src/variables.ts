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
     * @param debug Debugger facade
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
class EvaluationError extends Error {  }

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

    async getMember(member: string) {
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

    async getMemberValue(member: string) {
        const m = await this.getMember(member);
        return m.value;
    }

    async getMemberValueString(member: string) {
        const value = await this.getMemberValue(member);
        return utils.extractStringFromResult(value);
    }

    async getMemberValueEnum(member: string) {
        const value = await this.getMemberValue(member);
        if (!utils.isEnumResult(value)) {
            throw new UnexpectedOutputError(`member ${member} output is not enum`);
        }
        return value;
    }

    async getMemberValueBool(member: string) {
        const value = await this.getMemberValue(member);
        switch (value.toLocaleLowerCase()) {
            case 'true':
                return true;
            case 'false':
                return false;
            default:
                throw new UnexpectedOutputError(`member ${member} output is not bool`);
        }
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

    static async getRealNodeTag(variable: dap.DebugVariable, frameId: number,
                                context: ExecContext) {
        const nodeTagExpression = `((Node*)(${variable.evaluateName}))->type`;
        const response = await context.debug.evaluate(nodeTagExpression, frameId);
        let realTag = response.result?.replace('T_', '');
        if (!this.isValidNodeTag(realTag)) {
            return;
        }
        return realTag;
    }

    static async create(variable: dap.DebugVariable, frameId: number,
                        context: ExecContext, logger: utils.ILogger,
                        parent?: Variable): Promise<NodeTagVariable | undefined> {
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

class ExprNodeVariable extends NodeTagVariable {
    /**
     * String representation of expression.
     */
    protected repr?: string;

    private async evalStringResult(expr: string) {
        const result = await this.debug.evaluate(expr, this.frameId);
        const str = utils.extractStringFromResult(result.result);
        if (str === null) {
            throw new EvaluationError(`failed to get string from expr: ${expr}`);
        }
        return str;
    }

    private async evalStringWithPtrResult(expr: string) {
        const result = await this.debug.evaluate(expr, this.frameId);
        const str = utils.extractStringFromResult(result.result);
        if (str === null) {
            throw new EvaluationError(`failed to get string from expr: ${expr}`);
        }
        
        const ptr = utils.extractPtrFromStringResult(result.result);
        if (ptr === null) {
            throw new EvaluationError(`failed to get pointer from expr: ${expr}`);
        }
        return [str, ptr];
    }

    private async evalBoolResult(expr: string) {
        const result = await this.debug.evaluate(expr, this.frameId);
        switch (result.result.toLowerCase()) {
            case 'true':
                return true;
            case 'false':
                return false;
        }
        throw new EvaluationError(`failed to get bool from expr: ${expr}`);
    }

    private async evalIntResult(expr: string) {
        const result = await this.debug.evaluate(expr, this.frameId);
        const number = Number(result.result);
        if (Number.isNaN(number)) {
            throw new EvaluationError(`failed to get number result from expr: ${expr}`);
        }
        return number;
    }

    private async evalEnumResult(expr: string) {
        const result = await this.debug.evaluate(expr, this.frameId);

        /* 
         * Error messages starts with '-' and correct 
         * identifiers can not start with it
         */
        if (result.result.startsWith('-')) {
            throw new EvaluationError(`failed to get enum value from expr: ${expr}`);
        }

        return result.result;
    }

    private async palloc(size: string) {
        const result = await this.debug.evaluate(`palloc0(${size})`, this.frameId);
        if (!utils.isValidPointer(result.result)) {
            throw new EvaluationError('failed to allocate memory using palloc');
        }
        return result.result;
    }

    private async pfree(ptr: string) {
        await this.debug.evaluate(`pfree((void *)${ptr})`, this.frameId);
    }

    private async getListMemberElements(member: string) {
        const listMember = (await this.getRealMembers() ?? []).find(v => v.name === member);
        if (!(listMember && listMember instanceof ListNodeTagVariable)) {
            throw new EvaluationError(`failed to get list member '${this.realNodeTag}->${member}'`);
        }

        const elements = await listMember.getListElements();
        if (elements === undefined) {
            throw new EvaluationError(`failed to get list elements '${this.realNodeTag}->${member}'`);
        }
        return elements;
    }

    private async getListMemberElementsReprs(member: string, rtable: NodeTagVariable[]) {
        const elements = await this.getListMemberElements(member);
        
        const reprs = [];
        for (const elem of elements) {
            reprs.push(await this.getReprPlaceholder(elem, rtable));
        }

        return reprs;
    }

    private async getExprMemberRepr(member: string, rtable: NodeTagVariable[]) {
        const exprMember = (await this.getRealMembers() ?? []).find(v => v.name === member);
        if (!exprMember) {
            throw new EvaluationError(`failed to get Expr member '${this.realNodeTag}->${member}'`);
        }

        return await this.getReprPlaceholder(exprMember, rtable);
    }

    private async getListOfStrings(member: string, rtable: NodeTagVariable[]) {
        /* Get List of T_String elements and take their 'sval' values */
        const list = await this.getListMemberElements(member);
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
                    values.push(await entry.getReprInner(rtable));
                } else {
                    values.push('???');
                }
            } else {
                values.push('???');
            }
        }
        return values;
    }

    private async getCharStringMember(member: string) {
        const m = (await this.getRealMembers() ?? []).find(v => v.name === member);
        if (!m) {
            throw new EvaluationError(`Member ${this.realNodeTag}->${member} not found`);
        }
        const str = utils.extractStringFromResult(m.value);
        if (!str) {
            if (utils.isNull(m.value)) {
                return null;
            } else {
                throw new EvaluationError(`Failed to get ${this.realNodeTag}->${member} member string value`);
            }
        }

        return str;
    }

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

    private async getReprPlaceholder(variable: Variable, rtable: NodeTagVariable[]) {
        if (variable instanceof ExprNodeVariable) {
            return await variable.getReprInner(rtable);
        } else {
            return this.getExprPlaceholder(variable);
        }
    }

    private async formatVarExpr(rtable: NodeTagVariable[]) {
        const varnoMember = (await this.getRealMembers() ?? []).find(v => v.name === 'varno');
        if (!varnoMember) {
            throw new EvaluationError('failed to get varno of Var')
        }

        const varno = Number(varnoMember.value);
        if (Number.isNaN(varno)) {
            throw new EvaluationError('varno of Var is not a valid number');
        }

        let relname, attname;
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
                if (!(varno > 0 && varno <= rtable.length)) {
                    /* This was an Assert */
                    throw new EvaluationError('failed to get RTEs from range table');
                }

                const rte = rtable[varno - 1];
                /* 'rte.value' will be pointer to RTE struct */
                relname = await this.evalStringResult(`((RangeTblEntry *)${rte.value})->eref->aliasname`);
                attname = await this.evalStringResult(`get_rte_attribute_name(((RangeTblEntry *)${rte.value}), ((Var *)${this.value})->varattno)`);
                break;
        }

        return `${relname}.${attname}`;
    }

    private async formatConst(rtable: NodeTagVariable[]) {
        if (await this.evalBoolResult(`((Const *)${this.value})->constisnull`)) {
            return 'NULL';
        }

        /* Use 8 bytes to be fully sure type will fit */
        const tupoutput = await this.palloc('8');
        const tupIsVarlena = await this.palloc('8');

        /* 
         * WARN: I do not why, but you MUST cast pointers as 'void *',
         *       not 'Oid *' or '_Bool *'. 
         *       Otherwise, passed pointers will have some offset 
         *       (*orig_value* + offset), so written values will
         *       be stored in random place.
         */
        await this.evaluate(`getTypeOutputInfo(((Const *)${this.value})->consttype, ((void *)${tupoutput}), ((void *)${tupIsVarlena}))`);

        const [str, ptr] = await this.evalStringWithPtrResult(
                        `OidOutputFunctionCall(*((Oid *)${tupoutput}), ((Const *)${this.value})->constvalue)`);

        await this.pfree(ptr);
        await this.pfree(tupoutput);
        await this.pfree(tupIsVarlena);

        return str;
    }

    private async formatOpExpr(rtable: NodeTagVariable[]) {
        const opExpr = `((OpExpr *)(${this.value}))`;

        let opname;
        try {
            opname = await this.evalStringResult(`get_opname(${opExpr}->opno)`);
        } catch (e) {
            if (e instanceof EvaluationError) {
                opname = '(invalid operator)';
            } else {
                throw e;
            }
        }

        const members = await this.getRealMembers();
        if (!members) {
            throw new EvaluationError('failed to get children of Expr');;
        }

        const argsMember = members.find(v => v.name === 'args');
        if (!argsMember) {
            throw new EvaluationError('failed to get args of Expr');
        }
        
        if (!(argsMember instanceof ListNodeTagVariable)) {
            throw new EvaluationError('Expr->args is not a ListNodeTagVariable');
        }
        
        const args = await argsMember.getListElements();
        if (!args) {
            throw new EvaluationError('No arguments in Expr->args');
        }

        const data: string[] = [];
        if (args.length > 1) {
            const leftArg = args[0];
            if (leftArg instanceof ExprNodeVariable) {
                data.push(await leftArg.getReprInner(rtable));
            } else {
                data.push(this.getExprPlaceholder(leftArg));
            }

            data.push(opname);
            const rightArg = args[1];
            if (rightArg instanceof ExprNodeVariable) {
                data.push(await rightArg.getReprInner(rtable));
            } else {
                data.push(this.getExprPlaceholder(rightArg));
            }
        } else {
            data.push(opname);
            const leftArg = args[0];
            if (leftArg instanceof ExprNodeVariable) {
                data.push(await leftArg.getReprInner(rtable))
            } else {
                data.push(this.getExprPlaceholder(leftArg));
            }
        }

        return data.join(' ');
    }

    private async formatFuncExpr(rtable: NodeTagVariable[]) {
        let funcname;
        try {
            funcname = await this.evalStringResult(`get_func_name(((FuncExpr *)${this.value})->funcid)`);
        } catch (e) {
            funcname = '(invalid function)';
        }

        const argsMember = (await this.getRealMembers() ?? []).find(v => v.name === 'args');
        if (!(argsMember && argsMember instanceof ListNodeTagVariable)) {
            throw new EvaluationError('failed to get args member of FuncExpr');
        }

        const args = await argsMember.getListElements();
        if (args === undefined) {
            throw new EvaluationError('failed to get function arguments');
        }

        const coerceType = await this.evalEnumResult(`((FuncExpr *)${this.value})->funcformat`);

        switch (coerceType) {
            case 'COERCE_EXPLICIT_CALL':
            case 'COERCE_SQL_SYNTAX':
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
                    if (arg instanceof ExprNodeVariable) {
                        argsExpressions.push(await arg.getReprInner(rtable));
                    } else {
                        argsExpressions.push(this.getExprPlaceholder(arg));
                    }
                }

                return `${funcname}(${argsExpressions.join(', ')})`;
            case 'COERCE_EXPLICIT_CAST':
                const argRepr = await this.getReprPlaceholder(args[0], rtable);
                return `${argRepr}::${funcname}`;
            case 'COERCE_IMPLICIT_CAST':
                /* User did not request explicit cast, so show as simple expr */
                return await this.getReprPlaceholder(args[0], rtable);
            }
        /* Should not happen */
        return '???';
    }

    private async formatAggref(rtable: NodeTagVariable[]) {
        let funcname;
        try {
            funcname = await this.evalStringResult(`get_func_name(((Aggref *)${this.value})->aggfnoid)`);
        } catch (e) {
            funcname = '(invalid func)';
        }

        const argsMember = (await this.getRealMembers() ?? []).find(v => v.name === 'args');
        if (!argsMember) {
            throw new EvaluationError('failed to get args member of FuncExpr');
        }

        let args;
        if (utils.isNull(argsMember.value) || !(argsMember instanceof ListNodeTagVariable)) {
            /* If agg function called with '*', then 'args' is NIL */
            args = '*';
        } else {
            const argsMembers = await argsMember.getListElements();
            if (argsMembers === undefined) {
                throw new EvaluationError('failed to get function arguments');
            }
    
            const argsExpressions: string[] = [];
            for (const arg of argsMembers) {
                if (arg instanceof ExprNodeVariable) {
                    argsExpressions.push(await arg.getReprInner(rtable));
                } else {
                    argsExpressions.push(this.getExprPlaceholder(arg));
                }
            }

            args = argsExpressions.join(', ');
        }


        return `${funcname}(${args})`;
    }

    private async formatTargetEntry(rtable: NodeTagVariable[]) {
        /* NOTE: keep return type annotation, because now compiler can not
         *       handle such recursion correctly
         */
        const expr = (await this.getRealMembers() ?? []).find(v => v.name === 'expr');
        if (!(expr && expr instanceof ExprNodeVariable)) {
            throw new EvaluationError('failed to get expr member from TargetEntry');
        }

        return await expr.getReprInner(rtable);
    }

    private async formatScalarArrayOpExpr(rtable: NodeTagVariable[]) {
        let funcname;
        try {
            funcname = await this.evalStringResult(`get_opname(((ScalarArrayOpExpr *)${this.value})->opno)`);
        } catch (e) {
            funcname = '(invalid func)';
        }

        const or = await this.evalBoolResult(`((ScalarArrayOpExpr *)${this.value})->useOr`);
        const argsMember = (await this.getRealMembers() ?? []).find(v => v.name === 'args');
        if (!(argsMember && argsMember instanceof ListNodeTagVariable)) {
            throw new EvaluationError('failed to get args member of ScalarArrayOpExpr');
        }

        const args = await argsMember.getListElements();
        if (!args) {
            throw new EvaluationError('no args got in args of ScalarArrayOpExpr');
        }

        const [scalar, array] = args;
        let scalarRepr;
        if (scalar instanceof ExprNodeVariable) {
            scalarRepr = await scalar.getReprInner(rtable);
        } else {
            scalarRepr = this.getExprPlaceholder(scalar);
        }

        let arrayRepr;
        if (array instanceof ExprNodeVariable) {
            arrayRepr = await array.getReprInner(rtable);
        } else {
            arrayRepr = this.getExprPlaceholder(array);
        }

        return `${scalarRepr} ${funcname} ${or ? 'ANY' : 'ALL'}(${arrayRepr})`;
    }

    private async formatBoolExpr(rtable: NodeTagVariable[]) {
        const get_expr = async (v: Variable) => {
            if (v instanceof ExprNodeVariable) {
                return await v.getReprInner(rtable);
            } else {
                return this.getExprPlaceholder(v);
            }
        }

        const boolOp = await this.evalEnumResult(`((BoolExpr *)${this.value})->boolop`);
        const argsMember = (await this.getRealMembers() ?? []).find(v => v.name === 'args');
        if (!(argsMember && argsMember instanceof ListNodeTagVariable)) {
            throw new EvaluationError('failed to get args member of BoolExpr');
        }

        const args = await argsMember.getListElements();
        if (!args) {
            throw new EvaluationError('failed to get elements of BoolExpr->args');
        }

        if (boolOp === 'NOT_EXPR') {
            const exprRepr = await get_expr(args[0]);
            return `NOT ${exprRepr}`;
        }

        const argsReprs = [];
        for (const arg of args) {
            argsReprs.push(await get_expr(arg));
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

    private async formatCoalesceExpr(rtable: NodeTagVariable[]) {
        const argsMember = await this.getMember('args');

        if (!(argsMember instanceof ListNodeTagVariable)) {
            return 'COALESCE(???)';
        }

        const args = await argsMember.getListElements();
        if (!args) {
            throw new EvaluationError('failed to get elements of BoolExpr->args');
        }

        const argsReprs = [];
        for (const arg of args) {
            if (arg instanceof ExprNodeVariable) {
                argsReprs.push(await arg.getReprInner(rtable));
            } else {
                argsReprs.push(this.getExprPlaceholder(arg));
            }
        }

        return `COALESCE(${argsReprs.join(', ')})`;
    }

    private async formatNullTest(rtable: NodeTagVariable[]) {
        const testType = await this.evalEnumResult(`((NullTest *)${this.value})->nulltesttype`);
        const expr = await this.getMember('arg');

        let innerRepr;
        if (expr instanceof ExprNodeVariable) {
            innerRepr = await expr.getReprInner(rtable);
        } else {
            innerRepr = this.getExprPlaceholder(expr);
        }


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

    private async formatBooleanTest(rtable: NodeTagVariable[]) {
        const testType = await this.evalEnumResult(`((BooleanTest *)${this.value})->booltesttype`);
        const arg = await this.getMember('arg');

        const innerRepr = await this.getReprPlaceholder(arg, rtable);
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

    private async formatArrayExpr(rtable: NodeTagVariable[]) {
        const elementsMember = await this.getMember('elements');
        if (!(elementsMember instanceof ListNodeTagVariable)) {
            throw new EvaluationError('ArrayExpr->elements is not List');
        }
        
        const elements = await elementsMember.getListElements();
        if (elements === undefined) {
            throw new EvaluationError('failed to get elements of ArrayExpr->elements List');
        }

        const reprs = [];
        for (const e of elements) {
            reprs.push(await this.getReprPlaceholder(e, rtable));
        }
        return `ARRAY[${reprs.join(', ')}]`;
    }

    private async formatSqlValueFunction(rtable: NodeTagVariable[]) {
        const getTypmod = async () => {
            return await this.evalIntResult(`((SQLValueFunction *)${this.value})->typmod`);
        }
        const funcOp = await this.evalEnumResult(`((SQLValueFunction *)${this.value})->op`);
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

    private async formatMinMaxExpr(rtable: NodeTagVariable[]) {
        const op = await this.evalEnumResult(`((MinMaxExpr *)${this.value})->op`);
        const argsMember = await this.getMember('args');
        if (!(argsMember instanceof ListNodeTagVariable)) {
            throw new EvaluationError('failed to get args List member of MinMaxExpr');
        }

        const args = await argsMember.getListElements();
        if (args === undefined) {
            throw new EvaluationError('failed to get elements of MinMaxExpr->args list');
        }

        const argsReprs = [];
        for (const arg of args) {
            argsReprs.push(await this.getReprPlaceholder(arg, rtable));
        }
        
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

    private async formatRowExpr(rtable: NodeTagVariable[]) {
        const reprs = await this.getListMemberElementsReprs('args', rtable);
        return `ROW(${reprs.join(', ')})`;
    }

    private async formatDistinctExpr(rtable: NodeTagVariable[]) {
        const reprs = await this.getListMemberElementsReprs('args', rtable);
        if (reprs.length != 2) {
            throw new EvaluationError('should be 2 arguments for DistinctExpr');
        }

        const [left, right] = reprs;
        return `${left} IS DISTINCT FROM ${right}`;
    }

    private async formatNullIfExpr(rtable: NodeTagVariable[]) {
        const reprs = await this.getListMemberElementsReprs('args', rtable);
        if (reprs.length != 2) {
            throw new EvaluationError('should be 2 arguments for NullIf');
        }

        const [left, right] = reprs;
        return `NULLIF(${left}, ${right})`;
    }

    private async formatNamedArgExpr(rtable: NodeTagVariable[]) {
        const arg = await this.getExprMemberRepr('arg', rtable);
        const name = await this.evalStringResult(`((NamedArgExpr *)${this.value})->name`);
        return `${name} => ${arg}`;
    }

    private async formatGroupingFunc(rtable: NodeTagVariable[]) {
        const reprs = await this.getListMemberElementsReprs('args', rtable);
        return `GROUPING(${reprs.join(', ')})`;
    }

    private async formatWindowFunc(rtable: NodeTagVariable[]) {
        const funcname = await this.evalStringResult(`get_func_name(((WindowFunc *)${this.value})->winfnoid)`);
        const reprs = await this.getListMemberElementsReprs('args', rtable);
        let repr = `${funcname}(${reprs.join(', ')})`
        try {
            const filterRepr = await this.getExprMemberRepr('aggfilter', rtable);
            repr += ` FILTER (${filterRepr})`;
        } catch (e) {
            if (!(e instanceof EvaluationError)) {
                throw e;
            }
        }
        
        return repr;
    }

    private async formatSubscriptingRef(rtable: NodeTagVariable[]) {
        const exprRepr = await this.getExprMemberRepr('refexpr', rtable);
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

    private async formatXmlExpr(rtable: NodeTagVariable[]) {
        const xmlOp = await this.evalEnumResult(`((XmlExpr *)${this.value})->op`);
        switch (xmlOp) {
            case 'IS_XMLELEMENT':
                {
                    let namedArgs: string[] | null;
                    let argNames: string[] | null;
                    try {
                        namedArgs = await this.getListMemberElementsReprs('named_args', rtable);
                        argNames = await this.getListOfStrings('arg_names', rtable);
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
                    const name = await this.getCharStringMember('name');
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
                        argNames = await this.getListOfStrings('arg_names', rtable);
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
                break;
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
                break;
            case 'IS_XMLPARSE':
                {
                    const option = await this.evalEnumResult(`((XmlExpr *)${this.value})->xmloption`);
                    const args = await this.getListMemberElementsReprs('args', rtable);
                    if (!args) {
                        return 'XMLPARSE()';
                    }

                    const data = args[0];
                    return `XMLPARSE(${option === 'XMLOPTION_DOCUMENT' ? 'DOCUMENT' : 'CONTENT'} ${data})`;
                }
            case 'IS_XMLPI':
                {
                    const name = await this.getCharStringMember('name');
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
                    const option = await this.evalEnumResult(`((XmlExpr *)${this.value})->xmloption`);
                    const args = await this.getListMemberElementsReprs('args', rtable);
                    const indent = await this.evalBoolResult(`((XmlExpr *)${this.value})->indent`);
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

    private async formatSubLink(rtable: NodeTagVariable[]) {
        const type = await this.evalEnumResult(`((SubLink *)${this.value})->subLinkType`);
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
            if (!(v instanceof NodeTagVariable && v.realNodeTag === 'OpExpr')) {
                return '???';
            }

            const args = await v.getMember('args');
            if (!(args && args instanceof ListNodeTagVariable)) {
                throw new EvaluationError('failed to get OpExpr->args member');
            }

            const elements = await args.getListElements();
            if (elements === undefined) {
                throw new EvaluationError('failed to get elements of OpExpr->args member');
            }

            if (elements.length) {
                const left = elements[0];
                if (left instanceof ExprNodeVariable) {
                    return await left.getReprInner(rtable);
                }
            }

            return '???';
        }

        const testexpr = await this.getMember('testexpr');
        if (!(testexpr instanceof NodeTagVariable)) {
            throw new EvaluationError('Failed to get SubLink->testexpr');
        }

        let leftReprs: string[];
        if (testexpr.realNodeTag === 'OpExpr') {
            leftReprs = [await getOpExprLeftRepr(testexpr)];
        } else if (testexpr.realNodeTag === 'BoolExpr') {
            const args = await testexpr.getMember('args');
            if (!(args && args instanceof ListNodeTagVariable)) {
                throw new EvaluationError('BoolExpr->args member is not List');
            }
            
            const elements = await args.getListElements();
            if (elements === undefined) {
                throw new EvaluationError('Failed to get elements of BoolExpr->args List');
            }
            
            const reprs: string[] = [];
            for (const e of elements) {
                reprs.push(await getOpExprLeftRepr(e));
            }

            leftReprs = reprs;
        } else {
            /* testexpr.realNodeTag === 'RowCompareExpr' */
            const largs = await testexpr.getMember('largs');
            if (!(largs && largs instanceof ListNodeTagVariable)) {
                throw new EvaluationError('RowCompareExpr->largs member is not List');
            }

            const elements = await largs.getListElements();
            if (elements === undefined) {
                throw new EvaluationError('failed to get elements from RowCompareExpr->largs List member');
            }

            const reprs = [];
            for (const e of elements) {
                reprs.push(await this.getReprPlaceholder(e, rtable));
            }
            leftReprs = reprs;
        }

        /* SubLink->operName[0]->sval */
        let opname = '???';
        const operName = await this.getMember('operName');
        if (operName && operName instanceof ListNodeTagVariable) {
            const elements = await operName.getListElements();
            if (elements?.length && elements[0] instanceof RealVariable) {
                const sval = await elements[0].getMember('sval');
                opname = utils.extractStringFromResult(sval.value) ?? '???';
            }
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

    private async formatRowCompareExpr(rtable: NodeTagVariable[]) {
        const getReprs = async (arr: string[], member: string) => {
            const m = await this.getMember(member);
            if (!(m && m instanceof ListNodeTagVariable)) {
                throw new EvaluationError(`Failed to get RowCompareExpr->${member} List member`);
            }

            const elements = await m.getListElements();
            if (elements === undefined) {
                throw new EvaluationError(`Failed to get elements of RowCompareExpr->${member} List member`);
            }

            for (const e of elements) {
                arr.push(await this.getReprPlaceholder(e, rtable));
            }
        }

        const compareType = await this.evalEnumResult(`((RowCompareExpr *)${this.value})->rctype`);
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

    private async delegateFormatToMember(member: string, rtable: NodeTagVariable[]) {
        return await this.getExprMemberRepr(member, rtable);
    }

    private async formatParam(rtable: NodeTagVariable[]) {
        const paramNum = await this.evalIntResult(`((Param *)${this.value})->paramid`);
        return `PARAM$${paramNum}`;
    }

    private async formatJsonExpr(rtable: NodeTagVariable[]) {
        const op = await this.evalEnumResult(`((JsonExpr *)${this.value})->op`);
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

    private async formatJsonConstructorExpr(rtable: NodeTagVariable[]) {
        const ctorType = await this.evalEnumResult(`((JsonConstructorExpr *)${this.value})->type`);
        const args = await this.getListMemberElementsReprs('args', rtable);
        if (ctorType === 'JSCTOR_JSON_OBJECTAGG' || ctorType === 'JSCTOR_JSON_ARRAYAGG') {
            /* 
             * At runtime these function are rewritten and extracting
             * arguments from actual FuncExpr/WindowExpr to recreate
             * function repr "as it was meant" seems overhead.
             * So show already rewritten function - we can do it already.
             */
            return await this.getExprMemberRepr('func', rtable);
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

    private async formatJsonIsPredicate(rtable: NodeTagVariable[]) {
        const jsonType = await this.evalEnumResult(`((JsonIsPredicate *)${this.value})->item_type`);
        const expr = await this.getExprMemberRepr('expr', rtable);
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

    private async formatWindowFuncRunCondition(rtable: NodeTagVariable[]) {
        const wfuncLeft = await this.getMemberValueBool('wfunc_left');
        const expr = await this.getExprMemberRepr('arg', rtable);
        const opname = await this.evalStringResult(`get_opname(((WindowFuncRunCondition *)${this.value})->opno)`);
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

    private async formatCaseWhen(rtable: NodeTagVariable[]) {
        const when = await this.getExprMemberRepr('expr', rtable);
        const then = await this.getExprMemberRepr('result', rtable);
        return `WHEN ${when} THEN ${then}`;
    }

    private async formatFieldSelect(rtable: NodeTagVariable[]) {
        /* 
         * This is hard to determine name of field using only
         * attribute number - there are many manipulations should occur.
         * For example, see src/backend/utils/adt/ruleutils.c:get_name_for_var_field.
         * 
         * For now, just print container expr and '???' as field.
         * I think, in the end developers will understand which field is used.
         */
        const expr = await this.getExprMemberRepr('arg', rtable);
        return `${expr}.???`;
    }

    private async formatFieldStore(rtable: NodeTagVariable[]) {
        const expr = await this.getExprMemberRepr('arg', rtable);
        return `${expr}.??? = ???`;
    }

    private async formatCurrentOfExpr(rtable: NodeTagVariable[]) {
        const sval = await this.getCharStringMember('cursor_name');
        return `CURRENT OF ${sval === null ? 'NULL' : sval}`;
    }

    private async formatExprInner(rtable: NodeTagVariable[]): Promise<string> {
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
            }
        } catch (error) {
            if (!(error instanceof EvaluationError)) {
                throw error;
            }
        }
        return this.getExprPlaceholder(this);
    }

    private async getReprInner(rtable: NodeTagVariable[]) {
        if (this.repr) {
            return this.repr;
        }

        const repr = await this.formatExprInner(rtable);
        this.repr = repr;
        return repr;
    }

    async getRepr() {
        if (this.repr) {
            return this.repr;
        }

        const rtable = await this.findRtable();
        if (!rtable) {
            return;
        }

        return await this.getReprInner(rtable as NodeTagVariable[]);
    }

    private async findRtable() {
        /* TODO: поиск самого Query, не через PlannerInfo */
        
        /* Find PlannerInfo */
        let parent = this.parent;
        while (parent) {
            if (parent instanceof VariablesRoot) {
                let found = false;
                for (const v of parent.topLevelVariables) {
                    if (v instanceof NodeTagVariable && v.realNodeTag === 'PlannerInfo') {
                        parent = v;
                        found = true;
                        break;
                    }
                }
                if (found) {
                    /* Found PlannerInfo in top variables */
                    break;
                } else {
                    /* No more variables */
                    return null;
                }
            } else if (parent instanceof NodeTagVariable && parent.realNodeTag === 'PlannerInfo') {
                break;
            }

            parent = parent.parent;
        }

        if (!(parent && parent instanceof NodeTagVariable)) {
            return null;
        }

        const plannerInfo = parent;

        /* Get rtable from Query */
        const parse = (await plannerInfo.getChildren() ?? []).find(v => v.name === 'parse');
        if (!parse) {
            return null;
        }

        const rtable = (await parse.getChildren() ?? []).find(v => v.name === 'rtable');
        if (!(rtable && rtable instanceof ListNodeTagVariable)) {
            return null;
        }

        const rtes = await rtable.getListElements();
        if (!rtes) {
            return null;
        }

        return rtes;
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

        async getArrayElement(field: Variable, indexDelta?: number,) {
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