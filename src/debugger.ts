import * as vscode from 'vscode';
import * as dap from "./dap";
import { Features, ILogger } from './utils';
import { NodePreviewTreeViewProvider } from './extension';
import {EvaluationError} from './error';

export interface IDebugVariable {
    value: string;
    type: string;
    memoryReference?: string;
}

const pointerRegex = /^0x[0-9abcdef]+$/i;
const nullRegex = /^0x0+$/i;
const builtInTypes = new Set([
    /* Standard builtin C types */
    'char', 'short', 'int', 'long', 'double', 'float', '_Bool', 'void',
    'uintptr_t',

    /* src/include/c.h */
    'int8', 'int16', 'int32', 'uint8', 'uint16', 'uint32',
    'bits8', 'bits16', 'bits32', 'int64', 'uint64', 'int128', 'uint128',
    'Size', 'size_t', 'Index', 'Offset', 'float4', 'float8', 'Oid',
    'regproc', 'RegProcedure', 'TransactionId', 'SubTransactionId',
    'MultiXactId', 'MultiXactOffset', 'CommandId',

    /* src/include/postgres.h */
    'Datum',
    
    /* src/include/nodes/nodes.h */
    'Cost', 'Selectivity', 'Cardinality', 'ParseLoc', 'NodeTag'
]);

export enum DebuggerType {
    CppDbg,
    CodeLLDB
}

export interface IDebuggerFacade {
    /**
     * Type of the debugger in use.
     *
     * As they are fixed (not dynamically created or something) we can
     * safely define enumeration and use across the codebase.
     */
    readonly type: DebuggerType;

    /* TODO: specific expression when debugger is unavailable - not 'stopped' mode */
    /**
     * Evaluate generic C code expression
     * 
     * @param expression Expression to evaluate
     * @param frameId At which frame to evaluate expression
     * @param context @see {@link dap.EvaluateArguments.context}
     * @param noReturn 'true' if function is known to be 'void' returning,
     *                  otherwise some debuggers will throw error in such cases
     *                  like CodeLLDB. Default - 'false'.
     * @returns Result of evaluation
     * @throws @see {@link error.EvaluationError} if evaluation failed
     */
    evaluate: (expression: string, frameId: number | undefined,
               context?: string, noReturn?: boolean) => Promise<dap.EvaluateResponse>;
    getVariables: (frameId: number) => Promise<dap.DebugVariable[]>;
    getMembers: (variablesReference: number) => Promise<dap.DebugVariable[]>;
    getTopStackFrameId: (threadId: number) => Promise<number | undefined>;
    getCurrentFrameId: () => Promise<number | undefined>;
    getSession: () => vscode.DebugSession;
    getArrayVariables: (expression: string, length: number,
                        frameId: number | undefined) => Promise<dap.DebugVariable[]>;
    getCurrentFunctionName: () => Promise<string | undefined>;

    /* Utility functions with per debugger specifics */
    /**
     * Get pointer for location of this variable
     */
    getPointer: (variable: IDebugVariable) => string | undefined;

    /**
     * 
     * @param variable Variable to test pointer for
     * @returns true if variable's pointer is NULL, otherwise false
     */
    isNull: (variable: IDebugVariable | dap.EvaluateResponse) => boolean;

    /**
     * Check provided pointer value represents valid value.
     * That is, it can be dereferenced.
     * 
     * @param variable Variable to test
     * @returns Pointer value is valid and not NULL
     */
    isValidPointerType: (variable: IDebugVariable | dap.EvaluateResponse) => boolean;

    /**
     * Check that variable represents value struct - structure stored in place,
     * not pointer to struct, i.e. allocated on stack or embedded into another
     * structure.
     * 
     * NOTE: naming is taken from .NET, where we have value/pointer structures
     * (struct/class accordingly).
     * 
     * @param variable Variable to test
     * @param type Type of variable if real type may differ from declared
     * @returns true if variable is value struct
     */
    isValueStruct: (variable: IDebugVariable, type?: string) => boolean;

    /**
     * Check that variable represents scalar type, i.e. 'int' of 'char'.
     * 
     * @param variable Variable to test
     * @param type Additional type for cases when it can differ
     * @returns true if variable represents builtin scalar type
     */
    isScalarType: (variable: IDebugVariable, type?: string) => boolean;

