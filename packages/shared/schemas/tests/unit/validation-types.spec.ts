import { describe, expect, it } from 'vitest';
import {
  createValidationEntrySchema,
  createValidationErrorSchema,
  createValidationMetricsSchema,
  createValidationRequestSchema,
  createValidationResultSchema,
} from '../../src/types/validation.js';

describe('validation type schemas', () => {
  it('parses validation entry and request structures', () => {
    const entrySchema = createValidationEntrySchema();
    const requestSchema = createValidationRequestSchema();

    const entry = entrySchema.parse({ type: 'sample-type', value: 42 });
    expect(entry).toEqual({ type: 'sample-type', value: 42 });

    const request = requestSchema.parse({
      entries: [entry],
      batchId: 'batch-1',
    });

    expect(request.entries).toHaveLength(1);
  });

  it('parses validation error payloads with detailed structures', () => {
    const errorSchema = createValidationErrorSchema();

    const atomicError = errorSchema.parse({
      type: 'atomic-type',
      message: 'Atomic failure',
      detail: {
        reason: 'atomic-validation-failed',
        issues: [
          {
            path: ['value'],
            message: 'Value invalid',
            code: 'custom',
          },
        ],
      },
    });

    expect(atomicError.detail?.reason).toBe('atomic-validation-failed');

    const compositeError = errorSchema.parse({
      type: 'composite-type',
      message: 'Composite failure',
      detail: {
        reason: 'composite-validation-failed',
        dependencyTypes: ['atomic-type'],
        references: [{ type: 'atomic-type', path: ['value'] }],
      },
    });

    expect(compositeError.detail?.reason).toBe('composite-validation-failed');
  });

  it('parses validation result metrics', () => {
    const metricsSchema = createValidationMetricsSchema();
    const resultSchema = createValidationResultSchema();

    const metrics = metricsSchema.parse({
      evaluatedAtomic: 3,
      evaluatedComposite: 1,
      durationMs: 12,
      environmentId: 'test-env',
    });

    expect(metrics.environmentId).toBe('test-env');

    const successResult = resultSchema.parse({
      status: 'success',
      validatedTypes: ['sample-type'],
      firstError: null,
      metrics,
    });

    expect(successResult.status).toBe('success');
  });
});
