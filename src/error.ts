
/**
 * Base class for all exceptions produced by extension
 */
export class PghhError extends Error { }

/**
 * Error occurred during expression evaluation
 */
export class EvaluationError extends PghhError { }