    /**
     * Check that variable's type is fixed size array, not VLA
     * 
     * @param variable Variable to test
     * @returns true if variable's type is array of fixed size
     */
    isFixedSizeArray: (variable: IDebugVariable) => boolean;

    /**
     * For given variable with string type extract string it represents.
     * 'null' is returned if failed to extract it.
     * For 'NULL' variable it returns empty string.
     * 
     * @param variable Variable with string type
     * @returns String it contains, without quotes, or null if failed.
     */
    extractString: (variable: IDebugVariable | dap.EvaluateResponse) => string | null;

    /**
     * For given variable with string type extract string it represents.
     * All debuggers do not return full string, but instead they truncate
     * it. This function attempts to read the full string (observing chunk
     * by chunk).
     * 
     * @param variable Variable with string type
     * @returns Full string it contains, without quotes, or null if failed
     */
    extractLongString: (variable: IDebugVariable, frameId: number) => Promise<string | null>;

    /**
     * For given variable with 'bool' type extract it's value with converting
     * to 'boolean' TS type.
     * 'null' is returned if failed to extract it.
     * 
     * @param variable Variable of boolean type
     * @returns 'boolean' - stored value, or 'null' if failed to obtain result
     */
    extractBool: (variable: IDebugVariable | dap.EvaluateResponse) => boolean | null;

    /**
     * For given string variable extract it's pointer. This primarily used
     * for CppDbg extension, where string and pointer stored in 'value' member
     * together.
     * 'null' is returned if failed to obtain pointer.
     * 
     * @param variable Variable of string type
     * @returns String representing pointer value
     */
    extractPtrFromString: (variable: IDebugVariable | dap.EvaluateResponse) => string | null;

    /**
     * Format passed enum value in form which is acceptable for specific. debugger.
     * 
     * @param name Name of enum
     * @param value Value of enum as identifier
     * @returns String representation of enum value to use in expressions
     */
    formatEnumValue: (name: string, value: string) => string;
}
export abstract class GenericDebuggerFacade implements IDebuggerFacade, vscode.Disposable {
    registrations: vscode.Disposable[];

    isInDebug: boolean;
    session: vscode.DebugSession | undefined;

    /**
     * Cached id of postgres thread.
     * As pg have single-threaded/multi-process execution model
     * we do not bother tracking multiple threads.
     */
    threadId?: number;

    constructor(public logger: ILogger) {
        this.registrations = [
            /* Update current debug session data */
            vscode.debug.onDidStartDebugSession(s => {
                this.session = s;
                this.isInDebug = true;
            }),
            vscode.debug.onDidTerminateDebugSession(_ => {
                this.session = undefined;
                this.isInDebug = false;
                this.threadId = undefined;
            }),

            /* Invalidate function names cache */
            vscode.debug.onDidReceiveDebugSessionCustomEvent(e => {
                switch (e.event) {
                    case 'stopped':
                        this.threadId = undefined;
                        /* fallthrough */
                    case 'continued':
                        break;
                }
            })
        ];

        this.session = vscode.debug.activeDebugSession;
        this.isInDebug = vscode.debug.activeDebugSession !== undefined;
    }

    private async getThreadId() {
        if (this.threadId) {
            return this.threadId;
        }

        const threads: dap.ThreadsResponse = await this.getSession().customRequest('threads');
        if (!threads) {
            throw new Error('Failed to obtain threads from debugger');
        }
        const threadId = threads.threads[0].id;
        this.threadId = threadId;

        return threadId;
    }

    async getArrayVariables(array: string, length: number,
                            frameId: number | undefined) {
        const variables: dap.DebugVariable[] = [];
        for (let i = 0; i < length; i++) {
            const expression = `(${array})[${i}]`;
            const evalResponse = await this.evaluate(expression, frameId);
            const variable = {
                evaluateName: expression,
                memoryReference: evalResponse.memoryReference,
                name: `[${i}]`,
                type: evalResponse.type,
                value: evalResponse.result,
                variablesReference: evalResponse.variablesReference
            } as dap.DebugVariable;
            variables.push(variable);
        }
        return variables;
    }

    getCurrentFrameId = async () => {
        /* debugFocus API */
        return (vscode.debug.activeStackItem as vscode.DebugStackFrame | undefined)?.frameId;
    };

