import { z } from 'zod';
import { createTypeKeySchema } from './registry.js';

export interface ValidationEntry {
  type: string;
  value: unknown;
}

export interface ValidationRequest {
  batchId?: string;
  entries: readonly ValidationEntry[];
  context?: Record<string, unknown>;
}

export type ScalarPath = string | number;

export interface ValidationIssueSummary {
  path: ReadonlyArray<ScalarPath>;
  message: string;
  code: string;
  [key: string]: unknown;
}

export interface AtomicValidationErrorDetail extends Record<string, unknown> {
  reason: 'atomic-validation-failed';
  issues: ReadonlyArray<ValidationIssueSummary>;
}

export interface MissingDependenciesDetail extends Record<string, unknown> {
  reason: 'missing-dependencies';
  missing: ReadonlyArray<string>;
}

export interface CompositeValidationReference
  extends Record<string, unknown> {
  type: string;
  path?: ReadonlyArray<ScalarPath>;
}

export interface CompositeValidationErrorDetail
  extends Record<string, unknown> {
  reason: 'composite-validation-failed';
  violation?: string;
  dependencyTypes?: ReadonlyArray<string>;
  references?: ReadonlyArray<CompositeValidationReference>;
  metadata?: Record<string, unknown>;
}

export type ValidationErrorDetail =
  | AtomicValidationErrorDetail
  | CompositeValidationErrorDetail
  | MissingDependenciesDetail
  | Record<string, unknown>;

export interface ValidationError {
  type: string;
  message: string;
  detail?: ValidationErrorDetail;
}

export interface ValidationMetrics {
  evaluatedAtomic: number;
  evaluatedComposite: number;
  durationMs: number;
  environmentId?: string;
}

export interface ValidationSuccessResult {
  status: 'success';
  validatedTypes: readonly string[];
  firstError: null;
  metrics?: ValidationMetrics;
}

export interface ValidationFailureResult {
  status: 'failure';
  validatedTypes: readonly string[];
  firstError: ValidationError;
  metrics?: ValidationMetrics;
}

export type ValidationResult = ValidationSuccessResult | ValidationFailureResult;

const typeKeySchema = createTypeKeySchema();

const validationEntrySchema = z.object({
  type: typeKeySchema,
  value: z.unknown(),
});

const validationRequestSchema = z.object({
  batchId: z.string().min(1).optional(),
  entries: z.array(validationEntrySchema).min(1, 'entries must contain at least one item'),
  context: z.record(z.unknown()).optional(),
});

const scalarPathSchema = z.union([z.string(), z.number()]);

const validationIssueSchema = z.object({
  path: z.array(scalarPathSchema),
  message: z.string(),
  code: z.string(),
}).catchall(z.unknown());

const atomicDetailSchema = z
  .object({
    reason: z.literal('atomic-validation-failed'),
    issues: z.array(validationIssueSchema),
  })
  .catchall(z.unknown());

const missingDependenciesSchema = z
  .object({
    reason: z.literal('missing-dependencies'),
    missing: z.array(typeKeySchema),
  })
  .catchall(z.unknown());

const compositeReferenceSchema = z
  .object({
    type: typeKeySchema,
    path: z.array(scalarPathSchema).optional(),
  })
  .catchall(z.unknown());

const compositeDetailSchema = z
  .object({
    reason: z.literal('composite-validation-failed'),
    violation: z.string().optional(),
    dependencyTypes: z.array(typeKeySchema).optional(),
    references: z.array(compositeReferenceSchema).optional(),
    metadata: z.record(z.unknown()).optional(),
  })
  .catchall(z.unknown());

const validationErrorDetailSchema = z.union([
  atomicDetailSchema,
  missingDependenciesSchema,
  compositeDetailSchema,
  z.record(z.unknown()),
]);

const validationErrorSchema = z.object({
  type: typeKeySchema,
  message: z.string().min(1, 'message is required'),
  detail: validationErrorDetailSchema.optional(),
});

const validationMetricsSchema = z.object({
  evaluatedAtomic: z.number().int().min(0),
  evaluatedComposite: z.number().int().min(0),
  durationMs: z.number().min(0),
  environmentId: z.string().min(1).optional(),
});

const validationSuccessSchema = z.object({
  status: z.literal('success'),
  validatedTypes: z.array(typeKeySchema),
  firstError: z.null(),
  metrics: validationMetricsSchema.optional(),
});

const validationFailureSchema = z.object({
  status: z.literal('failure'),
  validatedTypes: z.array(typeKeySchema),
  firstError: validationErrorSchema,
  metrics: validationMetricsSchema.optional(),
});

const validationResultSchema = z.discriminatedUnion('status', [
  validationSuccessSchema,
  validationFailureSchema,
]);

export const createValidationEntrySchema = () => validationEntrySchema;
export const createValidationRequestSchema = () => validationRequestSchema;
export const createValidationErrorSchema = () => validationErrorSchema;
export const createValidationMetricsSchema = () => validationMetricsSchema;
export const createValidationResultSchema = () => validationResultSchema;
