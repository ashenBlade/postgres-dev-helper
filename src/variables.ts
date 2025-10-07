import * as vscode from 'vscode';
import * as dap from "./dap";
import * as constants from './constants';
import * as dbg from './debugger';
import { EvaluationError, DebuggerNotAvailableError } from './debugger';
import { Log as logger } from './logger';
import { PghhError, 
         unnullify } from './error';
import { Configuration,
         getWorkspaceFolder,
         getWorkspacePgSrcFile, VsCodeSettings } from './configuration';

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
    nodeTags = new Set<string>(constants.getDefaultNodeTags());

    /**
     * Known NodeTags that represents Expr nodes.
     * Required for Exprs representation in tree view as expressions
     */
    exprs = new Set<string>(constants.getDisplayedExprs());

    /**
     * Known aliases for Node variables - `typedef RealType* Alias'
     */
    aliases = new Map<string, string>(constants.getDefaultAliases());

    /*
     * Known references of Bitmapset.
     * Map: field_name -> BitmapsetReference
     */
    bmsRefs = new Map<string, constants.BitmapsetReference>(constants.getWellKnownBitmapsetReferences());

    addAliases(aliases: AliasInfo[]) {
        aliases.forEach(a => {
            this.aliases.set(a.alias.trim(), a.type.trim());
        });
    }

    /**
     * Check that provided type is derived from Node.
     * That is, we can obtain NodeTag from it.
     */
    isNodeVar(effectiveType: string) {
        /* 
         * Node variables are pointer types, so it must have
         * at least 1 pointer, but 1+ pointers is an array,
         * which can not be Node variables.
         */
        return   dbg.havePointersCount(effectiveType, 1) 
              && this.nodeTags.has(dbg.getStructNameFromType(effectiveType));
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

export interface ArrayVariableInfo {
    /* Parent type containing pointer to array */
    typeName: string;
    /* Name of member which stores array */
    memberName: string;
    /* Expression to get length of array */
    lengthExpression: string;
}

export interface ListPtrSpecialMemberInfo {
    /*
     * Real type of List members (must be pointer or alias)
     */
    type: string;

    /*
     * Name of 'List *' member or variable.
     *
     */
    member: string;
    
    /* 
     * Entity containing this List. Can be function name or struct name.
     */
    parent: string;
}

/* 
 * One enum macro flag information.
 */
export interface FlagMemberInfo {
    /* Macro/flag name */
    flag: string;
    /* Numeric value of this enum */
    numeric?: string;
}

/* Name of a field inside integer variable */
export interface FieldMemberInfo {
    /* User-friendly name of this field */
    name: string;
    /* Macro name acting as mask */
    mask: string;
    /* Numeric value of this mask */
    numeric?: string;
}

/* Information of integer variable/member acting as enum/bitmask value */
export interface BitmaskMemberInfo {
    /* Parent type which this member belongs to */
    type: string;
    /* Name of parent member */
    member: string;
    /* All flags for this member */
    flags?: FlagMemberInfo[];
    /* All fields stored in this member */
    fields?: FieldMemberInfo[];
}

export class SpecialMemberRegistry {
    /**
     * Double map: Type name -> (Member Name -> Info Object).
     */
    arrays = new Map<string, Map<string, ArrayVariableInfo>>();

    /**
     * Double map: Member/variable name -> (Struct/Function name -> Info object).
     *
     * Outer key is name of member or variable.
     * Inner key is name of structure or function (containing this member/variable
     * respectively).
     */
    listCustomPtrs = new Map<string, Map<string, ListPtrSpecialMemberInfo>>();
    
    /* 
     * Various bitmask integer members used in source code.
     * They act like values of [bitmask] enums or store another
     * fields inside (apply bitmask to part of bits).
     */
    bitmasks = new Map<string, Map<string, BitmaskMemberInfo>>();

    addArrays(elements: ArrayVariableInfo[]) {
        for (const element of elements) {
            const typeMap = this.arrays.get(element.typeName);
            if (typeMap === undefined) {
                this.arrays.set(element.typeName, new Map([
                    [element.memberName, element],
                ]));
            } else {
                typeMap.set(element.memberName, element);
            }
        }
    }

    addListCustomPtrSpecialMembers(elements: ListPtrSpecialMemberInfo[]) {
        for (const e of elements) {
            const map = this.listCustomPtrs.get(e.member);
            if (map === undefined) {
                this.listCustomPtrs.set(e.member, new Map([[e.parent, e]]));
            } else {
                map.set(e.parent, e);
            }
        }
    }
    
    addFlagsMembers(members: BitmaskMemberInfo[]) {
        for (const member of members) {
            let memberMap = this.bitmasks.get(member.type);
            if (memberMap === undefined) {
                memberMap = new Map();
                this.bitmasks.set(member.type, memberMap);
            }
            
            memberMap.set(member.member, member);
        }
    }

    getArray(parentType: string, memberName: string) {
        const parentTypeName = dbg.getStructNameFromType(parentType);
        const membersMap = this.arrays.get(parentTypeName);
        if (membersMap === undefined) {
            return;
        }

        const info = membersMap.get(memberName);
        if (info === undefined) {
            return;
        }

        return info;
    }

    getFlagsMember(type: string, member: string) {
        const typeMap = this.bitmasks.get(type);
        if (!typeMap) {
            return;
        }
        
        return typeMap.get(member);
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
    type: string;
}

export class HashTableTypes {
    /**
     * Map (member name -> (parent struct name -> type info structure))
     */
    htab = new Map<string, Map<string, HtabEntryInfo>>();

    /**
     * Map (prefix -> entry type).
     */
    simplehash = new Map<string, SimplehashEntryInfo>();

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
        const struct = dbg.getStructNameFromType(type);
        const prefix = SimplehashMember.getPrefix(struct);
        if (!prefix) {
            return undefined;
        }

        return this.simplehash.get(prefix);
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
    exists = false;

    /**
     * Special promise to be resolved when rtable is set.
     * Used as simple lock to prevent multiple rtable evaluations.
     * I.e. when 'ec_members' is opened with lots of members in it.
     */
    waiter?: Promise<void>;

    /**
     * Found 'rtable' among variables. Before updating/using
     * this field check `rtableSearched` if this member has
     * actual value.
     */
    rtable: NodeVariable[] | undefined;
}

/**
 * Container for properties hold only during debugger is stopped on breakpoint.
 * They may change on next step, so invalidated when code execution continues.
 */
export class StepContext {
    /**
     * Whether it is safe for now to allocate memory.
     */
    isSafeToAllocateMemory?: boolean;

    /**
     * List variable containing RTable
     */
    rtable: RangeTableContainer = new RangeTableContainer();

    /**
     * Name of function which frame we are currently observing.
     */
    currentFunctionName?: string;
    
    /*
     * Is it safe to get elements of Bitmapset.
     */
    isSafeToObserveBitmapset?: boolean;
    
    /* 
     * Is it safe to get elements of HTAB.
     */
    isSafeToObserveHTAB?: boolean;
    
    /*
     * Is it safe to invoke function, that use sys/catcache?
     */
    isSafeToUseSysCache?: boolean;

    reset() {
        this.isSafeToAllocateMemory = undefined;
        this.rtable.rtable = undefined;
        this.rtable.waiter = undefined;
        this.rtable.exists = false;
        this.currentFunctionName = undefined;
        this.isSafeToObserveBitmapset = undefined;
        this.isSafeToObserveHTAB = undefined;
        this.isSafeToUseSysCache = undefined;
    }
}

interface ExecContextData {
    hashTables: HashTableTypes;
    nodeVars: NodeVarRegistry;
    specialMembers: SpecialMemberRegistry;
};

/**
 * Which executable we are debugging
 */
enum ExecutableType {
    /* Main 'postgres' executable */
    Server,
    /* Frontend utils: pg_ctl, pg_waldump, initdb, etc... */
    Frontend,
};

/**
 * Context of current execution.
 */
export class ExecContext {
    /* 
     * Version number of debugging PG instance
     */
    pgversion?: number;

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
     * Cached properties for current step.
     */
    step = new StepContext();

    /**
     * Facade for debugger interface (TAP)
     */
    debug: dbg.IDebuggerFacade;

    /* Properties for current debug session */
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
     * `getTypeOutputInfo` function accepts 3 arguments instead of 4 (old-style).
     * 
     * This is used when CodeLLDB is used as debugger, because CppDbg do not
     * check passed amount of arguments.
     */
    hasGetTypeOutputInfo3Args = true;

    /**
     * 'bool' type represented as 'char'
     * 
     * Until PostgreSQL 10 'bool' was typedef to 'char' and now it uses
     * stdbool.h header.
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
    
    /**
     * Which executable we are debugging: 'postgres' or frontend utility
     */
    executableType: ExecutableType;
    
    get isFrontend() {
        return this.executableType === ExecutableType.Frontend;
    }
    
    get isServer() {
        return this.executableType === ExecutableType.Server;
    }
    
    /**
     * Current debugger can understand macros and use their actual values.
     * 
     * In example, to show enum values defined by macros in `t_infomask`
     */
    canUseMacros = true;

    constructor(debug: dbg.IDebuggerFacade, data: ExecContextData,
                pgversion: number | undefined, executableType: ExecutableType) {
        this.debug = debug;
        this.nodeVarRegistry = data.nodeVars;
        this.specialMemberRegistry = data.specialMembers;
        this.hashTableTypes = data.hashTables;
        this.pgversion = pgversion;
        this.executableType = executableType;
    }

    async getCurrentFunctionName() {
        if (this.step.currentFunctionName !== undefined) {
            return this.step.currentFunctionName;
        }

        const name = await this.debug.getCurrentFunctionName();
        this.step.currentFunctionName = name;
        return name;
    }

    /* 
     * Set property values according to knowledge of debugging
     * PostgreSQL server version
     */
    adjustProperties(version: number) {
        if (version < 15_00_00) {
            this.hasValueStruct = true;
        }
        
        if (version <  8_04_00) {
            this.hasPalloc = false;
        }
        
        if (version <  9_05_00) {
            this.hasAllowInCritSection = false;
        }
        
        if (version < 17_00_00) {
            this.hasBmsIsValidSet = false;
        }
        
        if (version <  9_03_00) {
            this.hasBmsNextMember = false;
        }
        
        if (version < 16_00_00) {
            this.hasBmsNodeTag = false;
        }
        
        if (version <  8_01_00) {
            this.hasGetTypeOutputInfo3Args = false;
        }
        
        if (version < 11_00_00) {
            this.hasGetAttname3 = false;
        }

        if (version <  8_01_00) {
            this.hasOidOutputFunctionCall = false;
        }
    }
}

function clampContainerLength(size: number) {
    const max = VsCodeSettings.getMaxContainerLength();
    return max < size ? max : size;
}

function getMaxContainerLength() {
    return VsCodeSettings.getMaxContainerLength();
}

/**
 * Special value for frameId used by ephemeral variables:
 * they do not need to evaluate anything.
 *
 * Examples: VariablesRoot, ScalarVariable, etc...
 */
const invalidFrameId = -1;

/**
 * Check that caught exception can be safely ignored and not shown to user.
 *
 * NOTE: return type annotation is 'error is EvaluationError' so it
 *       automatically will be casted to Error if we want further processing.
 */
function isEvaluationError(error: unknown): error is EvaluationError {
    /* 
     * When we are evaluating expressions or perform other DAP requests,
     * we may encounter different errors. We can identify 2 types of errors:
     * 
     * 1. Error in expression (source code related)
     * 2. Debugger error
     * 
     * For 1 we have 'EvaluationError' which is caught and some custom
     * handler is invoked. This is normal situation, because of major
     * version interface mismatch or some types represented differently.
     * 
     * But 2 type we can not handle, because error caused by external reasons.
     * The most illustrative example is that user clicks F10 (step) too
     * fast, so we do not have time to update the variables view and therefore,
     * in DAP request outdated identifiers are passed.
     * 
     * For the latter we allow the Error to propagate to the top-most caller
     * function which will then just log the error and return some placeholder.
     */
    return !!error && error instanceof EvaluationError;
}

/* Custom description formatter functions */

/* 
 * Check that given XLogRecPtr variable can be formatted
 * using 'pg_lsn_out' function.
 */
function shouldFormatXLogRecPtr(v: dap.DebugVariable, context: ExecContext) {
    /* 
     * In old pg versions XLogRecPtr stored as structure, so
     * there is no need to invoke 'pg_lsn_out'.
     * Also, current executable must be a server, because to invoke target
     * function DirectFunctionCall is used ('pg_lsn_out' is an sql function).
     */
    return Number.isInteger(Number(v.value)) && context.isServer;
}

/** 
 * Format XLogRecPtr in File/Offset form using 'pg_lsn_out' function.
 *
 * Before using this perform check using {@link shouldFormatXLogRecPtr}
 */
async function formatXLogRecPtr(v: Variable) {
    await v.checkCanAlloc();

    const debug = v.debug;
    const result = await v.directFunctionCall('pg_lsn_out', 'char *', v.value);
    const ptr = debug.extractPtrFromString(result);
    if (!ptr) {
        return;
    }

    await v.pfree(ptr);
    const format = debug.extractString(result);
    if (!format) {
        return;
    }

    return format;
}

/*
 * Format bitmask types, i.e. bitmapword or bits8
 */
async function formatBitmask(v: Variable) {
    const value = Number(v.value);
    if (Number.isNaN(value)) {
        return;
    }

    let bitmask = value.toString(2);

    /* 
     * Pad length to nearest power of 2, so it is easier to compare
     * multiple bitmapwords lying together.
     */
    const length = Math.pow(2, Math.ceil(Math.log2(bitmask.length)));
    bitmask = bitmask.padStart(length, '0');
    return bitmask;
}

async function getNullableAliasValue(v: Variable) {
    if (v.debug.isNull(v) || !(v instanceof RealVariable)) {
        /* Alias can be NULL and this is ok */
        return null;
    }

    return await v.getMemberValueCharString('aliasname');
}

async function rangeTblEntryDescriptionFormatter(v: Variable) {
    const nv = v as NodeVariable;
    let alias;
    
    try {
        alias = await getNullableAliasValue(await nv.getMember('alias'));
    } catch (err) {
        if (!isEvaluationError(err)) {
            throw err;
        }
        
        /* 'alias' is non-NULL only if alias is specified by user */
    }

    if (alias) {
        return alias;
    }
    
    /* Make another attempt, but now read 'eref' which must exist */
    try {
        /* Return 'undefined' instead of 'null' to fit function signature */
        return await getNullableAliasValue(await nv.getMember('eref')) ?? undefined;
    } catch (err) {
        if (isEvaluationError(err)) {
            logger.error(err, 'could not get string value of "eref" and "alias"');
        } else {
            throw err;
        }
    }
}

async function formatDefElem(v: Variable) {
    const nv = v as NodeVariable;
    const value = await getDefElemArgString(nv);
    if (!value) {
        return;
    }

    const defnamespace = await nv.getMemberValueCharString('defnamespace');
    const defname = await nv.getMemberValueCharString('defname');
    if (defnamespace) {
        return `${defnamespace}.${defname} = ${value}`;
    } else {
        return `${defname} = ${value}`;
    }
}

async function formatTypeNameRepr(v: Variable) {
    /* src/backend/parser/parse_type.c:appendTypeNameToBuffer */
    const nv = v as NodeVariable;
    const elements = await nv.getListMemberElements('names');
    if (!elements) {
        /* List can be empty - do not check 'length' */
        return;
    }

    let name;
    if (elements.length) {
        const names = [];
        for (const e of elements) {
            if (e instanceof ValueVariable) {
                names.push(await e.getStringRepr());
            }
        }

        name = names.length? names.join('.') : undefined;
    }

    /* 
     * Actual implementation also handle case, when there are no
     * elements in 'names' List. If so, we must go to syscache
     * and search type using 'typeOid' member, but SysCache but
     * used function ('format_type_be') will throw ERROR, if no
     * type found in system catalog, which is real, because we
     * could be observing DefElem during it's construction, or
     * there is a garbage
     */
    name ??= '$TYPENAME$';
    
    if (await nv.getMemberValueBool('pct_type')) {
        name += '%TYPE';
    }
    
    if (!nv.debug.isNull(await nv.getMember('arrayBounds'))) {
        name += '[]';
    }
    
    return name;
}

async function formatRangeVarRepr(v: Variable) {
    const nv = v as RealVariable;
    const catalog = await nv.getMemberValueCharString('catalogname');
    const schema = await nv.getMemberValueCharString('schemaname');
    const rel = await nv.getMemberValueCharString('relname');
    const names = [];
    if (catalog) {
        names.push(catalog);
    }
    if (schema) {
        names.push(schema);
    }
    if (rel) {
        names.push(rel);
    }
    
    const name = names.join('.');
    const alias = await getNullableAliasValue(await nv.getMember('alias'));
    
    if (alias) {
        return `${name} AS ${alias}`;
    } else {
        return name;
    }
}

async function formatRelFileLocator(v: Variable) {
    const rv = v as RealVariable;
    const spcOid = await rv.getMemberValueNumber('spcOid');
    const dbOid = await rv.getMemberValueNumber('dbOid');
    const relNumber = await rv.getMemberValueNumber('relNumber');
    return `${spcOid}/${dbOid}/${relNumber}`;
}

async function formatRelFileLocatorBackend(v: Variable) {
    const rv = v as RealVariable;
    const locator = await rv.getMember('locator');
    if (!(locator.type === 'RelFileLocator' && locator instanceof RealVariable)) {
        return;
    }
    
    const locatorRepr = await locator.getDescription();
    const backend = await rv.getMemberValueNumber('backend');
    return `${locatorRepr} [${backend}]`;
}

async function formatNameData(v: Variable) {
    const rv = v as RealVariable;
    /* 
     * NameData always stores as embedded value struct, so it is not a pointer.
     * The actual data stored as 'char[64]', so it is also not a pointer.
     * Thus, we can not just take pointer of 'data' array or NameData itself
     * and the only thing left is to take 'NameData.data' watch expression
     * which must return correct value and cast it.
     */
    const data = await rv.getMember('data');
    if (!(data instanceof RealVariable)) {
        return;
    }

    const expression = await data.formatWatchExpression();
    const result = await rv.debug.evaluate(`(char *)${expression}`, rv.frameId);
    return rv.debug.extractString(result);
}

async function formatStringMemberGeneric(v: Variable, member: string) {
    const rv = v as RealVariable;
    return await rv.getMemberValueCharString(member);
}

async function formatExprMember(v: Variable, member: string) {
    const rv = v as RealVariable;
    const m = await rv.getMember(member);
    if (m instanceof ExprNodeVariable) {
        return await m.getRepr();
    }
}

function getFormatterForNodeVariable(nodetag: string) {
    let member;
    switch (nodetag) {
        case 'TargetEntry':
            member = 'expr';
            break;
        case 'EquivalenceMember':
            member = 'em_expr';
            break;
        case 'RestrictInfo':
            member = 'clause';
            break;
    }

    if (member) {
        /* XXX: we can define 3 specialized functions for each case */
        return async (v: Variable) => await formatExprMember(v, member);
    }

    if (nodetag === 'RangeTblEntry') {
        return rangeTblEntryDescriptionFormatter;
    }
    
    if (nodetag === 'DefElem') {
        return formatDefElem;
    }
    
    if (nodetag === 'TypeName') {
        return formatTypeNameRepr;
    }
    
    if (nodetag === 'RangeVar') {
        return formatRangeVarRepr;
    }
    
    if (nodetag === 'Alias') {
        return async (v: Variable) => await formatStringMemberGeneric(v, 'aliasname');
    }
    
    if (nodetag === 'ColumnDef') {
        return async (v: Variable) => await formatStringMemberGeneric(v, 'colname');
    }
    
    if (nodetag === 'CommonTableExpr') {
        return async (v: Variable) => await formatStringMemberGeneric(v, 'ctename');
    }
}

function getFormatterForValueStruct(effectiveType: string, debugVariable: dap.DebugVariable,
                                    context: ExecContext) {
    if (effectiveType === 'bitmapword' || effectiveType === 'bits8') {
        /* Show bitmapword as bitmask, not integer */
        return formatBitmask;
    } else if (   effectiveType === 'XLogRecPtr'
               && shouldFormatXLogRecPtr(debugVariable, context)) {
        return formatXLogRecPtr;
    } else if (effectiveType === 'RelFileLocator') {
        return formatRelFileLocator;
    } else if (effectiveType === 'RelFileLocatorBackend') {
        return formatRelFileLocatorBackend;
    } else if (effectiveType === 'NameData') {
        return formatNameData;
    }
}

function getFormatterForPointerType(effectiveType: string) {
    if (effectiveType === 'bitmapword *' || effectiveType === 'bits8 *') {
        return formatBitmask;
    } else if (effectiveType === 'RelFileLocator *') {
        return formatRelFileLocator;
    } else if (effectiveType === 'RelFileLocatorBackend *') {
        return formatRelFileLocatorBackend;
    } else if (effectiveType === 'NameData *') {
        return formatNameData;
    }
    
    /*
     * These types require only reading members, but others 
     * use special handling, i.e. XLogRecPtr calls 'pg_lsn_out'
     * which requires getting actual scalar value.
     */
}

function isValidMemoryContextTag(tag: string) {
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
    }

    /* This is T_Invalid or something else */
    return false;
};

/* 
 * Format 'name' member for elements stored inside array.
 */
function getNameForArrayElement(index: number) {
    /* Default VS Code behavior to show array elements */
    return `[${index}]`;
}

/**
 * Reverse function for {@link getNameForArrayElement} which returns
 * stored index from 'name' of array element.
 */
function getIndexFromArrayElementName(name: string) {
    /* This function must be called only on array elements, so no checks */
    const index = Number(name.substring(1, name.length - 1));
    if (Number.isInteger(index)) {
        return index;
    }
}

function variablePropertyIsExpandable(props: dbg.IVariableProperties) {
    /* Expand pointer only if it is valid */
    if (props.isPointer()) {
        return !(props.pointerIsNull() || props.pointerIsInvalid());
    }
    
    /* Integer or other types do not have children */
    if (props.isScalar()) {
        return false;
    }
    
    if (props.isFlexibleArray()) {
        /* Flexible array is expandable only if it is a ArrayVariable */
        return false;
    }

    /* Other types should be fine */
    return true;
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
     * Type that was originally declared and should be shown
     * in variables view.
     */
    declaredType: string;

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

    /**
     * Execution context for current debug session.
     */
    context: ExecContext;

    /**
     * Number of frame, this variable belongs to.
     * All debugger operations with this variable must use this id.
     */
    frameId: number;

    /**
     * Shortcut for `this.context.debug`
     */
    get debug() {
        return this.context.debug;
    }

    constructor(name: string, value: string,
                type: string, declaredType: string,
                context: ExecContext, frameId: number,
                parent: Variable | undefined) {
        this.parent = parent;
        this.name = name;
        this.value = value;
        this.type = type;
        this.declaredType = declaredType;
        this.context = context;
        this.frameId = frameId;
    }

    
    /*
     * Cached variables.
     * If undefined - `getChildren` was not called;
     * If length == 0 - no children (scalar variable)
     */
    childrenCache: Variable[] | undefined;
    
    abstract doGetChildren(): Promise<Variable[] | undefined>;

    /**
     * Get children of this variable
     *
     * @returns Array of child variables or undefined if no children
     */
    async getChildren(): Promise<Variable[] | undefined> {
        try {
            if (this.childrenCache !== undefined) {
                /*
                 * return `undefined` if no children - scalar variable
                 */
                return this.childrenCache.length
                    ? this.childrenCache
                    : undefined;
            }

            const children = await this.doGetChildren();
            if (children) {
                this.childrenCache = children;
            } else {
                this.childrenCache = [];
            }

            return children;
        } catch (error: unknown) {
            if (!isEvaluationError(error)) {
                throw error;
            }

            logger.error(error, 'could not get children for', this.name);
            return;
        }
    }

    protected isExpandable() {
        if (!this.type?.length) {
            /* Special members */
            return false;
        }
        
        const props = this.debug.extractVariableProperties(this);
        return variablePropertyIsExpandable(props);
    }

    protected async getDescription() {
        return this.value;
    }
    
    protected getLabel() {
        return !this.declaredType?.length
            ? this.name
            : `${this.name}: ${this.declaredType}`;
    }

    /**
     * Create {@link vscode.TreeItem TreeItem} for variables view
     */
    async getTreeItem(): Promise<vscode.TreeItem> {
        try {
            return {
                label: this.getLabel(),
                description: await this.getDescription(),
                collapsibleState: this.isExpandable()
                    ? vscode.TreeItemCollapsibleState.Collapsed
                    : vscode.TreeItemCollapsibleState.None,
            };
        } catch (error: unknown) {
            if (isEvaluationError(error)) {
                logger.error(error, 'failed get TreeItem for', this.name);

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
    private static getRealType(type: string, context: ExecContext) {
        const structName = dbg.getStructNameFromType(type);
        const alias = context.nodeVarRegistry.aliases.get(structName);
        if (!alias) {
            return type;
        }

        const resultType = dbg.substituteStructName(type, alias);
        return resultType;
    }

    protected async getArrayMembers(expression: string, length: number) {
        const variables = await this.debug.getArrayVariables(expression,
                                                             length, this.frameId);
        return await Variable.mapVariables(variables, this.frameId, this.context, this);
    }

    static async create(debugVariable: dap.DebugVariable, frameId: number,
                        context: ExecContext, parent?: Variable): Promise<Variable> {
        const effectiveType = Variable.getRealType(debugVariable.type, context);
        const args: RealVariableArgs = {
            ...debugVariable,
            frameId,
            parent,
            context,
            type: effectiveType,
            declaredType: debugVariable.type,
        };

        const typeProps = context.debug.extractVariableProperties(debugVariable);

        /* Value struct or scalar types are not so interesting for us */
        if (!typeProps.isPointer()) {
            if (typeProps.isFixedSizeArray()) {
                return new RealVariable(args);
            }
    
            if (typeProps.isFlexibleArray()) {
                if (parent) {
                    /* FLA can be expanded as array */
                    const specialMember = context.specialMemberRegistry
                        .getArray(parent.type, debugVariable.name);
                    if (specialMember) {
                        return new ArrayVariable(specialMember, args);
                    }
                }
    
                return new RealVariable(args);
            }
            
            if (parent && parent instanceof RealVariable) {
                const flagsMember = context.specialMemberRegistry.getFlagsMember(
                    dbg.getStructNameFromType(parent.type),
                    debugVariable.name);
                if (flagsMember) {
                    return new FlagsMemberVariable(flagsMember, args);
                }
            }

            args.formatter = getFormatterForValueStruct(effectiveType, debugVariable, context);

            return new RealVariable(args);
        }

        if (typeProps.pointerIsNull()) {
            if (effectiveType.endsWith('List *')) {
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
                 * 
                 * XXX: this check will fail with trailing qualifiers, but
                 *      I haven't seen someone uses them, so ok
                 */
                return new ListNodeVariable('List', args);
            }
            
            return new InvalidVariable(args);
        }

        /*
         * Pointer types can be NULL or contain invalid pointers.
         * cppdbg do not recognize invalid pointers, but CodeLLDB - <invalid pointer>.
         * 
         * For such variables use special InvalidVariable, which do not
         * act like RealVariable, so it prevent some potential errors.
         */
        if (typeProps.pointerIsInvalid()) {
            return new InvalidVariable(args);
        }

        /* Now we are working with normal pointer type */

        /* 
         * Array special member should be processed before all, because
         * it acts like decorator.
         * 
         * It should never be one of others (Node, HTAB, etc...), but elements
         * of array can be.
         */
        if (parent) {
            const specialMember = context.specialMemberRegistry
                .getArray(parent.type, debugVariable.name);
            if (specialMember) {
                return new ArrayVariable(specialMember, args);
            }
        }

        /*
         * PostgreSQL versions prior 16 do not have Bitmapset Node.
         * So handle Bitmapset (with Relids) here.
         * 
         * NOTE: this check must be before general 'isNodeVar', because
         *       NULL is valid value otherwise this will break assumption
         *       that passed 'debugVariable' is not NULL
         */
        if (BitmapSetSpecialMember.isBitmapsetType(effectiveType)) {
            return new BitmapSetSpecialMember(args);
        }

        /* NodeTag variables: Node, List, Bitmapset etc.. */
        const nodeVar = await NodeVariable.tryCreateNode(debugVariable, frameId,
                                                         context, args);
        if (nodeVar) {
            return nodeVar;
        }

        /* 'HTAB *' */
        if (dbg.havePointersCount(effectiveType, 1) &&
            dbg.getStructNameFromType(effectiveType) === 'HTAB') {
            return new HTABSpecialMember(args);
        }

        /* Simple hash table (lib/simplehash.h) */
        if (SimplehashMember.looksLikeSimpleHashTable(effectiveType)) {
            const entry = context.hashTableTypes.findSimpleHashTableType(effectiveType);
            if (entry) {
                return new SimplehashMember(entry, args);
            }
        }
        
        args.formatter = getFormatterForPointerType(effectiveType);

        /* At the end - it is simple variable */
        return new RealVariable(args);
    }

    static async getVariables(variablesReference: number, frameId: number,
                              context: ExecContext, parent?: RealVariable): Promise<Variable[]> {
        const debugVariables = await context.debug.getMembers(variablesReference);
        const variables: Variable[] = [];
        for (const dv of debugVariables) {
            const v = await Variable.create(dv, frameId, context, parent);
            if (v) {
                variables.push(v);
            }
        }
        return variables;
    }

    static async mapVariables(debugVariables: dap.DebugVariable[],
                              frameId: number,
                              context: ExecContext,
                              parent?: Variable) {
        const variables: Variable[] = [];
        for (const dv of debugVariables) {
            const v = await Variable.create(dv, frameId, context, parent);
            if (v) {
                variables.push(v);
            }
        }
        return variables;
    }

    /**
     * Format expression to be inserted in 'Watch' view to evaluate.
     *
     * @returns Expression to be evaluated in 'Watch' view
     */
    async getUserWatchExpression(): Promise<string | null> {
        return null;
    }
    
    async checkCanAlloc() {
        /*
         * Memory allocation is a very sensitive operation.
         */
        if (!await this.isSafeToAllocateMemory()) {
            /* TODO: CritSectionError or something like that */
            throw new EvaluationError('It is not safe to allocate memory now');
        }
    }

    /**
     * call `palloc` with specified size (can be expression).
     * before, it performs some checks and can throw EvaluationError
     * if they fail.
     */
    async palloc(size: string) {
        await this.checkCanAlloc();

        /* TODO: use MemoryContextAllocExtended with NULL returning */
        if (this.context.hasPalloc) {
            try {
                return (await this.evaluate(`palloc(${size})`)).result;
            } catch (err) {
                /*
                 * I will not allocate huge amounts of memory - only small *state* structures,
                 * and expect, that there is always enough memory to allocate it.
                 *
                 * So, only invalid situation - this is old version of PostgreSQL,
                 * so `palloc` implemented as macro and we need to invoke `MemoryContextAlloc`
                 * directly.
                 */
                if (!isEvaluationError(err)) {
                    throw err;
                }

                logger.error(err, 'could not invoke "palloc", switching to MemoryContextAlloc');
                this.context.hasPalloc = false;
            }
        }

        const result = await this.evaluate(`MemoryContextAlloc(CurrentMemoryContext, ${size})`);
        return result.result;
    }
    
    async directFunctionCall(func: string, out: string, arg0: string, ...args: string[]) {
        await this.checkCanAlloc();
        const argsCount = 1 + args.length;
        const trailing = args.map(x => `, (Datum)${x}`).join('');
        const expr = `(${out})DirectFunctionCall${argsCount}Coll(&${func}, (Oid)${InvalidOid}, (Datum) ${arg0} ${trailing})`;
        return await this.evaluate(expr);
    }

    async functionCall(funcOid: string | number, out: string, arg0: string, ...args: string[]) {
        await this.checkCanAlloc();
        const argsCount = 1 + args.length;
        const trailing = args.map(x => `, (Datum)${x}`).join('');

        /* Init FmgrInfo */
        const fmgrInfo = await this.palloc('sizeof(FmgrInfo)');
        await this.evaluateVoid(`fmgr_info(${funcOid}, (void *)${fmgrInfo})`);

        /* Invoke function itself */
        const result = await this.evaluate(
            `(${out})FunctionCall${argsCount}(((void *)${fmgrInfo}), (Datum)${arg0} ${trailing})`,
        );

        await this.pfree(fmgrInfo);
        return result;
    }
    
    private haveSysCatCacheBreakpoint() {
        return !!vscode.debug.breakpoints.find(b => {
            if (!b.enabled) {
                return false;
            }
            if (b instanceof vscode.FunctionBreakpoint) {
                return     b.functionName.indexOf('SysCache') !== -1
                        || b.functionName.indexOf('CatCache') !== -1;
            }
            if (b instanceof vscode.SourceBreakpoint) {
                return     b.location.uri.fsPath.endsWith('catcache.c') 
                        /* this also will cover 'lsyscache.c' */
                        || b.location.uri.fsPath.endsWith('syscache.c');
            }
        });
    }
    
    private isSafeToUseSysCache() {
        return this.context.step.isSafeToUseSysCache 
            ??= !this.haveSysCatCacheBreakpoint();
    }

    /* 
     * Call evaluate with safety checks for sys/cat cache usage.
     */
    async evaluateSysCache(expr: string) {
        if (!this.isSafeToUseSysCache()) {
            throw new EvaluationError('Not safe to use SysCache');
        }

        return await this.evaluate(expr);
    }

    private async isSafeToAllocateMemory() {
        if (this.context.step.isSafeToAllocateMemory !== undefined) {
            return this.context.step.isSafeToAllocateMemory;
        }
        
        if (this.context.isFrontend) {
            /* Frontend does not have CurrentMemoryContext */
            return this.context.step.isSafeToAllocateMemory = true;;
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
                if (!isEvaluationError(err)) {
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


        const isSafe = isValidMemoryContextTag(result.result);
        this.context.step.isSafeToAllocateMemory = isSafe;
        return isSafe;
    }

    /**
     * call `pfree` with specified pointer
     */
    async pfree(pointer: string) {
        /* Should not happen, but add this check */
        if (!dbg.pointerIsNull(pointer)) {
            await this.evaluateVoid(`pfree((void *)${pointer})`);
        }
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
    static variableRootName = '$variables root$';

    constructor(public topLevelVariables: Variable[],
                context: ExecContext) {
        super(VariablesRoot.variableRootName, '', '', '', context, invalidFrameId,
              undefined);
    }

    async doGetChildren(): Promise<Variable[] | undefined> {
        return undefined;
    }
}

class ScalarVariable extends Variable {
    tooltip?: string;
    constructor(name: string, value: string, type: string, context: ExecContext,
                parent?: Variable, tooltip?: string) {
        super(name, value, type, type, context, invalidFrameId, parent);
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

class InvalidVariable extends Variable {
    constructor(args: RealVariableArgs) {
        super(args.name, args.value, args.type, args.declaredType,
              args.context, args.frameId, args.parent);
    }
    
    protected isExpandable(): boolean {
        return false;
    }
    
    async doGetChildren(): Promise<Variable[] | undefined> {
        return [];
    }
}

type DescriptionFormatter = (variable: Variable) => Promise<string | null | undefined>;

/* Utility structure used to reduce the number of function arguments */
interface RealVariableArgs {
    memoryReference?: string;
    name: string;
    type: string;
    declaredType: string;
    value: string;
    variablesReference: number;
    frameId: number;
    parent?: Variable;
    context: ExecContext;
    typeProperties?: dbg.IVariableProperties;
    formatter?: DescriptionFormatter;
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
     * Saved value of type properties during variable creation
     */
    typeProperties?: dbg.IVariableProperties;
    
    getTypeProperties() {
        return this.typeProperties ??= this.debug.extractVariableProperties(this);
    }

    /**
     * Formatter function that will parse given Variable instance
     * using custom, type-specific logic.
     */
    descriptionFormatter: DescriptionFormatter | undefined;

    constructor(args: RealVariableArgs) {
        super(args.name, args.value, args.type, args.declaredType, 
              args.context, args.frameId, args.parent);
        this.memoryReference = args.memoryReference;
        this.variablesReference = args.variablesReference;
        this.parent = args.parent;
        this.typeProperties = args.typeProperties;
        this.descriptionFormatter = args.formatter;
    }

    getRealVariableArgs(): RealVariableArgs {
        return {
            memoryReference: this.memoryReference,
            name: this.name,
            type: this.type,
            declaredType: this.declaredType,
            value: this.value,
            variablesReference: this.variablesReference,
            frameId: this.frameId,
            parent: this.parent,
            context: this.context,
            /* These members are type specific, so do not inherit them */
            formatter: undefined,
            typeProperties: undefined,
        };
    }
    
    protected isExpandable(): boolean {
        return this.typeProperties
            ? variablePropertyIsExpandable(this.typeProperties)
            : super.isExpandable();
    }

    /**
     * Base implementation which just get variables using
     * {@link variablesReference variablesReference } field
     */
    async doGetChildren(): Promise<Variable[] | undefined> {
        return await this.getRealMembers();
    }

    /**
     * Cached *real* members of this variable
     */
    realMembersCache?: Variable[];

    protected async doGetRealMembers() {
        return await Variable.getVariables(this.variablesReference, this.frameId,
                                           this.context, this);
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
        if (this.realMembersCache !== undefined) {
            return this.realMembersCache;
        }

        this.realMembersCache = await this.doGetRealMembers();
        return this.realMembersCache;
    }

    /* Cached value of `this.descriptionFormatter` */
    customDescriptionCache?: string;
    async getDescription() {
        if (this.descriptionFormatter) {
            if (this.customDescriptionCache) {
                return this.customDescriptionCache;
            }

            try {
                const description = await this.descriptionFormatter(this);
                if (description) {
                    this.customDescriptionCache = description;
                    return description;
                }
            } catch (err) {
                if (!isEvaluationError(err)) {
                    throw err;
                }

                logger.error(err, 'could not invoke custom formatter');
            }
        }
        
        return await super.getDescription();
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

    protected getType() {
        return this.type;
    }

    async getRealMember(member: string) {
        const m = await this.getMember(member);
        if (m instanceof RealVariable) {
            return m;
        }
        
        if (m instanceof InvalidVariable) {
            return;
        }

        throw new EvaluationError(`member "${member}" is neither RealVariable nor InvalidPointer`);
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
        if (!dbg.isEnumResult(value)) {
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

    async formatWatchExpression(): Promise<string | null> {
        if (!this.parent) {
            /* should not happen */
            return null;
        }

        const cast = this.type === this.declaredType
            ? ''
            : `(${this.type})`;
        if (this.parent instanceof VariablesRoot) {
            /* Top level variable needs to be just printed */
            if (this.getTypeProperties().isValueStruct()) {
                return this.name;
            } else {
                return `${cast}${this.name}`;
            }
        } else if (   this.parent instanceof ListElementsMember
                  || this.parent instanceof LinkedListElementsMember) {
            if (this.getTypeProperties().pointerCanDeref()) {
                return `(${this.type})${this.getPointer()}`;
            } else {
                const index = getIndexFromArrayElementName(this.name);
                if (index !== undefined) {
                    return `((${this.parent.type})${this.parent.getPointer()})[${index}]`;
                }
            }
        } else if (this.parent instanceof ArrayVariable) {
            if (this.getTypeProperties().pointerCanDeref()) {
                return `(${this.type})${this.getPointer()}`;
            } else {
                /*
                 * We may not store array index in object, because it is already
                 * stored in name of it.
                 */
                const index = getIndexFromArrayElementName(this.name);
                if (index !== undefined) {
                    return `((${this.parent.type})${this.parent.getPointer()})[${index}]`;
                }
            }
        } else if (this.parent instanceof RealVariable) {
            /* Member of real structure */
            if (this.parent.getTypeProperties().isValueStruct()) {
                /*
                 * If parent is a value struct, then his parent also
                 * can be value struct, so we can not get pointer of
                 * parent of parent - it also can be a value struct.
                 * So in such case just recursively get watch expression.
                 */
                const base = await this.parent.formatWatchExpression();
                if (!base) {
                    return null;
                }

                return `${cast}${base}.${this.name}`;
            } else {
                /* This is the most common case - watch member of some pointer type */
                const parentExpr = `((${this.parent.type})${this.parent.getPointer()})`;
                return `${cast}${parentExpr}->${this.name}`;
            }
        } else {
            /* Child of pseudo-member */
            if (this.getTypeProperties().isValueStruct()) {
                const parent = `((${this.parent.type})${this.parent.getPointer()})`;
                const separator = dbg.isPointerType(this.parent.type) ? '->' : '.';
                return `${parent}${separator}${this.name}`;
            } else if (this.getTypeProperties().pointerCanDeref()) {
                return `(${this.type})${this.getPointer()}`;
            }
        }

        return null;
    }

    async getUserWatchExpression() {
        let expr = await this.formatWatchExpression();
        if (expr && this.debug.type === dbg.DebuggerType.CodeLLDB) {
            expr = `/nat ${expr}`;
        }
        return expr;
    }
}

/*
 * Some constants from source code.
 * 
 * Using them in such way is quite safe, because they haven't changed for many
 * years (and I do not think will be changed in near future).
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
     * 
     * NOTE: if you want to remove 'T_' prefix, then do not use replace('T_', ''),
     *       because it can replace substring *inside* typename. Instead
     *       for check use `startsWith('T_')` and to trim `substring(2)`
     * 
     * @example AggPath, List
     */
    realNodeTag: string;

    constructor(realNodeTag: string, args: RealVariableArgs) {
        super(args);
        this.realNodeTag = realNodeTag;
    }

    protected computeEffectiveType() {
        const tagFromType = dbg.getStructNameFromType(this.type);
        if (tagFromType === this.realNodeTag) {
            return this.type;
        }

        /*
         * Also try find aliases for some NodeTags
         */
        let type = this.type;
        const alias = this.context.nodeVarRegistry.aliases.get(tagFromType);
        if (alias) {
            type = dbg.substituteStructName(type, alias);
        }

        return dbg.substituteStructName(type, this.realNodeTag);
    }

    typeComputed = false;
    getType(): string {
        if (!this.typeComputed) {
            this.type = this.computeEffectiveType();
            this.typeComputed = true;
        }

        return this.type;
    }

    /**
     * Whether real NodeTag match with declared type.
     * 
     * NOTE: this function is overloaded in inherited subclasses
     */
    protected tagsMatch() {
        /*
         * This works in general, but there are some types that does not
         * follow the convention, i.e. Value stores T_String, T_Float, etc...
         * 
         * For them we have to create separate classes with custom logic, but
         * thankfully there are not so many of them.
         */
        return dbg.getStructNameFromType(this.declaredType) === this.realNodeTag;
    }

    protected isExpandable(): boolean {
        return true;
    }
    
    protected getLabel() {
        return this.tagsMatch()
            ? `${this.name}: ${this.declaredType}`
            : `${this.name}: ${this.declaredType} [${this.realNodeTag}]`;
    }

    protected async checkNodeTagMatchType() {
        if (!this.tagsMatch()) {
            await this.castToNodeTag(this.realNodeTag);
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

    protected async castToNodeTag(tag: string) {
        /*
         * We should substitute current type with target, because
         * there may be qualifiers such `struct' or `const'
         */
        const resultType = dbg.substituteStructName(this.getType(), tag);
        return await this.castToType(resultType);
    }

    protected async doGetRealMembers() {
        await this.checkNodeTagMatchType();

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

    static getTagFromType(type: string) {
        return dbg.getStructNameFromType(type);
    }
    
    static async tryCreateNode(variable: dap.DebugVariable, frameId: number,
                               context: ExecContext, args: RealVariableArgs) {
        if (!context.nodeVarRegistry.isNodeVar(args.type)) {
            return;
        }

        /*
         * Even if we know, that this variable is of Node type, this does
         * not mean, that it does not contain garbage or it is actually
         * a base (abstract) type, so, we have to check it manually.
         * 
         * XXX: it would be better to add some Node inheritance knowledge
         *      to reduce debugger invocations
         */
        const expr = `((Node *)(${context.debug.getPointer(variable)}))->type`;
        let response;

        try {
            response = await context.debug.evaluate(expr, frameId);
        } catch (err) {
            if (isEvaluationError(err)) {
                logger.error(err, 'could not get NodeTag for', expr);
                return;
            }
            
            throw err;
        }

        if (!response.result.startsWith('T_')) {
            return;
        }
        
        /* Do not use replace('T_', ''), because this 'T_' can be inside identifier */
        const realTag = response.result.substring(2);
        if (!context.nodeVarRegistry.isNodeTag(realTag)) {
            return;
        }

        /* List */
        if (ListNodeVariable.isListVariable(realTag)) {
            return new ListNodeVariable(realTag, args);
        }

        /* Bitmapset */
        if (realTag === 'Bitmapset') {
            return new BitmapSetSpecialMember(args);
        }

        /*
         * Search custom formatter for $expr$ children. Do it now, because
         *
         * 1. previous types do not have custom formatter and
         * 2. next, ExprNodeVariable is created which also can have custom
         *    formatter (this is true for TargetEntry which is both Expr
         *    and require custom description).
         * 
         * So, this is the only suitable place for such logic.
         */
        args.formatter = getFormatterForNodeVariable(realTag);

        /* Expressions with it's representation */
        if (context.nodeVarRegistry.exprs.has(realTag)) {
            return new ExprNodeVariable(realTag, args);
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
    
    async formatWatchExpression() {
        /* Make sure 'type' is correctly initialized */
        await this.getChildren();

        return super.formatWatchExpression();
    }
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
        return this.debug.extractString(result);
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

        const result = await this.evaluateSysCache(`get_func_name((Oid) ${oid})`);
        const str = this.debug.extractString(result);
        if (str === null) {
            return null;
        }

        const ptr = this.debug.extractPtrFromString(result);
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

        const result = await this.evaluateSysCache(`get_opname((Oid)${oid})`);

        const str = this.debug.extractString(result);
        if (str === null) {
            return null;
        }

        const ptr = this.debug.extractPtrFromString(result);
        if (ptr) {
            await this.pfree(ptr);
        }

        return str;
    }

    /**
     * Get elements of member 'this->member' and return list
     * of repr for each element
     */
    private async getListMemberElementsReprs(member: string) {
        const elements = await this.getListMemberElements(member);

        const reprs = [];
        for (const elem of elements) {
            reprs.push(await this.getReprPlaceholder(elem));
        }

        return reprs;
    }

    /**
     * Get repr of 'this->member'
     */
    private async getMemberRepr(member: string) {
        const exprMember = await this.getMember(member);
        return await this.getReprPlaceholder(exprMember);
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
    private async getReprPlaceholder(variable: Variable) {
        if (variable instanceof ExprNodeVariable) {
            try {
                return await variable.getReprInternal();
            } catch (err) {
                if (isEvaluationError(err)) {
                    logger.error(err, 'could not get repr for node', variable.realNodeTag);
                    return this.getExprPlaceholder(variable);
                }

                throw err;
            }
        } else {
            return this.getExprPlaceholder(variable);
        }
    }

    private async formatVarExpr() {
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

        if (varno === -4) {
            return 'ROWID';
        }

        const rtable = await this.getRtable();
        if (!rtable) {
            return '???.???';
        }

        if (!(varno >= InvalidAttrNumber && varno <= rtable.length)) {
            return '???.???';
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

        const rte = rtable[varno - 1];
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
            if (alias) {
                const aliasColnames = await alias.getListMemberElements('colnames');

                if (varattno <= aliasColnames.length) {
                    const colname = aliasColnames[varattno - 1];
                    if (colname instanceof ValueVariable) {
                        return await colname.getStringRepr() ?? '???';
                    }
                }
            }

            const rteRelation = this.debug.formatEnumValue('RTEKind', 'RTE_RELATION'); 
            const getAttnameExpr = `   ${rtePtr}->rtekind == ${rteRelation} 
                                    && ${rtePtr}->relid   != ${InvalidOid}`;
            const evalResult = await this.evaluate(getAttnameExpr);
            const useGetAttname = this.debug.extractBool(evalResult);
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
                        r = await this.evaluateSysCache(`get_attname(${rtePtr}->relid, ${varattno}, true)`);
                        attname = this.debug.extractString(r);
                        if (attname !== null) {
                            return attname;
                        }
                    } catch (err) {
                        if (!isEvaluationError(err)) {
                            throw err;
                        }

                        /* maybe this version has get_attname with 2 arguments */
                        if (err.message.indexOf('no matching function') === -1) {
                            throw err;
                        }
                    }

                    r = await this.evaluateSysCache(`get_attname(${rtePtr}->relid, ${varattno})`);
                    attname = this.debug.extractString(r);
                    if (attname !== null) {
                        this.context.hasGetAttname3 = false;
                        return attname;
                    }
                } else {
                    r = await this.evaluateSysCache(`get_attname(${rtePtr}->relid, ${varattno})`);
                    attname = this.debug.extractString(r);
                    if (attname !== null) {
                        return attname;
                    }
                }
            }

            const eref = await rte.getRealMember('eref');
            if (eref) {
                const erefColnames = await eref.getListMemberElements('colnames');
                if (varattno <= erefColnames.length) {
                    const colname = erefColnames[varattno - 1];
                    if (colname instanceof ValueVariable) {
                        return await colname.getStringRepr() ?? '???';
                    }
                }
            }

            return '???';
        };

        const relname = await this.evalStringResult(`${rtePtr}->eref->aliasname`) ?? '???';
        const attname = await get_rte_attribute_name();
        return `${relname}.${attname}`;
    }

    private async formatPlaceHolderVar() {
        return await this.getMemberRepr('phexpr');
    }

    private async formatConst() {
        const evalOid = async (expr: string) => {
            const res = await this.evaluate(expr);
            const oid = Number(res.result);
            if (!Number.isInteger(oid)) {
                throw new UnexpectedOutputError(`failed to get Oid from expr: ${expr}`);
            }

            return oid;
        };

        const evalStrWithPtr = async (expr: string) => {
            const result = await this.debug.evaluate(expr, this.frameId);
            const str = this.debug.extractString(result);
            if (str === null) {
                throw new EvaluationError(`failed to get string from expr: ${expr}`);
            }

            const ptr = this.debug.extractPtrFromString(result);
            if (ptr === null) {
                throw new EvaluationError(`failed to get pointer from expr: ${expr}`);
            }
            return [str, ptr];
        };

        const legacyOidOutputFunctionCall = async (funcOid: number) => {
            /*
             * Older systems do not have OidOutputFunctionCall(), so use
             * FunctionCall1() instead.
             */
            /* Call function */
            const result = await this.functionCall(funcOid, '(char *)', `((Const *)${this.getPointer()})->constvalue)`);            

            /* Free allocated string */
            const ptr = this.debug.extractPtrFromString(result);
            if (ptr === null) {
                throw new EvaluationError(`failed to extract pointer from result: "${result.result}"`);
            }
            await this.pfree(ptr);
            
            const str = this.debug.extractString(result);
            if (str === null) {
                throw new EvaluationError(`failed to extract string from result: "${result.result}"`);
            }
            return str;
        };

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
        const maxAttempts = 2;
        for (attempt = 0; attempt < maxAttempts; attempt++) {
            if (this.context.hasGetTypeOutputInfo3Args) {
                try {
                    await this.evaluateVoid(`getTypeOutputInfo(((Const *)${this.getPointer()})->consttype, ((${tupOutputType})${tupOutput}), ((${tupIsVarLenaType})${tupIsVarlena}))`);
                } catch (err) {
                    if (!isEvaluationError(err)) {
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
                    if (!isEvaluationError(err)) {
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
            if (tupIOParam) {
                await this.pfree(tupIOParam);
            }
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
                if (!isEvaluationError(e)) {
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
        {await this.pfree(tupIOParam);}

        return repr;
    }

    private async formatOpExpr() {
        const opname = await this.getOpName('opno') ?? '(invalid op)';
        const args = await this.getListMemberElements('args');
        if (args.length === 0) {
            throw new UnexpectedOutputError('OpExpr contains no args');
        }

        let data;
        if (args.length > 1) {
            data = [
                await this.getReprPlaceholder(args[0]),
                opname,
                await this.getReprPlaceholder(args[1]),
            ];
        } else {
            data = [
                opname,
                await this.getReprPlaceholder(args[0]),
            ];
        }

        return data.join(' ');
    }

    private async formatFuncExpr() {
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
                    argsExpressions.push(await this.getReprPlaceholder(arg));
                }

                return `${funcname}(${argsExpressions.join(', ')})`;
            case 'COERCE_EXPLICIT_CAST':
                const argRepr = await this.getReprPlaceholder(args[0]);
                return `${argRepr}::${funcname}`;
            case 'COERCE_IMPLICIT_CAST':
                /* User did not request explicit cast, so show as simple expr */
                return await this.getReprPlaceholder(args[0]);
        }
        return '???';
    }

    private async formatAggref() {
        const funcname = await this.getFuncName('aggfnoid') ?? '(invalid func)';

        const reprs = await this.getListMemberElementsReprs('args');

        let args;
        if (reprs.length === 0) {
            /* If agg function called with '*', then 'args' is NIL */
            args = '*';
        } else {
            args = reprs.join(', ');
        }


        return `${funcname}(${args})`;
    }

    private async formatTargetEntry() {
        const expr = await this.getMember('expr');
        return await this.getReprPlaceholder(expr);
    }

    private async formatScalarArrayOpExpr() {
        const opname = await this.getOpName('opno') ?? '(invalid op)';

        const useOr = await this.getMemberValueBool('useOr');
        const args = await this.getListMemberElements('args');
        if (args.length !== 2) {
            throw new EvaluationError(`ScalarArrayOpExpr should contain 2 arguments, given: ${args.length}`);
        }

        const [scalar, array] = args;
        const scalarRepr = await this.getReprPlaceholder(scalar);
        const arrayRepr = await this.getReprPlaceholder(array);
        const funcname = useOr ? 'ANY' : 'ALL';

        return `${scalarRepr} ${opname} ${funcname}(${arrayRepr})`;
    }

    private async formatBoolExpr() {
        const boolOp = await this.getMemberValueEnum('boolop');
        const args = await this.getListMemberElements('args');

        if (boolOp === 'NOT_EXPR') {
            const exprRepr = await this.getReprPlaceholder(args[0]);
            return `NOT ${exprRepr}`;
        }

        const argsReprs = [];
        for (const arg of args) {
            argsReprs.push(await this.getReprPlaceholder(arg));
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

    private async formatCoalesceExpr() {
        const args = await this.getListMemberElements('args');
        const argsReprs = [];
        for (const arg of args) {
            argsReprs.push(await this.getReprPlaceholder(arg));
        }

        return `COALESCE(${argsReprs.join(', ')})`;
    }

    private async formatNullTest() {
        const expr = await this.getMember('arg');
        const innerRepr = await this.getReprPlaceholder(expr);

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

    private async formatBooleanTest() {
        const arg = await this.getMember('arg');
        const innerRepr = await this.getReprPlaceholder(arg);

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

    private async formatArrayExpr() {
        const reprs = await this.getListMemberElementsReprs('elements');
        return `ARRAY[${reprs.join(', ')}]`;
    }

    private async formatSqlValueFunction() {
        const getTypmod = async () => {
            return await this.getMemberValueNumber('typmod');
        };
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

    private async formatMinMaxExpr() {
        const op = await this.getMemberValueEnum('op');
        const argsReprs = await this.getListMemberElementsReprs('args');

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

    private async formatRowExpr() {
        const reprs = await this.getListMemberElementsReprs('args');
        return `ROW(${reprs.join(', ')})`;
    }

    private async formatDistinctExpr() {
        const reprs = await this.getListMemberElementsReprs('args');
        if (reprs.length != 2) {
            throw new EvaluationError('should be 2 arguments for DistinctExpr');
        }

        const [left, right] = reprs;
        return `${left} IS DISTINCT FROM ${right}`;
    }

    private async formatNullIfExpr() {
        const reprs = await this.getListMemberElementsReprs('args');
        if (reprs.length != 2) {
            throw new EvaluationError('should be 2 arguments for NullIf');
        }

        const [left, right] = reprs;
        return `NULLIF(${left}, ${right})`;
    }

    private async formatNamedArgExpr() {
        const arg = await this.getMemberRepr('arg');
        const name = await this.getMemberValueCharString('name');
        return `${name} => ${arg}`;
    }

    private async formatGroupingFunc() {
        const reprs = await this.getListMemberElementsReprs('args');
        return `GROUPING(${reprs.join(', ')})`;
    }

    private async formatWindowFunc() {
        const funcname = await this.getFuncName('winfnoid') ?? '(invalid func)';
        const reprs = await this.getListMemberElementsReprs('args');
        let repr = `${funcname}(${reprs.join(', ')})`;
        try {
            const filterRepr = await this.getMemberRepr('aggfilter');
            repr += ` FILTER (${filterRepr})`;
        } catch (e) {
            if (!isEvaluationError(e)) {
                throw e;
            }
        }

        return repr;
    }

    private async formatSubscriptingRef() {
        const exprRepr = await this.getMemberRepr('refexpr');
        const upperIndices = await this.getListMemberElements('refupperindexpr');
        let lowerIndices = null;
        try {
            lowerIndices = await this.getListMemberElements('reflowerindexpr');
        } catch (e) {
            if (!isEvaluationError(e)) {
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
                    index += await this.getReprPlaceholder(lower);
                }
                index += ':';
                if (!this.debug.isNull(upper)) {
                    index += await this.getReprPlaceholder(upper);
                }
                index += ']';
                indicesReprs.push(index);
            }
        } else {
            for (const upper of upperIndices) {
                const index = await this.getReprPlaceholder(upper);
                indicesReprs.push(`[${index}]`);
            }
        }

        return `(${exprRepr}${indicesReprs.join('')})`;
    }

    private async formatXmlExpr() {
        const getArgNameListOfStrings = async () => {
            /* Get List of T_String elements and take their 'sval' values */
            const list = await this.getListMemberElements('arg_names');
            const values = [];
            for (const entry of list) {
                if (entry instanceof ValueVariable) {
                    try {
                        values.push(await entry.getStringRepr() ?? 'NULL');
                    } catch (e) {
                        if (!isEvaluationError(e)) {
                            throw e;
                        }

                        values.push('???');
                    }
                } else if (entry instanceof ExprNodeVariable) {
                    values.push(await entry.getReprInternal());
                } else {
                    values.push('???');
                }
            }

            return values;
        };

        const xmlOp = await this.getMemberValueEnum('op');
        switch (xmlOp) {
            case 'IS_XMLELEMENT': {
                let namedArgs: string[] | null;
                let argNames: string[] | null;
                try {
                    namedArgs = await this.getListMemberElementsReprs('named_args');
                    argNames = await getArgNameListOfStrings();
                } catch (e) {
                    if (!isEvaluationError(e)) {
                        throw e;
                    }

                    namedArgs = null;
                    argNames = null;
                }
                let args: string[] | null;
                try {
                    args = await this.getListMemberElementsReprs('args');
                } catch (e) {
                    if (!isEvaluationError(e)) {
                        throw e;
                    }

                    args = null;
                }
                const name = await this.getMemberValueCharString('name');
                let repr = `XMLELEMENT(name ${name ?? 'NULL'}`;
                if (namedArgs && argNames && namedArgs.length === argNames.length) {
                    const xmlattributes = [];
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
            case 'IS_XMLFOREST': {
                let namedArgs: string[] | null;
                let argNames: string[] | null;
                try {
                    namedArgs = await this.getListMemberElementsReprs('named_args');
                    argNames = await getArgNameListOfStrings();
                } catch (e) {
                    if (!isEvaluationError(e)) {
                        throw e;
                    }

                    namedArgs = null;
                    argNames = null;
                }
                let repr = 'XMLFOREST(';
                if (namedArgs && argNames && namedArgs.length === argNames.length) {
                    const xmlattributes = [];
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
            case 'IS_XMLCONCAT': {
                let args: string[] | null;
                try {
                    args = await this.getListMemberElementsReprs('args');
                } catch (e) {
                    if (!isEvaluationError(e)) {
                        throw e;
                    }
                    args = null;
                }

                let repr = 'XMLCONCAT(';
                if (args) {
                    repr += args.join(', ');
                }
                repr += ')';
                return repr;
            }
            case 'IS_XMLPARSE': {
                const option = await this.getMemberValueEnum('xmloption');
                const args = await this.getListMemberElementsReprs('args');
                if (!args) {
                    return 'XMLPARSE()';
                }

                const data = args[0];
                return `XMLPARSE(${option === 'XMLOPTION_DOCUMENT' ? 'DOCUMENT' : 'CONTENT'} ${data})`;
            }
            case 'IS_XMLPI': {
                const name = await this.getMemberValueCharString('name');
                const args = await this.getListMemberElementsReprs('args');
                let repr = `XMLPI(NAME ${name}`;
                if (args) {
                    repr += `, ${args.join(', ')}`;
                }
                repr += ')';
                return repr;
            }
            case 'IS_XMLROOT': {
                const args = await this.getListMemberElementsReprs('args');
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
            case 'IS_XMLSERIALIZE': {
                const option = await this.getMemberValueEnum('xmloption');
                const args = await this.getListMemberElementsReprs('args');
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
            case 'IS_DOCUMENT': {
                const args = await this.getListMemberElementsReprs('args');
                if (args) {
                    return `${args[0]} IS DOCUMENT`;
                } else {
                    return '??? IS DOCUMENT';
                }
            }
        }

        return '???';
    }

    private async formatSubLink() {
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

            const elements = await v.getListMemberElements('args');
            if (elements.length) {
                const left = elements[0];
                if (left instanceof ExprNodeVariable) {
                    return await left.getReprInternal();
                }
            }

            return '???';
        };

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
            const elements = await testexpr.getListMemberElements('args');
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
                reprs.push(await this.getReprPlaceholder(arg));
            }
            leftReprs = reprs;
        }

        /* SubLink->operName[0]->sval */
        let opname = '???';
        const elements = await this.getListMemberElements('operName');
        if (elements?.length && elements[0] instanceof ValueVariable) {
            opname = await elements[0].getStringRepr() ?? '???';
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

    private async formatRowCompareExpr() {
        const getReprs = async (arr: string[], member: string) => {
            const elements = await this.getListMemberElementsReprs(member);
            for (const e of elements) {
                arr.push(e);
            }
        };

        const compareType = await this.getMemberValueEnum('rctype');
        const leftReprs: string[] = [];
        const rightReprs: string[] = [];

        await getReprs(leftReprs, 'largs');
        await getReprs(rightReprs, 'rargs');

        let opname;
        switch (compareType) {
            case 'ROWCOMPARE_LT':
                opname = '<';
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

    private async delegateFormatToMember(member: string) {
        /*
         * Repr of some exprs is same as repr of their field.
         * For such cases use this function in order not to
         * product many other functions.
         */
        return await this.getMemberRepr(member);
    }

    private async formatParam() {
        const paramNum = await this.getMemberValueNumber('paramid');
        return `PARAM$${paramNum}`;
    }

    private async formatJsonExpr() {
        const op = await this.getMemberValueEnum('op');
        switch (op) {
            case 'JSON_EXISTS_OP':
                return 'JSON_EXISTS(...)';
            case 'JSON_QUERY_OP':
                return 'JSON_QUERY(...)';
            case 'JSON_VALUE_OP':
                return 'JSON_VALUE(...)';
            case 'JSON_TABLE_OP':
                return 'JSON_TABLE(...)';
        }

        const trailing = op.lastIndexOf('_OP');
        if (trailing === -1) {
            return `${op}(...)`;
        }
        
        return `${op.substring(0, trailing)}(...)`;
    }

    private async formatJsonConstructorExpr() {
        const ctorType = await this.getMemberValueEnum('type');
        const args = await this.getListMemberElementsReprs('args');
        if (ctorType === 'JSCTOR_JSON_OBJECTAGG' || ctorType === 'JSCTOR_JSON_ARRAYAGG') {
            /*
             * At runtime these function are rewritten and extracting
             * arguments from actual FuncExpr/WindowExpr to recreate
             * function repr "as it was meant" seems overhead.
             * So show already rewritten function - we can do it already.
             */
            return await this.getMemberRepr('func');
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

    private async formatJsonIsPredicate() {
        const expr = await this.getMemberRepr('expr');
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

    private async formatWindowFuncRunCondition() {
        const wfuncLeft = await this.getMemberValueBool('wfunc_left');
        const expr = await this.getMemberRepr('arg');
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

    private async formatCaseWhen() {
        const when = await this.getMemberRepr('expr');
        const then = await this.getMemberRepr('result');
        return `WHEN ${when} THEN ${then}`;
    }

    private async formatFieldSelect() {
        /*
         * This is hard to determine name of field using only
         * attribute number - there are many manipulations should occur.
         * i.e. src/backend/utils/adt/ruleutils.c:get_name_for_var_field.
         *
         * For now, just print container expr and '???' as field.
         * I think, in the end developers will understand which field is used.
         */
        const expr = await this.getMemberRepr('arg');
        return `${expr}.???`;
    }

    private async formatFieldStore() {
        const expr = await this.getMemberRepr('arg');
        return `${expr}.??? = ???`;
    }

    private async formatCurrentOfExpr() {
        const sval = await this.getMemberValueCharString('cursor_name');
        return `CURRENT OF ${sval === null ? 'NULL' : sval}`;
    }

    private async formatExpr(): Promise<string> {
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
                    return await this.formatVarExpr();
                case 'Const':
                    return await this.formatConst();
                case 'OpExpr':
                    return await this.formatOpExpr();
                case 'FuncExpr':
                    return await this.formatFuncExpr();
                case 'Aggref':
                    return await this.formatAggref();
                case 'PlaceHolderVar':
                    return await this.formatPlaceHolderVar();
                case 'TargetEntry':
                    return await this.formatTargetEntry();
                case 'ScalarArrayOpExpr':
                    return await this.formatScalarArrayOpExpr();
                case 'BoolExpr':
                    return await this.formatBoolExpr();
                case 'BooleanTest':
                    return await this.formatBooleanTest();
                case 'CoalesceExpr':
                    return await this.formatCoalesceExpr();
                case 'Param':
                    return await this.formatParam();
                case 'NullTest':
                    return await this.formatNullTest();
                case 'ArrayExpr':
                    return await this.formatArrayExpr();
                case 'SQLValueFunction':
                    return await this.formatSqlValueFunction();
                case 'MinMaxExpr':
                    return await this.formatMinMaxExpr();
                case 'RowExpr':
                    return await this.formatRowExpr();
                case 'DistinctExpr':
                    return await this.formatDistinctExpr();
                case 'NullIfExpr':
                    return await this.formatNullIfExpr();
                case 'NamedArgExpr':
                    return await this.formatNamedArgExpr();
                case 'GroupingFunc':
                    return await this.formatGroupingFunc();
                case 'WindowFunc':
                    return await this.formatWindowFunc();
                case 'SubscriptingRef':
                case 'ArrayRef' /* old style 'SubscripingRef' */:
                    return await this.formatSubscriptingRef();
                case 'XmlExpr':
                    return await this.formatXmlExpr();
                case 'SubLink':
                    return await this.formatSubLink();
                case 'RowCompareExpr':
                    return await this.formatRowCompareExpr();
                case 'ArrayCoerceExpr':
                    return await this.delegateFormatToMember('arg');
                case 'CoerseToDomain':
                    return await this.delegateFormatToMember('arg');
                case 'ConvertRowtypeExpr':
                    return await this.delegateFormatToMember('arg');
                case 'CollateExpr':
                    return await this.delegateFormatToMember('arg');
                case 'CoerceViaIO':
                    return await this.delegateFormatToMember('arg');
                case 'RelabelType':
                    return await this.delegateFormatToMember('arg');
                case 'JsonExpr':
                    return await this.formatJsonExpr();
                case 'JsonValueExpr':
                    return await this.delegateFormatToMember('raw_expr');
                case 'JsonConstructorExpr':
                    return await this.formatJsonConstructorExpr();
                case 'JsonIsPredicate':
                    return await this.formatJsonIsPredicate();
                case 'WindowFuncRunCondition':
                    return await this.formatWindowFuncRunCondition();
                case 'CaseWhen':
                    return await this.formatCaseWhen();
                case 'FieldSelect':
                    return await this.formatFieldSelect();
                case 'FieldStore':
                    return await this.formatFieldStore();
                case 'CurrentOfExpr':
                    return await this.formatCurrentOfExpr();
                case 'InferenceElem':
                    return await this.delegateFormatToMember('expr');

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
            if (!isEvaluationError(error)) {
                throw error;
            }

            logger.error(error, 'failed repr for', this.realNodeTag);
        }
        return this.getExprPlaceholder(this);
    }

    /*
     * Entry point to get text representation of Expr during
     * recursive repr evaluation.  This is speed up, because
     * of already found 'rtable' passing.
     */
    private async getReprInternal() {
        if (this.repr) {
            return this.repr;
        }

        const repr = await this.formatExpr();
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

        return await this.getReprInternal();
    }

    private async getRtable() {
        if (this.context.step.rtable.exists) {
            return this.context.step.rtable.rtable;
        }

        /* 
         * For convenience some expressions are rendered instead of description
         * field, i.e. TargetEntry or EquivalenceMember. But when this happens
         * 'getChildren' is called for each TreeItem and we get concurrency issue.
         * 
         * NodeJS has event loop which stops when encounters 'await' (in simple
         * words), but in situation described above each element will have the
         * same call stack and as a result they all end up in this function.
         * So, for all of them 'exists === false', so they all will call
         * 'findRtable', but when they will call it execution flow will be
         * passed to another function which also will get to here with same
         * 'exists === false'. In the end, when someone will return from
         * 'findRtable' - 'rtable' and 'exists' might be already set, so we have
         * done extra work.
         * 
         * This can affect UX significantly especially when working with large
         * queries in complex scenarios.
         * 
         * So, 'waiter' - is a simple lock implementation on top of Promise.
         * We know that NodeJS is single-threaded so it is safe to update
         * 'waiter' member without any locks.
         */
        if (this.context.step.rtable.waiter) {
            await this.context.step.rtable.waiter;
        } else {
            /* eslint-disable-next-line no-async-promise-executor */
            const waiter = new Promise<void>(async (resolve, reject) => {
                try {
                    const rtable = await this.findRtable() as NodeVariable[] | undefined;
                    this.context.step.rtable.rtable = rtable;
                    this.context.step.rtable.exists = true;
                    resolve();
                } catch (error) {
                    reject(error);
                }
            });
            this.context.step.rtable.waiter = waiter;
            await waiter;
        }

        return this.context.step.rtable.rtable;
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
                      || v.realNodeTag === 'PlannedStmt'
                      || v.realNodeTag === 'EState');
        };

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
                    return await v.getListMemberElements('rtable');
                case 'EState':
                    /* EState->es_range_table */
                    return v.getListMemberElements('es_range_table');
            }
            logger.warn('got unexpected NodeTag in findRtable', v.realNodeTag);
            return;
        };

        let node = this.parent;
        while (node && !(node instanceof VariablesRoot)) {
            if (isRtableContainingNode(node)) {
                /* Found suitable Node directly */
                break;
            }
            
            /*
             * In Executor we do not have planner data structures,
             * but range table is stored inside 'EState' (which is handled
             * in 'isRtableContainingNode')
             * 
             * This variable (type) most likely won't be our parent,
             * because all Expr stored in Plan, which stored in PlanState
             * and the latter stores 'EState'.
             * 
             * Thus we must detect, that we are in 'PlanState' and then
             * take 'EState PlanState.state' member.
             * 
             * The only thing that breaks clean code is that 'PlanState'
             * is abstract type - this structure is embedded into the
             * inherited ones, so we must check not NodeTag, but it's
             * type directly.
             * 
             * In code it looks like this:
             * 
             * ```c
             * typedef struct PlanState
             * {
             *      Plan    *plan;   // <---- stores expressions
             *                       //       searching starts here
             *      EState  *state;  // <---- contains range table
             * } PlanState;
             * ```
             */
            if (node.type === 'PlanState' && node instanceof RealVariable) {
                const state = await node.getMember('state');
                if (state instanceof NodeVariable) {
                    const rtable = await tryGetRtable(state);
                    if (rtable) {
                        return rtable;
                    }
                }
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
        
        /* PlanState can not be  */

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
                                                this, expr);
        const children = await super.doGetChildren() ?? [];
        children.unshift(exprVariable);
        return children;
    }
}

class ListElementsMember extends Variable {
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
        super('$elements$', '', '', '', args.context, args.frameId, listParent);
        this.listParent = listParent;
        this.cellValue = cellValue;
        this.listCellType = listCellType;
    }

    protected isExpandable() {
        return !this.listParent.isEmpty();
    }

    async getPointerElements() {
        const length = await this.listParent.getListLength();
        if (!length) {
            return;
        }

        const listType = this.listParent.getMemberExpression('elements');
        const expression = `(${this.listCellType} *)(${listType})`;
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
        const elementsMemberExpr = `((ListCell *)${this.listParent.getMemberExpression('elements')})`;
        for (let i = 0; i < length; i++) {
            const expression = `${elementsMemberExpr}[${i}].${this.cellValue}`;
            const response = await this.debug.evaluate(expression, this.frameId);
            elements.push(new RealVariable({
                name: getNameForArrayElement(i),
                type: this.listCellType,
                declaredType: this.listCellType,
                variablesReference: response.variablesReference,
                value: response.result,
                memoryReference: response.memoryReference,
                frameId: this.frameId,
                context: this.context,
                parent: this,
            }));
        }

        return elements;
    }

    async doGetChildren() {
        if (this.members !== undefined) {
            return this.members;
        }

        this.members = await (
            this.listParent.realNodeTag === 'List'
                ? this.getPointerElements()
                : this.getIntegerElements()
        );

        return this.members;
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
        super('$elements$', '', '', '', context, listParent.frameId, listParent);
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
                name: getNameForArrayElement(i),
                value: response.result,
                type: this.realType,
                variablesReference: response.variablesReference,
                memoryReference: response.memoryReference,
            });
            evaluateName = `${evaluateName}->next`;
            cell = await this.debug.evaluate(evaluateName, this.frameId);
            ++i;
        } while (!this.debug.isNull(cell));

        return await Variable.mapVariables(elements, this.frameId, this.context,
                                           this.listParent);
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
    /* Special member, that manages elements of this List */
    listElements?: ListElementsMember | LinkedListElementsMember;

    getMemberExpression(member: string) {
        return `((${this.getType()})${this.getPointer()})->${member}`;
    }

    isEmpty() {
        /* Empty 'List *' is NIL (== NULL) */
        return this.getTypeProperties().pointerIsNull();
    }
    
    getListInfo() {
        switch (this.realNodeTag) {
            case 'List': 
                return {member: 'ptr_value', type: 'void *'};
            case 'IntList': 
                return {member: 'int_value', type: 'int'};
            case 'OidList': 
                return {member: 'oid_value', type: 'Oid'};
            case 'XidList': 
                return {member: 'xid_value', type: 'TransactionId'};
        }
    }

    async getListInfoSafe() {
        if (this.realNodeTag === 'List') {
            const realType = await this.findTypeForPtr();
            if (realType) {
                return {
                    member: 'ptr_value',
                    type: realType,
                };
            }
            
            return {member: 'ptr_value', type: 'void *'};
        }
        
        switch (this.realNodeTag) {
            case 'IntList': 
                return {member: 'int_value', type: 'int'};
            case 'OidList': 
                return {member: 'oid_value', type: 'Oid'};
            case 'XidList': 
                return {member: 'xid_value', type: 'TransactionId'};
        }
        
        logger.debug('failed to determine List tag for', this.name, '->elements. using ptr value');
        return {member: 'ptr_value', type: 'void *'};
    }

    protected isExpandable(): boolean {
        return !this.isEmpty();
    }

    private async findTypeForPtr() {
        /*
         * Usually pointer value in List is a Node variable (Node *),
         * but in general it can be any pointer, so declared as 'void *'.
         *
         * As such situations are more exceptional, so we treat List as
         * Node storing, but other non-Node can be identified by:
         *
         * 1. Function name + variable name (if this is top level variable)
         * 2. Structure name + member name (if this is a member of structure)
         * 
         * Such cases are only manually searched from source code - there is
         * no information at runtime.
         * 
         * To make search faster, first check member/variable name, because
         * it is cheaper than sending requests to debugger or parsing type
         * name of parent.
         */
        const defaultType = 'Node *';
        const map = this.context.specialMemberRegistry.listCustomPtrs.get(this.name);
        if (!map) {
            return defaultType;
        }

        if (!this.parent) {
            /*
             * All valid Variable objects must have 'parent' set
             * except special case 'VariablesRoot', but we are 'List',
             * not 'VariablesRoot'.
             */
            return defaultType;
        }

        let parent;
        if (this.parent instanceof VariablesRoot) {
            parent = await this.context.getCurrentFunctionName();
        } else {
            parent = dbg.getStructNameFromType(this.parent.type);
        }
        
        if (!parent) {
            return defaultType;
        }

        return map.get(parent)?.type ?? defaultType;
    }

    private async createArrayNodeElementsMember(elementsMember: RealVariable) {
        const {member, type} = await this.getListInfoSafe();
        return new ListElementsMember(this, member, type, {
            ...elementsMember.getRealVariableArgs(),
            frameId: this.frameId,
            parent: this,
            context: this.context,
        });
    }

    private async createLinkedListNodeElementsMember() {
        const {member, type} = await this.getListInfoSafe();
        return new LinkedListElementsMember(this, member, type, this.context);
    }

    override computeEffectiveType(): string {
        const declaredTag = dbg.getStructNameFromType(this.type);
        if (declaredTag !== 'List') {
            return dbg.substituteStructName(this.type, 'List');
        }
        return this.type;
    }

    private async castToList() {
        const realType = this.getType();
        const castExpression = `(${realType}) (${this.getPointer()})`;
        const response = await this.debug.evaluate(castExpression, this.frameId);
        if (!Number.isInteger(response.variablesReference)) {
            logger.warn('failed to cast', this.name, 'to List - got unexpected result:', response.result);
            return;
        }

        /* Also update type - it will be used  */
        this.variablesReference = response.variablesReference;
    }

    protected tagsMatch(): boolean {
        /* Check only for 'List' - there are no 'IntList', etc... */
        return dbg.getStructNameFromType(this.type) === 'List';
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

        const m = await this.getRealMembers();
        if (!m?.length) {
            return m;
        }

        /* 
         * Do not show implementation specific fields: head/tail for linked list
         * and initial_elements/elements (FLA) for array.
         */
        const e = m.find(v => v.name === 'elements');
        if (!e) {
            this.listElements = await this.createLinkedListNodeElementsMember();
            return [
                ...m.filter(v => !(v.name === 'head' || v.name === 'tail')),
                this.listElements,
            ];
        }

        if (!(e && e instanceof RealVariable)) {
            return m;
        }

        this.listElements = await this.createArrayNodeElementsMember(e);
        return [
            ...m.filter(v => !(v.name === 'elements' || v.name === 'initial_elements')),
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
            logger.warn('failed to obtain list size for', this.name);
            return;
        }
        
        return clampContainerLength(length);
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
    
    static isListVariable(nodetag: string) {
        return (
            nodetag === 'List' ||
            nodetag === 'IntList' ||
            nodetag === 'XidList' ||
            nodetag === 'OidList'
        );
    }
}


class ArrayVariable extends RealVariable {
    /**
     * Expression to evaluate to obtain array length.
     * Appended to target struct from right.
     * First element is length member name, but after
     * can be correction expressions i.e. '+ 1'.
     */
    info: ArrayVariableInfo;

    constructor(info: ArrayVariableInfo, args: RealVariableArgs) {
        super(args);
        this.info = info;
    }
    
    protected isExpandable(): boolean {
        /* 
         * It should be always expandable, because we might be working with
         * flexible array members
         */
        return true;
    }

    getLengthExpr() {
        const parentExpr = `((${this.parent?.type})${this.parent?.getPointer()})`;

        /* 
         * ES2021 has 'string.replaceAll' function, which perfectly suites.
         * But extension supports VS Code 1.67.0, which has only ES2020.
         * So just use 'replace' with global regexp.
         */
        const lengthExpr = this.info.lengthExpression.replace(/{}/g, parentExpr);

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
         * so we can reference parent (members) multiple times or use function
         * invocation instead of simple member.
         */
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
            if (!isEvaluationError(err)) {
                throw err;
            }

            logger.error(err, 'failed to evaluate length expr "', lengthExpr, '" for', this.name);
            return await super.doGetRealMembers();
        }

        if (!Number.isInteger(length) || length <= 0) {
            /* This covers both cases: error in 'result' and invalid length value. */
            return await super.doGetRealMembers();
        }

        /* Yes, we may have garbage, but what if the array is that huge? */
        length = clampContainerLength(length);

        const parent = unnullify(this.parent, 'this.parent');
        const memberExpr = `((${parent.type})${parent.getPointer()})->${this.info.memberName}`;
        const debugVariables = await this.debug.getArrayVariables(memberExpr,
                                                                  length, this.frameId);
        return await Variable.mapVariables(debugVariables, this.frameId, this.context,
                                           this);
    }
}

/*
 * Bitmapset variable
 */
class BitmapSetSpecialMember extends NodeVariable {
    constructor(args: RealVariableArgs) {
        super('Bitmapset', args);
    }

    async isValidSet(members: Variable[]): Promise<boolean> {
        /* This check is enough (if it exists) */
        if (this.context.hasBmsIsValidSet) {
            const expression = `bms_is_valid_set((Bitmapset *)${this.getPointer()})`;
            try {
                const response = await this.evaluate(expression);
                return this.debug.extractBool(response) ?? false;
            } catch (err) {
                if (!isEvaluationError(err)) {
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
        
        /* Fallback checking children members for validity/look normal */

        if (this.context.hasBmsNodeTag) {
            /* Check NodeTag is the most straight-forward approach */
            const nodeTag = members.find(m => m.name === 'type');
            if (nodeTag) {
                return nodeTag.value === 'T_Bitmapset';
            }
            
            this.context.hasBmsNodeTag = false;
        }
        
        /* If we do not have NodeTag, then check that member values looks normally */
        const nwords = members.find(m => m.name === 'nwords');
        if (!nwords) {
            return false;
        }
        
        const n = Number(nwords.value);

        /* 
         * For 64-bit system even 50 is large number: 50 * 64 = 3200.
         * But actually this is *potential* size, so can we allow such
         * large value - in reality it can contain only 1 element, just
         * in last word, but this acts like a pretty good correctness check.
         */
        const maxNWords = 50;
        if (Number.isNaN(n) || maxNWords <= n) {
            return false;
        }

        return true;
    }
    
    isBreakpointDangerous(bp: vscode.Breakpoint) {
        /*
         * Fastest way is just to iterate all breakpoints and check if
         * breakpoint is dangerous, meaning that if we will stop, then can
         * end up in infinite loop or precondition (state) can be violated.
         * 
         * For now such breakpoints includes all functions inside bitmapset.c -
         * main file with all Bitmapset manipulation logic.
         */
        if (!bp.enabled) {
            return false;
        }

        if (bp instanceof vscode.SourceBreakpoint) {
            return bp.location.uri.path.endsWith('bitmapset.c');
        }

        if (bp instanceof vscode.FunctionBreakpoint) {
            /*
             * All Bitmapset functions have 'bms_' prefix.
             * I can track which ones are dangerous, but if someday someone
             * will create another dangerous function then logic will be broken,
             * so add such simple check, so code will live longer.
             */
            return bp.functionName.startsWith('bms_');
        }
        
        /* Other breakpoints must be safe */
        return false;
    }
    
    safeToObserve() {
        return this.context.step.isSafeToObserveBitmapset 
            ??= !vscode.debug.breakpoints.find(this.isBreakpointDangerous);
    }

    async getSetElements(members: Variable[]): Promise<number[] | undefined> {
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
         * backend will crash.
         * 
         * Check performed using `bms_is_valid_set`, but if it
         * is missing, then check members to look normally.
         */
        if (!await this.isValidSet(members)) {
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
        const maxLength = getMaxContainerLength();
        do {
            const expression = `bms_next_member((Bitmapset *)${this.getPointer()}, ${number})`;
            try {
                const response = await this.evaluate(expression);
                number = Number(response.result);
                if (Number.isNaN(number)) {
                    logger.warn('failed to get set elements for', this.name);
                    return;
                }
            } catch (err) {
                if (!isEvaluationError(err)) {
                    throw err;
                }

                logger.error(err, 'failed to get set elements for', this.name);
                return;
            }

            if (number < 0) {
                break;
            }

            numbers.push(number);
        } while (number >= 0 && numbers.length < maxLength);

        return numbers;
    }

    private async getSetElementsFirstMember(): Promise<number[] | undefined> {
        await this.checkCanAlloc();

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
        if (this.debug.isNull(e)) {
            /* NULL means empty */
            return [];
        }

        const expression = `bms_first_member((Bitmapset *)${e.result})`;
        const maxLength = getMaxContainerLength();
        let number = -1;
        const numbers = [];
        do {
            const response = await this.evaluate(expression);
            number = Number(response.result);
            if (Number.isNaN(number)) {
                logger.warn('failed to get set elements for "', this.name, '" - got unexpected result:', response.result);
                return;
            }

            if (number < 0) {
                break;
            }

            numbers.push(number);
        } while (number >= 0 && numbers.length < maxLength);

        await this.pfree(e.result);

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
            type = this.parent.getType();
        } else {
            type = this.parent.type;
        }
        if (!(   dbg.getStructNameFromType(type) === ref.type
              && dbg.havePointersCount(type, 1))) {
            return;
        }

        return ref;
    }

    async doGetChildren() {
        /* All existing members */
        const members: Variable[] = await Variable.getVariables(this.variablesReference,
                                                                this.frameId, this.context,
                                                                this);
        if (!members?.length) {
            return members;
        }

        /* Add special members to explore set elements */
        const setMembers = await this.getSetElements(members);
        if (setMembers !== undefined) {
            const ref = await this.getBmsRef();
    
            members.push(new ScalarVariable('$length$', setMembers.length.toString(),
                                            '', this.context, this));
            members.push(new BitmapSetSpecialMember.BmsArrayVariable(this, setMembers, ref));
        }

        /* Do not show 'words' flexible array member */
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
            super(value.toString(), '', '', '', context, parent.frameId, parent);
            this.relid = value;
            this.bmsParent = bmsParent;
            this.ref = ref;
        }

        findStartElement(ref: constants.BitmapsetReference) {
            if (ref.start === 'Self') {
                return this.bmsParent.parent;
            } else if (ref.start === 'Parent') {
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
                            if (!isEvaluationError(e)) {
                                throw e;
                            }

                            member = undefined;
                        }
                    } else {
                        const members = await variable.getChildren();
                        if (members)
                        {member = members.find((v) => v.name === p);}
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
            } else if (field instanceof ArrayVariable) {
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
                }, this.bmsParent.frameId, this.context, this);
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
                    values.push(value);
                }
            }

            return values.length ? values : undefined;
        }

        protected isExpandable(): boolean {
            return this.ref !== undefined;
        }
    };

    static BmsArrayVariable = class extends Variable {
        setElements: number[];
        bmsParent: BitmapSetSpecialMember;
        constructor(parent: BitmapSetSpecialMember,
                    setElements: number[],
                    private ref?: constants.BitmapsetReference) {
            super('$elements$', '', '', '', parent.context, parent.frameId, parent);
            this.setElements = setElements;
            this.bmsParent = parent;
        }

        private createElement(index: number, value: number) {
            return new BitmapSetSpecialMember.BmsElementVariable(
                index, this, this.bmsParent,
                value, this.context, this.ref);
        }

        async doGetChildren(): Promise<Variable[] | undefined> {
            return this.setElements.map((se, i) => this.createElement(i, se));
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
    };

    static isBitmapsetType(type: string) {
        const typename = dbg.getStructNameFromType(type);
        if (typename === 'Bitmapset') {
            /* Bitmapset* */
            return dbg.havePointersCount(type, 1);
        } else if (typename === 'Relids') {
            /* Relids */
            return dbg.havePointersCount(type, 0);
        }
        return false;
    }
}

/**
 * Represents Integer, String, Boolean, Float or BitString nodes.
 * In older systems there was single 'Value' struct for them,
 * but now separate.
 * This class contains logic for handling both cases
 */
class ValueVariable extends NodeVariable {
    protected async checkNodeTagMatchType() {
        const structName = dbg.getStructNameFromType(this.type);

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
                await this.castToNodeTag(this.realNodeTag);

                /* Success */
                return;
            } catch (err: unknown) {
                if (!isEvaluationError(err)) {
                    throw err;
                }

                logger.error(err, 'could not cast type "', this.type, '" to tag', this.realNodeTag);
            }
        }

        /* 
         * Older versions of PostgreSQL has single 'Value' node which
         * contains all possible fields and decision based only on tag.
         */
        try {
            await this.castToNodeTag('Value');

            /* On success update flag indicating we have 'Value' structure */
            this.context.hasValueStruct = true;
        } catch (err) {
            if (!isEvaluationError(err)) {
                throw err;
            }

            logger.error(err, 'could not cast type "', this.type, '" to tag "Value"');
        }
    }

    async doGetChildren() {
        const children = await super.doGetChildren();
        if (!children?.length) {
            return children;
        }

        if (!this.context.hasValueStruct) {
            /* Modern pg versions already have type knowledge (distinct NodeTags) */
            return children;
        }

        const value = await this.getStringRepr();
        return [
            new ScalarVariable('$value$', value,
                               '' /* no type for this */,
                               this.context, this),
            ...children.filter(v => v.name !== 'val'),
        ];
    }

    private async getStringReprValueStruct() {
        if (this.realNodeTag === 'Null') {
            return 'NULL';
        }

        const valMember = await this.getMember('val');        
        if (!(valMember instanceof RealVariable)) {
            return '???';
        }

        if (this.realNodeTag === 'Integer') {
            return (await valMember.getMemberValueNumber('ival')).toString();
        }
        
        return await valMember.getMemberValueCharString('str');
    }
    
    private async getStringReprDistinct() {
        switch (this.realNodeTag) {
            case 'Integer':
                return (await this.getMemberValueNumber('ival')).toString();
            case 'Float':
                return await this.getMemberValueCharString('fval');
            case 'Boolean':
                return await this.getMemberValueBool('boolval') ? 'true' : 'false';
            case 'String':
                return await this.getMemberValueCharString('sval');
            case 'BitString':
                return await this.getMemberValueCharString('bsval');
            case 'Null':
                return 'NULL';
        }

        logger.warn('Unknown NodeTag for Value struct -', this.realNodeTag);
        return '$UNKNOWN$';
    }

    cachedStringRepr?: string;

    /*
     * Get string representation of given Value (or Integer/String/etc...) struct
     */
    async getStringRepr() {
        if (this.cachedStringRepr) {
            return this.cachedStringRepr;
        }
        let repr;

        /* It must be known by this time */
        if (this.context.hasValueStruct) {
            repr = await this.getStringReprValueStruct() ?? 'NULL';
        } else {
            repr = await this.getStringReprDistinct() ?? 'NULL';
        }
        
        this.cachedStringRepr = repr;
        return repr;
    }
}

async function getDefElemArgString(defElemVar: NodeVariable) {
    const arg = await defElemVar.getMember('arg');
    if (!(arg instanceof NodeVariable)) {
        logger.warn('DefElem->arg is not a Node variable, given:', arg.constructor.name);
        return;
    }

    /* see src/backend/commands/define.c:defGetString */
    if (arg instanceof ValueVariable) {
        return await arg.getStringRepr();
    }

    if (arg.realNodeTag === 'A_Star') {
        return '*';
    }
    
    if (arg.realNodeTag === 'TypeName') {
        return await formatTypeNameRepr(arg);
    }
    
    if (arg.realNodeTag === 'List' && arg instanceof ListNodeVariable) {
        /* src/backend/catalog/namespace.c:NameListToString */
        const elements = await arg.getListElements();
        if (!elements) {
            return;
        }

        const names = [];
        for (const e of elements) {
            if (e instanceof ValueVariable) {
                names.push(e.getStringRepr());
            } else if (e instanceof NodeVariable && e.realNodeTag === 'A_Star') {
                names.push('*');
            } else {
                logger.warn('unknown type in NameList of DefElem:', e.constructor.name);
            }
        }
        return names.join('.');
    }
}

/**
 * Represents Hash Table (HTAB) variable.
 */
class HTABSpecialMember extends RealVariable {
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
            parent = await this.context.getCurrentFunctionName();
            if (!parent) {
                return;
            }
        } else {
            parent = dbg.getStructNameFromType(this.parent.type);
        }

        const info = map.get(parent);
        return info?.type;
    }

    isDangerousBreakpoint(breakpoint: vscode.Breakpoint) {
        if (!breakpoint.enabled) {
            return false;
        }
        
        if (breakpoint instanceof vscode.SourceBreakpoint) {
            return breakpoint.location.uri.fsPath.endsWith('dynahash.c');
        }
        
        if (breakpoint instanceof vscode.FunctionBreakpoint) {
            return breakpoint.functionName.startsWith('hash_seq');
        }
        
        return false;
    }

    safeToObserve(): boolean {
        return this.context.step.isSafeToObserveHTAB
            ??= !vscode.debug.breakpoints.find(this.isDangerousBreakpoint);
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

        members.unshift(new HTABElementsMember(this, entryType));
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
        super('$elements$', '', '', '', htab.context, htab.frameId, htab);
        this.htab = htab;
        this.entryType = entryType;
    }

    protected isExpandable(): boolean {
        return true;
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
            return memory;
        } catch (err) {
            if (!isEvaluationError(err)) {
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
            if (!isEvaluationError(err)) {
                throw err;
            }
            /* 
             * Of course we can fail for the second time, so free allocated
             * memory, but note that thrown error can be caused by 'Step'
             * command which disables commands execution.
             */
            logger.error(err, 'failed to invoke hash_seq_init');
            await this.pfree(memory);
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
            if (!isEvaluationError(err)) {
                throw err;
            }
            
            logger.error(err, 'Could not invoke hash_seq_term');
        }

        await this.pfree(hashSeqStatus);
    }

    private async getNextHashEntry(hashSeqStatus: string): Promise<string | undefined> {
        const result = await this.evaluate(`hash_seq_search((HASH_SEQ_STATUS *)${hashSeqStatus})`);
        if (this.debug.isNull(result)) {
            return undefined;
        }
        
        return result.result;
    }

    async doGetChildren(): Promise<Variable[] | undefined> {
        const variables: Variable[] = [];
        const hashSeqStatus = await this.createHashSeqStatus();
        if (!hashSeqStatus) {
            return;
        }

        const maxLength = getMaxContainerLength();
        let entry;
        while ((entry = await this.getNextHashEntry(hashSeqStatus))) {
            let result;
            try {
                result = await this.evaluate(`(${this.entryType})${entry}`);
            } catch (err) {
                if (!isEvaluationError) {
                    throw err;
                }

                /* user can specify non-existent type */
                logger.error(err, 'Failed to create variable with type', this.entryType);
                await this.finalizeHashSeqStatus(hashSeqStatus);
                await this.pfree(hashSeqStatus);
                return undefined;
            }

            let variable;
            try {
                variable = await Variable.create({
                    ...result,
                    name: getNameForArrayElement(variables.length),
                    value: result.result,
                    memoryReference: result.memoryReference,
                }, this.frameId, this.context, this);
            } catch (error) {
                if (!isEvaluationError(error)) {
                    throw error;
                }

                await this.finalizeHashSeqStatus(hashSeqStatus);
                await this.pfree(hashSeqStatus);

                throw error;
            }

            variables.push(variable);
            if (maxLength < variables.length) {
                /* 
                 * If we terminate iteration before iteration is completed,
                 * we have to call finalizer function
                 */
                await this.finalizeHashSeqStatus(hashSeqStatus);
                break;
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
        return this.entry.type;
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

        members.unshift(new SimplehashElementsMember(this));
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
        const endOfType = index + '_hash'.length;
        if (type.length < endOfType) {
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
        const nextChar = type[endOfType];
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
        super('$elements$', '', '', '', hashTable.context, hashTable.frameId, 
              hashTable);
        this.hashTable = hashTable;
    }
    
    protected isExpandable(): boolean {
        return true;
    }

    private getHashTableType() {
        return `${this.hashTable.prefix}_hash`;
    }

    private getIteratorFunction() {
        return `${this.hashTable.prefix}_iterate`;
    }

    private getIteratorType() {
        return `${this.hashTable.prefix}_iterator`;
    }
    
    private removeFromContext() {
        /* 
         * If we can not iterate over this simplehash, i.e. because of
         * iteration function was trimmed from debug symbols, then we
         * just remove ourselves from context, so we will not be handled
         * further again.
         */
        this.context.hashTableTypes.simplehash.delete(this.hashTable.prefix);
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
            if (isEvaluationError(error)) {
                this.removeFromContext();
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
            if (!isEvaluationError(err)) {
                throw err;
            }

            await this.pfree(iteratorPtr);
            this.removeFromContext();
            return undefined;
        }

        return iteratorPtr;
    }

    async iterate(iterator: string, index: number, iterExpression: string) {
        let result;
        try {
            result = await this.evaluate(iterExpression);
        } catch (err) {
            if (!isEvaluationError(err)) {
                throw err;
            }

            this.removeFromContext();
            return undefined;
        }
        
        if (this.debug.isNull(result)) {
            return undefined;
        }

        try {
            return await Variable.create({
                ...result,
                name: getNameForArrayElement(index),
                value: result.result,
                memoryReference: result.memoryReference,
            }, this.frameId, this.context, this);
        } catch (err) {
            if (!isEvaluationError(err)) {
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

        const iterFunction = this.getIteratorFunction();
        const hashTableType = `(${this.getHashTableType()} *) ${this.hashTable.getPointer()}`;
        const iteratorArg = `(${this.getIteratorType()} *) ${iterator}`;
        const elementType = this.hashTable.elementType;
        /* Iteration expression does not change, so cache it here and pass as arg */
        const expression = `(${elementType}) ${iterFunction}(${hashTableType}, ${iteratorArg})`;
        const maxLength = getMaxContainerLength();
        const variables = [];
        let id = 0;
        let variable;
        while (   variables.length < maxLength 
               && (variable = await this.iterate(iterator, id, expression))) {
            ++id;
            variables.push(variable);
        }

        await this.pfree(iterator);
        return variables;
    }
}

/* 
 * Represents scalar integer field, that acts like value of enumeration
 * (maybe bitmask), but defined using macros instead of enum values.
 * Also, in such integer fields some parts stores some value, i.e. length.
 * Example is 't_infomask2' which stores both flags and number of attributes.
 * 
 * NOTE: it extends RealVariable (not ScalarVariable), because this member
 * can be used in 'watch' window, otherwise we can not get reference to it.
 */
class FlagsMemberVariable extends RealVariable {
    /* 
     * In a good way, we should use macros in expressions, but default debug
     * symbols (at least compiled with '-g') do not include this information,
     * so we get 'undeclared symbol' error. For this you should enable extra
     * debug symbols (i.e. for gdb use '-g3' level).
     * 
     * But even if we know numeric value of enum member and have the same
     * endianness we still have to evaluate all expressions in debugger, because
     * 1) due to another major pg version numeric values can change
     * 2) we can debug coredump collected from another machine, so we should not
     *    assume this PC is binary compatible with one that is debugged  
     */

    constructor(public bitmaskInfo: BitmaskMemberInfo, args: RealVariableArgs) {
        super(args);
    }

    protected isExpandable(): boolean {
        /* 
         * Mask values are shown in description, but for fields it is
         * more convenient to show as children elements.
         */
        return !!this.bitmaskInfo.fields?.length;
    }
    
    async getTreeItem() {
        const item = await super.getTreeItem();
        /*
         * Show original integer value in tooltip, because user may
         * want to know it, i.e. because our flags seem strange and
         * he would like to recheck.
         */
        item.tooltip = this.value;
        return item;
    }

    private async collectFlagValuesInternal(exprFormatter: (m: FlagMemberInfo) => string) {
        if (!this.bitmaskInfo.flags) {
            return;
        }
        
        const flags = [];
        
        for (const f of this.bitmaskInfo.flags) {
            const expr = exprFormatter(f);
            const result = await this.evaluate(expr);
            if (result.result === '1') {
                flags.push(f.flag);
            }
        }

        return flags;
    }

    private async collectFlagValues() {
        const flagStrategy = (f: FlagMemberInfo) => {
            return `((${this.value}) & (${f.flag})) == (${f.flag})
                        ? 1
                        : 0`;
        };

        const valueStrategy = (f: FlagMemberInfo) => {
            if (f.numeric === undefined) {
                throw new EvaluationError(`no numeric value for enum member ${f.flag}`);
            }

            return `((${this.value}) & (${f.numeric})) == (${f.numeric})
                        ? 1
                        : 0`;
        };

        if (this.context.canUseMacros) {
            try {
                return await this.collectFlagValuesInternal(flagStrategy);
            } catch (err) {
                if (!isEvaluationError(err)) {
                    throw err;
                }
                
                this.context.canUseMacros = false;
            }
        }

        return await this.collectFlagValuesInternal(valueStrategy);
    }
    
    private async collectFieldValuesInternal(exprFormatter: (m: FieldMemberInfo) => string) {
        if (!this.bitmaskInfo.fields) {
            return;
        }
        
        const fields: [string, string][] = [];
        
        for (const f of this.bitmaskInfo.fields) {
            const expr = exprFormatter(f);
            const result = await this.evaluate(expr);

            /*
             * Fields can contain '0' and it's OK, but if there is an error
             * occurred we will get Error, so 'value' must contain only valid
             * value.
             */
            fields.push([f.name, result.result]);
        }
        
        return fields;
    }
    
    private async collectFieldsValues() {
        const flagStrategy = (f: FieldMemberInfo) => {
            return `(${this.value}) & (${f.mask})`;
        };

        const valueStrategy = (f: FieldMemberInfo) => {
            if (f.numeric === undefined) {
                throw new EvaluationError(
                    `no numeric value for enum field ${f.name} of ${this.name}`);
            }

            return `(${this.value}) & (${f.numeric})`;
        };

        if (this.context.canUseMacros) {
            try {
                return await this.collectFieldValuesInternal(flagStrategy);
            } catch (err) {
                if (!isEvaluationError(err)) {
                    throw err;
                }

                this.context.canUseMacros = false;
            }
        }

        return await this.collectFieldValuesInternal(valueStrategy);
    }

    async getDescription(): Promise<string> {
        if (!this.bitmaskInfo.flags?.length) {
            return await super.getDescription();
        }

        let flagValues;
        try {
            flagValues = await this.collectFlagValues();
        } catch (err) {
            if (!isEvaluationError(err)) {
                throw err;
            }

            logger.error(err, 'failed to evaluate flags for', this.name);
            this.context.canUseMacros = false;
            return await super.getDescription();
        }
        
        /* 
         * XXX: for large amount of flags it is better to show
         * as child elements, otherwise desciption will be too long
         */
        return flagValues?.join(' | ') ?? await super.getDescription();
    }
    
    async doGetChildren() {
        if (!this.bitmaskInfo.fields?.length) {
            return [];
        }
        
        try {
            const fields = await this.collectFieldsValues();
            return fields?.map(([name, value]) => 
                new ScalarVariable(name, value, '', this.context, this)) ?? [];
        } catch (err) {
            if (!isEvaluationError(err)) {
                throw err;
            }

            logger.error(err, 'failed to evaluate fields for', this.name);
            this.context.canUseMacros = false;
            return [];
        }
    }
}

function pgVersionIsValid(version: number) {
    /*
     * PG_VERSION_NUM is a 6 digit number in form: MAJOR_MINOR_PATCH,
     * so perform not only Integer check, but also a value range.
     */
    return Number.isInteger(version) && 1_00_00 < version && version < 99_99_99;
}

export class PgVariablesViewProvider implements vscode.TreeDataProvider<Variable>, vscode.Disposable {
    constructor(private config: Configuration) { }
    
    /**
     * ExecContext used to pass to all members.
     * 
     * Field is set on first 'getChildren' invocation.
     */
    context?: ExecContext;

    /* 
     * Interface to access extension-specific debugger features.
     * 
     * Set during debug-session, and 'undefined' when there is no debugging.
     */
    debug?: dbg.GenericDebuggerFacade;

    /* https://code.visualstudio.com/api/extension-guides/tree-view#updating-tree-view-content */
    private _onDidChangeTreeData = new vscode.EventEmitter<void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
    refresh(): void {
        this.context?.step.reset();
        this._onDidChangeTreeData.fire();
    }

    private _onDidDebugStart = new vscode.EventEmitter<ExecContext>();
    /*
     * Emitted when debug session started and we return data.
     * Passes obtained PG version.
     */
    readonly onDidDebugStart = this._onDidDebugStart.event;

    startDebugging(debug: dbg.GenericDebuggerFacade) {
        this.debug?.dispose();
        this.debug = debug;
        this.context = undefined;
    }
    
    isInDebug() {
        return this.debug !== undefined;
    }
    
    stopDebugging() {
        this.debug?.dispose();
        this.debug = undefined;
        this.context = undefined;
        /* Clean variables view if any */
        this._onDidChangeTreeData.fire();
    }

    async getTreeItem(variable: Variable) {
        return variable.getTreeItem();
    }
    
    getDebug() {
        return unnullify(this.debug, 'this.debug');
    }

    async initializeExecContextFromConfig(nodeVars: NodeVarRegistry,
                                          specialMembers: SpecialMemberRegistry,
                                          hashTables: HashTableTypes) {
        const config = await this.config.getVariablesConfiguration();
        if (!config) {
            return;
        }
        
        if (config.arrays?.length) {
            logger.debug('adding', config.arrays.length, 'arrays from config file');
            try {
                specialMembers.addArrays(config.arrays);
            } catch (err) {
                logger.error(err, 'could not add custom array special members');
            }
        }

        if (config.aliases?.length) {
            logger.debug('adding', config.aliases.length, 'aliases from config file');
            try {
                nodeVars.addAliases(config.aliases);
            } catch (err) {
                logger.error(err, 'could not add aliases from configuration');
            }
        }

        if (config.customListTypes?.length) {
            logger.debug('adding', config.customListTypes.length, 'custom list types');
            try {
                specialMembers.addListCustomPtrSpecialMembers(config.customListTypes);
            } catch (err) {
                logger.error(err, 'error occurred during adding custom List types');
            }
        }

        if (config.htab?.length) {
            logger.debug('adding', config.htab.length, 'htab types');
            try {
                hashTables.addHTABTypes(config.htab);
            } catch (err) {
                logger.error(err, 'error occurred during adding custom HTAB types');
            }
        }

        if (config.simplehash?.length) {
            logger.debug('adding', config.simplehash.length, 'simplehash types');
            try {
                hashTables.addSimplehashTypes(config.simplehash);
            } catch (err) {
                logger.error(err, 'error occurred during adding custom simple hash table types');
            }
        }
        
        if (config.enums?.length) {
            logger.debug('adding', config.enums.length, 'enum bitmask types');
            try {
                specialMembers.addFlagsMembers(config.enums);
            } catch (err) {
                logger.error(err, 'error occurred during adding enum bitmask types');
            }
        }

        if (config.nodetags?.length) {
            logger.debug('adding', config.nodetags.length, 'custom NodeTags');
            try {
                for (const tag of config.nodetags) {
                    nodeVars.nodeTags.add(tag);
                }
            } catch (err) {
                logger.error(err, 'could not add custom NodeTags');
            }
        }
    }

    async tryGetServerVersionNumGuc(frameId: number) {
        const result = await this.getDebug().evaluate('server_version_num', frameId);
        const pgversion = Number(result.result);
        if (!pgVersionIsValid(pgversion)) {
            logger.warn('"server_version_num" is not valid, evaluated:', result.result);
            return undefined;
        }

        return pgversion;
    }
    
    async tryGetPgVersionNumPgConfig() {
        const path = getWorkspacePgSrcFile(
            getWorkspaceFolder(), 'src', 'include', 'pg_config.h');
        
        let text;
        try {
            const doc = await vscode.workspace.openTextDocument(path);
            text = doc.getText();
        } catch (err) {
            logger.error(err, 'could not open pg_config.h file', path.fsPath);
            return;
        }
    
        /*
         * Assume there are no other entries with the same name
         * in the generated pg_config.h file, so no check in loop.
         */
        const macro = 'PG_VERSION_NUM';
        const macroIndex = text.indexOf(macro);
        if (macroIndex === -1) {
            return;
        }
        
        /* Next character must be space, so skip it right away */
        let start = macroIndex + macro.length + 1;
        while (   start < text.length
               && isSpace(text[start])) {
            start++;
        }
    
        let end = start + 1;
        while (   end < text.length
               && !isSpace(text[end])) {
            end++;
        }
        
        const versionString = text.substring(start, end);
        const version = Number(versionString);
        if (!pgVersionIsValid(version)) {
            logger.warn('parsed PG_VERSION_NUM "', versionString, '" is not valid');
            return;
        }
        
        return version;
    }

    async createExecContext(pgversion: number | undefined): Promise<ExecContextData> {
        const specialMembers = new SpecialMemberRegistry();
        specialMembers.addArrays(constants.getArrays());
        specialMembers.addListCustomPtrSpecialMembers(constants.getKnownCustomListPtrs());
        
        const hashTables = new HashTableTypes();
        hashTables.addHTABTypes(constants.getWellKnownHTABTypes());
        
        const nodeVars = new NodeVarRegistry();
        
        /* Version specific initialization */
        if (pgversion) {
            if (10_00_00 <= pgversion) {
                hashTables.addSimplehashTypes(constants.getWellKnownSimpleHashTableTypes());
            }

            /* 
             * Initialize flags only if we know PostgreSQL version for sure,
             * otherwise we will lead developer in the wrong way - this is
             * even worse.
             */
            specialMembers.addFlagsMembers(constants.getWellKnownFlagsMembers(pgversion));
        } else {
            hashTables.addSimplehashTypes(constants.getWellKnownSimpleHashTableTypes());
        }

        this.initializeExecContextFromConfig(nodeVars, specialMembers, hashTables);
        
        return {
            specialMembers,
            hashTables,
            nodeVars,
        };
    }

    /* 
     * Cached pair [Cached type info, PG version] from previous run.
     * Can be used only if configuration file have not changed since previous run.
     */
    private cachedTypes?: [ExecContextData, number];

    tryGetCache(pgversion: number) {
        /*
         * We can use cache only if configuration have not changed AND 
         * we are debugging the same PG version (executable type may not
         * be checked).
         */
        if (   this.cachedTypes?.[1] === pgversion
            && !this.config.isDirty()) {
            return this.cachedTypes[0];
        }
    }

    async getDebugContext(frameId: number) {
        /* 
         * For correct initialization we must know PG version, so
         * some version-dependent type information is initialized
         * correctly.
         * 
         * Also, in some cases we must know which executable we are
         * debugging: 'postgres' server or frontend utility.
         * 
         * We derive executable type from the place where we got
         * pg version, because "server_version_num" is only available
         * at the server.
         */
        let pgversion;

        try {
            pgversion = await this.tryGetServerVersionNumGuc(frameId);
        } catch (err) {
            /* Do not check EvaluationError - fallback to parsing pg_config.h */
            logger.error(err, 'could not get "server_version_num" GUC');
        }

        if (pgversion) {
            return {
                pgversion,
                isServer: true,
            };
        }
        
        try {
            pgversion = await this.tryGetPgVersionNumPgConfig();
        } catch (err) {
            logger.error(err, 'could not parse pg_config.h file for PG_VERSION_NUM');
        }

        if (pgversion) {
            return {
                pgversion,
                isServer: false,
            };
        }

        /*
         * This is a safe default value which will disable many features
         * and make our work more "safe", because we will not touch many
         * things.
         */
        return {
            pgversion: undefined,
            isServer: false,
        };
    }
    
    async getExecContext(frameId: number) {
        let data: ExecContextData | undefined;
        const {pgversion, isServer} = await this.getDebugContext(frameId);

        if (pgversion) {
            logger.info('detected PostgreSQL version:', pgversion);
            data = this.tryGetCache(pgversion);
        } else {
            logger.warn('could not detect PostgreSQL version');
        }

        if (!data) {
            data = await this.createExecContext(pgversion);

            /* Store cache */
            if (pgversion) {
                this.cachedTypes = [data, pgversion];
            }
        }

        const exeType = isServer ? ExecutableType.Server : ExecutableType.Frontend;
        const context = new ExecContext(this.getDebug(), data, pgversion, exeType);
        if (pgversion) {
            context.adjustProperties(pgversion);
            this._onDidDebugStart.fire(context);
        }

        return context;
    }

    private async getChildrenInternal(element?: Variable | undefined) {
        if (element) {
            return await element.getChildren();
        }

        const frameId = await this.getDebug().getCurrentFrameId();
        if (frameId == undefined) {
            return;
        }

        if (!this.context) {
            this.context = await this.getExecContext(frameId);
        }

        const variables = await this.getTopLevelVariables(this.context, frameId);
        if (!variables) {
            return variables;
        }

        const root = new VariablesRoot(variables, this.context);
        variables.forEach(v => v.parent = root);
        return variables;
    }

    async getChildren(element?: Variable | undefined) {
        if (!this.debug) {
            return;
        }

        try {
            return await this.getChildrenInternal(element);
        } catch (err) {
            if (!(err instanceof Error)) {
                throw err;
            }

            /* 
             * There may be race condition when our state of debugger 
             * is 'ready', but real debugger is not, so we can not send
             * commands to debugger.
             * Such cases include debugger detach, continue after
             * breakpoint or the case when 'PG Variables' view reveals
             * when user start debug session.
             * 
             * In such cases we return empty array, so view will be cleared.
             */
            if (err instanceof DebuggerNotAvailableError) {
                return;
            }

            /* 
             * It would be better to just log error, otherwise if we re-throw
             * then user will see error popup and just freeze without
             * understanding where this error comes from.
             */
            logger.error(err, 'error occurred during obtaining members');
            return;
        }
    }

    async getTopLevelVariables(context: ExecContext, frameId: number) {
        const variables = await context.debug.getVariables(frameId);
        return await Variable.mapVariables(variables, frameId, context, undefined);
    }
    
    dispose() {
        this.stopDebugging();
        this._onDidChangeTreeData.dispose();
    }
}

function isSpace(char: string) {
    return char === ' ' || char === '\t' || char === '\n';
}

function isIdentifierChar(char: string) {
    return    ('a' <= char && char <= 'z') || ('A' <= char && char <= 'Z')
           || char === '_' /* put it here, because underscore is more common, than digit */
           || ('0' <= char && char <= '9');
}

export async function parseNodeTagsFile(file: vscode.Uri) {
    let content;
    try {
        logger.debug('opening NodeTag file', file.fsPath);
        const document = await vscode.workspace.openTextDocument(file);
        content = document.getText();
    } catch (error) {
        logger.error(error, 'could not open NodeTags file', file.fsPath);
        return;
    }

    logger.debug('parsing contents of NodeTag file', file.fsPath);
    const nodeTags: string[] = [];
    let prefixIndex = undefined;
    while ((prefixIndex = content.indexOf('T_', prefixIndex)) !== -1) {
        /* Check this is start of identifier (not false positive) */
        if (prefixIndex > 0 && !isSpace(content[prefixIndex - 1])) {
            prefixIndex += 2;
            continue;
        }

        /* Search for end of identifier */
        let endOfIdent = prefixIndex + 2;
        while (endOfIdent < content.length && isIdentifierChar(content[endOfIdent])) {
            endOfIdent++;
        }

        /* End of file - should not happen */
        if (content.length <= endOfIdent) {
            break;
        }

        const tag = content.substring(prefixIndex + 2, endOfIdent);
        nodeTags.push(tag);
        prefixIndex = endOfIdent + 1;
    }
    
    return new Set(nodeTags);
}

export async function dumpNodeVariableToLogCommand(pgvars: PgVariablesViewProvider,
                                                   ...args: unknown[]) {
    if (!pgvars.context) {
        return;
    }

    const session = vscode.debug.activeDebugSession;
    if (!session) {
        vscode.window.showWarningMessage('Can not dump variable - no active debug session!');
        return;
    }
    const debug = pgvars.context.debug;
    if (!debug) {
        logger.warn('context.debug is undefined, but debug session is active');
        return;
    }

    if (!(typeof args === 'object' && args !== null && 'variable' in args)) {
        return;
    }

    const variable = args.variable as dap.DebugVariable;
    const frameId = await debug.getCurrentFrameId();
    if (frameId === undefined) {
        logger.warn('could not get current frame id');
        return;
    }

    const expression = `pprint((const void *) ${debug.getPointer(variable)})`;
    logger.info('executing pprint');
    await debug.evaluate(expression,
                         frameId, 
                         undefined  /* context */, 
                         true       /* no return */);
}

function isDebugVariable(o: unknown): o is dap.DebugVariable {
    return    (typeof o === 'object' && !!o)
           && ('name' in o && typeof o.name === 'string' && o.name.length > 0)
           && ('value' in o && typeof o.value === 'string' && o.value.length > 0)
           && ('type' in o && typeof o.type === 'string' && o.type.length > 0);
}

export async function dumpNodeVariableToDocumentCommand(pgvars: PgVariablesViewProvider,
                                                        ...args: unknown[]) {
    if (!pgvars.context?.debug) {
        return;
    }
    
    if (!args?.length) {
        return;
    }

    let variable: dap.DebugVariable;

    /*
     * Command can be run for 'Variable' or 'pg variables' views,
     * so use a common denominator.
     */
    const arg = args[0];
    if (arg instanceof Variable) {
        const nodeVar = args;
        if (!(nodeVar instanceof NodeVariable)) {
            return;
        }

        variable = {
            name: nodeVar.name,
            type: nodeVar.type,
            value: nodeVar.value,
            variablesReference: nodeVar.variablesReference,
            memoryReference: nodeVar.memoryReference,
        };
    } else if (   !!args && typeof args === 'object'
               && 'variable' in args && isDebugVariable(args.variable)) {
        variable = args.variable;
    } else {
        logger.warn('could not get DebugVariable from given "args" =', args);
        return;
    }

    const session = vscode.debug.activeDebugSession;
    if (!session) {
        return;
    }

    const debug = pgvars.context.debug;
    const frameId = await debug.getCurrentFrameId();
    if (frameId === undefined) {
        vscode.window.showWarningMessage(`Could not get current stack frame id to invoke functions`);
        return;
    }

    let response;

    /* 
     * In order to make node dump we use 2 functions:
     * 
     * 1. 'nodeToStringWithLocations' - dump arbitrary node object into string form
     * 2. 'pretty_format_node_dump' - prettify dump returned from 'nodeToString'
     * 
     * This sequence is well known and also used in 'pprint' itself, so feel
     * free to use it.
     */
    const nodeToStringExpr = `nodeToStringWithLocations((const void *) ${debug.getPointer(variable)})`;
    response = await debug.evaluate(nodeToStringExpr, frameId);

    /* Save to call pfree later */
    const savedNodeToStringPtr = response.memoryReference;

    const prettyFormatExpr = `pretty_format_node_dump((const char *) ${response.memoryReference})`;
    response = await debug.evaluate(prettyFormatExpr, frameId);

    const debugVariable: dbg.IDebugVariable = {
        type: response.type,
        value: response.result,
        memoryReference: response.memoryReference,
    };
    const ptr = debug.extractPtrFromString(debugVariable);
    const node = await debug.extractLongString(debugVariable, frameId);

    /*
     * Perform pfree'ing ONLY after extracting string, otherwise there will
     * be garbage '\\177' in string buffer.
     */
    try {
        await debug.evaluate(`pfree((const void *) ${ptr})`, frameId,
                             undefined, true);
        await debug.evaluate(`pfree((const void *) ${savedNodeToStringPtr})`, frameId,
                             undefined, true);           
    } catch (err: unknown) {
        if (!isEvaluationError(err)) {
            throw err;
        }

        logger.error(err, 'could not dump variable', variable.name, 'to log');
        
        /* continue - this is not critical error for dump logic */
    }

    if (node === null) {
        vscode.window.showErrorMessage('Could not obtain node dump: NULL is returned from nodeToString');
        return;
    }

    /* 
     * Finally, show document with node dump.  It would be nice to also set
     * appropriate title, but I don't known how to do it without saving file.
     */
    const document = await vscode.workspace.openTextDocument({content: node});
    vscode.window.showTextDocument(document);
}

export function refreshVariablesCommand(pgvars: PgVariablesViewProvider) {
    pgvars.refresh();
}

export async function addVariableToWatchCommand(...args: unknown[]) {
    if (!args.length) {
        return;
    }
    
    const variable = args[0];
    if (!(variable instanceof Variable)) {
        logger.warn('given argument is not Variable type:', variable);
        return;
    }

    const expr = await variable.getUserWatchExpression();
    if (!expr) {
        return;
    }

    await vscode.commands.executeCommand('debug.addToWatchExpressions', {
        variable: {
            evaluateName: expr,
        },
    });
}
