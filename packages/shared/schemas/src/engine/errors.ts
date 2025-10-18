import type { ZodError } from 'zod';
import type { CompositeRuleIssue } from '../types/registry.js';
import type { ValidationError } from '../types/validation.js';

const cloneZodIssues = (error: ZodError) =>
  error.issues.map((issue) => ({
    path: [...issue.path],
    message: issue.message,
    code: issue.code,
  }));

export const createUnknownTypeError = (typeKey: string): ValidationError => ({
  type: typeKey,
  message: `Unknown validation type "${typeKey}"`,
  detail: { reason: 'unknown-type' },
});

export const createMissingDependencyError = (
  typeKey: string,
  missingDependencies: readonly string[],
): ValidationError => ({
  type: typeKey,
  message: `Missing dependencies for "${typeKey}"`,
  detail: {
    reason: 'missing-dependencies',
    missing: [...missingDependencies],
  },
});

export const createAtomicValidationError = (
  typeKey: string,
  message: string,
  error: ZodError,
): ValidationError => ({
  type: typeKey,
  message,
  detail: {
    reason: 'atomic-validation-failed',
    issues: cloneZodIssues(error),
  },
});

const assignDefined = (
  target: Record<string, unknown>,
  source: Record<string, unknown>,
) => {
  Object.entries(source).forEach(([key, value]) => {
    if (value !== undefined) {
      target[key] = value;
    }
  });
};

export const createCompositeValidationError = (
  typeKey: string,
  message: string,
  dependencies: readonly string[],
  issue: CompositeRuleIssue | undefined,
): ValidationError => {
  const detail: Record<string, unknown> = {
    reason: 'composite-validation-failed',
    dependencyTypes: [...dependencies],
    violation: message,
  };

  if (issue?.detail) {
    assignDefined(detail, issue.detail as Record<string, unknown>);

    if (!('dependencyTypes' in issue.detail)) {
      detail.dependencyTypes = [...dependencies];
    }

    if (!('violation' in issue.detail)) {
      detail.violation = message;
    }
  }

  return {
    type: typeKey,
    message,
    detail,
  };
};