    switchToEventBasedRefresh() {
        this.getCurrentFrameId = async () => {
            /*
             * We can not track selected stack frame - return last (top)
             */
            if (!this.isInDebug) {
                return;
            }

            const threadId = await this.getThreadId();
            return await this.getTopStackFrameId(threadId);
        };
    }

    getSession(): vscode.DebugSession {
        if (this.session !== undefined) {
            return this.session;
        }

        this.session = vscode.debug.activeDebugSession;
        if (this.session === undefined) {
            this.isInDebug = false;
            throw new Error('No active debug session');
        }

        return this.session;
    }

    async getCurrentFunctionName() {
        const threadId = await this.getThreadId();

        /* 
         * In most cases we want to get current function (on top of call stack),
         * but if we have DebugFocus feature, then user can choose other stack
         * frame.
         * 
         * There is some trouble with it - returned frameId can be generated
         * each time we make request. But there is observation, that frameId
         * obtained from 'vscode.debug.activeStackItem' can be used to calculate
         * index of frame in 'stackFrames' DAP request.
         */
        let frameIndex;
        if (Features.debugFocusEnabled()) {
            const index = await this.getCurrentFrameId();
            if (index) {
                frameIndex = this.maybeCalcFrameIndex(index) ?? 0;
            } else {
                frameIndex = 0;
            }
        } else {
            frameIndex = 0;
        }

        const st = await this.getStackTrace(threadId, 1, frameIndex);
        if (!(st && 0 < st.stackFrames?.length)) {
            return;
        }

        const frame = st.stackFrames[0];

        /* cppdbg additionally formats function name: lib.so!func(args) */

        /* Remove arguments from function name */
        let name = frame.name;
        const argsIdx = name.indexOf('(');
        if (argsIdx !== -1) {
            name = name.substring(0, argsIdx);
        }

        /* Remove shlib prefix */
        const shlibPrefix = name.indexOf('!');
        if (shlibPrefix !== -1) {
            name = name.substring(shlibPrefix + 1);
        }

        return name;
    }

    async getScopes(frameId: number): Promise<dap.Scope[]> {
        const response: dap.ScopesResponse = await this.getSession()
            .customRequest('scopes', { frameId } as dap.ScopesArguments);
        return response.scopes;
    }

    private async getStackTrace(threadId: number, levels?: number, startFrame?: number) {
        return await this.getSession().customRequest('stackTrace', {
            threadId,
            levels,
            startFrame
        } as dap.StackTraceArguments) as dap.StackTraceResponse;
    }

    async getMembers(variablesReference: number): Promise<dap.DebugVariable[]> {
        const response: dap.VariablesResponse = await this.getSession()
            .customRequest('variables', {
                variablesReference
            } as dap.VariablesArguments);
        return response.variables;
    }

    async getVariables(frameId: number): Promise<dap.DebugVariable[]> {
        const scopes = await this.getScopes(frameId);
        if (scopes === undefined) {
            return [];
        }

        const variables: dap.DebugVariable[] = [];

        /* 
         * Show only Locals - not Registers. Also do not
         * use 'presentationHint' - it might be undefined
         * in old versions of VS Code.
         */
        for (const scope of scopes.filter(this.shouldShowScope)) {
            const members = await this.getMembers(scope.variablesReference);
            variables.push(...members);
        }
        return variables;
    }

    async getTopStackFrameId(threadId: number): Promise<number | undefined> {
        const response: dap.StackTraceResponse = await this.getStackTrace(threadId, 1);
        return response.stackFrames?.[0]?.id;
    }

    isFixedSizeArray(variable: IDebugVariable) {
        /*
        * Find pattern: type[size]
        * But not: type[] - VLA is not expanded.
        * Here we use fact, that 'type[size]' differs from 'type[]' by
        * penultimate character - for VLA this must be '['.
        * 
        */
        if (variable.type.length < 2) {
            return false;
        }

        if (variable.type[variable.type.length - 1] !== ']') {
            return false;
        }
        
        if (variable.type[variable.type.length - 2] === '[') {
            return false;
        }

        return true;
    }

    isScalarType(variable: IDebugVariable, type?: string) {
        return builtInTypes.has(type ?? variable.type);
    }

    getPointer(variable: IDebugVariable) {
        return variable.memoryReference ?? variable.value;
    }

    protected getValue(variable: IDebugVariable | dap.EvaluateResponse) {
        return 'value' in variable ? variable.value : variable.result;
    }

