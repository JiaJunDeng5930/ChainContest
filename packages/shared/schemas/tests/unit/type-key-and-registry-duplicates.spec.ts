import { describe, expect, it } from 'vitest';
import {
  createTypeKeySchema,
  createValidationRegistrySchema,
} from '../../src/types/registry.js';

describe('type key and registry schema edge cases', () => {
  it('rejects type keys with version suffix', () => {
    const schema = createTypeKeySchema();
    expect(() => schema.parse('metric-v2')).toThrow(/must not end with a version suffix/i);
    expect(() => schema.parse('metric_v3')).toThrow(/must not end with a version suffix/i);
    expect(() => schema.parse('metric')).not.toThrow();
  });

  it('rejects duplicate type keys in registry', () => {
    const schema = createValidationRegistrySchema();
    expect(() =>
      schema.parse([
        { typeKey: 'a', kind: 'atomic', dependencies: [], rule: { description: 'a', failureMessage: 'a' } },
        { typeKey: 'a', kind: 'atomic', dependencies: [], rule: { description: 'a', failureMessage: 'a' } },
      ] as any),
    ).toThrow(/appears more than once/);
  });
});

