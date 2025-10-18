import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  ConfigurationError,
  mergeRegistryWithOverrides,
  parseEnvironmentOverrides,
  parseRegistryDefinition,
} from '../../src/registry/schema.js';
import { loadValidationContext } from '../../src/engine/context.js';

const baseRegistryInput = [
  {
    typeKey: 'metric-a',
    kind: 'atomic' as const,
    dependencies: [],
    rule: {
      description: 'Metric A must be non-negative',
      failureMessage: 'Metric A is negative',
      schema: z.number().min(0),
    },
  },
  {
    typeKey: 'composite-a',
    kind: 'composite' as const,
    dependencies: ['metric-a'],
    rule: {
      description: 'Composite A validates metric A summary',
      failureMessage: 'Composite A failed',
      composite: ({ dependencies, addIssue }) => {
        const metric = dependencies['metric-a'];
        if (typeof metric === 'number' && metric > 1_000) {
          addIssue({
            detail: {
              violation: 'metric-a-exceeds-threshold',
            },
          });
        }
      },
    },
  },
];

describe('registry schema utilities', () => {
  it('merges environment overrides and returns latest activation time', () => {
    const registry = parseRegistryDefinition(baseRegistryInput);
    const overridesInput = [
      {
        environmentId: 'prod',
        activatedAt: '2025-10-18T09:00:00.000Z',
        overrides: {
          'metric-a': {
            rule: {
              description: 'Prod metric A threshold',
              failureMessage: 'Prod metric A invalid',
              schema: z.number().min(10),
            },
          },
        },
      },
      {
        environmentId: 'prod',
        activatedAt: '2025-10-18T12:00:00.000Z',
        overrides: {
          'metric-a': {
            rule: {
              description: 'Prod metric A tightened',
              failureMessage: 'Prod metric A failed tightened rule',
              schema: z.number().min(100),
            },
          },
        },
      },
    ];

    const parsedOverrides = parseEnvironmentOverrides(overridesInput, registry);
    const { registry: merged, activatedAt } = mergeRegistryWithOverrides(
      registry,
      parsedOverrides,
      'prod',
    );

    const metricEntry = merged.find((entry) => entry.typeKey === 'metric-a');
    expect(metricEntry?.rule.failureMessage).toBe('Prod metric A failed tightened rule');
    expect(activatedAt).toBe('2025-10-18T12:00:00.000Z');
  });

  it('throws ConfigurationError when overrides introduce self-dependency', () => {
    const registry = parseRegistryDefinition(baseRegistryInput);
    const overridesInput = [
      {
        environmentId: 'prod',
        activatedAt: '2025-10-18T10:00:00.000Z',
        overrides: {
          'composite-a': {
            dependencies: ['composite-a'],
          },
        },
      },
    ];

    const parsedOverrides = parseEnvironmentOverrides(overridesInput, registry);

    expect(() =>
      mergeRegistryWithOverrides(registry, parsedOverrides, 'prod'),
    ).toThrow(ConfigurationError);
  });

  it('rejects composite entries without dependencies', () => {
    const invalidRegistry = [
      {
        typeKey: 'invalid-composite',
        kind: 'composite' as const,
        dependencies: [],
        rule: {
          description: 'Invalid composite',
          failureMessage: 'Should fail',
          composite: () => {},
        },
      },
    ];

    expect(() => parseRegistryDefinition(invalidRegistry)).toThrowError(
      /must declare at least one dependency/,
    );
  });

  it('rejects overrides that add dependencies to atomic types', () => {
    const registry = parseRegistryDefinition(baseRegistryInput);
    const overridesInput = [
      {
        environmentId: 'prod',
        activatedAt: '2025-10-18T09:00:00.000Z',
        overrides: {
          'metric-a': {
            dependencies: ['metric-a'],
          },
        },
      },
    ];

    expect(() => parseEnvironmentOverrides(overridesInput, registry)).toThrowError(
      /must not add dependencies/,
    );
  });

  it('rejects overrides referencing unknown dependency keys', () => {
    const registry = parseRegistryDefinition(baseRegistryInput);
    const overridesInput = [
      {
        environmentId: 'prod',
        activatedAt: '2025-10-18T09:00:00.000Z',
        overrides: {
          'composite-a': {
            dependencies: ['unknown-type'],
          },
        },
      },
    ];

    expect(() => parseEnvironmentOverrides(overridesInput, registry)).toThrowError(
      /references unknown dependency/,
    );
  });

  it('requires atomic entries to provide rule.schema', () => {
    const registry = [
      {
        typeKey: 'no-schema',
        kind: 'atomic' as const,
        dependencies: [],
        rule: {
          description: 'Missing schema should fail',
          failureMessage: 'Should not load',
        },
      } as unknown,
    ];

    expect(() => loadValidationContext({ registry })).toThrowError(
      /missing rule\.schema/,
    );
  });

  it('requires composite entries to provide rule.composite', () => {
    const registry = [
      {
        typeKey: 'example',
        kind: 'atomic' as const,
        dependencies: [],
        rule: {
          description: 'Example atomic',
          failureMessage: 'Example atomic failed',
          schema: z.number(),
        },
      },
      {
        typeKey: 'no-composite',
        kind: 'composite' as const,
        dependencies: ['example'],
        rule: {
          description: 'Missing composite handler should fail',
          failureMessage: 'Should not load',
        },
      } as unknown,
    ];

    expect(() => loadValidationContext({ registry })).toThrowError(
      /missing rule\.composite/,
    );
  });
});
