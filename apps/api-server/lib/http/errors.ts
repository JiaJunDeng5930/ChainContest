import type { ZodError } from 'zod';
import { getLogger } from '@/lib/observability/logger';

export type HttpErrorCode =
  | 'bad_request'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'rate_limited'
  | 'validation_failed'
  | 'dependency_failure'
  | 'service_unavailable'
  | 'internal_error';

export type ErrorSeverity = 'info' | 'warn' | 'error';

export interface HttpErrorOptions {
  message?: string;
  detail?: unknown;
  cause?: unknown;
  status?: number;
  expose?: boolean;
  headers?: Record<string, string>;
  severity?: ErrorSeverity;
}

export interface NormalizedErrorBody {
  code: HttpErrorCode;
  message: string;
  detail?: unknown;
}

export interface NormalizedHttpError {
  status: number;
  body: NormalizedErrorBody;
  headers: Record<string, string>;
  severity: ErrorSeverity;
  expose: boolean;
  cause?: unknown;
}

const DEFAULT_HEADERS: Record<string, string> = Object.freeze({
  'Cache-Control': 'no-store'
});

const DB_ERROR_STATUS: Record<string, number> = {
  INPUT_INVALID: 400,
  NOT_FOUND: 404,
  CONFLICT: 409,
  ORDER_VIOLATION: 409,
  RESOURCE_UNSUPPORTED: 422,
  INTERNAL_ERROR: 500
};

const DB_ERROR_CODE: Record<string, HttpErrorCode> = {
  INPUT_INVALID: 'validation_failed',
  NOT_FOUND: 'not_found',
  CONFLICT: 'conflict',
  ORDER_VIOLATION: 'conflict',
  RESOURCE_UNSUPPORTED: 'dependency_failure',
  INTERNAL_ERROR: 'internal_error'
};

const isDbError = (error: unknown): error is {
  code: keyof typeof DB_ERROR_STATUS;
  message: string;
  detail?: unknown;
} => {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const maybe = error as { code?: unknown };
  return typeof maybe.code === 'string' && maybe.code in DB_ERROR_STATUS;
};

const isZodError = (error: unknown): error is ZodError => Boolean(error && typeof error === 'object' && 'issues' in (error as Record<string, unknown>));

export class HttpError extends Error {
  public readonly status: number;
  public readonly code: HttpErrorCode;
  public readonly detail?: unknown;
  public readonly headers: Record<string, string>;
  public readonly severity: ErrorSeverity;
  public readonly expose: boolean;

  constructor(code: HttpErrorCode, options: HttpErrorOptions = {}) {
    super(options.message ?? code, { cause: options.cause });
    this.name = 'HttpError';
    this.code = code;
    this.status = options.status ?? inferStatus(code);
    this.detail = options.detail;
    this.headers = { ...DEFAULT_HEADERS, ...(options.headers ?? {}) };
    this.severity = options.severity ?? defaultSeverity(this.status);
    this.expose = options.expose ?? this.status < 500;
  }
}

const inferStatus = (code: HttpErrorCode): number => {
  switch (code) {
    case 'bad_request':
    case 'validation_failed':
      return 400;
    case 'unauthorized':
      return 401;
    case 'forbidden':
      return 403;
    case 'not_found':
      return 404;
    case 'conflict':
      return 409;
    case 'rate_limited':
      return 429;
    case 'dependency_failure':
      return 502;
    case 'service_unavailable':
      return 503;
    case 'internal_error':
    default:
      return 500;
  }
};

const defaultSeverity = (status: number): ErrorSeverity => {
  if (status >= 500) {
    return 'error';
  }
  if (status >= 400) {
    return 'warn';
  }
  return 'info';
};