    dispose() {
        this.registrations.forEach(r => r.dispose());
        this.registrations.length = 0;
    }

    /**
     * Utility function used in getFunctionName, that computes index
     * of frame basing of it's frameId.
     */
    abstract readonly type: DebuggerType;
    abstract maybeCalcFrameIndex(frameId: number): number | undefined;
    abstract shouldShowScope(scope: dap.Scope): boolean;
    abstract evaluate(expression: string, frameId: number | undefined, context?: string): Promise<dap.EvaluateResponse>;
    abstract isNull(variable: IDebugVariable | dap.EvaluateResponse): boolean;
    abstract isValidPointerType(variable: IDebugVariable | dap.EvaluateResponse): boolean;
    abstract isValueStruct(variable: IDebugVariable, type?: string): boolean;
    abstract extractString(variable: IDebugVariable | dap.EvaluateResponse): string | null;
    abstract extractBool(variable: IDebugVariable | dap.EvaluateResponse): boolean | null;
    abstract extractPtrFromString(variable: IDebugVariable | dap.EvaluateResponse): string | null;
    abstract formatEnumValue(name: string, value: string): string;
    abstract extractLongString(variable: IDebugVariable, frameId: number): Promise<string | null>;
}

export class CppDbgDebuggerFacade extends GenericDebuggerFacade {
    type = DebuggerType.CppDbg;
    
    shouldShowScope(scope: dap.Scope): boolean {
        return scope.name === 'Locals';
    }

    getArrayVariables = async (array: string, length: number,
                               frameId: number | undefined) => {
        const expression = `${array}, ${length}`;
        const evalResponse = await this.evaluate(expression, frameId);
        if (!evalResponse?.variablesReference) {
            return [];
        }

        return await this.getMembers(evalResponse.variablesReference);
    };

    switchToManualArrayExpansion() {
        this.getArrayVariables = super.getArrayVariables;
    }
    
    async evaluate(expression: string, frameId: number | undefined, context?: string) {
        context ??= 'watch';
        const response: dap.EvaluateResponse = await this.getSession().customRequest('evaluate', {
            expression,
            context,
            frameId
        } as dap.EvaluateArguments);

        if (this.isFailedVar(response)) {
            throw new EvaluationError(response.result);
        }

        return response;
    }

    async getMembers(variablesReference: number): Promise<dap.DebugVariable[]> {
        const response: dap.VariablesResponse = await this.getSession()
            .customRequest('variables', {
                variablesReference
            } as dap.VariablesArguments);
        return response.variables;
    }

    isFailedVar(response: dap.EvaluateResponse): boolean {
        /* 
        * gdb/mi has many error types for different operations.
        * In common - when error occurs 'result' has message in form
        * 'OPNAME: MSG':
        * 
        *  - OPNAME - name of the failed operation
        *  - MSG - human-readable error message
        * 
        * When we send 'evaluate' command this VS Code converts it to
        * required command and when it fails, then 'result' member
        * contains error message. But if we work with variables (our logic),
        * OPNAME will be '-var-create', not that command, that VS Code sent.
        * 
        * More about: https://www.sourceware.org/gdb/current/onlinedocs/gdb.html/GDB_002fMI-Variable-Objects.html
        */
        return response.result.startsWith('-var-create');
    }

    isNull(variable: IDebugVariable | dap.EvaluateResponse) {
        return this.getValue(variable) === '0x0';
    }

    isValidPointerType(variable: IDebugVariable | dap.EvaluateResponse) {
        return pointerRegex.test(this.getValue(variable)) && !this.isNull(variable);
    }

    isValueStruct(variable: IDebugVariable, type?: string) {
        /* Top level variable */
        if (variable.value === '{...}') {
            return true;
        }

        /* Embedded structure (also check for flexible array member) */
        if (variable.value === '' && !(type ?? variable.type).endsWith('[]')) {
            return true;
        }

        return false;
    }

    extractString(variable: IDebugVariable | dap.EvaluateResponse) {
        const value = this.getValue(variable);
        const left = value.indexOf('"');
        const right = value.lastIndexOf('"');
        if (left === -1 || left === right) {
            /* No STR can be found */
            return null;
        }

        return value.substring(left + 1, right);
    }

