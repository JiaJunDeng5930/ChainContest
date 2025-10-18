import { performance } from 'node:perf_hooks';

export enum DbErrorCode {
  INPUT_INVALID = 'INPUT_INVALID',
  NOT_FOUND = 'NOT_FOUND',
  CONFLICT = 'CONFLICT',
  ORDER_VIOLATION = 'ORDER_VIOLATION',
  RESOURCE_UNSUPPORTED = 'RESOURCE_UNSUPPORTED',
  INTERNAL_ERROR = 'INTERNAL_ERROR'
}

export interface DbErrorDetail {
  reason?: string;
  context?: Record<string, unknown>;
}

export class DbError extends Error {
  public readonly code: DbErrorCode;

  public readonly detail?: DbErrorDetail;

  constructor(code: DbErrorCode, message: string, options?: { detail?: DbErrorDetail; cause?: unknown }) {
    super(message, { cause: options?.cause });
    this.code = code;
    this.detail = options?.detail;
    this.name = 'DbError';
  }
}

export interface MetricsEvent {
  operation: string;
  durationMs: number;
  outcome: 'success' | 'error';
  errorCode?: DbErrorCode;
}

export type MetricsHook = (event: MetricsEvent) => void;

let activeHook: MetricsHook = () => {};

export function registerMetricsHook(hook: MetricsHook | null | undefined): void {
  activeHook = hook ?? (() => {});
}

export function getMetricsHook(): MetricsHook {
  return activeHook;
}

export function ensureDbError(error: unknown, fallback: DbErrorCode = DbErrorCode.INTERNAL_ERROR): DbError {
  if (error instanceof DbError) {
    return error;
  }

  if (isPostgresIntegrityError(error)) {
    return mapPostgresIntegrityError(error);
  }

  return new DbError(fallback, (error as Error)?.message ?? 'Unhandled database error', { cause: error });
}

export async function withMetrics<TResult>(
  operation: string,
  runner: () => Promise<TResult>
): Promise<TResult> {
  const hook = getMetricsHook();
  const startedAt = performance.now();

  try {
    const result = await runner();
    hook({
      operation,
      outcome: 'success',
      durationMs: performance.now() - startedAt
    });
    return result;
  } catch (error) {
    const classified = ensureDbError(error);
    hook({
      operation,
      outcome: 'error',
      durationMs: performance.now() - startedAt,
      errorCode: classified.code
    });
    throw classified;
  }
}

function isPostgresIntegrityError(error: unknown): error is { code?: string; constraint?: string; message: string } {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const pgError = error as { code?: unknown; message?: unknown };
  return typeof pgError.code === 'string' && typeof pgError.message === 'string';
}

function mapPostgresIntegrityError(error: { code?: string; constraint?: string; message: string }): DbError {
  switch (error.code) {
    case '23505': // unique_violation
      return new DbError(DbErrorCode.CONFLICT, error.message, {
        detail: {
          reason: 'unique_violation',
          context: { constraint: error.constraint }
        }
      });
    case '23503': // foreign_key_violation
      return new DbError(DbErrorCode.NOT_FOUND, error.message, {
        detail: {
          reason: 'foreign_key_violation',
          context: { constraint: error.constraint }
        }
      });
    case '23514': // check_violation
    case '22001': // data_too_long
    case '22003': // numeric_value_out_of_range
    case '22P02': // invalid_text_representation
      return new DbError(DbErrorCode.INPUT_INVALID, error.message, {
        detail: {
          reason: 'constraint_violation',
          context: { code: error.code, constraint: error.constraint }
        }
      });
    default:
      return new DbError(DbErrorCode.INTERNAL_ERROR, error.message, {
        detail: {
          reason: 'unclassified_pg_error',
          context: { code: error.code, constraint: error.constraint }
        }
      });
  }
}
