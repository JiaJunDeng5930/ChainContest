import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { loadValidationContext, validateBatch } from '../../src/index.js';

const isoDate = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), {
    message: 'Value must be an ISO-8601 timestamp',
  })
  .transform((value) => new Date(value));

const registryDefinition = [
  {
    typeKey: 'start-time',
    kind: 'atomic',
    dependencies: [],
    rule: {
      description: 'Start time must be a valid ISO timestamp',
      failureMessage: 'Invalid start time',
      schema: isoDate,
    },
  },
  {
    typeKey: 'end-time',
    kind: 'atomic',
    dependencies: [],
    rule: {
      description: 'End time must be a valid ISO timestamp',
      failureMessage: 'Invalid end time',
      schema: isoDate,
    },
  },
  {
    typeKey: 'event-window',
    kind: 'composite',
    dependencies: ['start-time', 'end-time'],
    rule: {
      description: 'End time must not precede start time',
      failureMessage: 'Event window is invalid',
      composite: ({ dependencies, addIssue }) => {
        const start = dependencies['start-time'] as Date;
        const end = dependencies['end-time'] as Date;

        if (end.getTime() < start.getTime()) {
          addIssue({
            message: 'End time must be on or after start time',
            detail: {
              violation: 'end-before-start',
              references: [
                { type: 'start-time' },
                { type: 'end-time', path: ['value'] },
              ],
            },
          });
        }
      },
    },
  },
];

const context = loadValidationContext({ registry: registryDefinition });

describe('composite invariants', () => {
  it('returns success when composite invariant holds', () => {
    const result = validateBatch(
      {
        entries: [
          { type: 'start-time', value: '2025-10-18T09:00:00.000Z' },
          { type: 'end-time', value: '2025-10-18T10:00:00.000Z' },
          { type: 'event-window', value: null },
        ],
      },
      context,
    );

    expect(result.status).toBe('success');
    expect(result.validatedTypes).toEqual([
      'start-time',
      'end-time',
      'event-window',
    ]);
  });

  it('reports composite failure with dependency references', () => {
    const result = validateBatch(
      {
        entries: [
          { type: 'start-time', value: '2025-10-18T11:00:00.000Z' },
          { type: 'end-time', value: '2025-10-18T10:00:00.000Z' },
          { type: 'event-window', value: null },
        ],
      },
      context,
    );

    expect(result.status).toBe('failure');
    expect(result.firstError).toMatchObject({
      type: 'event-window',
      message: 'End time must be on or after start time',
    });
    expect(result.firstError?.detail).toMatchObject({
      violation: 'end-before-start',
      dependencyTypes: ['start-time', 'end-time'],
    });
  });

  it('fails fast when dependencies are missing', () => {
    const result = validateBatch(
      {
        entries: [
          { type: 'start-time', value: '2025-10-18T11:00:00.000Z' },
          { type: 'event-window', value: null },
        ],
      },
      context,
    );

    expect(result.status).toBe('failure');
    expect(result.firstError).toMatchObject({
      type: 'event-window',
      detail: { reason: 'missing-dependencies', missing: ['end-time'] },
    });
  });

  it('falls back to default composite detail when none is provided', () => {
    const localContext = loadValidationContext({
      registry: [
        {
          typeKey: 'flag',
          kind: 'atomic',
          dependencies: [],
          rule: {
            description: 'Flag must be true',
            failureMessage: 'Invalid flag',
            schema: z.boolean(),
          },
        },
        {
          typeKey: 'flag-check',
          kind: 'composite',
          dependencies: ['flag'],
          rule: {
            description: 'Composite ensures flag remains true',
            failureMessage: 'Composite flag check failed',
            composite: ({ dependencies, addIssue }) => {
              if (dependencies['flag'] === false) {
                addIssue({});
              }
            },
          },
        },
      ],
    });

    const result = validateBatch(
      {
        entries: [
          { type: 'flag', value: false },
          { type: 'flag-check', value: null },
        ],
      },
      localContext,
    );

    expect(result.status).toBe('failure');
    expect(result.firstError).toMatchObject({
      type: 'flag-check',
      message: 'Composite flag check failed',
      detail: {
        violation: 'Composite flag check failed',
        dependencyTypes: ['flag'],
      },
    });
  });
});
