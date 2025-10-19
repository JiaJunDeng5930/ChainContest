export const CONTEST_CHAIN_ERROR_CODES = [
  'QUALIFICATION_FAILED',
  'RULE_VIOLATION',
  'CHAIN_UNAVAILABLE',
  'STATE_CONFLICT',
  'AUTHORIZATION_REQUIRED',
  'PRICING_STALE',
  'VALIDATION_FAILED',
  'NOT_IMPLEMENTED',
  'INTERNAL_ERROR',
] as const;

export type ContestChainErrorCode =
  (typeof CONTEST_CHAIN_ERROR_CODES)[number];

export type ContestChainErrorSeverity = 'info' | 'warn' | 'error';

export interface ContestChainErrorOptions {
  readonly cause?: unknown;
  readonly details?: Record<string, unknown>;
  readonly source?: string;
  readonly severity?: ContestChainErrorSeverity;
  readonly retryable?: boolean;
  readonly timestamp?: string;
}

const cloneDetails = (
  details: Record<string, unknown> | undefined,
): Readonly<Record<string, unknown>> =>
  details ? Object.freeze({ ...details }) : Object.freeze({});

const resolveTimestamp = (timestamp?: string) =>
  timestamp ?? new Date().toISOString();

const isContestChainErrorCode = (
  value: unknown,
): value is ContestChainErrorCode =>
  typeof value === 'string' &&
  (CONTEST_CHAIN_ERROR_CODES as readonly string[]).includes(value);

export class ContestChainError extends Error {
  public readonly code: ContestChainErrorCode;

  public readonly retryable: boolean;

  public readonly severity: ContestChainErrorSeverity;

  public readonly source?: string;

  public readonly details: Readonly<Record<string, unknown>>;

  public readonly timestamp: string;

  constructor(
    code: ContestChainErrorCode,
    message: string,
    options: ContestChainErrorOptions = {},
  ) {
    super(message);
    this.name = 'ContestChainError';
    this.code = code;
    this.retryable = options.retryable ?? false;
    this.severity = options.severity ?? 'error';
    this.source = options.source;
    this.details = cloneDetails(options.details);
    this.timestamp = resolveTimestamp(options.timestamp);

    if (options.cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = options.cause;
    }
  }

  public toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      retryable: this.retryable,
      severity: this.severity,
      source: this.source,
      details: this.details,
      timestamp: this.timestamp,
    };
  }
}

export interface ContestChainErrorDescriptor
  extends Omit<ContestChainErrorOptions, 'timestamp'> {
  readonly code: ContestChainErrorCode;
  readonly message: string;
}

const normalizeDescriptor = (
  descriptor: ContestChainErrorDescriptor,
): ContestChainErrorDescriptor => ({
  ...descriptor,
  details: descriptor.details ? { ...descriptor.details } : undefined,
});

export const createContestChainError = (
  descriptor: ContestChainErrorDescriptor,
): ContestChainError =>
  new ContestChainError(
    descriptor.code,
    descriptor.message,
    normalizeDescriptor(descriptor),
  );

export const createNotImplementedError = (
  message = 'Method not implemented yet',
  options: Omit<ContestChainErrorOptions, 'timestamp'> = {},
): ContestChainError =>
  new ContestChainError('NOT_IMPLEMENTED', message, options);

export const isContestChainError = (
  error: unknown,
): error is ContestChainError => error instanceof ContestChainError;

const VIEM_ERROR_CODE_MAPPING: Record<string, ContestChainErrorCode> = {
  CALL_EXCEPTION: 'STATE_CONFLICT',
  EXECUTION_REVERTED: 'RULE_VIOLATION',
  INSUFFICIENT_FUNDS: 'QUALIFICATION_FAILED',
  INVALID_ARGUMENT: 'VALIDATION_FAILED',
  NONCE_EXPIRED: 'STATE_CONFLICT',
  NONCE_TOO_LOW: 'STATE_CONFLICT',
  NETWORK_ERROR: 'CHAIN_UNAVAILABLE',
  PROVIDER_NOT_READY: 'CHAIN_UNAVAILABLE',
  RATE_LIMITED: 'CHAIN_UNAVAILABLE',
  TIMEOUT: 'CHAIN_UNAVAILABLE',
  TRANSACTION_REPLACED: 'STATE_CONFLICT',
  UNPREDICTABLE_GAS_LIMIT: 'CHAIN_UNAVAILABLE',
  UNCONFIGURED_NAME: 'CHAIN_UNAVAILABLE',
  UNAUTHORIZED: 'AUTHORIZATION_REQUIRED',
  ACTION_REJECTED: 'AUTHORIZATION_REQUIRED',
};