    override async extractLongString(variable: IDebugVariable, frameId: number): Promise<string | null> {
        const isStringTruncated = (response: string) => {
            /* 
             * Rendered truncated string has '...' at the very end, not in
             * string value itself, so check 'result' member.
             */
            return response.endsWith('...');
        };

        const normalize = (str: string) => {
            /* Replace escape characters */
            str = str.replace(/\\n/g, '\n');
            str = str.replace(/\\t/g, '\t');
            str = str.replace(/\\"/g, '"');

            /*
             * Now find shortages in form <repeats XXX times> and replace with
             * actual values.  Thankfully, here we only have spaces repeated
             * (haven't seen any other values yet).  Also, remember that
             * repeated parts can be located in any part of string, so add
             * (", )? checks for such cases.
             */
            let exec;
            while ((exec = /(", )?' ' <repeats (\d+) times>(, ")?/m.exec(str)) !== null) {
                let times;
                if (exec.length > 2) {
                    times = Number(exec[2]);
                } else {
                    times = Number(exec[1]);
                }

                if (!Number.isInteger(times)) {
                    return str;
                }

                str = str.replace(exec[0], ' '.repeat(times));
            }
            
            return str;
        };

        const extractStringExtended = (value: string) => {
            /* 
             * Original 'extractString' does not handle leading/trailing
             * <repeats XXX> chunks and this is fatal when parsing node dumps
             * because it has lots of spaces which are turned into such
             * repeats.
             * 
             * This is special version that just do not truncate such shortcuts
             * if they are placed in start/end of string.
             * 
             * I am not planning to replace original function with this, because
             * currently this is only place where we must be aware of such
             * behavior.
             */

            /* Trim pointer part */
            const exec = /^0x[\dA-Fa-f]+ /.exec(value);
            if (!exec) {
                /* Pointer part always must be in string */
                return null;
            }

            let str = value.substring(exec[0].length);
            if (str[0] === '"') {
                /* Remove leading ", but do not do this for <repeats ...> */
                str = str.substring(1);
            }

            /* Remove ... for truncated strings */
            if (str.endsWith('...')) {
                str = str.substring(0, str.length - 3);
            }

            if (str[str.length - 1] === '"') {
                /* Remove trailing ", but do not do this for <repeats ...> */
                str = str.substring(0, str.length - 1);
            }

            return str;
        };

        let chunk = extractStringExtended(variable.value);
        if (chunk == null) {
            return null;
        }

        chunk = normalize(chunk);
        /* Shortcut for little strings */
        if (!isStringTruncated(variable.value)) {
            return chunk;
        }
        
        /* To get full string we consume string by chunks and then build
         * whole string using concatenating.
         */
        const stringPtr = this.extractPtrFromString(variable);
        const chunks = [chunk];
        let currentLength = chunk.length;
        while (true) {
            const currentChunkExpr = `(const char *)${stringPtr} + ${currentLength}`;
            const response = await this.evaluate(currentChunkExpr, frameId);
            chunk = extractStringExtended(response.result);
            if (chunk === null || chunk.length <= 0) {
                return null;
            }

            chunk = normalize(chunk);
            chunks.push(chunk);
            if (!isStringTruncated(response.result)) {
                break;
            }

            currentLength += chunk.length;

            /* 
             * Experimentally found that max string size (original string length)
             * is 200 characters.  For truncated strings after normalization
             * we must get exactly this size.
             */
            console.assert(chunk.length === 200);
        }

        return chunks.join('');
    }

    extractBool(variable: IDebugVariable | dap.EvaluateResponse) {
        /* 
         * On older pg versions bool stored as 'char' and have format: "X '\00X'"
         */
        switch (this.getValue(variable).trim().toLowerCase()) {
            case 'true':
            case "1 '\\001'":
                return true;
            case 'false':
            case "0 '\\000'":
                return false;
        }

        return null;
    }

    extractPtrFromString(variable: IDebugVariable | dap.EvaluateResponse) {
        /*
         * When evaluating 'char*' member, 'result' field will be in form: `0x00000 "STR"`.
         * This function extracts stored pointer (0x00000), otherwise null returned
         */
        const value = this.getValue(variable);
        const space = value.indexOf(' ');
        if (space === -1) {
            return null;
        }

        const ptr = value.substring(0, space);
        if (!pointerRegex.test(ptr)) {
            return null;
        }
        return ptr;
    }

    maybeCalcFrameIndex(frameId: number) {
        /* 
         * DAP returns new frameId each 'stackTrace' invocation, so we can
         * not just iterate through all StackFrames and find equal frame id.
         * 
         * I found such hack - all frames returned by 'evaluate' are in form
         * 'frameId = 1000 + frameIndex' (at least I rely on it very much).
         * We just need to get this single frame.
         */
        return frameId - 1000;
    }

    formatEnumValue(_name: string, value: string) {
        /* CppDbg allows passing only identifier, without type qualification */
        return value;
    }
}

export class CodeLLLDBDebuggerFacade extends GenericDebuggerFacade {
    type = DebuggerType.CodeLLDB;

