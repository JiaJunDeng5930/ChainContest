import { performance } from 'node:perf_hooks';
import type { ZodError } from 'zod';
import type {
  ValidationEntry,
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

interface ValidationEntryState {
  readonly entry: ValidationEntry;
  readonly index: number;
  evaluated: boolean;
}

interface RecordedValidationSuccess {
  readonly index: number;
  readonly type: string;
}

interface ValidationFailureState {
  readonly index: number;
  readonly error: ValidationError;
}

export const validateBatch = (
  request: ValidationRequest,
  context: ValidationContext,
): ValidationResult => {
  const start = now();
  const metricsState = {
    evaluatedAtomic: 0,
    evaluatedComposite: 0,
  };
  const resolvedValues = new Map<string, unknown>();
  const recordedSuccesses: RecordedValidationSuccess[] = [];
  const entryStates: ValidationEntryState[] = [];
  const entriesByType = new Map<string, ValidationEntryState[]>();

  request.entries.forEach((entry, index) => {
    const state: ValidationEntryState = {
      entry,
      index,
      evaluated: false,
    };
    entryStates.push(state);

    const registryEntry = context.plan.entryByType[entry.type];
    if (!registryEntry) {
      return;
    }

    const list = entriesByType.get(entry.type) ?? [];
    list.push(state);
    entriesByType.set(entry.type, list);
  });

  const recordSuccess = (index: number, type: string, value: unknown) => {
    recordedSuccesses.push({ index, type });
    resolvedValues.set(type, value);
  };

  const findNextDependencyState = (
    type: string,
    afterIndex: number,
  ): ValidationEntryState | undefined => {
    const candidates = entriesByType.get(type);
    if (!candidates) {
      return undefined;
    }

    let fallback: ValidationEntryState | undefined;

    for (const candidate of candidates) {
      if (candidate.evaluated) {
        continue;
      }

      if (candidate.index <= afterIndex) {
        return candidate;
      }

      if (!fallback || candidate.index < fallback.index) {
        fallback = candidate;
      }
    }

    return fallback;
  };

  const evaluating = new Set<number>();

  const evaluateState = (
    state: ValidationEntryState,
  ): ValidationFailureState | null => {
    if (state.evaluated) {
      return null;
    }

    if (evaluating.has(state.index)) {
      throw new Error(
        `Detected cyclic dependency while validating "${state.entry.type}"`,
      );
    }

    evaluating.add(state.index);

    const registryEntry = context.plan.entryByType[state.entry.type];

    if (!registryEntry) {
      evaluating.delete(state.index);
      return {
        index: state.index,
        error: createUnknownTypeError(state.entry.type),
      };
    }

    if (registryEntry.kind === 'atomic') {
      metricsState.evaluatedAtomic += 1;
      const schema = context.atomicSchemas[state.entry.type];

      try {
        const parsed = schema.parse(state.entry.value);
        recordSuccess(state.index, state.entry.type, parsed);
        state.evaluated = true;
        evaluating.delete(state.index);
        return null;
      } catch (error) {
        const failureError = isZodError(error)
          ? createAtomicValidationError(
              state.entry.type,
              registryEntry.rule.failureMessage,
              error,
            )
          : createUnknownTypeError(state.entry.type);

        evaluating.delete(state.index);
        return { index: state.index, error: failureError };
      }
    }

    const missingDependencies: string[] = [];

    for (const dependencyType of registryEntry.dependencies) {
      if (resolvedValues.has(dependencyType)) {
        continue;
      }

      const dependencyState = findNextDependencyState(
        dependencyType,
        state.index,
      );

      if (!dependencyState) {
        missingDependencies.push(dependencyType);
        continue;
      }

      const dependencyFailure = evaluateState(dependencyState);
      if (dependencyFailure) {
        evaluating.delete(state.index);
        return dependencyFailure;
      }
    }

    metricsState.evaluatedComposite += 1;

    if (missingDependencies.length > 0) {
      evaluating.delete(state.index);
      return {
        index: state.index,
        error: createMissingDependencyError(
          state.entry.type,
          missingDependencies,
        ),
      };
    }

    const { values } = collectDependencyValues(
      resolvedValues,
      registryEntry.dependencies,
    );

    let failureIssue: CompositeRuleIssue | undefined;

    const addIssue = (issue: CompositeRuleIssue) => {
      if (!failureIssue) {
        failureIssue = issue;
      }
    };

    const evaluator = context.compositeEvaluators[state.entry.type];

    evaluator({
      value: state.entry.value,
      dependencies: values,
      addIssue,
    });

    if (failureIssue) {
      evaluating.delete(state.index);
      return {
        index: state.index,
        error: createCompositeValidationError(
          state.entry.type,
          failureIssue.message ?? registryEntry.rule.failureMessage,
          registryEntry.dependencies,
          failureIssue,
        ),
      };
    }

    recordSuccess(state.index, state.entry.type, state.entry.value);
    state.evaluated = true;
    evaluating.delete(state.index);
    return null;
  };

  let failureState: ValidationFailureState | null = null;

  for (const state of entryStates) {
    if (state.evaluated) {
      continue;
    }

    const failure = evaluateState(state);
    if (failure) {
      failureState = failure;
      break;
    }
  }

  const duration = now() - start;
  const metrics = createMetrics(
    metricsState.evaluatedAtomic,
    metricsState.evaluatedComposite,
    duration,
    context.environmentId,
  );

  if (failureState) {
    const validatedTypes = recordedSuccesses
      .filter((success) => success.index < failureState.index)
      .sort((a, b) => a.index - b.index)
      .map((success) => success.type);

    return createFailureResult(validatedTypes, failureState.error, metrics);
  }

  const validatedTypes = recordedSuccesses
    .sort((a, b) => a.index - b.index)
    .map((success) => success.type);

  return createSuccessResult(validatedTypes, metrics);
};
