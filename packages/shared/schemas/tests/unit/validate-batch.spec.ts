import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  loadValidationContext,
  validateBatch,
} from '../../src/index.js';

const registryDefinition = [
  {
    typeKey: 'sender-address',
    kind: 'atomic',
    dependencies: [],
    rule: {
      description: 'Sender address must be a hex string',
      failureMessage: 'Invalid sender address',
      schema: z
        .string()
        .startsWith('0x')
        .regex(/^0x[a-f0-9]{8}$/i, { message: 'Address must be 10 hex chars' }),
    },
  },
  {
    typeKey: 'transfer-amount',
    kind: 'atomic',
    dependencies: [],
    rule: {
      description: 'Transfer amount must be positive',
      failureMessage: 'Invalid transfer amount',
      schema: z.number().int().positive(),
    },
  },
];

describe('validateBatch', () => {
  it('returns success when every entry passes validation', () => {
    const context = loadValidationContext({ registry: registryDefinition });
    const result = validateBatch(
      {
        batchId: 'batch-success',
        entries: [
          { type: 'sender-address', value: '0xabc123ef' },
          { type: 'transfer-amount', value: 42 },
        ],
      },
      context,
    );

    expect(result.status).toBe('success');
    expect(result.firstError).toBeNull();
    expect(result.validatedTypes).toEqual([
      'sender-address',
      'transfer-amount',
    ]);
    expect(result.metrics).toMatchObject({
      evaluatedAtomic: 2,
      evaluatedComposite: 0,
      environmentId: 'default',
    });
  });

  it('short-circuits on the first atomic failure and omits later types', () => {
    const context = loadValidationContext({ registry: registryDefinition });
    const result = validateBatch(
      {
        batchId: 'batch-failure',
        entries: [
          { type: 'sender-address', value: '0xabc123ef' },
          { type: 'transfer-amount', value: -1 },
          { type: 'sender-address', value: '0xdeadbeef' },
        ],
      },
      context,
    );

    expect(result.status).toBe('failure');
    expect(result.validatedTypes).toEqual(['sender-address']);
    expect(result.firstError).toMatchObject({
      type: 'transfer-amount',
      message: 'Invalid transfer amount',
    });
    expect(result.metrics).toMatchObject({
      evaluatedAtomic: 2,
      evaluatedComposite: 0,
    });
  });

  it('fails with unknown type errors while preserving earlier successes', () => {
    const context = loadValidationContext({ registry: registryDefinition });
    const result = validateBatch(
      {
        entries: [
          { type: 'sender-address', value: '0xabc123ef' },
          { type: 'mystery-field', value: 123 },
        ],
      },
      context,
    );

    expect(result.status).toBe('failure');
    expect(result.validatedTypes).toEqual(['sender-address']);
    expect(result.firstError).toMatchObject({
      type: 'mystery-field',
      message: 'Unknown validation type "mystery-field"',
    });
    expect(result.metrics).toMatchObject({
      evaluatedAtomic: 1,
      evaluatedComposite: 0,
    });
  });
});
