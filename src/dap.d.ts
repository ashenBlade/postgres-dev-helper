/* 
 * Definitions used from https://microsoft.github.io/debug-adapter-protocol/overview.
 * There are some modifications to better fit implementation: 
 * - remove 'body' for all response interfaces
 * - remove unused members from some interfaces
 * - rename 'Variable' to 'DebugVariable' - to explicitly separate variable classes
 * - remove "?" for some members (as it always should be present)
 * 
 * P.S. this is not complete list of changes
 */

export interface EvaluateArguments {
    /**
     * The expression to evaluate.
     */
    expression: string;

    /**
     * Evaluate the expression in the scope of this stack frame. If not specified,
     * the expression is evaluated in the global scope.
     */
    frameId?: number;

    /**
     * The context in which the evaluate request is used.
     * Values:
     * 'watch': evaluate is called from a watch view context.
     * 'repl': evaluate is called from a REPL context.
     * 'hover': evaluate is called to generate the debug hover contents.
     * This value should only be used if the corresponding capability
     * `supportsEvaluateForHovers` is true.
     * 'clipboard': evaluate is called to generate clipboard contents.
     * This value should only be used if the corresponding capability
     * `supportsClipboardContext` is true.
     * 'variables': evaluate is called from a variables view context.
     * etc.
     */
    context?: 'watch' | 'repl' | 'hover' | 'clipboard' | 'variables' | string;
}

export interface EvaluateResponse {
    /**
     * The result of the evaluate request.
     */
    result: string;

    /**
     * The type of the evaluate result.
     * This attribute should only be returned by a debug adapter if the
     * corresponding capability `supportsVariableType` is true.
     */
    type: string;

    /**
     * If `variablesReference` is > 0, the evaluate result is structured and its
     * children can be retrieved by passing `variablesReference` to the
     * `variables` request as long as execution remains suspended. See 'Lifetime
     * of Object References' in the Overview section for details.
     */
    variablesReference: number;

    /**
     * A memory reference to a location appropriate for this result.
     * For pointer type eval results, this is generally a reference to the
     * memory address contained in the pointer.
     * This attribute may be returned by a debug adapter if corresponding
     * capability `supportsMemoryReferences` is true.
     */
    memoryReference: string;
}

export interface VariablesArguments {
    /**
     * The variable for which to retrieve its children. The `variablesReference`
     * must have been obtained in the current suspended state. See 'Lifetime of
     * Object References' in the Overview section for details.
     */
    variablesReference: number;
}



export interface DebugVariable {
    /**
     * The variable's name.
     */
    name: string;

    /**
     * The variable's value.
     * This can be a multi-line text, e.g. for a function the body of a function.
     * For structured variables (which do not have a simple value), it is
     * recommended to provide a one-line representation of the structured object.
     * This helps to identify the structured object in the collapsed state when
     * its children are not yet visible.
     * An empty string can be used if no value should be shown in the UI.
     */
    value: string;

    /**
     * The type of the variable's value. Typically shown in the UI when hovering
     * over the value.
     * This attribute should only be returned by a debug adapter if the
     * corresponding capability `supportsVariableType` is true.
     */
    type: string;

    /**
     * The evaluatable name of this variable which can be passed to the `evaluate`
     * request to fetch the variable's value.
     */
    evaluateName: string;

    /**
     * If `variablesReference` is > 0, the variable is structured and its children
     * can be retrieved by passing `variablesReference` to the `variables` request
     * as long as execution remains suspended. See 'Lifetime of Object References'
     * in the Overview section for details.
     */
    variablesReference: number;

    /**
     * A memory reference associated with this variable.
     * For pointer type variables, this is generally a reference to the memory
     * address contained in the pointer.
     * For executable data, this reference may later be used in a `disassemble`
     * request.
     * This attribute may be returned by a debug adapter if corresponding
     * capability `supportsMemoryReferences` is true.
     */
    memoryReference: string;
}

export interface VariablesResponse {
    /**
     * All (or a range) of variables for the given variable reference.
     */
    variables: DebugVariable[];
}

export interface ScopesArguments {
    /**
     * Retrieve the scopes for the stack frame identified by `frameId`. The
     * `frameId` must have been obtained in the current suspended state. See
     * 'Lifetime of Object References' in the Overview section for details.
     */
    frameId: number;
}

export interface Scope {
    /**
     * Name of the scope such as 'Arguments', 'Locals', or 'Registers'. This
     * string is shown in the UI as is and can be translated.
     */
    name: string;

    /**
     * A hint for how to present this scope in the UI. If this attribute is
     * missing, the scope is shown with a generic UI.
     * Values:
     * 'arguments': Scope contains method arguments.
     * 'locals': Scope contains local variables.
     * 'registers': Scope contains registers. Only a single `registers` scope
     * should be returned from a `scopes` request.
     * 'returnValue': Scope contains one or more return values.
     * etc.
     */
    presentationHint?: 'arguments' | 'locals' | 'registers' | 'returnValue' | string;

    /**
     * The variables of this scope can be retrieved by passing the value of
     * `variablesReference` to the `variables` request as long as execution
     * remains suspended. See 'Lifetime of Object References' in the Overview
     * section for details.
     */
    variablesReference: number;
}

export interface ScopesResponse {
    /**
     * The scopes of the stack frame. If the array has length zero, there are no
     * scopes available.
     */
    scopes: Scope[];
}