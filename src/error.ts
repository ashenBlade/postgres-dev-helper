
/**
 * Base class for all exceptions produced by extension
 */
export class PghhError extends Error { }

/**
 * Error occurred during expression evaluation
 */
export class EvaluationError extends PghhError { }

/**
 * Error occurring when some precondition/assumption is violated,
 */
export class AssumptionError extends PghhError {}

export function unnullify<T>(arg: T | undefined | null, name: string): T {
    if (arg) {
        return arg;
    }
    
    throw new AssumptionError(`${name} is null or undefined`);
}
