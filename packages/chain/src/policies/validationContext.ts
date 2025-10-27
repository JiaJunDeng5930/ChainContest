/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-redundant-type-constituents, @typescript-eslint/no-unsafe-member-access */
import {
  loadValidationContext,
  validateBatch,
  type ValidationContext,
  type ValidationContextOptions,
  type ValidationRequest,
  type ValidationResult,
  type ValidationError,
  type ValidationMetrics,
} from '@chaincontest/shared-schemas';
import { createContestChainError } from '../errors/contestChainError.js';

export type FrozenValidationMetrics = ValidationMetrics | undefined;

export interface FrozenValidationError {
  readonly type: string;
  readonly message: string;
  readonly detail?: unknown;
}

export interface FrozenValidationResult {
  readonly status: ValidationResult['status'];
  readonly validatedTypes: readonly string[];
  readonly firstError: FrozenValidationError | null;
  readonly metrics: FrozenValidationMetrics;
}

const freezeArray = <T>(values: readonly T[]): readonly T[] =>
  Object.freeze([...values]);

const freezeDetail = (detail: unknown): unknown => {
  if (detail == null) {
    return detail;
  }

  if (Array.isArray(detail)) {
    const frozenEntries = detail.map((entry) =>
      typeof entry === 'object' && entry !== null ? { ...entry } : entry,
    );
    return Object.freeze(frozenEntries) as unknown;
  }

  if (typeof detail === 'object') {
    return Object.freeze({ ...(detail as Record<string, unknown>) }) as unknown;
  }

  return detail;
};

const freezeError = (
  error: ValidationError | null,
): FrozenValidationError | null => {
  if (!error) {
    return null;
  }

  const { type, message, detail } = error;
  const frozen: FrozenValidationError = {
    type,
    message,
    detail: freezeDetail(detail),
  };
  return Object.freeze(frozen);
};

const freezeMetrics = (
  metrics: ValidationMetrics | undefined,
): FrozenValidationMetrics => (metrics ? Object.freeze({ ...metrics }) : undefined);

const freezeValidationResult = (
  result: ValidationResult,
): FrozenValidationResult => {
  if (result.status === 'success') {
    const frozen: FrozenValidationResult = {
      status: 'success',
      validatedTypes: freezeArray(result.validatedTypes),
      firstError: null,
      metrics: freezeMetrics(result.metrics),
    };
    return Object.freeze(frozen);
  }

  const frozen: FrozenValidationResult = {
    status: 'failure',
    validatedTypes: freezeArray(result.validatedTypes),
    firstError: freezeError(result.firstError),
    metrics: freezeMetrics(result.metrics),
  };
  return Object.freeze(frozen);
};

export interface GatewayValidationAdapter {
  readonly context: ValidationContext;
  readonly validateRequest: (request: ValidationRequest) => FrozenValidationResult;
  readonly validateType: (
    type: string,
    value: unknown,
    options?: { readonly context?: Record<string, unknown>; readonly batchId?: string },
  ) => FrozenValidationResult;
  readonly assertValid: (
    request: ValidationRequest,
    message?: string,
  ) => FrozenValidationResult;
  readonly assertTypeValid: (
    type: string,
    value: unknown,
    options?: { readonly context?: Record<string, unknown>; readonly batchId?: string; readonly message?: string },
  ) => FrozenValidationResult;
}

const createSingleEntryRequest = (
  type: string,
  value: unknown,
  options?: { readonly context?: Record<string, unknown>; readonly batchId?: string },
): ValidationRequest => ({
  batchId: options?.batchId,
  context: options?.context,
  entries: [
    {
      type,
      value,
    },
  ],
});

const raiseValidationFailure = (
  request: ValidationRequest,
  result: FrozenValidationResult,
  message?: string,
): never => {
  const errorMessage =
    message ??
    (result.firstError
      ? `Validation failed for type "${result.firstError.type}"`
      : 'Validation failed for request');

  throw createContestChainError({
    code: 'VALIDATION_FAILED',
    message: errorMessage,
    details: {
      request,
      firstError: result.firstError,
      metrics: result.metrics,
    },
  });
};

export const createGatewayValidationAdapter = (
  context: ValidationContext,
): GatewayValidationAdapter => {
  const validateRequest = (request: ValidationRequest) =>
    freezeValidationResult(validateBatch(request, context));

  const validateType: GatewayValidationAdapter['validateType'] = (type, value, options) =>
    validateRequest(createSingleEntryRequest(type, value, options));

  const assertValid: GatewayValidationAdapter['assertValid'] = (request, message) => {
    const result = validateRequest(request);
    if (result.status === 'failure') {
      raiseValidationFailure(request, result, message);
    }

    return result;
  };

  const assertTypeValid: GatewayValidationAdapter['assertTypeValid'] = (
    type,
    value,
    options,
  ) => {
    const request = createSingleEntryRequest(type, value, options);
    const result = validateRequest(request);
    if (result.status === 'failure') {
      raiseValidationFailure(request, result, options?.message);
    }

    return result;
  };

  return Object.freeze({
    context,
    validateRequest,
    validateType,
    assertValid,
    assertTypeValid,
  });
};

export const createGatewayValidationContext = (
  options: ValidationContextOptions,
): GatewayValidationAdapter => createGatewayValidationAdapter(loadValidationContext(options));

export const isGatewayValidationAdapter = (
  value: unknown,
): value is GatewayValidationAdapter =>
  Boolean(
    value &&
      typeof value === 'object' &&
      'validateRequest' in value &&
      typeof (value as GatewayValidationAdapter).validateRequest === 'function',
  );

export type { ValidationContext, ValidationRequest };
