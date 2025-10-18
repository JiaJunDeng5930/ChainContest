import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { loadValidationContext, validateBatch } from '../../src/index.js';

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
      schema: z.number().int().min(1).max(1_000),
    },
  },
];

const environmentOverrides = [
  {
    environmentId: 'prod',
    activatedAt: '2025-10-18T00:00:00.000Z',
    overrides: {
      'transfer-amount': {
        rule: {
          description: 'Production transfer amount must be <= 500',
          failureMessage: 'Production transfer amount exceeds limit',
          schema: z.number().int().min(1).max(500),
        },
      },
    },
  },
];

describe('environment overrides', () => {
  it('applies overrides when environmentId is provided', () => {
    const context = loadValidationContext({
      registry: registryDefinition,
      environmentOverrides,
      environmentId: 'prod',
    });

    const result = validateBatch(
      {
        entries: [
          { type: 'sender-address', value: '0xabc123ef' },
          { type: 'transfer-amount', value: 750 },
        ],
      },
      context,
    );

    expect(result.status).toBe('failure');
    expect(result.firstError).toMatchObject({
      type: 'transfer-amount',
      message: 'Production transfer amount exceeds limit',
    });
    expect(result.metrics?.environmentId).toBe('prod');
  });

  it('defaults to base registry when environmentId is omitted', () => {
    const context = loadValidationContext({
      registry: registryDefinition,
      environmentOverrides,
    });

    const result = validateBatch(
      {
        entries: [
          { type: 'sender-address', value: '0xabc123ef' },
          { type: 'transfer-amount', value: 750 },
        ],
      },
      context,
    );

    expect(result.status).toBe('success');
  });

  it('rejects overrides referencing unknown type keys', () => {
    expect(() =>
      loadValidationContext({
        registry: registryDefinition,
        environmentOverrides: [
          {
            environmentId: 'prod',
            activatedAt: '2025-10-18T00:00:00.000Z',
            overrides: {
              'unknown-type': {
                rule: {
                  description: 'Invalid override',
                  failureMessage: 'Should never apply',
                  schema: z.number().int(),
                },
              },
            },
          },
        ],
      }),
    ).toThrowError(/unknown type/i);
  });
});
