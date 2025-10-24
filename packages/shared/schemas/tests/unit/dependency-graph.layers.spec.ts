import { describe, expect, it } from 'vitest';
import { createExecutionPlan } from '../../src/engine/dependency-graph.js';

const layeredRegistry = [
  {
    typeKey: 'base',
    kind: 'atomic' as const,
    dependencies: [],
    rule: { description: 'base', failureMessage: 'base failed', schema: { parse: (v: unknown) => v } as any },
  },
  {
    typeKey: 'level-1',
    kind: 'composite' as const,
    dependencies: ['base'],
    rule: { description: 'l1', failureMessage: 'l1 failed', composite: () => {} },
  },
  {
    typeKey: 'level-2',
    kind: 'composite' as const,
    dependencies: ['level-1'],
    rule: { description: 'l2', failureMessage: 'l2 failed', composite: () => {} },
  },
];

describe('dependency graph - layered composites', () => {
  it('orders atomic first and composites by layers', () => {
    const plan = createExecutionPlan(layeredRegistry as any);

    // ordered sequence should respect dependencies
    expect(plan.ordered.map((e) => e.typeKey)).toEqual([
      'base',
      'level-1',
      'level-2',
    ]);

    // stages should contain atomic stage then two composite layers
    expect(plan.stages).toHaveLength(3);
    expect(plan.stages[0].kind).toBe('atomic');
    expect(plan.stages[0].entries.map((e) => e.typeKey)).toEqual(['base']);
    expect(plan.stages[1].kind).toBe('composite');
    expect(plan.stages[1].entries.map((e) => e.typeKey)).toEqual(['level-1']);
    expect(plan.stages[2].kind).toBe('composite');
    expect(plan.stages[2].entries.map((e) => e.typeKey)).toEqual(['level-2']);
  });
});