export const normalizeError = (error: unknown): NormalizedHttpError => {
  if (error instanceof HttpError) {
    return {
      status: error.status,
      body: {
        code: error.code,
        message: error.message,
        detail: error.expose ? error.detail : undefined
      },
      headers: error.headers,
      severity: error.severity,
      expose: error.expose,
      cause: error.cause
    };
  }

  if (isDbError(error)) {
    const status = DB_ERROR_STATUS[error.code];
    const code = DB_ERROR_CODE[error.code];
    const expose = status < 500;
    return {
      status,
      body: {
        code,
        message: expose ? sanitizeMessage(error.message) : 'Internal server error',
        detail: expose ? sanitizeDetail(error.detail) : undefined
      },
      headers: { ...DEFAULT_HEADERS },
      severity: defaultSeverity(status),
      expose,
      cause: error
    };
  }

  if (isZodError(error)) {
    const detail = error.issues?.map((issue) => ({
      path: issue.path,
      message: issue.message,
      code: issue.code
    }));
    return {
      status: 400,
      body: {
        code: 'validation_failed',
        message: 'Request validation failed',
        detail
      },
      headers: { ...DEFAULT_HEADERS },
      severity: 'warn',
      expose: true,
      cause: error
    };
  }

  if (error instanceof Error) {
    return {
      status: 500,
      body: {
        code: 'internal_error',
        message: 'Internal server error'
      },
      headers: { ...DEFAULT_HEADERS },
      severity: 'error',
      expose: false,
      cause: error
    };
  }

  return {
    status: 500,
    body: {
      code: 'internal_error',
      message: 'Internal server error'
    },
    headers: { ...DEFAULT_HEADERS },
    severity: 'error',
    expose: false
  };
};

const sanitizeMessage = (message: string): string => {
  if (!message) {
    return 'Request failed';
  }
  return message.length > 512 ? `${message.slice(0, 509)}...` : message;
};

const sanitizeDetail = (detail: unknown): unknown => {
  if (!detail) {
    return undefined;
  }

  try {
    JSON.stringify(detail);
    return detail;
  } catch {
    return undefined;
  }
};

export const toErrorResponse = (error: unknown): NormalizedHttpError => {
  const normalized = normalizeError(error);
  if (normalized.severity !== 'info') {
    const logger = getLogger();
    const { status, body } = normalized;
    logger[normalized.severity]({ status, code: body.code, detail: normalized.expose ? body.detail : undefined, error: normalized.cause }, body.message);
  }

  return normalized;
};

export const httpErrors = {
  badRequest: (message = 'Bad request', options: HttpErrorOptions = {}) => new HttpError('bad_request', { message, ...options, status: options.status ?? 400 }),
  unauthorized: (message = 'Unauthorized', options: HttpErrorOptions = {}) => new HttpError('unauthorized', { message, ...options, status: options.status ?? 401 }),
  forbidden: (message = 'Forbidden', options: HttpErrorOptions = {}) => new HttpError('forbidden', { message, ...options, status: options.status ?? 403 }),
  notFound: (message = 'Not found', options: HttpErrorOptions = {}) => new HttpError('not_found', { message, ...options, status: options.status ?? 404 }),
  conflict: (message = 'Conflict', options: HttpErrorOptions = {}) => new HttpError('conflict', { message, ...options, status: options.status ?? 409 }),
  rateLimited: (retryAfterMs: number, message = 'Too many requests', options: HttpErrorOptions = {}) =>
    new HttpError('rate_limited', {
      message,
      ...options,
      detail: { ...(options.detail as Record<string, unknown> | undefined), retryAfterMs },
      headers: {
        ...(options.headers ?? {}),
        'Retry-After': Math.max(Math.ceil(retryAfterMs / 1000), 1).toString()
      },
      status: options.status ?? 429
    }),
  serviceUnavailable: (message = 'Service unavailable', options: HttpErrorOptions = {}) =>
    new HttpError('service_unavailable', { message, ...options, status: options.status ?? 503 }),
  internal: (message = 'Internal server error', options: HttpErrorOptions = {}) => new HttpError('internal_error', { message, ...options, status: options.status ?? 500 })
};
