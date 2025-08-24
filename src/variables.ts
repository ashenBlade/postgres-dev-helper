import * as vscode from 'vscode';
import * as utils from "./utils";
import * as dap from "./dap";
import * as constants from './constants';
import * as dbg from './debugger';
import { PghhError, EvaluationError } from './error';

export interface AliasInfo {
    /* Declared type */
    alias: string;
    /* Actual type */
    type: string;
}

/**
 * Registry for all known `NodeTag' enum values
 */
export class NodeVarRegistry {
    /**
     * Known NodeTag values (without 'T_' prefix)
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
        if (this.nodeTags.has(typeName) && utils.getPointersCount(type) === 1) {
            return true;
        }

        const alias = this.aliases.get(typeName);
        if (!alias) {
            return false;
        }

        type = type.replace(typeName, alias);
        typeName = utils.getStructNameFromType(type);
        return this.nodeTags.has(typeName) && utils.getPointersCount(type) === 1;
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

export interface ListPtrSpecialMemberInfo {
    /*
     * Real type of List members (must be pointer or alias)
     */
    type: string;

    /**
     * Pair of [Struct, Member] identifying this member
     */
    member?: [string, string];

    /**
     * Pair of [Function, Variable] identifying this member
     */
    variable?: [string, string];
}

export class SpecialMemberRegistry {
    /**
     * Double map: Type name -> (Member Name -> Info Object).
     */
    arraySpecialMembers: Map<string, Map<string, ArraySpecialMemberInfo>>;

    /**
     * Double map: Member/variable name -> (Struct/Function name -> Info object).
     *
     * Outer key is name of member or variable.
     * Inner key is name of structure or function (containing this member/variable
     * respectively).
     */
    listCustomPtrs: Map<string, Map<string, ListPtrSpecialMemberInfo>>;