    shouldShowScope(scope: dap.Scope): boolean {
        return scope.name === 'Local';
    }

    valueRepresentsStructure(value: string) {
        return value.startsWith('{') && value.endsWith('}');
    }

    async evaluate(expression: string, frameId: number | undefined, context?: string, noReturn?: boolean): Promise<dap.EvaluateResponse> {
        try {
            context ??= 'watch';

            /* 
             * CodeLLDB has many expression evaluators: simple, python and native.
             * https://github.com/vadimcn/codelldb/blob/master/MANUAL.md#expressions
             * 
             * Default is 'simple' (changed in settings), but we use only native,
             * so add '/nat' for each expression for sure.
             */
            expression = `/nat ${expression}`;
            return await this.getSession().customRequest('evaluate', {
                expression,
                context,
                frameId
            } as dap.EvaluateArguments);
        } catch (err) {
            if (err instanceof Error) {
                if (noReturn && err.message === 'unknown error') {
                    /* 
                     * CodeLLDB don't like 'void' returning expressions and
                     * throws such strange errors, but call actually succeeds
                     */
                    return {
                        memoryReference: '',
                        result: '',
                        type: '',
                        variablesReference: -1
                    };
                }

                throw new EvaluationError(err.message);
            }

            throw err;
        }
    }

    isNull(variable: IDebugVariable | dap.EvaluateResponse): boolean {
        const value = this.getValue(variable);
        return value === '<null>' || nullRegex.test(value);
    }
    
    isValidPointerType(variable: IDebugVariable | dap.EvaluateResponse): boolean {
        const value = this.getValue(variable);

        /* CodeLLDB examine pointers itself, so this is handy for us */
        if (value === '<invalid address>' || value === '<null>') {
            return false;
        }
        
        /* 
         * CodeLLDB is smart, but it is problem for us, because it becomes hard
         * to detect which type of this type: pointer to struct or builtin basic
         * type (i.e. 'int *').
         * So, here I try to be as flexible as I can - this is pointer type
         * if it contains any pointer in type or it is raw pointer value.
         */
        return variable.type.indexOf('*') !== -1 || pointerRegex.test(value);
    }

    isScalarType(variable: IDebugVariable, type?: string) {
        /* 
         * CodeLLDB displays structures in 'description', so we can use
         * this info to figure out, that even if type is not builtin, it
         * is actually not a struct.
         * 'valueRepresentsStructure' also covers case, when 'description'
         * is array - it rendered as '{1, 2, 3, ...}'.
         */
        return super.isScalarType(variable, type) || 
              !this.valueRepresentsStructure(variable.value);
    }

    isValueStruct(variable: IDebugVariable, type?: string): boolean {
        /* 
         * CodeLLDB does not expose such info in description,
         * so everything we can do - check type. This will fail if
         * type is typedef of pointer.
         */
        type ??= variable.type;

        if (type.indexOf('*') !== -1) {
            return false;
        }

        if (type.indexOf("]") !== -1) {
            return false;
        }

        return true;
    }

    private extractStringInternal(str: string) {
        /* 
         * char* is rendered as string wrapped into double quotes,
         * without any pointer - just trim them.
         */
        return str.substring(1, str.length - 1);
    }

    extractString(variable: IDebugVariable | dap.EvaluateResponse): string | null {
        return this.extractStringInternal(this.getValue(variable));
    }

