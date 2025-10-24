import { describe, expect, it } from 'vitest';
import { createExecutionPlan, DependencyCycleError } from '../../src/engine/dependency-graph.js';

const registryWithCycle = [
  {
    typeKey: 'a',
    kind: 'composite' as const,
    dependencies: ['b'],
    rule: { description: 'a', failureMessage: 'a failed', composite: () => {} },
  },
  {
    typeKey: 'b',
    kind: 'composite' as const,
    dependencies: ['a'],
    rule: { description: 'b', failureMessage: 'b failed', composite: () => {} },
  },
];

describe('dependency graph - cycle detection', () => {
  it('throws DependencyCycleError when registry contains a cycle', () => {
    expect(() => createExecutionPlan(registryWithCycle as any)).toThrow(
      DependencyCycleError,
    );
  });
});

