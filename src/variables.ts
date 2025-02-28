import * as vscode from 'vscode';
import * as utils from "./utils";
import * as dap from "./dap";
import * as constants from './constants';
import { ContribFeatures } from './extension';

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
    exprs: Set<string> = new Set<string>(constants.getDefaultExprs())

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

    /**
     * Version of installed pg_hacker_helper_tools contrib in database.
     * Otherwise 0
     */
    contribVersion: number;
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
    async getChildren() {
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
        return Variable.getVariables(this.variablesReference, this.frameId,
                                     this.context, this.logger, this);
    }

    protected async getArrayMembers(expression: string, length: number) {
        const variables = await this.debug.getArrayVariables(expression,
                                                             length, this.frameId);
        return await Variable.mapVariables(variables, this.frameId, this.context,
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

    private async getMembersImpl() {
        const debugVariables = await this.context.debug.getMembers(this.variablesReference);
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
            return new ExprNodeVariable(realTag, args, logger);
        }

        /* Display expression in EquivalenceMember */
        if (realTag === 'EquivalenceMember') {
            return new EquivalenceMemberVariable(realTag, args, logger);
        }

        return new NodeTagVariable(realTag, args, logger);
    }
}

class ExprNodeVariable extends NodeTagVariable {
    /**
     * String representation of expression.
     */
    protected repr?: string;
    /** 
     * If repr evaluation is not possible, we will continue getting undefined each time.
     * So use separate flag to indicate, that 'repr' is done.
     */
    private reprEvaluated: boolean = false;
    async getRepr() {
        if (this.reprEvaluated) {
            return this.repr;
        }

        if (!this.canRepr()) {
            this.reprEvaluated = true;
            return this.repr;
        }

        this.reprEvaluated = true;

        const rtable = await this.findRtable();
        if (!rtable) {
            return;
        }

        /* Using function from my contrib */
        const res = await this.debug.evaluate(`pg_hacker_helper_format_expr((Expr *)(${this.evaluateName}), (List *)(${rtable}))`, this.frameId);
        if (utils.isNull(res.result)) {
            return;
        }
        
        /* 
         * 'result' is in form: 0xFFFFFF "EXPR"
         * 
         * So we need to remove pointer and enclosing double quotes.
         * But if evaluation failed, we will have NULL (0x0) pointer.
         */
        const leftQuoteIndex = res.result.indexOf('"');
        if (leftQuoteIndex === -1) {
            return;
        }

        const rightQuoteIndex = res.result.lastIndexOf('"');
        if (rightQuoteIndex === -1) {
            return;
        }

        if (leftQuoteIndex === rightQuoteIndex) {
            return;
        }
        
        const repr = res.result.substring(leftQuoteIndex + 1, rightQuoteIndex);

        const resultPtr = res.result.substring(0, leftQuoteIndex - 1).trim();
        await this.debug.evaluate(`pfree((void *)${resultPtr})`, this.frameId);

        this.repr = repr;
        return repr;
    }

    private canRepr() {
        return ContribFeatures.exprRepresentation(this.context.contribVersion);
    }

    private async findRtable() {
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

        if (!parent) {
            return null;
        }

        const plannerInfo = parent as NodeTagVariable;

        /* Get rtable from Query */
        const rtable = await this.debug.evaluate(`(${plannerInfo.evaluateName})->parse->rtable`, this.frameId);
        if (!utils.isValidPointer(rtable.result)) {
            return null;
        }

        return rtable.result;
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
    /* 
     * 1. Получаю children
     * 2. Нахожу em_expr
     * 3. Это ExprNodeVariable
     * 4. Получаю его repr
     * 5. Ставлю в название
     */

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
        const children = await this.getChildren();
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
    members: ListElementsMember | LinkedListElementsMember | undefined;
    
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
                this.members = this.createArrayNodeElementsMember(dv);
                members.push(this.members);
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
            this.members = this.createLinkedListNodeElementsMember();
            members.push(this.members);
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
        if (!this.members) {
            /* Initialize members */
            await this.getChildren();
            if (!this.members) {
                /* Failed to initialize */
                return;
            }
        }

        return await this.members.getChildren();
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