    async extractLongString(variable: IDebugVariable, frameId: number): Promise<string | null> {
        const isStringTruncated = (response: string) => {
            /* 
             * Rendered truncated string has '...' at the very end, not in
             * string value itself, so check 'result' member.
             */
            return response.endsWith('...');
        };

        const normalize = (str: string) => {
            /* Replace escape characters */
            str = str.replace(/\\n/g, '\n');
            str = str.replace(/\\t/g, '\t');
            str = str.replace(/\\"/g, '"');

            /* Unlike cppdbg it does not render <repeats XXX> */
            return str;
        };

        const extractStringExtended = (str: string) => {
            if (str.endsWith('...')) {
                str = str.substring(0, str.length - 3);
            }
            
            return this.extractStringInternal(str);
        };

        let chunk = extractStringExtended(variable.value);
        if (chunk == null) {
            return null;
        }

        chunk = normalize(chunk);
        if (!isStringTruncated(variable.value)) {
            return chunk;
        }

        /*
         * To get full string we consume string by chunks and then build
         * whole string using concatenating.
         */
        const stringPtr = this.extractPtrFromString(variable);
        const chunks = [chunk];
        let currentLength = chunk.length;
        while (true) {
            const currentChunkExpr = `(const char *)${stringPtr} + ${currentLength}`;
            const response = await this.evaluate(currentChunkExpr, frameId);
            chunk = extractStringExtended(response.result);
            if (chunk === null || chunk.length <= 0) {
                return null;
            }

            chunk = normalize(chunk);
            chunks.push(chunk);
            if (!isStringTruncated(response.result)) {
                break;
            }

            currentLength += chunk.length;
        }

        return chunks.join('');
    }

    extractBool(variable: IDebugVariable | dap.EvaluateResponse): boolean | null {
        /* 
         * On older pg versions bool stored as 'char' and have format: "X '\00X'"
         */
        switch (this.getValue(variable).trim().toLowerCase()) {
            case 'true':
            case "'\\x01'":
                return true;
            case 'false':
            case "'\\0'":
                return false;
        }

        return null;
    }

    extractPtrFromString(variable: IDebugVariable | dap.EvaluateResponse): string | null {
        /* 
         * String pointer is not stored in 'value', the only we can do is
         * to take 'memoryReference'
         */
        if (variable.memoryReference === undefined) {
            return null;
        }
        return variable.memoryReference;
    }

    maybeCalcFrameIndex(_frameId: number) {
        /* 
         * Unlike CppDbg, CodeLLDB returns new 'frameId' always, it does not
         * refresh values after steps, so we can not rely on frameId returned
         * by 'vscode.debug.activeStackItem'
         */
        return undefined;
    }

    formatEnumValue(name: string, value: string) {
        /* CodeLLDB requires to qualify enum values just like in C++ */
        return `${name}::${value}`;
    }
}

/**
 * Shortcut function to test that pointer is NULL.
 * Used for situations, where only pointer value is present, without variable.....
 * 
 * @param pointer Pointer value in HEX form
 * @returns true if pointer value is NULL
 */
export function pointerIsNull(pointer: string) {
    return pointer === '0x0' || /0x0+/.test(pointer);
}

export function setupDebugger(variablesView: NodePreviewTreeViewProvider,
                              context: vscode.ExtensionContext) {
    if (!Features.debugFocusEnabled()) {
        /* 
         * Prior to VS Code version 1.90 there is no debugFocus API - 
         * we can not track current stack frame. It is very convenient,
         * because single event refreshes state and also we keep track
         * of stack frame selected in debugger view.
         * 
         * For older versions we use event based implementation -
         * subscribe to debugger events and filter out needed:
         * continue execution, stopped (breakpoint), terminated etc...
         * 
         * NOTE: We can not track current stack frame, so this feature is
         *       not available for users.
         */

        const disposable = vscode.debug.registerDebugAdapterTrackerFactory('*', {
            createDebugAdapterTracker(_: vscode.DebugSession) {
                return {
                    onDidSendMessage(message: dap.ProtocolMessage) {
                        if (message.type === 'response') {
                            if (message.command === 'continue') {
                                /* `Continue' command - clear */
                                variablesView.refresh();
                            }
    
                            return;
                        }
    
                        if (message.type === 'event') {
                            if (message.event === 'stopped' || message.event === 'terminated') {
                                /* Hit breakpoint - show variables */
                                variablesView.refresh();
                            }
                        }
                    },
    
                    onWillStopSession() {
                        /* Debug session terminates - clear */
                        variablesView.refresh();
                    },
                };
            },
        });
        context.subscriptions.push(disposable);
    }
}
