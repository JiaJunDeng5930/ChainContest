import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  ValidationContext,
  ValidationRequest,
  ValidationResult,
} from '@chaincontest/shared-schemas';

const validateBatchMock = vi.fn<
  ValidationResult,
  [ValidationRequest, ValidationContext]
>();
const loadValidationContextMock = vi.fn<ValidationContext, [unknown]>();

vi.mock('@chaincontest/shared-schemas', () => ({
  validateBatch: (request: ValidationRequest, context: ValidationContext) =>
    validateBatchMock(request, context),
  loadValidationContext: (options: unknown) => loadValidationContextMock(options),
}));

import {
  createGatewayValidationAdapter,
  createGatewayValidationContext,
  isGatewayValidationAdapter,
} from '../src/policies/validationContext';

const stubRequest: ValidationRequest = {
  entries: [{ type: 'contest', value: { id: '1' } }],
};

const successResult: ValidationResult = {
  status: 'success',
  validatedTypes: ['contest'],
  firstError: null,
  metrics: {
    evaluatedAtomic: 1,
    evaluatedComposite: 0,
    durationMs: 1,
  },
};

const failureResult: ValidationResult = {
  status: 'failure',
  validatedTypes: ['contest'],
  firstError: {
    type: 'contest',
    message: 'invalid',
    detail: { reason: 'atomic-validation-failed' },
  },
  metrics: {
    evaluatedAtomic: 1,
    evaluatedComposite: 0,
    durationMs: 1,
  },
};

beforeEach(() => {
  validateBatchMock.mockReset();
  loadValidationContextMock.mockReset();
});

describe('createGatewayValidationAdapter', () => {

  it('validates single type via helper', () => {
    validateBatchMock.mockReturnValueOnce(successResult);
    const adapter = createGatewayValidationAdapter({} as ValidationContext);

    const result = adapter.validateType('contest', { id: '1' });
    expect(result.status).toBe('success');
  });

  it('assertTypeValid throws with custom message', () => {
    const arrayDetailFailure = {
      status: 'failure' as const,
      validatedTypes: ['contest'],
      firstError: {
        type: 'contest',
        message: 'invalid',
        detail: [{ reason: 'array' }] as unknown,
      },
      metrics: failureResult.metrics,
    } as ValidationResult;
    validateBatchMock.mockReturnValueOnce(arrayDetailFailure);
    const adapter = createGatewayValidationAdapter({} as ValidationContext);

    expect(() =>
      adapter.assertTypeValid('contest', { id: '1' }, { message: 'custom message' }),
    ).toThrow(/custom message/);
  });

  it('identifies invalid adapter structures', () => {
    expect(isGatewayValidationAdapter({})).toBe(false);
  });
  it('freezes validation results on success', () => {
    validateBatchMock.mockReturnValueOnce(successResult);
    const adapter = createGatewayValidationAdapter({} as ValidationContext);

    const result = adapter.validateRequest(stubRequest);
    expect(result.status).toBe('success');
    expect(Object.isFrozen(result.validatedTypes)).toBe(true);
    expect(result.metrics?.evaluatedAtomic).toBe(1);
  });

  it('handles success responses without metrics', () => {
    const noMetrics: ValidationResult = {
      status: 'success',
      validatedTypes: ['contest'],
      firstError: null,
      metrics: undefined,
    };
    validateBatchMock.mockReturnValueOnce(noMetrics);
    const adapter = createGatewayValidationAdapter({} as ValidationContext);
    const result = adapter.assertValid(stubRequest);
    expect(result.metrics).toBeUndefined();
  });
  it('throws contest chain error on failure', () => {
    validateBatchMock.mockReturnValueOnce(failureResult);
    const adapter = createGatewayValidationAdapter({} as ValidationContext);

    expect(() => adapter.assertValid(stubRequest)).toThrow(/Validation failed/);
  });
});

describe('createGatewayValidationContext', () => {
  it('loads validation context and returns adapter', () => {
    loadValidationContextMock.mockReturnValueOnce({} as ValidationContext);
    validateBatchMock.mockReturnValueOnce(successResult);

    const adapter = createGatewayValidationContext({ registry: {} });
    expect(isGatewayValidationAdapter(adapter)).toBe(true);
    expect(loadValidationContextMock).toHaveBeenCalled();
    adapter.validateRequest(stubRequest);
    expect(validateBatchMock).toHaveBeenCalled();
  });
});