const deriveCodeFromMessage = (message: string): ContestChainErrorCode | null => {
  const normalized = message.toLowerCase();

  if (normalized.includes('allowance') || normalized.includes('approval')) {
    return 'AUTHORIZATION_REQUIRED';
  }

  if (normalized.includes('insufficient') && normalized.includes('balance')) {
    return 'QUALIFICATION_FAILED';
  }

  if (normalized.includes('stale price') || normalized.includes('price oracle')) {
    return 'PRICING_STALE';
  }

  if (normalized.includes('nonce')) {
    return 'STATE_CONFLICT';
  }

  if (normalized.includes('temporarily') && normalized.includes('unavailable')) {
    return 'CHAIN_UNAVAILABLE';
  }

  if (normalized.includes('validation')) {
    return 'VALIDATION_FAILED';
  }

  return null;
};

const deriveCodeFromExternalError = (
  error: Error & { code?: unknown },
  fallback: ContestChainErrorCode,
): ContestChainErrorCode => {
  if (isContestChainErrorCode(error.code)) {
    return error.code;
  }

  if (typeof error.code === 'string') {
    const mappedCode = VIEM_ERROR_CODE_MAPPING[error.code];
    if (mappedCode) {
      return mappedCode;
    }
  }

  if (error.message) {
    const inferred = deriveCodeFromMessage(error.message);
    if (inferred) {
      return inferred;
    }
  }

  return fallback;
};

const serializeUnknown = (value: unknown): unknown => {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
    };
  }

  if (typeof value === 'object' && value !== null) {
    return {
      ...value,
    };
  }

  return value;
};

export interface ContestChainErrorFallback
  extends Omit<ContestChainErrorDescriptor, 'message' | 'code'> {
  readonly code?: ContestChainErrorCode;
  readonly message?: string;
}

const defaultFallback = {
  code: 'INTERNAL_ERROR' as ContestChainErrorCode,
  message: 'Unexpected contest chain gateway error',
  details: undefined as Record<string, unknown> | undefined,
  retryable: false,
  severity: 'error' as ContestChainErrorSeverity,
  source: undefined as string | undefined,
};

export const wrapContestChainError = (
  error: unknown,
  fallback: ContestChainErrorFallback = defaultFallback,
): ContestChainError => {
  if (error instanceof ContestChainError) {
    return error;
  }

  const descriptor = {
    code: fallback.code ?? defaultFallback.code,
    message: fallback.message ?? defaultFallback.message,
    details: fallback.details ?? defaultFallback.details,
    retryable: fallback.retryable ?? defaultFallback.retryable,
    severity: fallback.severity ?? defaultFallback.severity,
    source: fallback.source ?? defaultFallback.source,
  };

  if (error instanceof Error) {
    const code = deriveCodeFromExternalError(
      error as Error & { code?: unknown },
      descriptor.code,
    );
    const message =
      fallback.message ?? error.message ?? descriptor.message;
    const details = {
      ...descriptor.details,
      external: serializeUnknown(error),
    };

    return new ContestChainError(code, message, {
      ...descriptor,
      details,
      cause: error,
    });
  }

  const details = {
    ...descriptor.details,
    external: serializeUnknown(error),
  };

  return new ContestChainError(descriptor.code, descriptor.message, {
    ...descriptor,
    details,
  });
};

export const assertContestChainError = (
  error: unknown,
  fallback: ContestChainErrorFallback = defaultFallback,
): ContestChainError => {
  if (error instanceof ContestChainError) {
    return error;
  }

  throw wrapContestChainError(error, fallback);
};

export const formatContestChainError = (
  error: ContestChainError,
): string => {
  const parts = [
    `${error.name}[${error.code}] ${error.message}`,
    `retryable=${error.retryable}`,
    `severity=${error.severity}`,
  ];

  if (error.source) {
    parts.push(`source=${error.source}`);
  }

  if (Object.keys(error.details).length > 0) {
    parts.push(`details=${JSON.stringify(error.details)}`);
  }

  return parts.join(' | ');
};
