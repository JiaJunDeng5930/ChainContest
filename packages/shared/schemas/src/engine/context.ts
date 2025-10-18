import type { ZodType } from 'zod';
import {
  mergeRegistryWithOverrides,
  parseEnvironmentOverrides,
  parseRegistryDefinition,
  RegistrySchemaError,
} from '../registry/schema.js';
import {
  type CompositeRuleEvaluator,
  type EnvironmentOverride,
  type RegistryEntry,
  type ValidationRegistry,
} from '../types/registry.js';
import { createExecutionPlan, type ExecutionPlan } from './dependency-graph.js';

export interface ValidationContextOptions {
  registry: unknown;
  environmentOverrides?: unknown;
  environmentId?: string;
}

export interface ValidationContext {
  readonly environmentId: string;
  readonly registry: ValidationRegistry;
  readonly plan: ExecutionPlan;
  readonly atomicSchemas: Readonly<Record<string, ZodType<unknown>>>;
  readonly compositeEvaluators: Readonly<Record<string, CompositeRuleEvaluator>>;
  readonly overrides: readonly EnvironmentOverride[];
  readonly activatedAt?: string;
}

const cloneEntry = (entry: RegistryEntry): RegistryEntry => ({
  ...entry,
  dependencies: [...entry.dependencies],
  rule: {
    ...entry.rule,
  },
  metadata: entry.metadata ? { ...entry.metadata } : undefined,
});

const prepareRegistry = (registry: ValidationRegistry): ValidationRegistry =>
  registry.map(cloneEntry);

const buildAtomicSchemaCache = (
  registry: ValidationRegistry,
): Record<string, ZodType<unknown>> => {
  const cache: Record<string, ZodType<unknown>> = {};

  registry.forEach((entry) => {
    if (entry.kind === 'atomic') {
      if (!entry.rule.schema) {
        throw new RegistrySchemaError(
          `Atomic entry "${entry.typeKey}" is missing rule.schema`,
          ['rule', 'schema'],
        );
      }

      cache[entry.typeKey] = entry.rule.schema;
    }
  });

  return cache;
};

const buildCompositeEvaluatorCache = (
  registry: ValidationRegistry,
): Record<string, CompositeRuleEvaluator> => {
  const cache: Record<string, CompositeRuleEvaluator> = {};

  registry.forEach((entry) => {
    if (entry.kind === 'composite') {
      if (!entry.rule.composite) {
        throw new RegistrySchemaError(
          `Composite entry "${entry.typeKey}" is missing rule.composite`,
          ['rule', 'composite'],
        );
      }

      cache[entry.typeKey] = entry.rule.composite;
    }
  });

  return cache;
};

export const loadValidationContext = (
  options: ValidationContextOptions,
): ValidationContext => {
  const registryDefinition = parseRegistryDefinition(options.registry);
  const overrides = options.environmentOverrides
    ? parseEnvironmentOverrides(options.environmentOverrides, registryDefinition)
    : [];

  const environmentId = options.environmentId ?? 'default';
  const { registry: mergedRegistry, activatedAt } = mergeRegistryWithOverrides(
    registryDefinition,
    overrides,
    environmentId,
  );

  const registry = prepareRegistry(mergedRegistry);
  const plan = createExecutionPlan(registry);
  const atomicSchemas = buildAtomicSchemaCache(registry);
  const compositeEvaluators = buildCompositeEvaluatorCache(registry);

  return {
    environmentId,
    registry,
    plan,
    atomicSchemas,
    compositeEvaluators,
    overrides,
    activatedAt,
  };
};