    constructor() {
        this.arraySpecialMembers = new Map();
        this.listCustomPtrs = new Map();
        this.addArraySpecialMembers(constants.getArraySpecialMembers());
        this.addListCustomPtrSpecialMembers(constants.getKnownCustomListPtrs());
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

    addListCustomPtrSpecialMembers(elements: ListPtrSpecialMemberInfo[]) {
        const addRecord = (member: string, funcOrStruct: string,
            info: ListPtrSpecialMemberInfo) => {
            const map = this.listCustomPtrs.get(member);
            if (map === undefined) {
                this.listCustomPtrs.set(member, new Map([
                    [funcOrStruct, info]
                ]))
            } else {
                map.set(funcOrStruct, info);
            }
        }

        for (const e of elements) {
            if (e.member) {
                const [struct, member] = e.member;
                addRecord(member, struct, e);
            }

            if (e.variable) {
                const [func, variable] = e.variable;
                addRecord(variable, func, e);
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
 * Container type to store information about HTAB hash tables.
 * HTAB is generalized, so there only 2 ways to identify HTAB and it's
 * stored type - variable and member of another structure.
 *
 * This is also generalized - "parent" can be name of function or
 * name of structure, and "member" - name of variable in function
 * or member of structure, accordingly.
 */
export interface HtabEntryInfo {
    /**
     * Type of entry in HTAB*
     */
    type: string;

    /**
     * Name of the HTAB* member
     */
    member: string;

    /**
     *  Parent structure, containing HTAB* member
     */
    parent: string;
}

/**
 * Container type to store information about simple hash table - simplehash.
 * 
 * Main reason to introduce it - is to track 'iteration' facility.
 * Due to compiler optimizations (unused symbol pruning) iterator type
 * and iteration functions can be removed if they are not used.
 * 
 * For this purpose 'canIterate' flag was introduced. Initially, it set to 'true'
 * and then set to 'false' if error like 'unable to create variable' appears -
 * it serves as a signal, that there is no means to implement iteration.
 * 
 * You may think, that we can monkey-patch iteration functions/types, but no.
 * Main reason is that 'start_iterate' and 'iterate' logic is quite complex
 * and *iteration state* stored in each entry of hash table (state member),
 * so it heavily depends on internal structure layout and doing monkey-patching
 * can break everything.
 * 
 * We can overcome this by rewriting everything here (in extension).
 * Currently, I do not want to do that, but maybe in future I'll change my mind.
 */
export interface SimplehashEntryInfo {
    /* 
     * 'SH_PREFIX' defined when declaring/defining hash table
     */
    prefix: string;

    /* 
     * Type of element stored in this hash table.
     * Should be a pointer type, because no checks and adding pointer performed.
     */
    elementType: string;

    /* 
     * Flag, indicating that 'start_iterate' and 'iterate' functions
     * and 'iterator' struct exist.
     */
    canIterate: boolean;
}

export class HashTableTypes {
    /**
     * Map (member name -> (parent struct name -> type info structure))
     */
    htab: Map<string, Map<string, HtabEntryInfo>>;

    /**
     * Map (prefix -> entry type).
     */
    simplehash: Map<string, SimplehashEntryInfo>;

    constructor() {
        this.htab = new Map();
        this.simplehash = new Map();
        this.addHTABTypes(constants.getWellKnownHTABTypes());
        this.addSimplehashTypes(constants.getWellKnownSimpleHashTableTypes());
    }

    addHTABTypes(elements: HtabEntryInfo[]) {
        for (const element of elements) {
            const map = this.htab.get(element.member);
            if (map === undefined) {
                this.htab.set(element.member, new Map([[element.parent, element]]));
            } else {
                /*
                 * Don't bother with duplicate types - this is normal situation,
                 * because when configuration file read second+ time all elements
                 * from is are re-added, so duplicates WILL be encountered.
                 */
                map.set(element.parent, element);
            }
        }
    }

    addSimplehashTypes(elements: SimplehashEntryInfo[]) {
        for (const e of elements) {
            this.simplehash.set(e.prefix, e);
        }
    }

    findSimpleHashTableType(type: string) {
        const struct = utils.getStructNameFromType(type);
        const prefix = SimplehashMember.getPrefix(struct);
        if (!prefix) {
            return undefined;
        }

        return this.simplehash.get(prefix);
    }
}

/**
 * Context of current execution.
 */
export class ExecContext {
    /**
     * Registry about NodeTag variables information
     */
    nodeVarRegistry: NodeVarRegistry;

    /**
     * Registry with information of Special Members
     */
    specialMemberRegistry: SpecialMemberRegistry;

    /**
     * Types of entries, that different HTAB store (dynahash.c)
     */
    hashTableTypes: HashTableTypes;

    /**
     * Facade for debugger interface (TAP)
     */
    debug: dbg.IDebuggerFacade;

    /**
     * Flag, indicating that this version of PostgreSQL
     * has common class for 'String', 'Integer' and other
     * value structures.
     * Updated at runtime in 'ValueVariable'.
     *
     * Initialized with `false` and updated during runtime
     */
    hasValueStruct = false;

    /**
     * Flag, indicating that this version of PostgreSQL
     * has `palloc` implementation as function, otherwise
     * it is macro and we must use `MemoryContextAlloc`.
     *
     * Initialized with `true` and updated during runtime
     */
    hasPalloc = true;


    /**
     * 'MemoryContextData' struct has 'allowInCritSection'
     * member. It must be checked during memory allocation.
     *
     * Introduced in 9.5 version
     */
    hasAllowInCritSection = true;

    /**
     * This postgres version has 'bms_is_valid_set' function
     * used to validate Bitmapset variable.
     * Without such check next invocations of Bitmapset
     * functions will crash backend (because of 'Assert's).
     */
    hasBmsIsValidSet = true;

    /**
     * This postgres version has 'bms_next_member' function.
     * It is used to get members of Bitmapset faster than
     * old version (by copying existing one and popping data
     * from it + palloc/pfree).
     */
    hasBmsNextMember = true;

    /**
     * Bitmapset in old pg versions do not have separate T_Bitmapset
     * node tag.
     * This is required to check whether Bitmapset is valid
     * for further operations (function invocations), otherwise
     * we can get SEGFAULT.
     */
    hasBmsNodeTag = true;

    /**
     * Has `get_attname` function.
     *
     * It is used when formatting `Var` representation.
     * This function is preferred, because allows not to throw ERROR
     * if failed to get attribute.
     */
    hasGetAttname = true;

    /**
     * `getTypeOutputInfo` function accepts 3 arguments instead of 4 (old-style).
     * 
     * This is used when CodeLLDB is used as debugger, because CppDbg do not
     * check passed amount of arguments.
     */
    hasGetTypeOutputInfo3Args = true;

    /**
     * 'bool' type represented as 'char'
     * 
     * Until PostgreSQL 10 'bool' was typedef to 'char'. Required for CodeLLDB.
     */
    hasBoolAsChar = false;

    /**
     * 'get_attname' function accepts 3 arguments.
     * 
     * In PostgreSQL 10 and below 'get_attname' accepted 2 arguments and
     * worked same way as current with 'true' passed as 3rd argument.
     */
    hasGetAttname3 = true;

    /**
     * Has 'OidOutputFunctionCall' function.
     * 
     * It acts like shortcut for function call, so if we do not have it,
     * then do everything by ourselves.
     */
    hasOidOutputFunctionCall = true;

    constructor(nodeVarRegistry: NodeVarRegistry, specialMemberRegistry: SpecialMemberRegistry,
                debug: dbg.IDebuggerFacade, hashTableTypes: HashTableTypes) {
        this.nodeVarRegistry = nodeVarRegistry;
        this.specialMemberRegistry = specialMemberRegistry;
        this.hashTableTypes = hashTableTypes;
        this.debug = debug;
    }
}

/**
 * Special value for frameId used by ephemeral variables:
 * they do not need to evaluate anything.
 *
 * Examples: VariablesRoot, ScalarVariable, etc...
 */
const invalidFrameId = -1;

/**
 * Check that caught exception can be safely ignored
 * and not shown to user.
 * This is applied in end-point functions like 'getTreeItem'
 * or 'getChildren'.
 *
 * @param error Error object caught using 'try'
 */
function isExpectedError(error: any) {
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
    return    error instanceof PghhError
           || error?.name === 'CodeExpectedError';
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
     * Evaluate value of variable. Have different meaning for
     * different types of variables:
     *
     * - Empty for raw structures
     * - Actual values for primitives (integers, floats)
     * - Pointer value for pointers (for 'char *' it has actual string at the end)
     */
    value: string;

    /**
     * Separate pointer value of this variable location.
     * Some extensions (i.e. old CppDbg) do not return it, so marked '?'.
     */
    memoryReference?: string;

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
     * Logger
     */
    logger: utils.ILogger;

    /**
     * Number of frame, this variable belongs
     */
    frameId: number;

    /**
     * Shortcut for `this.context.debug`
     */
    get debug() {
        return this.context.debug;
    }

    constructor(name: string, value: string, type: string,
                context: ExecContext, frameId: number,
                parent: Variable | undefined, logger?: utils.ILogger) {
        this.parent = parent;
        this.name = name;
        this.value = value;
        this.type = type;
        this.context = context;
        this.frameId = frameId;

        /* logger argument is optional, because parent must be set always */
        this.logger = logger ?? parent?.logger!;
    }

    /**
     * Get children of this variable
     *
     * @returns Array of child variables or undefined if no children
     */
    async getChildren(): Promise<Variable[] | undefined> {
        try {
            if (this.children !== undefined) {
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
            this.logger.error('failed to get children for %s', this.name, error);
            if (isExpectedError(error)) {
                return;
            } else {
                throw error;
            }
        }
    }

    abstract doGetChildren(): Promise<Variable[] | undefined>;
    protected isExpandable() {
        /* Pointer to struct */
        if (this.debug.isValidPointerType(this)) {
            return true;
        }

        /* Do not deref NULL */
        if (this.debug.isNull(this)) {
            return false;
        }

        /* Builtin scalar types, like 'int' */
        if (this.debug.isScalarType(this)) {
            return false;
        }

        /* Embedded or top level structs */
        if (this.debug.isValueStruct(this)) {
            return true;
        }

        /* Fixed size array: type[size] */
        if (this.debug.isFixedSizeArray(this)) {
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
        try {
            return {
                label: this.type === '' 
                            ? this.name
                            : `${this.name}: ${this.type}`,
                description: await this.getDescription(),
                collapsibleState: this.isExpandable()
                    ? vscode.TreeItemCollapsibleState.Collapsed
                    : vscode.TreeItemCollapsibleState.None,
            }
        } catch (error: any) {
            this.logger.debug('failed get TreeItem for %s', this.name, error);

            if (isExpectedError(error)) {
                /* Placeholder */
                return {};
            } else {
                throw error;
            }
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
                        parent?: Variable) {
        /*
         * We pass RealVariable (not generic Variable), because if we
         * want to use this function - it means we create variable
         * using debugger interface and this variable is present in code.
         */
        const args: RealVariableArgs = {
            ...debugVariable,
            frameId,
            parent,
            context,
            logger,
        };

        const realType = Variable.getRealType(debugVariable, context);
        if (context.debug.isValueStruct(debugVariable, realType) ||
            !context.debug.isValidPointerType(debugVariable)) {
            if (context.debug.isNull(debugVariable) && 
                debugVariable.type.endsWith('List *')) {
                /* 
                 * Empty List is NIL == NULL == '0x0' Also 'endsWith'
                 * covers cases like 'const List *'.
                 * 
                 * Note that even if 'Bitmapset' also falls in this
                 * variable category (NULL is meaningful), by design
                 * do not create 'BitmapSetSpecialMember' for it,
                 * because some runtime checks will end up in SEGFAULT.
                 * Currently, there is no need for that, but take this
                 * into account if you are planning to do this.
                 */
                return new ListNodeVariable('List', args);
            }

            if (realType === 'bitmapword') {
                /* Show bitmapword as bitmask, not integer */
                return new BitmapwordVariable(args);
            }

            return new RealVariable(args);
        }

        /* 
         * Array special member should be processed before all, because
         * it acts like decorator.
         * 
         * It should never be one of others (Node, HTAB, etc...), but elements
         * of array can be.
         */
        if (parent?.type && parent instanceof RealVariable) {
            const specialMember = context.specialMemberRegistry
                .getArraySpecialMember(parent.type, debugVariable.name);
            if (specialMember) {
                return new ArraySpecialMember(parent, specialMember, {
                    ...debugVariable,
                    frameId: frameId,
                    parent: parent,
                    context,
                    logger
                }) as RealVariable;
            }
        }

        /*
         * PostgreSQL versions prior 16 do not have Bitmapset Node.
         * So handle Bitmapset (with Relids) here.
         */
        if (BitmapSetSpecialMember.isBitmapsetType(realType)) {
            return new BitmapSetSpecialMember(args);
        }

        /* NodeTag variables: Node, List, Bitmapset etc.. */
        if (context.nodeVarRegistry.isNodeVar(realType)) {
            const nodeTagVar = await NodeVariable.createNode(debugVariable, frameId,
                                                             context, logger, parent);
            if (nodeTagVar) {
                return nodeTagVar;
            }
        }

        /* 'HTAB *' */
        if (utils.getPointersCount(realType) === 1 &&
            utils.getStructNameFromType(realType) === 'HTAB') {
            return new HTABSpecialMember(args);
        }

        /* Simple hash table (simple hash) */
        if (SimplehashMember.looksLikeSimpleHashTable(realType)) {
            const entry = context.hashTableTypes.findSimpleHashTableType(realType);
            if (entry) {
                return new SimplehashMember(entry, args);
            }
        }

        /* At the end - it is simple variable */
        return new RealVariable(args);
    }

    static async getVariables(variablesReference: number, frameId: number,
                              context: ExecContext, logger: utils.ILogger,
                              parent?: RealVariable): Promise<Variable[]> {
        const debugVariables = await context.debug.getMembers(variablesReference);
        return await Promise.all(debugVariables.map(variable =>
            Variable.create(variable, frameId, context, logger, parent))
        );
    }

    static async mapVariables(debugVariables: dap.DebugVariable[],
                              frameId: number,
                              context: ExecContext,
                              logger: utils.ILogger,
                              parent?: RealVariable): Promise<Variable[]> {
        return await (Promise.all(debugVariables.map(v =>
            Variable.create(v, frameId, context, logger, parent))
        ));
    }

    /**
     * Format expression to be inserted in 'Watch' view to evaluate.
     *
     * @returns Expression to be evaluated in 'Watch' view
     */
    getWatchExpression(): string | null {
        return null;
    }

    /**
     * call `palloc` with specified size (can be expression).
     * before, it performs some checks and can throw EvaluationError
     * if they fail.
     */
    async palloc(size: string) {
        /*
         * Memory allocation is a very sensitive operation.
         */
        if (!await this.isSafeToAllocateMemory()) {
            /* TODO: CritSectionError or something like that */
            throw new EvaluationError('It is not safe to allocate memory now');
        }

        if (this.context.hasPalloc) {
            const result = await this.evaluate(`palloc(${size})`);

            /*
             * I will not allocate huge amounts of memory - only small *state* structures,
             * and expect, that there is always enough memory to allocate it.
             *
             * So, only invalid situation - this is old version of PostgreSQL,
             * so `palloc` implemented as macro and we need to invoke `MemoryContextAlloc`
             * directly.
             */
            if (this.debug.isValidPointerType({...result, value: result.result})) {
                return result.result;
            }
        }

        const result = await this.evaluate(`MemoryContextAlloc(CurrentMemoryContext, ${size})`);
        if (this.debug.isValidPointerType({...result, value: result.result})) {
            this.context.hasPalloc = false;
            return result.result;
        }

        throw new EvaluationError(`failed to allocate memory using MemoryContextAlloc: ${result.result}`);
    }

    private async isSafeToAllocateMemory() {
        const isValidMemoryContextTag = (tag: string) => {
            /*
             * Different versions has different algorithms (tags)
             * for memory allocations.
             * We check all of them, without knowledge of pg version.
             *
             * In comments you will see version when it was introduced
             * (AllocSetContext was here forever).
             */
            switch (tag) {
                case 'T_AllocSetContext':
                case 'T_SlabContext':       /* 10 */
                case 'T_GenerationContext': /* 11 */
                case 'T_BumpContext':       /* 17 */
                    return true;
                default:
                    /* This is T_Invalid or something else */
                    return false;
            }
        }

        const T_Invalid = this.debug.formatEnumValue('NodeTag', 'T_Invalid');

        /*
         * Memory allocation is very sensitive operation.
         * Allocation occurs in CurrentMemoryContext (directly or by `palloc`).
         *
         * During this operation we have to perform some checks:
         * 1. MemoryContextIsValid()
         * 2. AssertNotInCriticalSection()
         *
         * If we do not perform them by ourselves the whole backend may
         * crash, because these checks will fail.
         *
         * I try to reduce amount of debugger calls, so use single expression.
         * It combines both MemoryContextIsValid() and AssertNotInCriticalSection().
         */
        let result;
        if (this.context.hasAllowInCritSection) {
            try {
                const checkExpr = 
                    `(CurrentMemoryContext == ((void *)0))
                        ? ((NodeTag) ${T_Invalid})
                        : (CritSectionCount == 0 || CurrentMemoryContext->allowInCritSection)
                            ? ((NodeTag) ((Node *)CurrentMemoryContext)->type)
                            : ((NodeTag) ${T_Invalid})`;
                result = await this.evaluate(checkExpr);
            } catch (err) {
                if (!(err instanceof EvaluationError)) {
                    throw err;
                }

                if (err.message.indexOf('There is no member') === -1) {
                    throw err;
                }

                this.context.hasAllowInCritSection = false;
                const checkExpr =
                    `(CurrentMemoryContext == ((void *)0))
                        ? ((NodeTag) ${T_Invalid})
                        : ((NodeTag) ((Node *)CurrentMemoryContext)->type)`;
                result = await this.evaluate(checkExpr);
            }
        } else {
            const checkExpr =
                `(CurrentMemoryContext == ((void *)0))
                    ? ((NodeTag) ${T_Invalid})
                    : ((NodeTag) ((Node *)CurrentMemoryContext)->type)`;
            result = await this.evaluate(checkExpr);
        }


        return isValidMemoryContextTag(result.result);
    }

    /**
     * call `pfree` with specified pointer
     */
    async pfree(pointer: string) {
        if (!dbg.pointerIsNull(pointer))
            await this.evaluateVoid(`pfree((void *)${pointer})`);
    }

    protected async evaluate(expr: string) {
        return await this.debug.evaluate(expr, this.frameId);
    }

    protected async evaluateVoid(expr: string) {
        return await this.debug.evaluate(expr, this.frameId, 
                                         undefined  /* context */, 
                                         true       /* no return */);
    }

    getPointer() {
        return this.debug.getPointer(this);
    }
}

/*
 * Special class to store top level variables, extracted from this frame.
 * Used as container for top-level variables.
 *
 * Now used to find 'PlannerInfo' or 'Query' in all current variables.
 */
export class VariablesRoot extends Variable {
    static variableRootName = '$variables root$'

    constructor(public topLevelVariables: Variable[],
                context: ExecContext, logger: utils.ILogger) {
        super(VariablesRoot.variableRootName, '', '', context, invalidFrameId,
              undefined, logger);
    }

    async doGetChildren(): Promise<Variable[] | undefined> {
        return undefined;
    }
}

class ScalarVariable extends Variable {
    tooltip?: string;
    constructor(name: string, value: string, type: string, context: ExecContext,
                logger: utils.ILogger, parent?: Variable, tooltip?: string) {
        super(name, value, type, context, invalidFrameId, parent, logger);
        this.tooltip = tooltip;
    }

    async doGetChildren(): Promise<Variable[] | undefined> {
        return;
    }

    async getTreeItem() {
        const item = await super.getTreeItem();

        /* Some scalar variables are pseudo members without any type */
        if (this.type === '') {
            item.label = this.name;
        }

        item.tooltip = this.tooltip;
        return item;
    }
}

/* Utility structure used to reduce the number of function arguments */
interface RealVariableArgs {
    memoryReference?: string;
    name: string;
    type: string;
    value: string;
    variablesReference: number;
    frameId: number;
    parent?: Variable;
    context: ExecContext;
    logger: utils.ILogger;
}

/**
 * Specified member was not found in some variable's members
 */
class NoMemberFoundError extends PghhError {
    constructor(readonly member: string) {
        super(`member ${member} does not exists`);
    }
}

/**
 * Evaluation produced unexpected results.
 * 
 * TODO: add actual/expected pair
 */
class UnexpectedOutputError extends EvaluationError { }

/**
 * Base class for all *real* variables (members or variables
 * obtained using 'evaluate' or as members of structs).
 */
export class RealVariable extends Variable {

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
     * Cached *real* members of this variable
     */
    members?: Variable[];

    constructor(args: RealVariableArgs) {
        super(args.name, args.value, args.type, args.context, args.frameId, args.parent, args.logger);
        this.memoryReference = args.memoryReference;
        this.variablesReference = args.variablesReference;
        this.parent = args.parent;
    }

    getRealVariableArgs(): RealVariableArgs {
        return {
            memoryReference: this.memoryReference,
            name: this.name,
            type: this.type,
            value: this.value,
            variablesReference: this.variablesReference,
            frameId: this.frameId,
            parent: this.parent,
            context: this.context,
            logger: this.logger,
        }
    }

    /**
     * Check that {@link value value} is valid pointer value
     */
    isValidPointer() {
        return this.debug.isValidPointerType(this);
    }

    /**
     * Base implementation which just get variables using
     * {@link variablesReference variablesReference } field
     */
    async doGetChildren(): Promise<Variable[] | undefined> {
        if (this.members !== undefined) {
            return this.members;
        }

        this.members = await this.getRealMembers();
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
        if (this.members !== undefined) {
            return this.members;
        }

        this.members = await this.doGetRealMembers();
        return this.members;
    }

    protected async doGetRealMembers() {
        return await Variable.getVariables(this.variablesReference, this.frameId,
            this.context, this.logger, this);
    }

    protected async getArrayMembers(expression: string, length: number) {
        const variables = await this.debug.getArrayVariables(expression,
                                                             length, this.frameId);
        return await Variable.mapVariables(variables, this.frameId, this.context,
                                           this.logger, this);
    }

    /**
     * Get *real* member of this var `this->member`.
     * Prefer this method as more optimized.
     *
     * @param member member name of this var
     * @returns Variable that represent member of this var
     * @throws `NoMemberFoundError` if no such member found
     * @throws `EvaluationError` if failed to get members of this variable
     */
    async getMember(member: string) {
        /*
         * Use `getRealMember`, not `getChildren` in order to
         * prevent infinite loops when getting member
         * of one var from another.
         */
        const members = await this.getRealMembers();
        if (members === undefined) {
            throw new EvaluationError(`failed to get members of "${this.type} ${this.name}"`);
        }

        const m = members.find(v => v.name === member);
        if (m === undefined) {
            throw new NoMemberFoundError(member);
        }

        return m;
    }

    getRealType() {
        return this.type;
    }

    async getRealMember(member: string) {
        const m = await this.getMember(member);
        if (m instanceof RealVariable) {
            return m;
        }

        throw new EvaluationError(`member "${member}" is not RealVariable`);
    }

    /**
     * Get elements of member `this->member`.
     * You should use this function, because NIL is valid
     * List representation, but this extension treats it as
     * RealVariable, not ListNodeVariable.
     *
     * @param member member name of this var
     * @returns Elements of list array
     */
    async getListMemberElements(member: string) {
        const m = await this.getMember(member);
        if (m instanceof ListNodeVariable) {
            const elements = await m.getListElements();
            if (elements === undefined) {
                throw new UnexpectedOutputError(`failed to get elements from List member ${member}`);
            }
            return elements;
        }

        /* NIL means 0x0, so List will be RealVariable */
        if (this.debug.isNull(m)) {
            return [];
        }

        throw new UnexpectedOutputError(`member ${member} is not valid List`);
    }

    /**
     * Get string value of `char *` member `this->member`.
     * If that was NULL, then `null` returned.
     *
     * @param memberName member name of this var
     * @returns string value of member
     */
    async getMemberValueCharString(memberName: string) {
        const member = await this.getMember(memberName);
        const str = this.debug.extractString(member);
        if (str !== null) {
            return str;
        }
        if (this.debug.isNull(member)) {
            return null;
        }

        throw new UnexpectedOutputError(`member ${memberName} output is not valid char string`);
    }

    /**
     * Get value of enum member `this->member`.
     * If failed throws UnexpectedOutputError.
     *
     * NOTE: var does not know, what valid enum values for this type are,
     *       so it returns anything, that looks like valid enum value.
     *
     * @param memberName member name of this var
     * @returns Enum value of this member as string
     */
    async getMemberValueEnum(memberName: string) {
        const member = await this.getMember(memberName);
        const value = member.value;
        if (!utils.isEnumResult(value)) {
            throw new UnexpectedOutputError(`member ${memberName} output is not enum`);
        }
        return value;
    }

    /**
     * Get bool value of `this->member`.
     * If failed throw UnexpectedOutputError.
     *
     * @param memberName member name of this var
     * @returns Bool value of member
     */
    async getMemberValueBool(memberName: string) {
        const member = await this.getMember(memberName);
        const result = this.debug.extractBool(member);
        if (result === null) {
            throw new UnexpectedOutputError(`member ${memberName} output is not bool`);
        }
        return result;
    }

    /**
     * Get number value of `this->member`.
     * If failed throws UnexpectedOutputError.
     *
     * @param memberName member name of this var
     * @returns Number value of this member
     */
    async getMemberValueNumber(memberName: string) {
        const member = await this.getMember(memberName);
        const value = member.value;
        const num = Number(value);
        if (Number.isNaN(num)) {
            throw new UnexpectedOutputError(`member ${memberName} output is not number`);
        }
        return num;
    }

    protected formatWatchExpression(myType: string) {
        /* TODO: only CppDbg works with this */
        if (this.parent instanceof VariablesRoot) {
            /* Top level variable */
            if (this.debug.isValueStruct(this, myType)) {
                /* No way to evaluate raw structs as they just lie on stack */
                return this.name;
            } else if (this.debug.isValidPointerType(this)) {
                return `(${myType})${this.getPointer()}`;
            }
        }
        else if (this.parent instanceof ListElementsMember ||
            this.parent instanceof LinkedListElementsMember) {
            /* Pointer element of List, not int/Oid/TransactionId... */
            if (this.debug.isValidPointerType(this)) {
                return `(${myType})${this.getPointer()}`;
            }
        } else if (this.parent instanceof ArraySpecialMember) {
            if (this.debug.isValidPointerType(this)) {
                return `(${myType})${this.getPointer()}`
            }
        } else if (this.parent instanceof RealVariable) {
            /* Member of real structure */
            const typeModifier = this.type === myType ? '' : `(${myType})`;
            if (this.debug.isValueStruct(this.parent)) {
                if (   this.debug.isFixedSizeArray(this.parent)
                    && this.debug.isValidPointerType(this)) {
                    return `(${myType})${this.getPointer()}`;
                } else {
                    return `${typeModifier}(${this.parent.type})${this.parent.getPointer()}.${this.name}`;
                }
            } else if (this.debug.isValidPointerType(this.parent)) {
                return `${typeModifier}((${this.parent.getRealType()})${this.parent.getPointer()})->${this.name}`;
            }
        } else {
            /* Child of pseudo-member */
            if (this.debug.isValueStruct(this, myType)) {
                if (!this.parent) {
                    /* Should not happen */
                    return this.name;
                }

                if (this.parent instanceof VariablesRoot) { 
                    return this.name;
                } else if (this.debug.isValidPointerType(this.parent)) {
                    return `((${this.parent.type})${this.parent.getPointer()})->${this.name}`
                } else {
                    return `((${this.parent.type})${this.parent.getPointer()}).${this.name}`
                }
            } else if (this.debug.isValidPointerType(this)) {
                return `(${myType})${this.getPointer()}`
            }
        }

        return null;
    }

    getWatchExpression() {
        return this.formatWatchExpression(this.type);
    }
}

/*
 * Some constants from source code.
 * Using them in such way is quite safe, because they haven't
 * changed for many years (and I do not think will be changed
 * in near future).
 */
const InvalidOid = 0;
const oidIsValid = (oid: number) => Number.isInteger(oid) && oid !== InvalidOid;

const InvalidAttrNumber = 0;

/**
 * Variable/member with `NodeTag' assigned.
 * We should examine it to get real NodeTag because it
 * may be different from declared type.
 */
export class NodeVariable extends RealVariable {
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
    realType?: string;

    constructor(realNodeTag: string, args: RealVariableArgs) {
        super(args);
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
        let type = this.type;
        const alias = this.context.nodeVarRegistry.aliases.get(tagFromType);
        if (alias) {
            type = utils.substituteStructName(type, alias);
        }

        return utils.substituteStructName(type, this.realNodeTag);
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
        try {
            return {
                label: this.tagsMatch()
                    ? `${this.name}: ${this.type}`
                    : `${this.name}: ${this.type} [${this.realNodeTag}]`,
                description: await this.getDescription(),
                collapsibleState: this.isExpandable()
                    ? vscode.TreeItemCollapsibleState.Collapsed
                    : vscode.TreeItemCollapsibleState.None,
            };
        } catch (e) {
            this.logger.debug('failed to get TreeItem for %s', this.name, e);
            if (isExpectedError(e)) {
                return {};
            } else {
                throw e;
            }
        }
    }

    protected async checkTagMatch() {
        if (!this.tagsMatch()) {
            await this.castToTag(this.realNodeTag);
        }
    }

    protected async castToType(type: string) {
        const newVarExpression = `((${type})${this.getPointer()})`;

        const response = await this.debug.evaluate(newVarExpression, this.frameId);
        this.variablesReference = response.variablesReference;

        /*
         * No need to update 'type' member - type in variables view
         * already present and we rely on 'realNodeTag' member
         */
        return response;
    }

    protected async castToTag(tag: string) {
        /*
         * We should substitute current type with target, because
         * there may be qualifiers such `struct' or `const'
         */
        const resultType = utils.substituteStructName(this.getRealType(), tag);
        return await this.castToType(resultType);
    }

    async doGetChildren() {
        await this.checkTagMatch();

        let members = await super.doGetChildren();

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
            members = await this.getRealMembers();
        }
        return members;
    }

    protected async doGetRealMembers() {
        await this.checkTagMatch();

        let members = await super.doGetRealMembers();

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
            members = await super.doGetRealMembers();
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

    static async createNode(variable: dap.DebugVariable, frameId: number,
                            context: ExecContext, logger: utils.ILogger,
                            parent?: Variable) {
        const getRealNodeTag = async () => {
            const expr = `((Node*)(${context.debug.getPointer(variable)}))->type`;
            const response = await context.debug.evaluate(expr, frameId);
            let realTag = response.result.replace('T_', '');
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
            context,
            logger,
        };

        realTag = realTag.replace('T_', '');

        /* List */
        if (ListNodeVariable.listInfo.has(realTag)) {
            return new ListNodeVariable(realTag, args);
        }

        /* Bitmapset */
        if (realTag === 'Bitmapset') {
            return new BitmapSetSpecialMember(args);
        }

        /* Expressions with it's representation */
        if (context.nodeVarRegistry.exprs.has(realTag)) {
            if (realTag === 'TargetEntry') {
                return new TargetEntryVariable(args);
            }

            return new ExprNodeVariable(realTag, args);
        }

        /* Display expressions in EquivalenceMember and RestrictInfo */
        if (realTag === 'EquivalenceMember') {
            return new DisplayExprReprVariable(realTag, 'em_expr', args);
        }

        if (realTag === 'RestrictInfo') {
            return new DisplayExprReprVariable(realTag, 'clause', args);
        }

        /* Check this is a tag of 'Value' */
        if (realTag === 'String' ||
            realTag === 'Integer' ||
            realTag === 'Float' ||
            realTag === 'Boolean' ||
            realTag === 'BitString') {
            return new ValueVariable(realTag, args);
        }

        return new NodeVariable(realTag, args);
    }

    getWatchExpression() {
        return this.formatWatchExpression(this.computeRealType());
    }
}

/**
 * Used only inside ExprNodeVariable in order not to pass huge type specification.
 * Created as container to postpone 'rtable' evaluation.
 */
class RangeTableContainer {
    /**
     * Flag indicating, that search of rtable already occurred.
     * 'rtable' can be undefined because we could not find it.
     */
    rtableSearched: boolean = false;

    /**
     * Found 'rtable' among variables. Before updating/using
     * this field check `rtableSearched` if this member has
     * actual value.
     */
    rtable: NodeVariable[] | undefined;
}

/**
 * Subtypes of Expr node, that can be displayed with text representation of it's expression
 */
class ExprNodeVariable extends NodeVariable {
    /**
     * String representation of expression.
     */
    protected repr?: string;

    /**
     * Evaluate expression and parse string from result.
     * If result is not correct string result output, then null returned.
     */
    private async evalStringResult(expr: string) {
        const result = await this.evaluate(expr);
        return this.debug.extractString({...result, value: result.result});
    }

    /**
     * Run `get_func_name(this->oidMember)` and get output as string.
     */
    private async getFuncName(oidMember: string) {
        /* First check oid is valid, otherwise ERROR is thrown */
        const oid = await this.getMemberValueNumber(oidMember);
        if (!oidIsValid(oid)) {
            return null;
        }

        const result = await this.evaluate(`get_func_name((Oid) ${oid})`);
        const pseudoVar = {...result, value: result.result};
        const str = this.debug.extractString(pseudoVar);
        if (str === null) {
            return null;
        }

        const ptr = this.debug.extractPtrFromString(pseudoVar);
        if (ptr) {
            await this.pfree(ptr);
        }
        return str;
    }

    /**
     * Run `get_opname(this->oidMember)` and get output as string.
     */
    private async getOpName(oidMember: string) {
        const oid = await this.getMemberValueNumber(oidMember);
        if (!oidIsValid(oid)) {
            return null;
        }

        const result = await this.evaluate(`get_opname((Oid)${oid})`);

        const pseudoVar = {...result, value: result.result};
        const str = this.debug.extractString(pseudoVar);
        if (str === null) {
            return null;
        }

        const ptr = this.debug.extractPtrFromString(pseudoVar);
        if (ptr) {
            await this.pfree(ptr);
        }

        return str;
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
        ['PlaceHolderVar', 'PLACEHOLDER_VAR'],
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

        if (!(variable instanceof NodeVariable)) {
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
            try {
                return await variable.getReprInternal(rtable);
            } catch (err) {
                if (err instanceof EvaluationError) {
                    return this.getExprPlaceholder(variable);
                }

                throw err;
            }
        } else {
            return this.getExprPlaceholder(variable);
        }
    }

    private async formatVarExpr(rtable: RangeTableContainer) {
        const varno = await this.getMemberValueNumber('varno');

        if (varno === -1 || varno === 65000) {
            return 'INNER.???';
        }

        if (varno === -2 || varno === 65001) {
            return 'OUTER.???';
        }

        if (varno === -3 || varno === 65002) {
            return 'INDEX.???';
        }

        if (!rtable.rtableSearched) {
            if (!rtable.rtable) {
                rtable.rtable = await this.findRtable() as NodeVariable[] | undefined;
                rtable.rtableSearched = true;
            }
        }

        if (!rtable.rtable) {
            return '???.???';
        }

        if (!(varno > 0 && varno <= rtable.rtable.length)) {
            /* This was an Assert */
            throw new EvaluationError('failed to get RTEs from range table');
        }

        /*
         * We can safely get `relname` (eref->aliasname), but that's
         * not true for `attname`.
         *
         * We can use `get_rte_attribute_name` function, but
         * main drawback is that it throws ERROR if failed to find
         * one.
         * You may think that this is valid, but not during development
         * when you are creating a patch and modifying Query/Subquery
         * such, that they can interleave each other. It can lead
         * to `get_rte_attribute_name` throwing an ERROR.
         *
         * Fortunately, this function is simple enough and here
         * we just copy it's logic.
         */

        const rte = rtable.rtable[varno - 1];
        const rtePtr = `((RangeTblEntry *)${rte.getPointer()})`;
        const get_rte_attribute_name = async () => {
            /* Copy of `get_rte_attribute_name` logic */

            const varattno = await this.getMemberValueNumber('varattno');
            if (varattno === InvalidAttrNumber) {
                return '*';
            }

            if (varattno < InvalidAttrNumber) {
                return '???';
            }

            const alias = await rte.getRealMember('alias');
            if (alias.isValidPointer()) {
                const aliasColnames = await alias.getListMemberElements('colnames');

                if (varattno <= aliasColnames.length) {
                    const colname = aliasColnames[varattno - 1];
                    if (colname instanceof ValueVariable) {
                        return await colname.getStringValue() ?? '???';
                    }
                }
            }

            if (this.context.hasGetAttname) {
                const rteRelation = this.debug.formatEnumValue('RTEKind', 'RTE_RELATION'); 
                const getAttnameExpr = `   ${rtePtr}->rtekind == ${rteRelation} 
                                        && ${rtePtr}->relid   != ${InvalidOid}`;
                const evalResult = await this.evaluate(getAttnameExpr);
                const useGetAttname = this.debug.extractBool({...evalResult, value: evalResult.result});
                if (useGetAttname) {
                    let r;
                    let attname;
                    if (this.context.hasGetAttname3) {
                        /* 
                         * There are 2 notes:
                         * 
                         * 1. In older versions `get_attname` accepted only 2
                         *    arguments and behaved in same way as `true` is
                         *    passed today
                         * 2. We first should check for failed var, not extract
                         *    string and check for null. My current code for
                         *    extracting strings is dumb and does not check for
                         *    such situations (so it will return non-null in
                         *    case of such error)
                         */
                        try {
                            r = await this.evaluate(`get_attname(${rtePtr}->relid, ${varattno}, true)`);
                            attname = this.debug.extractString({...r, value: r.result});
                            if (attname !== null) {
                                return attname;
                            }
                        } catch (err) {
                            if (!(err instanceof EvaluationError)) {
                                throw err;
                            }

                            /* maybe this version has get_attname with 2 arguments */
                            if (err.message.indexOf('no matching function') === -1) {
                                throw err;
                            }
                        }

                        r = await this.evaluate(`get_attname(${rtePtr}->relid, ${varattno})`);
                        attname = this.debug.extractString({...r, value: r.result});
                        if (attname !== null) {
                            this.context.hasGetAttname3 = false;
                            return attname;
                        }
                    } else {
                        r = await this.evaluate(`get_attname(${rtePtr}->relid, ${varattno})`);
                        attname = this.debug.extractString({...r, value: r.result});
                        if (attname !== null) {
                            return attname;
                        }
                    }
                }
            }

            const eref = await rte.getRealMember('eref');
            if (eref.isValidPointer()) {
                const erefColnames = await eref.getListMemberElements('colnames');
                if (varattno <= erefColnames.length) {
                    const colname = erefColnames[varattno - 1];
                    if (colname instanceof ValueVariable) {
                        return await colname.getStringValue() ?? '???';
                    }
                }
            }

            return '???';
        }

        /* TODO: change to Variable interface to prevent (possible) SEGFAULT */
        const relname = await this.evalStringResult(`${rtePtr}->eref->aliasname`) ?? '???';
        const attname = await get_rte_attribute_name();

        return `${relname}.${attname}`;
    }

    private async formatPlaceHolderVar(rtable: RangeTableContainer) {
        return await this.getMemberRepr('phexpr', rtable);
    }

    private async formatConst(rtable: RangeTableContainer) {
        const evalOid = async (expr: string) => {
            const res = await this.evaluate(expr);
            const oid = Number(res.result);
            if (!Number.isInteger(oid)) {
                throw new UnexpectedOutputError(`failed to get Oid from expr: ${expr}`);
            }

            return oid;
        }

        const evalStrWithPtr = async (expr: string) => {
            const result = await this.debug.evaluate(expr, this.frameId);
            const debugVar = {...result, value: result.result};
            const str = this.debug.extractString(debugVar);
            if (str === null) {
                throw new EvaluationError(`failed to get string from expr: ${expr}`);
            }

            const ptr = this.debug.extractPtrFromString(debugVar);
            if (ptr === null) {
                throw new EvaluationError(`failed to get pointer from expr: ${expr}`);
            }
            return [str, ptr];
        }

        const legacyOidOutputFunctionCall = async (funcOid: number) => {
            /*
             * Older systems do not have OidOutputFunctionCall().
             * But, luckily, it's very simple to write it by ourselves.
             */

            const fmgrInfo = await this.palloc('sizeof(FmgrInfo)');
            /* Init FmgrInfo */
            const expr = `fmgr_info(${funcOid}, (void *)${fmgrInfo})`;
            await this.evaluateVoid(expr);

            /* Call function */
            const [str, ptr] = await evalStrWithPtr(`(char *)((Pointer) FunctionCall1(((void *)${fmgrInfo}), ((Const *)${this.getPointer()})->constvalue))`);
            await this.pfree(ptr);
            return str;
        }

        if (await this.getMemberValueBool('constisnull')) {
            return 'NULL';
        }

        const tupOutput = await this.palloc('sizeof(Oid)');
        const tupIsVarlena = await this.palloc('sizeof(Oid)');

        /* Older system have 4 params (3rd is tupIOParam) */
        let tupIOParam = this.context.hasGetTypeOutputInfo3Args
                                    ? undefined
                                    : await this.palloc('sizeof(Oid)');

        /*
         * This place is ****. In a nutshell, for CppDbg we have to pass arguments 
         * as 'void *', otherwise passed pointers will have some offset, so written
         * values will be stored in random place.
         * But, CodeLLDB complains, because argument type does not match passed
         * types ('Oid *' does not match passed 'void *').
         * Also, there is trouble for CodeLLDB when working with old PostgreSQL,
         * because back days 'bool' was typedef for 'char' and CodeLLDB
         * complains "can not convert 'bool *' to 'bool *' (aka 'char *')".
         * 
         * I hate this place.
         */
        let tupOutputType;
        let tupIsVarLenaType;
        let tupIOParamType;
        if (this.debug.type === dbg.DebuggerType.CppDbg) {
            tupOutputType = tupIsVarLenaType = tupIOParamType = 'void *';
        } else {
            console.assert(this.debug.type === dbg.DebuggerType.CodeLLDB,
                           'The only other option for DebuggerType is CodeLLDB but passed %d', this.debug.type);
            tupOutputType = 'Oid *';
            if (this.context.hasBoolAsChar) {
                tupIsVarLenaType = 'char *';
            } else {
                tupIsVarLenaType = 'bool *';
            }
            tupIOParamType = 'Oid *';
        }

        /* 
         * We have to handle multiple possible bad scenarios, so make fallback
         * logic with iteration and in each iteration run code according to
         * state.
         * 
         * Prevent infinite recursion and perform max 2 iterations - max possible
         * amount of fallbacks (3->4 args + )
         */
        let attempt;
        let maxAttempts = 2;
        for (attempt = 0; attempt < maxAttempts; attempt++) {
            if (this.context.hasGetTypeOutputInfo3Args) {
                try {
                    await this.evaluateVoid(`getTypeOutputInfo(((Const *)${this.getPointer()})->consttype, ((${tupOutputType})${tupOutput}), ((${tupIsVarLenaType})${tupIsVarlena}))`);
                } catch (err) {
                    if (!(err instanceof EvaluationError)) {
                        throw err;
                    }
    
                    if (err.message.indexOf('char *') !== -1) {
                        tupIsVarLenaType = 'char *';
                        this.context.hasBoolAsChar = true;
                        continue;
                    } else if (err.message.indexOf('requires 4') !== -1) {
                        tupIOParam = await this.palloc('sizeof(Oid)');
                        this.context.hasGetTypeOutputInfo3Args = false;
                        continue;
                    } else {
                        throw err;
                    }
                }
            } else {
                try {
                    await this.evaluateVoid(`getTypeOutputInfo(((Const *)${this.getPointer()})->consttype, ((${tupOutputType})${tupOutput}), ((${tupIOParamType})${tupIOParam}), ((${tupIsVarLenaType})${tupIsVarlena}))`);
                } catch (err) {
                    if ((!(err instanceof EvaluationError))) {
                        throw err;
                    }

                    if (err.message.indexOf('char *') !== -1) {
                        tupIsVarLenaType = 'char *';
                        this.context.hasBoolAsChar = true;
                        continue;
                    } else {
                        throw err;
                    }
                }
            }

            break;
        }

        if (maxAttempts <= attempt) {
            await this.pfree(tupOutput);
            await this.pfree(tupIsVarlena);
            if (tupIOParam)
                await this.pfree(tupIOParam);
            return '???';
        }

        const funcOid = await evalOid(`*((Oid *)${tupOutput})`);
        let repr;
        

        if (this.context.hasOidOutputFunctionCall) {
            try {
                const [str, ptr] = await evalStrWithPtr(`OidOutputFunctionCall(${funcOid}, ((Const *)${this.getPointer()})->constvalue)`);
                await this.pfree(ptr);
                repr = str;
            } catch (e) {
                if (!(e instanceof EvaluationError)) {
                    throw e;
                }

                repr = await legacyOidOutputFunctionCall(funcOid);
                this.context.hasOidOutputFunctionCall = false;
            }
        } else {
            repr = await legacyOidOutputFunctionCall(funcOid);
        }

        await this.pfree(tupOutput);
        await this.pfree(tupIsVarlena);
        if (tupIOParam)
            await this.pfree(tupIOParam);

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
                if (!this.debug.isNull(lower)) {
                    index += await this.getReprPlaceholder(lower, rtable);
                }
                index += ':';
                if (!this.debug.isNull(upper)) {
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
                if (entry instanceof ValueVariable) {
                    try {
                        values.push(await entry.getStringValue() ?? 'NULL');
                    } catch (e) {
                        if (e instanceof EvaluationError) {
                            this.logger.debug('error during getting string value from ValueVariable', e);
                            values.push('???');
                        } else {
                            throw e;
                        }
                    }
                } else if (entry instanceof ExprNodeVariable) {
                    values.push(await entry.getReprInternal(rtable));
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
            if (!(v instanceof NodeVariable && v.realNodeTag === 'OpExpr')) {
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
        if (!(testexpr instanceof NodeVariable)) {
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
        if (elements?.length && elements[0] instanceof ValueVariable) {
            opname = await elements[0].getStringValue() ?? '???'
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
         * i.e. src/backend/utils/adt/ruleutils.c:get_name_for_var_field.
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
            /*
             * Values sorted in order of appearing frequency.
             * P.S. Of course in my opinion, no stats collected.
             */
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
                case 'PlaceHolderVar':
                    return await this.formatPlaceHolderVar(rtable);
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
                case 'ArrayRef' /* old style 'SubscripingRef' */:
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
     * recursive repr evaluation.  This is speed up, because
     * of already found 'rtable' passing.
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
         * We can go in 4 ways:
         *
         * 1. PlannderInfo->parse (Query)->rtable
         * 2. Query->rtable
         * 3. PlannedStmt->rtable
         * 4. Search in 'context *' variable members
         * 
         * Anyway logic is the following: traverse variable tree up while
         * looking for PlannerInfo/Query/PlannedStmt. If we reached top-level
         * then look them for same nodes and also (if failed) find 'context *'
         * variable (in walkers/mutators it often contains these nodes).
         */
        const isRtableContainingNode = (v: Variable) => {
            return v instanceof NodeVariable && 
                    (    v.realNodeTag === 'PlannerInfo'
                      || v.realNodeTag === 'Query'
                      || v.realNodeTag === 'PlannedStmt');
        }

        const tryGetRtable = async (v: NodeVariable) => {
            switch (v.realNodeTag) {
                case 'Query':
                    /* Query->rtable */
                    return await v.getListMemberElements('rtable');
                case 'PlannerInfo':
                    /* PlannerInfo->parse->rtable */
                    const parse = await v.getMember('parse');
                    if (!(parse && parse instanceof NodeVariable)) {
                        return;
                    }
                    return await parse.getListMemberElements('rtable');
                case 'PlannedStmt':
                    /* PlannedStmt->rtable */
                    return v.getListMemberElements('rtable');
                default:
                    this.logger.warn('got unexpected NodeTag in findRtable: %s',
                                     v.realNodeTag);
                    return;
            }
        }

        let node = this.parent;
        while (node && !(node instanceof VariablesRoot)) {
            if (isRtableContainingNode(node)) {
                /* Found suitable Node */
                break;
            }

            /* Continue traversing variable tree upper */
            node = node.parent;
        }

        if (!node) {
            return;
        }

        if (isRtableContainingNode(node)) {
            /* Ok, Node variable found - extract */
            return await tryGetRtable(node as NodeVariable);
        }

        /* 
         * Reached top level: search appropriate Node var at the top level
         * or apply heuristic and find it in walker/mutator's members.
         */
        if (!(node instanceof VariablesRoot)) {
            return;
        }

        for (const v of node.topLevelVariables) {
            /* Find Node variables directly in top level */
            if (isRtableContainingNode(v)) {
                console.assert(v instanceof NodeVariable);
                return await tryGetRtable(v as NodeVariable);
            }

            /* 
             * May be we are in walker/mutator, so check 'context'
             * variable - conventional name of argument variable with
             * work context.
             */
            if (   v instanceof RealVariable 
                && (v.name === 'context' || v.name === 'cxt') 
                && v.type !== 'void *') {
                const members = await v.getRealMembers();
                if (!members) {
                    continue;
                }

                for (const member of members) {
                    if (!isRtableContainingNode(member)) {
                        continue;
                    }

                    /* 
                     * Some 'context' variable types have both 'PlannerInfo'
                     * and 'Query' but one of them may be null.  By design,
                     * only RealVariable can be NULL, so if variable is
                     * NodeVariable so no check required.
                     */
                    console.assert(member instanceof NodeVariable);
                    return await tryGetRtable(member as NodeVariable);
                }
            }
        }

        /* Did not find anything */
    }

    async doGetChildren() {
        const expr = await this.getRepr();
        if (!expr) {
            return await super.doGetChildren();
        }

        /* Add representation field first in a row */
        const exprVariable = new ScalarVariable('$expr$', expr, '', this.context,
            this.logger, this, expr)
        const children = await super.doGetChildren() ?? [];
        children.unshift(exprVariable);
        return children;
    }
}

/**
 * Simple wrapper around 'Expr' containing variable,
 * which must display it's repr in description member.
 *
 * Used for 'EquivalenceMember' and 'RestrictInfo'.
 */
class DisplayExprReprVariable extends NodeVariable {
    /**
     * 'Expr' member which representation is shown
     */
    readonly exprMember: string;

    constructor(tag: string, exprMember: string, args: RealVariableArgs) {
        super(tag, args);
        this.exprMember = exprMember;
    }

    async getDescription() {
        const exprMember = await this.getMember(this.exprMember);
        if (exprMember instanceof ExprNodeVariable) {
            return await exprMember.getRepr();
        }

        return '';
    }
}

/**
 *   Special case for 'TargetEntry' to display it's repr
 * in description.
 *   It can not be moved to 'DisplayExprReprVariable' because
 * it is Expr and can be used in 'ExprVariable.
 *   Also I do not want to move such logic to 'ExprVariable',
 * because repr evaluation is resource-intensive operation
 * and UI just blocks.
 */
class TargetEntryVariable extends ExprNodeVariable {
    constructor(args: RealVariableArgs) {
        super('TargetEntry', args);
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
     * @example int, Oid, Node * (or custom)
    */
    listCellType: string;

    /**
     * Parent List variable to which we belong
     */
    listParent: ListNodeVariable;

    constructor(listParent: ListNodeVariable, cellValue: string,
                listCellType: string, args: RealVariableArgs) {
        super(args);
        this.listParent = listParent;
        this.cellValue = cellValue;
        this.listCellType = listCellType;
    }

    async getTreeItem() {
        return {
            label: '$elements$',
            collapsibleState: this.listParent.isEmpty()
                ? vscode.TreeItemCollapsibleState.None
                : vscode.TreeItemCollapsibleState.Collapsed,
        };
    }

    async getPointerElements() {
        const length = await this.listParent.getListLength();
        if (!length) {
            return;
        }

        const listType = this.listParent.getMemberExpression('elements');
        const expression = `(${this.listCellType}*)(${listType})`;
        return super.getArrayMembers(expression, length);
    }

    async getIntegerElements() {
        const length = await this.listParent.getListLength();
        if (!length) {
            return;
        }

        /*
        * We can not just cast `elements' to 'int *' or 'Oid *'
        * due to padding in union.  For these we iterate
        * each element and evaluate each item independently
        */
        const elements: RealVariable[] = [];
        for (let i = 0; i < length; i++) {
            const expression = `((ListCell *)${this.getPointer()})[${i}].${this.cellValue}`;
            const response = await this.debug.evaluate(expression, this.frameId);
            elements.push(new RealVariable({
                name: `[${i}]` /* array elements behaviour */,
                type: this.listCellType,
                variablesReference: response.variablesReference,
                value: response.result,
                memoryReference: response.memoryReference,
                frameId: this.frameId,
                context: this.context,
                logger: this.logger,
                parent: this,
            }));
        }

        return elements;
    }

    async doGetChildren() {
        if (this.members !== undefined) {
            return this.members;
        }

        this.members = await (this.listParent.realNodeTag === 'List'
            ? this.getPointerElements()
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
    listParent: ListNodeVariable;

    constructor(listParent: ListNodeVariable, cellValue: string,
        realType: string, context: ExecContext) {
        super('$elements$', '', '', context, listParent.frameId, listParent);
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
        } while (!this.debug.isNull({...cell, value: cell.result}));

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
export class ListNodeVariable extends NodeVariable {
    static listInfo: Map<string, {member: string, type: string}> = new Map([
        ['List', {member: 'ptr_value', type: 'void *'}],
        ['IntList', {member: 'int_value', type: 'int'}],
        ['OidList', {member: 'oid_value', type: 'Oid'}],
        ['XidList', {member: 'xid_value', type: 'TransactionId'}],
    ]);

    /* Special member, that manages elements of this List */
    listElements?: ListElementsMember | LinkedListElementsMember;

    constructor(nodeTag: string, args: RealVariableArgs) {
        super(nodeTag, args);
    }

    getMemberExpression(member: string) {
        return `((${this.getRealType()})${this.getPointer()})->${member}`
    }

    isEmpty() {
        return this.debug.isNull(this);
    }

    async getListInfoSafe() {
        if (this.realNodeTag === 'List') {
            const realType = await this.findTypeForPtr();
            if (realType) {
                return {
                    member: 'ptr_value',
                    type: realType
                }
            }
        }
        
        let info = ListNodeVariable.listInfo.get(this.realNodeTag);
        if (!info) {
            this.logger.debug('failed to determine List tag for %s->elements. using ptr value',
                              this.name);
            info = {member: 'ptr_value', type: 'void *'};
        }

        return info;
    }

    protected isExpandable(): boolean {
        return !this.isEmpty();
    }

    private async findTypeForPtr() {
        /*
         * Usually (i.e. in planner) ptr value is a node variable (Node *),
         * but actually it can be any pointer.
         *
         * All `List`s hold Nodes, but sometimes it can be custom data.
         * These special cases can be identified by:
         *
         * 1. Function name + variable name (if this is top level variable)
         * 2. Structure name + member name (if this is a member of structure)
         */

        if (!this.parent) {
            /*
             * All valid Variable objects must have 'parent' set
             * except special case 'VariablesRoot', but we are 'List',
             * not 'VariablesRoot'.
             */
            return 'Node *';
        }

        let map = this.context.specialMemberRegistry.listCustomPtrs.get(this.name);
        if (!map) {
            return 'Node *';
        }

        /* Check only 1 case - they are mutually exclusive */
        if (this.parent instanceof VariablesRoot) {
            const func = await this.debug.getCurrentFunctionName();
            if (func) {
                const info = map.get(func);
                if (info) {
                    return info.type;
                }
            }
        } else {
            const parentType = utils.getStructNameFromType(this.parent.type);
            const info = map.get(parentType);
            if (info) {
                return info.type;
            }
        }

        return 'Node *';
    }

    private async createArrayNodeElementsMember(elementsMember: RealVariable) {
        const info = await this.getListInfoSafe();
        return new ListElementsMember(this, info.member, info.type, {
            ...elementsMember.getRealVariableArgs(),
            frameId: this.frameId,
            parent: this,
            context: this.context,
            logger: this.logger
        });
    }

    private async createLinkedListNodeElementsMember() {
        const info = await this.getListInfoSafe();
        return new LinkedListElementsMember(this, info.member, info.type, this.context);
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
        const castExpression = `(${realType}) (${this.getPointer()})`;
        const response = await this.debug.evaluate(castExpression, this.frameId);
        if (!Number.isInteger(response.variablesReference)) {
            this.logger.warn('failed to cast %s to List: %s',
                this.name, response.result);
            return;
        }

        /* Also update type - it will be used  */
        this.variablesReference = response.variablesReference;
    }

    protected tagsMatch(): boolean {
        /* Check only for 'List' - there are no 'IntList', etc... */
        return utils.getStructNameFromType(this.type) === 'List';
    }

    async doGetChildren() {
        if (this.isEmpty()) {
            /* Just show empty members */
            return await this.doGetRealMembers();
        }

        /* 
         * This does 'Node *' -> 'List *' conversion. We have to override
         * default 'tagsMatch' because there is no 'IntList' structure,
         * otherwise we will get an exception.
         */
        if (!this.tagsMatch()) {
            await this.castToList();
        }

        const m = await this.doGetRealMembers();
        if (!m) {
            return m;
        }

        const e = m.find(v => v.name === 'elements');
        if (!e) {
            this.listElements = await this.createLinkedListNodeElementsMember();
            return [
                ...m.filter(v => v.name !== 'head' && v.name !== 'tail'),
                this.listElements
            ];
        }

        if (!(e && e instanceof RealVariable)) {
            return m;
        }

        this.listElements = await this.createArrayNodeElementsMember(e);
        return [
            ...m.filter(v => v.name !== 'elements' && v.name !== 'initial_elements'),
            this.listElements,
        ];
    }

    async getListLength() {
        if (this.isEmpty()) {
            return 0;
        }

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
        if (this.isEmpty()) {
            return [];
        }

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
     * Prevent errors/bugs if there was garbage after
     * length expression evaluation.
     */
    static plausibleMaxLength = 1024;
    
    /**
     * Expression to evaluate to obtain array length.
     * Appended to target struct from right.
     * First element is length member name, but after
     * can be correction expressions i.e. '+ 1'.
     */
    info: ArraySpecialMemberInfo;
    parent: RealVariable;

    constructor(parent: RealVariable, info: ArraySpecialMemberInfo,
                args: RealVariableArgs) {
        super(args);
        this.info = info;
        this.parent = parent;
    }

    getLengthExpr() {
        /* 
         * To be more flexible and (simultaneously) simple we have 2 forms
         * of expressions:
         * 
         * 1. Parent member expression: `lengthExpr` concatenated to `parent->`
         * 2. Generic expression: `lengthExpr` is arbitrary expression
         * 
         * Generic expression starts with `!` (because parent member expression
         * will never be member expression in that way).
         * Also, to be able to reference parent `{}` is used as a placeholder,
         * so we can reference parent (members) multple times or use function
         * invocation instead of simple member.
         */
        const parentExpr = `((${this.parent.type})${this.parent.getPointer()})`;
        const lengthExpr = this.info.lengthExpr.replace(/{}/g, parentExpr);
        if (lengthExpr.startsWith('!')) {
            return lengthExpr.substring(1);
        } else {
            return `${parentExpr}->${lengthExpr}`;
        }
    }

    async doGetRealMembers() {
        const lengthExpr = this.getLengthExpr();
        let length;
        try {
            const evalResult = await this.evaluate(lengthExpr);
            length = Number(evalResult.result);
        } catch (err) {
            if (!(err instanceof EvaluationError)) {
                throw err;
            }

            this.logger.error('failed to evaluate length expr "%s" for %s',
                              lengthExpr, this.name, err);
            return await super.doGetRealMembers();
        }

        if (!Number.isInteger(length) || length <= 0) {
            /* This covers both cases: error in 'result' and invalid length value. */
            return await super.doGetRealMembers();
        }

        /* Yes, we may have garbage, but what if the array is that huge? */
        if (ArraySpecialMember.plausibleMaxLength < length) {
            length = ArraySpecialMember.plausibleMaxLength;
        }

        const memberExpr = `((${this.parent.type})${this.parent.getPointer()})->${this.info.memberName}`;
        const debugVariables = await this.debug.getArrayVariables(memberExpr,
                                                        length, this.frameId);
        return await Variable.mapVariables(debugVariables, this.frameId, this.context,
                                            this.logger, this);
    }
}

/*
 * Bitmapset variable
 */
class BitmapSetSpecialMember extends NodeVariable {
    /*
     * List of functions that we are using for bitmapset evaluation.
     * We need to ensure, that no breakpoints set on them, otherwise
     * we encounter infinite loop
     */
    private static evaluationUsedFunctions = [
        'bms_next_member',
        'bms_first_member',
        'bms_is_valid_set'
    ]

    constructor(args: RealVariableArgs) {
        super('Bitmapset', args,);
    }

    async isValidSet(): Promise<boolean> {
        /*
         * First, validate NodeTag. BitmapSetSpecialMember could be
         * created using dumb type check, without actual NodeTag
         * checking. So we do it here
         */
        if (this.context.hasBmsNodeTag) {
            try {
                const tag = await this.evaluate(`((Bitmapset *)${this.getPointer()})->type`);
                if (tag.result !== 'T_Bitmapset') {
                    if (!utils.isValidIdentifier(tag.result)) {
                        /* Do not track NodeTag anymore and perform check again */
                        this.context.hasBmsNodeTag = false;
                        return await this.isValidSet();
                    } else {
                        /* Tags do not match */
                        return false;
                    }
                }
            } catch (err) {
                if (!(err instanceof EvaluationError)) {
                    throw err;
                }

                if (err.message.indexOf('no member') === -1) {
                    throw err;
                }

                /* CodeLLDB path */
                this.context.hasBmsNodeTag = false;
                return await this.isValidSet();
            }
        } else {
            /*
             * If we do not have NodeTag, then try to check that we can deref
             * pointer (means that pointer is valid).
             * 'nwords' member is only available option in this case.
             * If output is empty, then pointer is invalid.
             *
             * Also, pointer may give valid (at first glance) result,
             * but it contains garbage and value will be too large - we
             * check this too. 50 seems big enough to start worrying about.
             */
            const result = await this.evaluate(`((Bitmapset *)${this.getPointer()})->nwords`);
            const nwords = Number(result.result);
            if (!(Number.isInteger(nwords) && nwords < 50)) {
                return false;
            }
        }

        if (this.context.hasBmsIsValidSet) {
            const expression = `bms_is_valid_set((Bitmapset *)${this.getPointer()})`;
            try {
                const response = await this.evaluate(expression);
                return this.debug.extractBool({...response, value: response.result}) ?? false;
            } catch (err) {
                if (!(err instanceof EvaluationError)) {
                    throw err;
                }

                /*
                 * `bms_is_valid_set' introduced in 17.
                 * On other versions `type` member will be not set (undefined).
                 * We assume it is valid, because for NULL variables we do not
                 * create Variable instances.
                 */
                this.context.hasBmsIsValidSet = false;
                return true;
            }
        }

        return true;
    }

    safeToObserve() {
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
                    this.logger.info('found breakpoint at bitmapset.c - set elements not shown');
                    return false;
                }
            } else if (bp instanceof vscode.FunctionBreakpoint) {
                /*
                 * Need to check functions that are called to get set elements
                 */
                if (BitmapSetSpecialMember.evaluationUsedFunctions.indexOf(bp.functionName) !== -1) {
                    this.logger.info('found breakpoint at %s - bms elements not shown',
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
         * We MUST check validity of set, because, otherwise,
         * `Assert` will fail or SEGFAULT si thrown and whole
         * backend will crash
         */
        if (!await this.isValidSet()) {
            return;
        }

        /*
         * Most likely, we use new Bitmapset API, but fallback with old-styled
         */
        let result;
        if (this.context.hasBmsNextMember) {
            result = await this.getSetElementsNextMember();
            if (result !== undefined) {
                return result;
            }
        }

        result = await this.getSetElementsFirstMember();
        if (result !== undefined) {
            this.context.hasBmsNextMember = false;
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
            const expression = `bms_next_member((Bitmapset *)${this.getPointer()}, ${number})`;
            try {
                const response = await this.evaluate(expression);
                number = Number(response.result);
                if (Number.isNaN(number)) {
                    this.logger.warn('failed to get set elements for %s', this.name);
                    return;
                }
            } catch (err) {
                if (!(err instanceof EvaluationError)) {
                    throw err;
                }

                this.logger.error('failed to get set elements for %s', this.name, err);
                return;
            }

            if (number < 0) {
                break;
            }

            numbers.push(number);
        } while (number >= 0);

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
        const e = await this.evaluate(`bms_copy((Bitmapset *)${this.getPointer()})`);
        if (!this.debug.isValidPointerType({...e, value: e.result})) {
            /* NULL means empty */
            return [];
        }
        
        const bms = e.result;
        let number = -1;
        const numbers = [];
        do {
            const expression = `bms_first_member((Bitmapset *)${bms})`;
            const response = await this.evaluate(expression);
            number = Number(response.result);
            if (Number.isNaN(number)) {
                this.logger.warn('failed to get set elements for "%s": %s',
                                 this.name, response.result);
                return;
            }

            if (number < 0) {
                break;
            }

            numbers.push(number);
        } while (number >= 0);

        await this.pfree(bms);

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
        if (this.parent instanceof NodeVariable) {
            type = this.parent.getRealType();
        } else {
            type = this.parent.type;
        }
        if (!(   utils.getStructNameFromType(type) === ref.type
              && utils.getPointersCount(type) === 1)) {
            return;
        }

        return ref;
    }

    async doGetChildren() {
        /* All existing members */
        const members = await Variable.getVariables(this.variablesReference,
                                                    this.frameId, this.context,
                                                    this.logger, this);
        if (!members) {
            return members;
        }

        /* Add special members to explore set elements */
        const setMembers = await this.getSetElements();
        if (setMembers !== undefined) {
            const ref = await this.getBmsRef();
    
            members.push(new ScalarVariable('$length$', setMembers.length.toString(),
                                            '', this.context, this.logger, this));
            members.push(new BitmapSetSpecialMember.BmsArrayVariable(this, setMembers, ref));
        }

        return members.filter(v => v.name !== 'words');
    }

    static BmsElementVariable = class extends Variable {
        /*
         * `value` as number. needed for refs
         */
        relid: number;

        bmsParent: BitmapSetSpecialMember;

        /*
         * Which objects this Bitmapset references
         */
        ref?: constants.BitmapsetReference;

        constructor(index: number,
                    parent: Variable,
                    bmsParent: BitmapSetSpecialMember,
                    value: number,
                    context: ExecContext,
                    ref: constants.BitmapsetReference | undefined) {
            super(`[${index}]`, value.toString(), '', context, parent.frameId, parent);
            this.relid = value;
            this.bmsParent = bmsParent;
            this.ref = ref;
        }

        findStartElement(ref: constants.BitmapsetReference) {
            if (ref.start === 'Self') {
                return this.bmsParent.parent;
            } else if (this.ref!.start === 'Parent') {
                return this.bmsParent.parent?.parent;
            }

            /* Find PlannerInfo in parents */
            let parent = this.bmsParent.parent;

            while (parent) {
                if (parent.type.indexOf('PlannerInfo') !== -1 &&
                    parent instanceof NodeVariable &&
                    parent.realNodeTag === 'PlannerInfo') {
                    return parent;
                }

                /*
                 * If this is last variable, it must be 'VariablesRoot'.
                 * As last chance, find 'PlannerInfo' in declared variables,
                 * not direct parent.
                 */
                if (!parent.parent) {
                    if (parent.name === VariablesRoot.variableRootName &&
                        parent instanceof VariablesRoot) {
                        for (const v of parent.topLevelVariables) {
                            if (v instanceof NodeVariable &&
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

            const root = this.findStartElement(this.ref);
            if (!root) {
                return;
            }

            const resultFields: [Variable, number?][] = [];

            for (const path of this.ref.paths) {
                let variable: Variable = root;
                for (const p of path.path) {
                    let member;

                    /* Separation made for speed performance */
                    if (variable instanceof RealVariable) {
                        try {
                            member = await variable.getMember(p);
                        } catch (e) {
                            if (!(e instanceof EvaluationError)) {
                                throw e;
                            }

                            member = undefined;
                        }
                    } else {
                        const members = await variable.getChildren();
                        if (members)
                            member = members.find((v) => v.name === p);
                    }

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

            if (field instanceof ListNodeVariable) {
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
                    /* Empty 'List *' will be created as RealVariable */
                    return;
                }

                const expr = `((${field.type})${field.getPointer()})[${index}]`;
                const result = await this.debug.evaluate(expr, this.bmsParent.frameId);
                return await Variable.create({
                    ...result,
                    name: `ref(${field.name})`,
                    value: result.result,
                    evaluateName: expr
                }, this.bmsParent.frameId, this.context, this.bmsParent.logger, this);
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
            super('$elements$', '', '', parent.context, parent.frameId, parent);
            this.setElements = setElements;
            this.bmsParent = parent;
        }

        private createElement(index: number, value: number) {
            return new BitmapSetSpecialMember.BmsElementVariable(index, this,
                                this.bmsParent, value, this.context, this.ref);
        }

        async doGetChildren(): Promise<Variable[] | undefined> {
            return this.setElements.map((se, i) => this.createElement(i, se))
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

    static isBitmapsetType(type: string) {
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
 * Represent single 'bitmapword' as bitmask, not integer
 */
class BitmapwordVariable extends RealVariable {
    async getTreeItem(): Promise<vscode.TreeItem> {
        const value = Number(this.value);
        if (Number.isNaN(value)) {
            return await super.getTreeItem();
        }

        let bitmask = value.toString(2);

        /* 
         * Pad length to nearest power of 2, so it is easier to compare
         * multiple bitmapwords lying together.
         */
        const length = Math.pow(2, Math.ceil(Math.log2(bitmask.length)))
        bitmask = bitmask.padStart(length, '0');

        return {
            label: `${this.name}: bitmapword`,
            description: bitmask,
            collapsibleState: vscode.TreeItemCollapsibleState.None
        }
    }
}

/**
 * Represents Integer, String, Boolean, Float or BitString nodes.
 * In older systems there was single 'Value' struct for them,
 * but now separate.
 * This class contains logic for handling both cases
 */
class ValueVariable extends NodeVariable {
    isString() {
        return this.realNodeTag === 'String';
    }

    protected async checkTagMatch() {
        const structName = utils.getStructNameFromType(this.type);

        if (structName === this.realNodeTag || structName === 'Value') {
            /*
             * If tag equal to it's tag, so it's already have
             * valid type and no need to cast.
             *
             * 'Value' is not a tag, but in this case we do not
             * need to do anything too - already right type.
             */
            return;
        }

        /* Try cast struct to corresponding tag */
        if (!this.context.hasValueStruct) {
            try {
                await this.castToTag(this.realNodeTag);

                /* Success */
                return;
            } catch (err: any) {
                if (err instanceof EvaluationError) {
                    this.logger.debug('failed to cast type "%s" to tag "%s"',
                                      this.type, this.realNodeTag, err);
                }
            }
        }

        /* 
         * Older versions of PostgreSQL has single 'Value' node which
         * contains all possible fields and decision based only on tag.
         */
        try {
            await this.castToTag('Value');

            /* On success update flag indicating we have 'Value' structure */
            this.context.hasValueStruct = true;
        } catch (err) {
            if (err instanceof EvaluationError) {
                this.logger.debug('failed to cast type "%s" to tag "Value"',
                                this.type, err);
            }
        }
    }

    async doGetChildren() {
        const children = await super.doGetChildren();
        if (!(children && this.context.hasValueStruct)) {
            /* For modern structures no need to show real values */
            return children;
        }

        const val = children.find(v => v.name === 'val');
        if (!val) {
            return children;
        }

        const valMembers = await val.getChildren();
        if (!valMembers) {
            return children;
        }

        let value: string;
        switch (this.realNodeTag) {
            case 'String':
            case 'BitString':
            case 'Float':
                /* read str value */
                const str = valMembers.find(v => v.name === 'str');
                if (!str) {
                    return children;
                }
                value = str.value;
                break;
            case 'Integer':
            case 'Boolean':
                /* read int value */
                const ival = valMembers.find(v => v.name === 'ival');
                if (!ival) {
                    return children;
                }
                value = ival.value;
                break;
            case 'Null':
                /* idk if this can happen, but anyway */
                value = 'NULL';
                break;
            default:
                return children;
        }

        return [
            new ScalarVariable('$value$', value,
                '' /* no type for this */,
                this.context, this.logger, this),
            ...children.filter(v => v.name !== 'val'),
        ]
    }

    /**
     * Get string value if node is T_String.
     *
     * @returns `string` value or `null` if it was NULL
     * @throws EvaluationError if current Node is not T_String or errors
     * during evalution occured
     */
    async getStringValue() {
        if (!this.isString()) {
            throw new EvaluationError(`current ValueVariable is not String: ${this.realNodeTag}`);
        }

        const children = await this.getRealMembers();
        if (!children) {
            throw new EvaluationError('failed to get children of ValueVariable');
        }

        /* It must be known by this time */
        if (this.context.hasValueStruct) {
            const val = children.find(v => v.name === 'val');
            if (!val) {
                throw new EvaluationError('member Value->val not found');
            }

            const members = await val.getChildren();
            if (!members) {
                throw new EvaluationError('failed to get members of Value->val union');
            }

            const str = members.find(v => v.name === 'str');
            if (!str) {
                throw new EvaluationError('member Value->val.str not found');
            }

            return this.debug.extractString(str);
        } else {
            const sval = children.find(v => v.name === 'sval');
            if (!sval) {
                throw new EvaluationError('member String->sval not found');
            }

            return this.debug.extractString(sval);
        }
    }
}

/**
 * Represents Hash Table (HTAB) variable.
 */
class HTABSpecialMember extends RealVariable {
    private static evaluationUsedFunctions = [
        'hash_seq_init',
        'hash_seq_search',
        'hash_seq_term',
    ];

    async findEntryType(): Promise<string | undefined> {
        const map = this.context.hashTableTypes.htab.get(this.name);
        if (!map) {
            return;
        }

        if (!this.parent) {
            return;
        }

        let parent;
        if (this.parent instanceof VariablesRoot) {
            parent = await this.debug.getCurrentFunctionName();
            if (!parent) {
                return;
            }
        } else {
            parent = utils.getStructNameFromType(this.parent.type);
        }

        const info = map.get(parent);
        if (!info) {
            return;
        }

        return info.type;
    }

    safeToObserve(): boolean {
        for (const bp of vscode.debug.breakpoints) {
            if (!bp.enabled) {
                continue;
            }

            if (bp instanceof vscode.SourceBreakpoint) {
                if (bp.location.uri.path.endsWith('bitmapset.c')) {
                    this.logger.info('found breakpoint at bitmapset.c - set elements not shown');
                    return false;
                }
            } else if (bp instanceof vscode.FunctionBreakpoint) {
                /*
                 * Need to check functions that are called to get set elements
                 */
                if (HTABSpecialMember.evaluationUsedFunctions.indexOf(bp.functionName) !== -1) {
                    this.logger.info('found breakpoint at %s - bms elements not shown',
                                     bp.functionName);
                    return false;
                }
            }
        }

        return true;
    }

    async doGetChildren(): Promise<Variable[] | undefined> {
        const members = await super.doGetChildren();
        if (!members) {
            return members;
        }

        /* Hope, validity check is not necessary */
        if (!this.safeToObserve()) {
            return members;
        }

        const entryType = await this.findEntryType();
        if (!entryType) {
            return members;
        }

        members.push(new HTABElementsMember(this, entryType));
        return members;
    }
}

/**
 * Represents array of stored entries of Hash Table.
 * Loaded lazily when member is expanded.
 */
class HTABElementsMember extends Variable {
    /*
     * Parent HTAB
     */
    htab: HTABSpecialMember;

    /**
     * Type of entry of HTAB
     */
    entryType: string;

    constructor(htab: HTABSpecialMember, entryType: string) {
        super('$elements$', '', '', htab.context, htab.frameId, htab, htab.logger);
        this.htab = htab;
        this.entryType = entryType;
    }

    async getTreeItem() {
        return {
            label: '$elements$',
            collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
        }
    }

    private async createHashSeqStatus(): Promise<string | undefined> {
        /*
         * HASH_SEQ_STATUS *status = palloc(sizeof(HASH_SEQ_STATUS));
         * hash_seq_init(status, htab);
         */
        const memory = await this.palloc('sizeof(HASH_SEQ_STATUS)');
        const pointer = this.htab.getPointer();
        const expr = `hash_seq_init((HASH_SEQ_STATUS *)${memory}, (HTAB *)${pointer})`;

        try {
            await this.evaluateVoid(expr);
        } catch (err) {
            if (!(err instanceof EvaluationError)) {
                throw err;
            }

            if (err.message.indexOf('ambiguous') === -1) {
                throw err;
            }
        }


        /* 
         * In CodeLLDB first invocation of 'hash_seq_init' always fails
         * with error like 'reference to HASH_SEQ_STATUS is ambiguous',
         * but subsequent calls succeed.
         */
        try {
            await this.evaluateVoid(expr);
        } catch (err) {
            /* 
             * Of course we can fail for the second time, so free allocated
             * memory, but note that thrown error can be caused by 'Step'
             * command which disables commands execution.
             */
            if (err instanceof EvaluationError) {
                await this.pfree(memory);
                this.logger.error('failed to invoke hash_seq_init: %s', err.message);
            }

            throw err;
        }

        return memory;
    }

    private async finalizeHashSeqStatus(hashSeqStatus: string) {
        /*
         * hash_seq_term(status);
         * pfree(status);
         */
        try {
            await this.evaluateVoid(`hash_seq_term((HASH_SEQ_STATUS *)${hashSeqStatus})`);

        } catch (err) {
            if (!(err instanceof EvaluationError)) {
                throw err;
            }
            
            this.logger.error('Could not invoke hash_seq_term: %s', err.message);
        }

        await this.pfree(hashSeqStatus);
    }

    private async getNextHashEntry(hashSeqStatus: string): Promise<string | undefined> {
        const result = await this.evaluate(`hash_seq_search((HASH_SEQ_STATUS *)${hashSeqStatus})`);
        if (!result) {
            throw new EvaluationError('failed to get next hash table entry');
        }

        const pseudoVar = {...result, value: result.result};

        if (this.debug.isValidPointerType(pseudoVar)) {
            return result.result;
        }

        if (this.debug.isNull(pseudoVar)) {
            return undefined;
        }

        throw new EvaluationError(`Failed to get next hash table entry: ${result.result}`);
    }

    async doGetChildren(): Promise<Variable[] | undefined> {
        const variables: Variable[] = [];
        const hashSeqStatus = await this.createHashSeqStatus();
        if (!hashSeqStatus) {
            return;
        }

        let entry;
        while ((entry = await this.getNextHashEntry(hashSeqStatus))) {
            let result;
            try {
                result = await this.evaluate(`(${this.entryType})${entry}`);
            } catch (err) {
                if (!(err instanceof EvaluationError)) {
                    throw err;
                }

                /* user can specify non-existent type */
                this.logger.warn('Failed to create variable with type %s',
                                 this.entryType, err);
                await this.finalizeHashSeqStatus(hashSeqStatus);
                await this.pfree(hashSeqStatus);
                return undefined;
            }

            try {
                const variable = await Variable.create({
                    ...result,
                    name: `${variables.length}`,
                    value: result.result,
                    evaluateName: `((${this.entryType})${entry})`,
                }, this.frameId, this.context, this.logger, this);
                variables.push(variable)
            } catch (error) {
                if (error instanceof EvaluationError) {
                    await this.finalizeHashSeqStatus(hashSeqStatus);
                    await this.pfree(hashSeqStatus);
                }

                throw error;
            }
        }

        await this.pfree(hashSeqStatus);

        return variables;
    }
}

/**
 * Represents simplehash hash table, created using '#include "lib/simplehash.h"'
 */
class SimplehashMember extends RealVariable {
    /* 
     * Stores information about simple hash table: prefix for identifier names,
     * type of entry and flag, indicating if it has facility to iterate over it.
     */
    entry: SimplehashEntryInfo;

    get prefix(): string {
        return this.entry.prefix;
    }

    get elementType(): string {
        return this.entry.elementType;
    }
  
    constructor(entry: SimplehashEntryInfo, args: RealVariableArgs) {
        super(args);
        this.entry = entry;
    }
    
    async doGetChildren(): Promise<Variable[] | undefined> {
        const members = await super.doGetChildren();
        if (!members) {
            return members;
        }

        members.push(new SimplehashElementsMember(this));
        return members;
    }

    static looksLikeSimpleHashTable(type: string) {
        const index = type.indexOf('_hash');

        /* 
         * If there is no '_hash' in typename then 
         * this is definitely not simple hash table
         */
        if (index === -1) {
            return false;
        }

        /* 
         * Check this is last part of typename, i.e. not part of whole typename
         */
        if (type.length < index + '_hash'.length) {
            /*
             * I assume, every hash table object is a pointer type,
             * not allocated on stack.
             */
            return false;
        }

        /* 
         * Next character after '_hash' must be non alphanumerical,
         * so typename actually ends with '_hash'.
         * In real life only available continuation is space or star.
         */
        const nextChar = type[index + '_hash'.length];
        return nextChar === ' ' || nextChar === '*';
    }

    static getPrefix(struct: string) {
        if (!struct.endsWith('_hash')) {
            return undefined;
        }

        return struct.substring(0, struct.length - '_hash'.length);
    }
}

/**
 * Represents members of simplehash variable, stored in $elements$
 */
class SimplehashElementsMember extends Variable {
    /* 
     * Parent simple hash table
     */
    hashTable: SimplehashMember;

    constructor(hashTable: SimplehashMember) {
        super('$elements$', '', '', hashTable.context, hashTable.frameId, 
              hashTable, hashTable.logger);
        this.hashTable = hashTable;
    }

    async getTreeItem(): Promise<vscode.TreeItem> {
        /* Show only '$elements$' */
        return {
            label: '$elements$',
            collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
        }
    }

    /* 
     * Cached identifier names for function and types
     */
    hashTableType?: string = undefined;
    iteratorType?: string = undefined;
    iteratorFunction?: string = undefined;

    private getHashTableType() {
        return this.hashTableType ??= `${this.hashTable.prefix}_hash`;
    }

    private getIteratorFunction() {
        return this.iteratorFunction ??= `${this.hashTable.prefix}_iterate`;
    }

    private getIteratorType() {
        return this.iteratorType ??= `${this.hashTable.prefix}_iterator`;
    }

    /* 
     * Allocate memory for iterator struct and invoke initialization function on it.
     */
    async createIterator() {
        const iteratorType = this.getIteratorType();
        const hashTableType = this.getHashTableType();

        /* 
         * Using 'sizeof' can be first filter to define wheter it has any iteration facility.
         */
        let iteratorPtr;
        try {
            iteratorPtr = await this.palloc(`sizeof(${iteratorType})`);
        } catch (error) {
            if (error instanceof EvaluationError) {
                this.hashTable.entry.canIterate = false;
                return undefined;
            }
            throw error;
        }

        /* 'start_iterate' seems not important to cache for optimization */
        const hashTablePointer = `(${hashTableType} *) ${this.hashTable.getPointer()}`;
        const iteratorPointer = `(${iteratorType} *)${iteratorPtr}`;
        const expr = `${this.hashTable.prefix}_start_iterate(${hashTablePointer}, ${iteratorPointer})`;

        try {
            await this.evaluateVoid(expr);
        } catch (err) {
            if (!(err instanceof EvaluationError)) {
                throw err;
            }

            await this.pfree(iteratorPtr);
            this.hashTable.entry.canIterate = false;
            return undefined;
        }

        return iteratorPtr;
    }

    async iterate(iterator: string, current: number) {
        const iterFunction = this.getIteratorFunction();
        const hashTableType = `(${this.getHashTableType()} *) ${this.hashTable.getPointer()}`;
        const iteratorArg = `(${this.getIteratorType()} *) ${iterator}`;
        const elementType = this.hashTable.elementType;
        const expression = `(${elementType}) ${iterFunction}(${hashTableType}, ${iteratorArg})`;

        let result;
        try {
            result = await this.evaluate(expression);
        } catch (err) {
            if (!(err instanceof EvaluationError)) {
                throw err;
            }
            
            this.hashTable.entry.canIterate = false;
            return undefined;
        }
        
        if (this.debug.isNull({...result, value: result.result})) {
            return undefined;
        }

        try {
            return await Variable.create({
                ...result,
                name: `${current}`,
                value: result.result,
                evaluateName: `((${this.hashTable.elementType} *)${result.result})`,
            }, this.frameId, this.context, this.logger, this);
        } catch (err) {
            if (!(err instanceof EvaluationError)) {
                throw err;
            }

            await this.pfree(iterator);
            throw err;
        }
    }

    async doGetChildren(): Promise<Variable[] | undefined> {
        /* 
         * Iteration pattern:
         * 
         * SH_ITERATOR iterator;
         * SH_ELEMENT_TYPE element;
         * SH_START_ITERATE(table, &iterator);
         * 
         * while ((element = SH_ITERATE(table, &iterator)) != NULL)
         * {
         *     // Processing
         * }
         * 
         * 
         * NOTE: in contrast to HTAB there is no need to call to terminate
         *       iteration before end of iteration.
         */

        const iterator = await this.createIterator();
        if (!iterator) {
            return;
        }

        const variables = [];
        let id = 0;
        let variable;
        while ((variable = await this.iterate(iterator, id))) {
            ++id;
            variables.push(variable);
        }

        await this.pfree(iterator);
        return variables;
    }
}

/**
 * Get expression to fill in 'Watch' window in Debug view container.
 *
 * @param variable Instance of variable user clicked on
 */
export function getWatchExpressionCommandHandler(variable: any) {
    return variable instanceof Variable
        ? variable.getWatchExpression()
        : null;
}
