import * as vscode from 'vscode';
import * as dap from "./dap";
import { NodePreviewTreeViewProvider } from './extension';

export interface IDebuggerFacade {
    readonly isInDebug: boolean;
    /* Common debugger functionality */
    evaluate: (expression: string, frameId: number | undefined,
               context?: string) => Promise<dap.EvaluateResponse>;
    getVariables: (frameId: number) => Promise<dap.DebugVariable[]>;
    getMembers: (variablesReference: number) => Promise<dap.DebugVariable[]>;
    getTopStackFrameId: (threadId: number) => Promise<number | undefined>;
    getCurrentFrameId: () => Promise<number | undefined>;
    getSession: () => vscode.DebugSession;
    getArrayVariables: (expression: string, length: number,
                        frameId: number | undefined) => Promise<dap.DebugVariable[]>;
    getFunctionName: (frameId: number) => Promise<string | undefined>;
}

/**
 * Return `true` if evaluation operation failed.
 */
export function isFailedVar(response: dap.EvaluateResponse) {
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

export class CppDbgDebuggerFacade implements IDebuggerFacade, vscode.Disposable {
    private registrations: vscode.Disposable[];

    isInDebug: boolean;
    session: vscode.DebugSession | undefined;

    /**
     * Cache of function names (value) in specified frame (key).
     * Invalidated each time execution continues.
     */
    functionNames?: Map<number, string>;

    /**
     * Cached id of postgres thread.
     * As pg have single-threaded/multi-process execution model
     * we do not bother tracking multiple threads.
     */
    threadId?: number;

    constructor() {
        this.registrations = [
            /* Update current debug session data */
            vscode.debug.onDidStartDebugSession(s => {
                this.session = s;
                this.isInDebug = true;
            }),
            vscode.debug.onDidTerminateDebugSession(s => {
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
                        this.functionNames = undefined;
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

    getArrayVariables = async (array: string, length: number,
                               frameId: number | undefined) => {
        const expression = `(${array}), ${length}`;
        const evalResponse = await this.evaluate(expression, frameId);
        if (!evalResponse?.variablesReference) {
            return [];
        }

        return await this.getMembers(evalResponse.variablesReference);
    }

    getCurrentFrameId = async () => {
        /* debugFocus API */
        return (vscode.debug.activeStackItem as vscode.DebugStackFrame | undefined)?.frameId;
    }

    switchToManualArrayExpansion() {
        this.getArrayVariables = async function (array: string, length: number,
                                                 frameId: number | undefined) {
            /* 
             * In old VS Code there is no array length expansion feature.
             * We can not just add ', length' to expression, so evaluate each
             * element manually
             */
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
            return variables
        }
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

    async getFunctionName(frameId: number) {
        /* First, search in cache */
        if (this.functionNames) {
            const name = this.functionNames.get(frameId);
            if (name !== undefined) {
                return name;
            }
        }

        const threadId = await this.getThreadId();
        
        /* 
        * DAP returns new frameId each 'stackTrace' invocation, so we can
        * not just iterate through all StackFrames and find equal frame id.
        * 
        * I found such hack - all frames returned by 'evaluate' are in form
         * 'frameId = 1000 + frameIndex' (at least I rely on it very much).
         * We just need to get this single frame.
         */
        const frameIndex = frameId - 1000;

        const st = await this.getStackTrace(threadId, 1, frameIndex);
        if (!(st && st.stackFrames)) {
            return;
        }

        const frame = st.stackFrames[0];

        /* Remove arguments from function name */
        const argsIdx = frame.name.indexOf('(');
        if (argsIdx === -1) {
            return frame.name;
        }

        const name = frame.name.substring(0, argsIdx);

        /* Update cache */
        if (this.functionNames === undefined) {
            this.functionNames = new Map([[frameId, name]]);
        } else {
            this.functionNames.set(frameId, name);
        }

        return name;
    }

    async evaluate(expression: string, frameId: number | undefined, context?: string) {
        context ??= 'watch';
        return await this.getSession().customRequest('evaluate', {
            expression,
            context,
            frameId
        } as dap.EvaluateArguments);
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
        for (const scope of scopes.filter(s => s.name === 'Locals')) {
            const members = await this.getMembers(scope.variablesReference);
            variables.push(...members);
        }
        return variables;
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

    async getTopStackFrameId(threadId: number): Promise<number | undefined> {
        const response: dap.StackTraceResponse = await this.getStackTrace(threadId, 1);
        return response.stackFrames?.[0]?.id;
    }

    dispose() {
        this.registrations.forEach(r => r.dispose());
        this.registrations.length = 0;
    }

    switchToEventBasedRefresh(context: vscode.ExtensionContext, provider: NodePreviewTreeViewProvider) {
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
         * NOTES:
         *  - We can not track current stack frame, so this feature is
         *    not available for users.
         *  - Support only 'cppdbg' configuration - tested only for it
         */

        let savedThreadId: undefined | number = undefined;
        const disposable = vscode.debug.registerDebugAdapterTrackerFactory('*', {
            createDebugAdapterTracker(_: vscode.DebugSession) {
                return {
                    onDidSendMessage(message: dap.ProtocolMessage) {
                        if (message.type === 'response') {
                            if (message.command === 'continue') {
                                /* 
                                    * `Continue' command - clear
                                    */
                                provider.refresh();
                            }

                            return;
                        }

                        if (message.type === 'event') {
                            if (message.event === 'stopped' || message.event === 'terminated') {
                                /* 
                                    * Hit breakpoint - show variables
                                    */
                                provider.refresh();
                                savedThreadId = message.body?.threadId as number | undefined;
                            }
                        }
                    },

                    onWillStopSession() {
                        /* Debug session terminates - clear */
                        provider.refresh();
                    },
                }
            },
        });
        context.subscriptions.push(disposable);
        this.getCurrentFrameId = async () => {
            /* 
             * We can not track selected stack frame - return last (top)
             */
            if (!(this.isInDebug && savedThreadId)) {
                return;
            }

            return await this.getTopStackFrameId(savedThreadId);
        }
    }
}
