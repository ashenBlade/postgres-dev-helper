import * as vscode from 'vscode';
import * as dap from "./dap";
import { IVariable } from './extension';

const nullPointer = '0x0';
const pointerRegex = /^0x[0-9abcdef]+$/i;

/**
 * Check provided pointer value represents valid value.
 * That is, it can be dereferenced
 * 
 * @param value Pointer value in hex format
 * @returns Pointer value is valid and not NULL
 */
export function isValidPointer(value: string) {
    return pointerRegex.test(value) && value !== nullPointer;
}

export function getStructNameFromType(type: string) {
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

/**
 * Count number '*' in type string
 * 
 * @param type Type string to test
 * @returns Number of '*' in type
 */
export function getPointersCount(type: string) {
    /* All pointers go sequentially from end without spaces */
    let count = 0;
    for (let index = type.length - 1; index > -1; --index) {
        if (type[index] === '*') {
            count++;
        } else {
            break;
        }
    }
    return count;
}

/**
 * Substitute struct name from type to provided struct name.
 * This takes qualifiers into account (const, volatile, *, etc...)
 * 
 * @param type Whole type name of original variable (including qualifiers)
 * @param target The name of the type (or base type) to be substituted
 * @returns Result type name
 */
export function substituteStructName(type: string, target: string) {
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
    typeParts[index] = target;
    return typeParts.join(' ');
}

/**
 * Check that variable is not a pointer, but raw struct.
 * 
 * @param variable Variable to test
 * @returns true if variable is raw struct
 */
export function isRawStruct(variable: IVariable) {
    /* 
     * Check that variable is plain struct - not pointer.
     * Figured out - top level variables has {...} in value, but
     * struct members are empty strings. (For raw structs).
     */
    return variable.parent
        ? variable.value === ''
        : variable.value === '{...}';
}

export async function evaluate(session: vscode.DebugSession, expression: string, frameId: number, context?: string): Promise<dap.EvaluateResponse> {
    context ??= 'repl';
    return await session.customRequest('evaluate', { expression, context, frameId } as dap.EvaluateArguments);
}

export async function getVariables(session: vscode.DebugSession, variablesReference: number): Promise<dap.DebugVariable[]> {
    const response: dap.VariablesResponse = await session.customRequest('variables', { variablesReference } as dap.VariablesArguments);
    return response.variables;
}

export async function getScopes(session: vscode.DebugSession, frameId: number): Promise<dap.Scope[]> {
    const response: dap.ScopesResponse = await session.customRequest('scopes', { frameId } as dap.ScopesArguments);
    return response.scopes;
}

export interface ILogger {
    info: (message: string) => void;
    warn: (message: string) => void;
    error: (message: string) => void;
}

export class OutputChannelLogger implements ILogger {
    constructor(private readonly channel: vscode.OutputChannel)
    { }
    logGeneric(level: string, message: string) {
        const timestamp = new Date().toISOString().replace('T', ' ').replace('Z', '');
        this.channel.append(timestamp)
        this.channel.append(' [')
        this.channel.append(level);
        this.channel.append(']')
        this.channel.append(': ');
        this.channel.appendLine(message);
    }
    error(message: string) {
        this.logGeneric('ERROR', message);
    }
    info(message: string) {
        this.logGeneric('INFO', message);
    }
    warn(message: string) {
        this.logGeneric('WARN', message);
    }
}

export interface IDebuggerFacade {
    readonly isInDebug: boolean;
    evaluate: (expression: string, frameId: number, context?: string) => Promise<dap.EvaluateResponse>;
    getVariables: (variablesReference: number) => Promise<dap.DebugVariable[]>;
    getScopes: (frameId: number) => Promise<dap.Scope[]>;
}

export class VsCodeDebuggerFacade implements IDebuggerFacade, vscode.Disposable {
    private registrations: vscode.Disposable[];

    isInDebug: boolean;
    session: vscode.DebugSession | undefined;

    constructor() {
        this.registrations = [
            vscode.debug.onDidStartDebugSession(s => {
                this.session = s;
                this.isInDebug = true;
            }),
            vscode.debug.onDidTerminateDebugSession(s => {
                this.session = undefined;
                this.isInDebug = false;
            }),
        ];
        
        this.session = vscode.debug.activeDebugSession;
        this.isInDebug = vscode.debug.activeDebugSession !== undefined;
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
    
    async evaluate(expression: string, frameId: number, context?: string): Promise<dap.EvaluateResponse> {
        context ??= 'repl';
        return await this.getSession().customRequest('evaluate', { expression, context, frameId } as dap.EvaluateArguments);
    }
    
    async getVariables(variablesReference: number): Promise<dap.DebugVariable[]> {
        const response: dap.VariablesResponse = await this.getSession().customRequest('variables', { variablesReference } as dap.VariablesArguments);
        return response.variables;
    }
    
    async getScopes(frameId: number): Promise<dap.Scope[]> {
        const response: dap.ScopesResponse = await this.getSession().customRequest('scopes', { frameId } as dap.ScopesArguments);
        return response.scopes;
    }

    dispose() {
        this.registrations.forEach(r => r.dispose());
        this.registrations.length = 0;
    }
}