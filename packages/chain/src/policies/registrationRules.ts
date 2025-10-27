import type {
  ContestIdentifier,
  QualificationCheckShape,
  PlanRejectionReasonShape,
  RegistrationCapacityShape,
  TokenApprovalRequestShape,
} from '../gateway/domainModels.js';
import type {
  ContestParticipantProfile,
  RegistrationRequirement,
} from '../gateway/types.js';
import {
  inspectAllowances,
  type AllowanceInspectionResult,
} from '../adapters/allowanceInspector.js';

export interface RegistrationRulesInput {
  readonly contest: ContestIdentifier;
  readonly phase: string;
  readonly window: { readonly opensAt: string; readonly closesAt: string };
  readonly capacity: RegistrationCapacityShape;
  readonly requirement: RegistrationRequirement;
  readonly approvals: readonly TokenApprovalRequestShape[];
  readonly participant: ContestParticipantProfile;
  readonly blockTimestamp: string;
}

export interface RegistrationRulesResult {
  readonly verdict: 'pass' | 'blocked';
  readonly checks: readonly QualificationCheckShape[];
  readonly rejectionReason?: PlanRejectionReasonShape;
  readonly failedRuleIds: readonly string[];
  readonly allowanceInspection: AllowanceInspectionResult;
}

const toDate = (value: string): Date | null => {
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    const normalized = Math.abs(numeric) < 1e12 ? numeric * 1000 : numeric;
    const interpreted = new Date(normalized);
    return Number.isNaN(interpreted.getTime()) ? null : interpreted;
  }
  const interpreted = new Date(value);
  return Number.isNaN(interpreted.getTime()) ? null : interpreted;
};

const zero = BigInt(0);

const getBalance = (participant: ContestParticipantProfile, token: string): bigint => {
  const raw = participant.balances[token.toLowerCase()] ?? '0';
  try {
    return BigInt(raw);
  } catch {
    return zero;
  }
};

const normalizeRuleMessage = (message: string): string => message.trim();

const createCheck = (
  rule: string,
  passed: boolean,
  message: string,
  detail?: Record<string, unknown>,
): QualificationCheckShape => ({
  rule,
  passed,
  message: normalizeRuleMessage(message),
  severity: passed ? 'info' : 'error',
  detail,
});

const createRejection = (
  code: string,
  message: string,
  detail?: Record<string, unknown>,
): PlanRejectionReasonShape => ({
  code,
  message,
  detail,
});

