import {
  createEnvironmentOverrideCollectionSchema,
  createValidationRegistrySchema,
  type EnvironmentOverride,
  type RegistryEntry,
  type RegistryEntryOverride,
  type ValidationRegistry,
} from '../types/registry.js';

export class RegistrySchemaError extends Error {
  readonly path?: ReadonlyArray<string | number>;

  constructor(message: string, path?: ReadonlyArray<string | number>) {
    super(message);
    this.name = 'RegistrySchemaError';
    this.path = path;
  }
}

export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigurationError';
  }
}

const registrySchema = createValidationRegistrySchema();
const environmentOverridesSchema = createEnvironmentOverrideCollectionSchema();

const ensureDependenciesAreKnown = (
  entry: RegistryEntry,
  registryMap: Map<string, RegistryEntry>,
) => {
  const { typeKey, kind, dependencies } = entry;

  if (kind === 'atomic' && dependencies.length > 0) {
    throw new RegistrySchemaError(
      `Atomic entry "${typeKey}" must not declare dependencies`,
      ['dependencies'],
    );
  }

  if (kind === 'composite' && dependencies.length === 0) {
    throw new RegistrySchemaError(
      `Composite entry "${typeKey}" must declare at least one dependency`,
      ['dependencies'],
    );
  }

  const seen = new Set<string>();
  dependencies.forEach((dependency, index) => {
    if (!registryMap.has(dependency)) {
      throw new RegistrySchemaError(
        `Entry "${typeKey}" depends on unknown type "${dependency}"`,
        ['dependencies', index],
      );
    }

    if (dependency === typeKey) {
      throw new RegistrySchemaError(
        `Entry "${typeKey}" cannot depend on itself`,
        ['dependencies', index],
      );
    }

    if (seen.has(dependency)) {
      throw new RegistrySchemaError(
        `Entry "${typeKey}" declares duplicate dependency "${dependency}"`,
        ['dependencies', index],
      );
    }

    seen.add(dependency);
  });
};

const assertRegistryConsistency = (registry: ValidationRegistry) => {
  const registryMap = new Map(registry.map((entry) => [entry.typeKey, entry]));
  registry.forEach((entry) => {
    ensureDependenciesAreKnown(entry, registryMap);
  });
};

const cloneEntry = (entry: RegistryEntry): RegistryEntry => ({
  ...entry,
  dependencies: [...entry.dependencies],
  rule: {
    ...entry.rule,
  },
  metadata: entry.metadata ? { ...entry.metadata } : undefined,
});

const mergeEntry = (
  entry: RegistryEntry,
  override: RegistryEntryOverride,
): RegistryEntry => {
  const mergedRule = override.rule
    ? {
        ...entry.rule,
        ...override.rule,
      }
    : entry.rule;

  const mergedDependencies =
    override.dependencies !== undefined
      ? [...override.dependencies]
      : entry.dependencies;

  const mergedMetadata =
    override.metadata !== undefined
      ? {
          ...(entry.metadata ?? {}),
          ...override.metadata,
        }
      : entry.metadata;

  return {
    ...entry,
    ...override,
    dependencies: mergedDependencies,
    rule: mergedRule,
    metadata: mergedMetadata,
  };
};

export const parseRegistryDefinition = (input: unknown): ValidationRegistry => {
  const registry = registrySchema.parse(input);
  assertRegistryConsistency(registry);

  return registry;
};

export const parseEnvironmentOverrides = (
  input: unknown,
  registry: ValidationRegistry,
): EnvironmentOverride[] => {
  const overrides = environmentOverridesSchema.parse(input);
  const registryMap = new Map(registry.map((entry) => [entry.typeKey, entry]));

  overrides.forEach((override) => {
    for (const [typeKey, partialEntry] of Object.entries(override.overrides)) {
      if (!registryMap.has(typeKey)) {
        throw new RegistrySchemaError(
          `Environment "${override.environmentId}" overrides unknown type "${typeKey}"`,
          ['overrides', typeKey],
        );
      }

      if (partialEntry.dependencies) {
        partialEntry.dependencies.forEach((dependency, dependencyIndex) => {
          if (!registryMap.has(dependency)) {
            throw new RegistrySchemaError(
              `Environment "${override.environmentId}" override for "${typeKey}" references unknown dependency "${dependency}"`,
              ['overrides', typeKey, 'dependencies', dependencyIndex],
            );
          }
        });
      }

      const baseEntry = registryMap.get(typeKey)!;
      if (
        partialEntry.dependencies &&
        baseEntry.kind === 'atomic' &&
        partialEntry.dependencies.length > 0
      ) {
        throw new RegistrySchemaError(
          `Environment "${override.environmentId}" override for atomic type "${typeKey}" must not add dependencies`,
          ['overrides', typeKey, 'dependencies'],
        );
      }

      if (
        baseEntry.kind === 'composite' &&
        partialEntry.dependencies &&
        partialEntry.dependencies.length === 0
      ) {
        throw new RegistrySchemaError(
          `Environment "${override.environmentId}" override for composite type "${typeKey}" must keep at least one dependency`,
          ['overrides', typeKey, 'dependencies'],
        );
      }
    }
  });

  return overrides;
};

export const mergeRegistryWithOverrides = (
  registry: ValidationRegistry,
  overrides: readonly EnvironmentOverride[],
  environmentId: string,
): { registry: ValidationRegistry; activatedAt?: string } => {
  if (overrides.length === 0) {
    return { registry };
  }

  const environmentOverrides = overrides.filter(
    (override) => override.environmentId === environmentId,
  );

  if (environmentOverrides.length === 0) {
    return { registry };
  }

  const mergedRegistry = registry.map(cloneEntry);
  const indexByType = new Map<string, number>();
  mergedRegistry.forEach((entry, index) => {
    indexByType.set(entry.typeKey, index);
  });

  environmentOverrides.forEach((override) => {
    Object.entries(override.overrides).forEach(([typeKey, partialEntry]) => {
      const index = indexByType.get(typeKey);

      if (index === undefined) {
        throw new ConfigurationError(
          `Override references unknown type "${typeKey}"`,
        );
      }

      const current = mergedRegistry[index];
      mergedRegistry[index] = mergeEntry(current, partialEntry);
    });
  });

  try {
    assertRegistryConsistency(mergedRegistry);
  } catch (error) {
    if (error instanceof RegistrySchemaError) {
      throw new ConfigurationError(error.message);
    }

    throw error;
  }

  const activatedAt = environmentOverrides
    .map((override) => override.activatedAt)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1);

  return { registry: mergedRegistry, activatedAt };
};
