import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { loadValidationContext, validateBatch } from '../../src/index.js';

describe('validation performance', () => {
  it('processes 100 atomic entries within one second', () => {
    const registry = [
      {
        typeKey: 'payload',
        kind: 'atomic',
        dependencies: [],
        rule: {
          description: 'Payload must be a non-empty string',
          failureMessage: 'Invalid payload',
          schema: z.string().min(1),
        },
      },
    ];

    const context = loadValidationContext({ registry });
    const entries = Array.from({ length: 100 }, (_, index) => ({
      type: 'payload',
      value: `value-${index}`,
    }));

    const result = validateBatch({ entries }, context);

    expect(result.status).toBe('success');
    expect(result.metrics?.evaluatedAtomic).toBe(100);
    expect(result.metrics?.durationMs ?? Number.POSITIVE_INFINITY).toBeLessThan(1_000);
  });
});
