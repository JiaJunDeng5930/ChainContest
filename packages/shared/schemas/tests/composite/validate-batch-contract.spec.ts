import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  listRegisteredTypes,
  loadValidationContext,
  validateBatch,
} from '../../src/index.js';
import { createValidationResultSchema } from '../../src/types/validation.js';

const registryDefinition = [
  {
    typeKey: 'sender-address',
    kind: 'atomic',
    dependencies: [],
    rule: {
      description: 'Sender address must be a hex string',
      failureMessage: 'Invalid sender address',
      schema: z.string().regex(/^0x[a-f0-9]{8}$/i),
    },
  },
  {
    typeKey: 'transfer-amount',
    kind: 'atomic',
    dependencies: [],
    rule: {
      description: 'Transfer amount must be positive and <= 1000',
      failureMessage: 'Invalid transfer amount',
      schema: z.number().int().min(1).max(1000),
    },
  },
  {
    typeKey: 'transfer-audit',
    kind: 'composite',
    dependencies: ['sender-address', 'transfer-amount'],
    rule: {
      description: 'Composite audit ensures amount does not exceed maximum',
      failureMessage: 'Transfer exceeds composite threshold',
      composite: ({ dependencies, addIssue }) => {
        const amount = dependencies['transfer-amount'];
        if (typeof amount === 'number' && amount > 900) {
          addIssue({
            message: 'Transfer amount exceeds allowed threshold',
            detail: {
              dependencyTypes: ['transfer-amount'],
              references: [{ type: 'transfer-amount' }],
              metadata: { limit: 900, actual: amount },
            },
          });
        }
      },
    },
  },
];

describe('validation contract conformance', () => {
  it('matches the OpenAPI success schema', () => {
    const context = loadValidationContext({ registry: registryDefinition });
    const schema = createValidationResultSchema();

    const result = validateBatch(
      {
        entries: [
          { type: 'sender-address', value: '0xabc123ef' },
          { type: 'transfer-amount', value: 750 },
          { type: 'transfer-audit', value: { reason: 'initial' } },
        ],
      },
      context,
    );

    expect(result.status).toBe('success');
    expect(() => schema.parse(result)).not.toThrow();
    expect(result.metrics).toMatchObject({
      evaluatedAtomic: 2,
      evaluatedComposite: 1,
    });
  });

  it('returns a 422-style failure payload when the composite rule fails', () => {
    const context = loadValidationContext({ registry: registryDefinition });
    const schema = createValidationResultSchema();

    const result = validateBatch(
      {
        entries: [
          { type: 'sender-address', value: '0xabc123ef' },
          { type: 'transfer-amount', value: 950 },
          { type: 'transfer-audit', value: { reason: 'limit test' } },
        ],
      },
      context,
    );

    expect(result.status).toBe('failure');
    expect(result.firstError).toMatchObject({
      type: 'transfer-audit',
      message: 'Transfer amount exceeds allowed threshold',
      detail: {
        violation: 'Transfer amount exceeds allowed threshold',
        dependencyTypes: ['transfer-amount'],
        references: [{ type: 'transfer-amount' }],
        metadata: { limit: 900, actual: 950 },
      },
    });
    expect(() => schema.parse(result)).not.toThrow();
  });

  it('lists registered types for consumers', () => {
    const context = loadValidationContext({ registry: registryDefinition });
    const types = listRegisteredTypes(context);

    expect(types).toEqual({
      types: [
        {
          type: 'sender-address',
          kind: 'atomic',
          dependencies: [],
          description: 'Sender address must be a hex string',
        },
        {
          type: 'transfer-amount',
          kind: 'atomic',
          dependencies: [],
          description: 'Transfer amount must be positive and <= 1000',
        },
        {
          type: 'transfer-audit',
          kind: 'composite',
          dependencies: ['sender-address', 'transfer-amount'],
          description: 'Composite audit ensures amount does not exceed maximum',
        },
      ],
    });
  });
});
