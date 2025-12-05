
/**
 * Base class for all exceptions produced by extension
 */
export class PghhError extends Error { }

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

export class WorkspaceNotOpenedError extends PghhError {
    constructor() {
        super('No workspace opened');
    }
}

/**
 * Error occurring when argument passed to function is invalid or does
 * not satisfy some conditions.
 */
export class ArgumentInvalidError extends PghhError {
    constructor(actual: unknown, expected: unknown) {
        super(`Given argument ${actual} is invalid, expected ${expected}`);
    }
}
