import { loadValidationContext } from './engine/context.js';
import { validateBatch } from './engine/executor.js';
import type { ValidationContext, ValidationContextOptions } from './engine/context.js';
import type {
  ValidationRequest,
  ValidationResult,
} from './types/validation.js';
import type { TypeDescriptor } from './types/registry.js';

export { loadValidationContext, validateBatch };
export type {
  ValidationContext,
  ValidationContextOptions,
  ValidationRequest,
  ValidationResult,
};
export type { TypeDescriptor } from './types/registry.js';
export type {
  AtomicValidationErrorDetail,
  CompositeValidationErrorDetail,
  CompositeValidationReference,
  MissingDependenciesDetail,
  ValidationIssueSummary,
  ValidationError,
  ValidationMetrics,
} from './types/validation.js';

export const listRegisteredTypes = (context: ValidationContext): {
  types: TypeDescriptor[];
} => ({
  types: context.registry.map((entry) => ({
    type: entry.typeKey,
    kind: entry.kind,
    dependencies: [...entry.dependencies],
    description: entry.rule.description,
  })),
});

export { z } from 'zod';
