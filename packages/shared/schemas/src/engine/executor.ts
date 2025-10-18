import { performance } from 'node:perf_hooks';
import type { ZodError } from 'zod';
import type {
  ValidationRequest,
  ValidationResult,
  ValidationSuccessResult,
  ValidationFailureResult,
  ValidationMetrics,
  ValidationError,
} from '../types/validation.js';
import type { CompositeRuleIssue } from '../types/registry.js';
import {
  createAtomicValidationError,
  createCompositeValidationError,
  createMissingDependencyError,
  createUnknownTypeError,
} from './errors.js';
import type { ValidationContext } from './context.js';

const now = () => performance.now();

const createMetrics = (
  evaluatedAtomic: number,
  evaluatedComposite: number,
  durationMs: number,
  environmentId: string,
): ValidationMetrics => ({
  evaluatedAtomic,
  evaluatedComposite,
  durationMs,
  environmentId,
});

const createSuccessResult = (
  validatedTypes: readonly string[],
  metrics: ValidationMetrics,
): ValidationSuccessResult => ({
  status: 'success',
  validatedTypes: [...validatedTypes],
  firstError: null,
  metrics,
});

const createFailureResult = (
  validatedTypes: readonly string[],
  error: ValidationError,
  metrics: ValidationMetrics,
): ValidationFailureResult => ({
  status: 'failure',
  validatedTypes: [...validatedTypes],
  firstError: error,
  metrics,
});

const isZodError = (error: unknown): error is ZodError => {
  if (!error || typeof error !== 'object') {
    return false;
  }

  return 'issues' in error && Array.isArray((error as ZodError).issues);
};

const collectDependencyValues = (
  resolved: Map<string, unknown>,
  dependencies: readonly string[],
) => {
  const missing: string[] = [];
  const values: Record<string, unknown> = {};

  dependencies.forEach((dependency) => {
    if (!resolved.has(dependency)) {
      missing.push(dependency);
      return;
    }

    values[dependency] = resolved.get(dependency);
  });

  return { missing, values };
};

export const validateBatch = (
  request: ValidationRequest,
  context: ValidationContext,
): ValidationResult => {
  const start = now();
  const validatedTypes: string[] = [];
  const resolvedValues = new Map<string, unknown>();
  const metricsState = {
    evaluatedAtomic: 0,
    evaluatedComposite: 0,
  };

  for (const entry of request.entries) {
    const registryEntry = context.plan.entryByType[entry.type];

    if (!registryEntry) {
      const metrics = createMetrics(
        metricsState.evaluatedAtomic,
        metricsState.evaluatedComposite,
        now() - start,
        context.environmentId,
      );
      return createFailureResult(
        validatedTypes,
        createUnknownTypeError(entry.type),
        metrics,
      );
    }

    if (registryEntry.kind === 'atomic') {
      metricsState.evaluatedAtomic += 1;
      const schema = context.atomicSchemas[entry.type];

      try {
        const parsed = schema.parse(entry.value);
        validatedTypes.push(entry.type);
        resolvedValues.set(entry.type, parsed);
        continue;
      } catch (error) {
        const metrics = createMetrics(
          metricsState.evaluatedAtomic,
          metricsState.evaluatedComposite,
          now() - start,
          context.environmentId,
        );

        if (isZodError(error)) {
          return createFailureResult(
            validatedTypes,
            createAtomicValidationError(
              entry.type,
              registryEntry.rule.failureMessage,
              error,
            ),
            metrics,
          );
        }

        return createFailureResult(
          validatedTypes,
          createUnknownTypeError(entry.type),
          metrics,
        );
      }
    }

    metricsState.evaluatedComposite += 1;
    const evaluator = context.compositeEvaluators[entry.type];
    const { missing, values } = collectDependencyValues(
      resolvedValues,
      registryEntry.dependencies,
    );

    if (missing.length > 0) {
      const metrics = createMetrics(
        metricsState.evaluatedAtomic,
        metricsState.evaluatedComposite,
        now() - start,
        context.environmentId,
      );

      return createFailureResult(
        validatedTypes,
        createMissingDependencyError(entry.type, missing),
        metrics,
      );
    }

    let failureIssue: CompositeRuleIssue | undefined;

    const addIssue = (issue: CompositeRuleIssue) => {
      if (!failureIssue) {
        failureIssue = issue;
      }
    };

    evaluator({
      value: entry.value,
      dependencies: values,
      addIssue,
    });

    if (failureIssue) {
      const metrics = createMetrics(
        metricsState.evaluatedAtomic,
        metricsState.evaluatedComposite,
        now() - start,
        context.environmentId,
      );

      return createFailureResult(
        validatedTypes,
        createCompositeValidationError(
          entry.type,
          failureIssue.message ?? registryEntry.rule.failureMessage,
          registryEntry.dependencies,
          failureIssue,
        ),
        metrics,
      );
    }

    validatedTypes.push(entry.type);
    resolvedValues.set(entry.type, entry.value);
  }

  const metrics = createMetrics(
    metricsState.evaluatedAtomic,
    metricsState.evaluatedComposite,
    now() - start,
    context.environmentId,
  );

  return createSuccessResult(validatedTypes, metrics);
};
