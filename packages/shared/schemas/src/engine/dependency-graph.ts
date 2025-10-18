import {
  type RegistryEntry,
  type RegistryEntryKind,
  type ValidationRegistry,
} from '../types/registry.js';

export class DependencyCycleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DependencyCycleError';
  }
}

export interface ExecutionPlanLayer {
  readonly kind: RegistryEntryKind;
  readonly entries: readonly RegistryEntry[];
}

export interface ExecutionPlan {
  readonly ordered: readonly RegistryEntry[];
  readonly stages: readonly ExecutionPlanLayer[];
  readonly entryByType: Readonly<Record<string, RegistryEntry>>;
}

export const createExecutionPlan = (
  registry: ValidationRegistry,
): ExecutionPlan => {
  const entryByType = Object.fromEntries(
    registry.map((entry) => [entry.typeKey, entry]),
  ) as Record<string, RegistryEntry>;
  const resolveEntry = (typeKey: string): RegistryEntry => {
    const entry = entryByType[typeKey];
    if (!entry) {
      throw new DependencyCycleError(
        `Missing validation registry entry for type "${typeKey}"`,
      );
    }
    return entry;
  };

  const indegree = new Map<string, number>();
  const adjacency = new Map<string, Set<string>>();

  registry.forEach((entry) => {
    indegree.set(entry.typeKey, entry.dependencies.length);
    entry.dependencies.forEach((dependency) => {
      const followers = adjacency.get(dependency) ?? new Set<string>();
      followers.add(entry.typeKey);
      adjacency.set(dependency, followers);
    });
  });

  const queue: string[] = [];
  const depth = new Map<string, number>();

  indegree.forEach((value, typeKey) => {
    if (value === 0) {
      queue.push(typeKey);
      depth.set(typeKey, 0);
    }
  });

  const ordered: RegistryEntry[] = [];
  const atomicEntries: RegistryEntry[] = [];
  const compositeLayersMap = new Map<number, RegistryEntry[]>();

  while (queue.length > 0) {
    const typeKey = queue.shift()!;
    const entry = resolveEntry(typeKey);
    ordered.push(entry);

    const entryDepth = depth.get(typeKey) ?? 0;

    if (entry.kind === 'atomic') {
      atomicEntries.push(entry);
    } else {
      const layerIndex = Math.max(entryDepth - 1, 0);
      const layer = compositeLayersMap.get(layerIndex) ?? [];
      layer.push(entry);
      compositeLayersMap.set(layerIndex, layer);
    }

    const followers = adjacency.get(typeKey);
    if (!followers) {
      continue;
    }

    followers.forEach((followerKey) => {
      const followerEntry = resolveEntry(followerKey);
      const remaining = (indegree.get(followerKey) ?? 0) - 1;
      indegree.set(followerKey, remaining);

      if (remaining === 0) {
        const dependencyDepths = followerEntry.dependencies.map(
          (dependency) => depth.get(dependency) ?? 0,
        );
        const followerDepth =
          dependencyDepths.length === 0
            ? 0
            : Math.max(...dependencyDepths) + (followerEntry.kind === 'composite' ? 1 : 0);
        depth.set(followerKey, followerDepth);
        queue.push(followerKey);
      }
    });
  }

  if (ordered.length !== registry.length) {
    throw new DependencyCycleError('Detected cycle in validation registry');
  }

  const compositeLayers: ExecutionPlanLayer[] = Array.from(
    compositeLayersMap.entries(),
  )
    .sort((a, b) => a[0] - b[0])
    .map(([, entries]) => ({
      kind: 'composite' as const,
      entries,
    }));

  const stages: ExecutionPlanLayer[] = [];
  if (atomicEntries.length > 0) {
    stages.push({ kind: 'atomic', entries: atomicEntries });
  }
  stages.push(...compositeLayers);

  return {
    ordered,
    stages,
    entryByType,
  };
};
