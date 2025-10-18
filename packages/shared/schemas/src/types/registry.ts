import { z, type ZodType } from 'zod';

export type RegistryEntryKind = 'atomic' | 'composite';

export interface CompositeRuleReference {
  type: string;
  path?: ReadonlyArray<string | number>;
}

export interface CompositeRuleDetail {
  violation?: string;
  dependencyTypes?: ReadonlyArray<string>;
  references?: ReadonlyArray<CompositeRuleReference>;
  metadata?: Record<string, unknown>;
}

export interface CompositeRuleIssue {
  message?: string;
  detail?: CompositeRuleDetail;
}

export interface CompositeRuleContext {
  value: unknown;
  dependencies: Readonly<Record<string, unknown>>;
  addIssue: (issue: CompositeRuleIssue) => void;
}

export type CompositeRuleEvaluator = (context: CompositeRuleContext) => void;

export interface RegistryRuleDescriptor {
  description: string;
  failureMessage: string;
  parameters?: Record<string, unknown>;
  schema?: ZodType<unknown>;
  composite?: CompositeRuleEvaluator;
}

export interface RegistryEntry {
  typeKey: string;
  kind: RegistryEntryKind;
  dependencies: readonly string[];
  rule: RegistryRuleDescriptor;
  metadata?: Record<string, unknown>;
}

export type ValidationRegistry = readonly RegistryEntry[];

export type RegistryEntryOverride = Partial<
  Omit<RegistryEntry, 'typeKey' | 'kind'>
>;

export interface TypeDescriptor {
  type: string;
  kind: RegistryEntryKind;
  dependencies: readonly string[];
  description: string;
}

export interface EnvironmentOverride {
  environmentId: string;
  activatedAt: string;
  overrides: Readonly<Record<string, RegistryEntryOverride>>;
}

const typeKeyRegex = /^[a-z](?:[a-z0-9]*)(?:[-_][a-z0-9]+)*$/;
const versionSuffixRegex = /(?:^|[-_])v\d+$/;

const typeKeySchema = z
  .string()
  .min(1, 'typeKey is required')
  .max(128, 'typeKey is too long')
  .regex(typeKeyRegex, 'typeKey must use kebab or snake case')
  .refine((value) => !versionSuffixRegex.test(value), {
    message: 'typeKey must not end with a version suffix',
  });

const registryRuleSchema = z.object({
  description: z.string().min(1, 'rule.description is required'),
  failureMessage: z.string().min(1, 'rule.failureMessage is required'),
  parameters: z.record(z.unknown()).optional(),
  schema: z
    .custom<ZodType<unknown>>(
      (value) => typeof value === 'object' && value !== null,
      {
        message: 'rule.schema must be a Zod schema',
      },
    )
    .optional(),
  composite: z
    .custom<CompositeRuleEvaluator>((value) => typeof value === 'function', {
      message: 'rule.composite must be a function',
    })
    .optional(),
});

const registryEntrySchema = z.object({
  typeKey: typeKeySchema,
  kind: z.enum(['atomic', 'composite']),
  dependencies: z.array(typeKeySchema).default([]),
  rule: registryRuleSchema,
  metadata: z.record(z.unknown()).optional(),
});

const overridesEntrySchema = registryEntrySchema
  .omit({ typeKey: true, kind: true })
  .partial();

const environmentOverrideSchema = z.object({
  environmentId: z.string().min(1, 'environmentId is required'),
  activatedAt: z.string().min(1, 'activatedAt timestamp is required'),
  overrides: z.record(overridesEntrySchema).default({}),
});

export const createRegistryEntrySchema = () => registryEntrySchema;

export const createTypeKeySchema = () => typeKeySchema;

export const createValidationRegistrySchema = () =>
  z
    .array(registryEntrySchema)
    .superRefine((entries, ctx) => {
      const seen = new Set<string>();
      entries.forEach((entry, index) => {
        if (seen.has(entry.typeKey)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `typeKey "${entry.typeKey}" appears more than once`,
            path: [index, 'typeKey'],
          });
          return;
        }
        seen.add(entry.typeKey);
      });
    });

export const createEnvironmentOverrideSchema = () => environmentOverrideSchema;

export const createEnvironmentOverrideCollectionSchema = () =>
  z.array(environmentOverrideSchema);