export const evaluateRegistrationRules = (
  input: RegistrationRulesInput,
): RegistrationRulesResult => {
  const checks: QualificationCheckShape[] = [];
  const failedRuleIds: string[] = [];
  let rejection: PlanRejectionReasonShape | undefined;

  const now = toDate(input.blockTimestamp) ?? new Date();
  const windowOpen = toDate(input.window.opensAt);
  const windowClose = toDate(input.window.closesAt);

  const ensureFailure = (
    ruleId: string,
    code: string,
    message: string,
    detail?: Record<string, unknown>,
  ) => {
    if (!failedRuleIds.includes(ruleId)) {
      failedRuleIds.push(ruleId);
    }
    if (!rejection) {
      rejection = createRejection(code, message, detail);
    }
  };

  const phaseAllowed = input.phase === 'registering';
  checks.push(
    createCheck(
      'registration.phase',
      phaseAllowed,
      phaseAllowed
        ? 'Contest phase permits registration'
        : `Contest in phase "${input.phase}" does not accept registrations`,
    ),
  );
  if (!phaseAllowed) {
    ensureFailure(
      'registration.phase',
      'REGISTRATION_PHASE_INVALID',
      `Contest phase "${input.phase}" does not allow registration`,
    );
  }

  let withinWindow = true;
  if (windowOpen && now < windowOpen) {
    withinWindow = false;
  }
  if (windowClose && now > windowClose) {
    withinWindow = false;
  }

  checks.push(
    createCheck(
      'registration.window',
      withinWindow,
      withinWindow
        ? 'Registration window is open'
        : 'Registration window is closed',
      {
        now: now.toISOString(),
        opensAt: windowOpen?.toISOString(),
        closesAt: windowClose?.toISOString(),
      },
    ),
  );
  if (!withinWindow) {
    ensureFailure(
      'registration.window',
      'REGISTRATION_WINDOW_CLOSED',
      'Registration period is not active',
      {
        now: now.toISOString(),
        opensAt: windowOpen?.toISOString(),
        closesAt: windowClose?.toISOString(),
      },
    );
  }

  const capacityDetail: Record<string, unknown> = {
    registered: input.capacity.registered,
    maximum: input.capacity.maximum,
    isFull: input.capacity.isFull,
  };

  const capacityAvailable = !input.capacity.isFull;
  checks.push(
    createCheck(
      'registration.capacity',
      capacityAvailable,
      capacityAvailable
        ? 'Registration capacity available'
        : 'Contest registration capacity reached',
      capacityDetail,
    ),
  );
  if (!capacityAvailable) {
    ensureFailure(
      'registration.capacity',
      'REGISTRATION_CAPACITY_FULL',
      'Contest registration capacity reached',
      capacityDetail,
    );
  }

  const notRegistered = !input.participant.registered;
  checks.push(
    createCheck(
      'registration.duplicate',
      notRegistered,
      notRegistered
        ? 'Participant not yet registered'
        : 'Participant already registered',
      { participant: input.participant.address },
    ),
  );
  if (!notRegistered) {
    ensureFailure(
      'registration.duplicate',
      'REGISTRATION_ALREADY_COMPLETED',
      'Participant already registered for contest',
      { participant: input.participant.address },
    );
  }

  const balance = getBalance(
    input.participant,
    input.requirement.tokenAddress,
  );
  const requiredAmount = (() => {
    try {
      return BigInt(input.requirement.amount);
    } catch {
      return zero;
    }
  })();

  const balanceSufficient = balance >= requiredAmount;
  checks.push(
    createCheck(
      'registration.balance',
      balanceSufficient,
      balanceSufficient
        ? 'Participant balance sufficient for registration'
        : 'Insufficient balance for registration',
      {
        token: input.requirement.tokenAddress,
        requiredAmount: input.requirement.amount,
        actualBalance: balance.toString(),
      },
    ),
  );
  if (!balanceSufficient) {
    ensureFailure(
      'registration.balance',
      'INSUFFICIENT_BALANCE',
      'Participant balance below required registration amount',
      {
        token: input.requirement.tokenAddress,
        requiredAmount: input.requirement.amount,
        actualBalance: balance.toString(),
      },
    );
  }

  const allowanceInspection = inspectAllowances({
    participant: input.participant,
    requirements: input.approvals,
  });

  const allowanceSufficient = allowanceInspection.status === 'satisfied';
  checks.push(
    createCheck(
      'registration.allowance',
      allowanceSufficient,
      allowanceSufficient
        ? 'Allowances are sufficient for registration'
        : 'Allowances are insufficient for registration',
      {
        requirements: allowanceInspection.requirements,
        missing: allowanceInspection.missing,
      },
    ),
  );
  if (!allowanceSufficient) {
    ensureFailure(
      'registration.allowance',
      'INSUFFICIENT_ALLOWANCE',
      'Participant must increase token allowance before registering',
      {
        requirements: allowanceInspection.requirements,
        missing: allowanceInspection.missing,
      },
    );
  }

  const verdict = failedRuleIds.length === 0 ? 'pass' : 'blocked';

  return Object.freeze({
    verdict,
    checks: Object.freeze(checks),
    rejectionReason: rejection,
    failedRuleIds: Object.freeze(failedRuleIds),
    allowanceInspection,
  });
};
