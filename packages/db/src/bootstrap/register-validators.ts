import {
  loadValidationContext,
  validateBatch,
  type ValidationContext,
  type ValidationContextOptions,
  type ValidationRequest,
  type ValidationResult
} from '@chaincontest/shared-schemas';
import { DbError, DbErrorCode } from '../instrumentation/metrics.js';

export const DbValidationTypes = {
  userWalletLookup: 'db-user-wallet-lookup-request',
  userWalletMutation: 'db-user-wallet-mutation-request',
  contestQuery: 'db-contest-query-request',
  userContestQuery: 'db-user-contest-query-request',
  contestDomainWrite: 'db-contest-domain-write-request',
  ingestionStatus: 'db-ingestion-status-request',
  ingestionEvent: 'db-ingestion-event-request'
} as const;

export type DbValidationTypeKey = (typeof DbValidationTypes)[keyof typeof DbValidationTypes];

export interface ValidatorRegistrationOptions {
  registry: ValidationContextOptions['registry'];
  overrides?: ValidationContextOptions['environmentOverrides'];
  environmentId?: string;
}

let activeContext: ValidationContext | null = null;

export const REQUIRED_VALIDATION_TYPES: readonly DbValidationTypeKey[] = [
  DbValidationTypes.userWalletLookup,
  DbValidationTypes.userWalletMutation,
  DbValidationTypes.contestQuery,
  DbValidationTypes.userContestQuery,
  DbValidationTypes.contestDomainWrite,
  DbValidationTypes.ingestionStatus,
  DbValidationTypes.ingestionEvent
] as const;

export function registerDbValidators(options: ValidatorRegistrationOptions): ValidationContext {
  const context = loadValidationContext({
    registry: options.registry,
    environmentOverrides: options.overrides,
    environmentId: options.environmentId
  });

  ensureRequiredTypes(context);
  activeContext = context;
  return context;
}

export function getValidationContext(): ValidationContext {
  if (!activeContext) {
    throw new DbError(DbErrorCode.INTERNAL_ERROR, 'Validation context has not been registered');
  }
  return activeContext;
}

export function resetValidationContext(): void {
  activeContext = null;
}

export function validateInput(request: ValidationRequest): ValidationResult {
  const context = getValidationContext();
  const result = validateBatch(request, context);
  if (result.status === 'failure') {
    throw new DbError(DbErrorCode.INPUT_INVALID, result.firstError.message, {
      detail: {
        reason: 'validation_failed',
        context: {
          type: result.firstError.type,
          validatedTypes: result.validatedTypes,
          detail: result.firstError.detail
        }
      }
    });
  }

  return result;
}

export function validateSingleInput(type: DbValidationTypeKey, value: unknown): void {
  validateInput({
    entries: [{ type, value }]
  });
}

function ensureRequiredTypes(context: ValidationContext): void {
  const registeredTypes = new Set(context.registry.map((entry) => entry.typeKey));
  const missing = REQUIRED_VALIDATION_TYPES.filter((type) => !registeredTypes.has(type));

  if (missing.length > 0) {
    throw new DbError(DbErrorCode.INTERNAL_ERROR, 'Missing required validation types', {
      detail: {
        reason: 'missing_validation_types',
        context: { missing }
      }
    });
  }
}
