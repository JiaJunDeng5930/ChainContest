import type {
  ContestIdentifier,
  PlanRejectionReasonShape,
  PolicyCheckShape,
  TokenApprovalRequestShape,
} from '../gateway/domainModels.js';
import type {
  ContestParticipantProfile,
  ContestRebalanceConfig,
} from '../gateway/types.js';
import type { RebalanceIntent } from '../gateway/contracts.js';
import {
  inspectAllowances,
  type AllowanceInspectionResult,
} from '../adapters/allowanceInspector.js';

export interface RebalanceRulesInput {
  readonly contest: ContestIdentifier;
  readonly config: ContestRebalanceConfig;
  readonly participant: ContestParticipantProfile;
  readonly intent: RebalanceIntent;
  readonly blockTimestamp: string;
  readonly approvals: readonly TokenApprovalRequestShape[];
  readonly phase: string;
}

export interface RebalanceRulesResult {
  readonly status: 'ready' | 'blocked';
  readonly checks: readonly PolicyCheckShape[];
  readonly rejectionReason?: PlanRejectionReasonShape;
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

const toBigInt = (value: string): bigint => {
  try {
    return BigInt(value);
  } catch {
    return zero;
  }
};

const ensureRejection = (
  existing: PlanRejectionReasonShape | undefined,
  ruleId: string,
  message: string,
  detail?: Record<string, unknown>,
): PlanRejectionReasonShape =>
  existing ?? {
    code: ruleId,
    message,
    detail,
  };

const recordCheck = (
  checks: PolicyCheckShape[],
  rule: string,
  status: 'pass' | 'fail',
  message: string,
  detail?: Record<string, unknown>,
) => {
  checks.push({
    rule,
    status,
    message,
    detail,
  });
};

const isAssetAllowed = (
  whitelist: readonly string[],
  asset: string,
): boolean => {
  const normalizedAsset = asset.toLowerCase();
  return whitelist.some(
    (candidate) => candidate.toLowerCase() === normalizedAsset,
  );
};

export const evaluateRebalanceRules = (
  input: RebalanceRulesInput,
): RebalanceRulesResult => {
  const checks: PolicyCheckShape[] = [];
  let rejection: PlanRejectionReasonShape | undefined;
  const failedRules = new Set<string>();

  const now = toDate(input.blockTimestamp) ?? new Date();

  const phaseAllowed = input.phase === 'live';
  recordCheck(
    checks,
    'rebalance.phase',
    phaseAllowed ? 'pass' : 'fail',
    phaseAllowed
      ? 'Contest phase allows rebalancing'
      : `Contest phase "${input.phase}" does not permit rebalancing`,
  );
  if (!phaseAllowed) {
    failedRules.add('rebalance.phase');
    rejection = ensureRejection(
      rejection,
      'RULE_VIOLATION',
      'Contest phase does not allow rebalancing at this time',
    );
  }

  const whitelistOk =
    isAssetAllowed(input.config.whitelist, input.intent.sellAsset) &&
    isAssetAllowed(input.config.whitelist, input.intent.buyAsset);

  recordCheck(
    checks,
    'rebalance.asset-whitelist',
    whitelistOk ? 'pass' : 'fail',
    whitelistOk
      ? 'Both assets are in the allowed whitelist'
      : 'One or more assets are not permitted for rebalancing',
    {
      whitelist: input.config.whitelist,
      sellAsset: input.intent.sellAsset,
      buyAsset: input.intent.buyAsset,
    },
  );
  if (!whitelistOk) {
    failedRules.add('rebalance.asset-whitelist');
    rejection = ensureRejection(
      rejection,
      'RULE_VIOLATION',
      'Requested assets are not allowed by policy',
    );
  }

  const amount = toBigInt(input.intent.amount);
  const maxAmount = toBigInt(input.config.maxTradeAmount);
  const withinAmount = amount > zero && amount <= maxAmount;

  recordCheck(
    checks,
    'rebalance.amount-limit',
    withinAmount ? 'pass' : 'fail',
    withinAmount
      ? 'Trade amount within permitted limit'
      : 'Trade amount exceeds configured limit',
    {
      requested: input.intent.amount,
      maximum: input.config.maxTradeAmount,
    },
  );
  if (!withinAmount) {
    failedRules.add('rebalance.amount-limit');
    rejection = ensureRejection(
      rejection,
      'RULE_VIOLATION',
      'Requested trade amount exceeds allowed limit',
      {
        requested: input.intent.amount,
        maximum: input.config.maxTradeAmount,
      },
    );
  }

  const cooldownEnds = input.participant.cooldownEndsAt
    ? toDate(input.participant.cooldownEndsAt)
    : null;
  const lastRebalance = input.participant.lastRebalanceAt
    ? toDate(input.participant.lastRebalanceAt)
    : null;

  let cooldownPassed = true;
  if (cooldownEnds) {
    cooldownPassed = now.getTime() >= cooldownEnds.getTime();
  } else if (lastRebalance) {
    const diffSeconds = (now.getTime() - lastRebalance.getTime()) / 1000;
    cooldownPassed = diffSeconds >= input.config.cooldownSeconds;
  }

  recordCheck(
    checks,
    'rebalance.cooldown',
    cooldownPassed ? 'pass' : 'fail',
    cooldownPassed
      ? 'Cooldown fulfilled for participant'
      : 'Participant must wait before next rebalance',
    {
      cooldownEndsAt: input.participant.cooldownEndsAt,
      lastRebalanceAt: input.participant.lastRebalanceAt,
      cooldownSeconds: input.config.cooldownSeconds,
      evaluatedAt: now.toISOString(),
    },
  );
  if (!cooldownPassed) {
    failedRules.add('rebalance.cooldown');
    rejection = ensureRejection(
      rejection,
      'RULE_VIOLATION',
      'Participant is within rebalance cooldown window',
      {
        cooldownEndsAt: input.participant.cooldownEndsAt,
        lastRebalanceAt: input.participant.lastRebalanceAt,
        cooldownSeconds: input.config.cooldownSeconds,
        evaluatedAt: now.toISOString(),
      },
    );
  }

  const priceAnchor = toDate(input.config.lastPriceUpdatedAt);
  let priceFresh = true;
  if (priceAnchor) {
    const diffSeconds = (now.getTime() - priceAnchor.getTime()) / 1000;
    priceFresh = diffSeconds <= input.config.priceFreshnessSeconds;
  }

  recordCheck(
    checks,
    'rebalance.price-freshness',
    priceFresh ? 'pass' : 'fail',
    priceFresh
      ? 'Price oracle is fresh'
      : 'Price oracle data is stale',
    {
      lastPriceUpdatedAt: input.config.lastPriceUpdatedAt,
      freshnessWindowSeconds: input.config.priceFreshnessSeconds,
      evaluatedAt: now.toISOString(),
    },
  );
  if (!priceFresh) {
    failedRules.add('rebalance.price-freshness');
    rejection = ensureRejection(
      rejection,
      'PRICING_STALE',
      'Price oracle data is stale',
      {
        lastPriceUpdatedAt: input.config.lastPriceUpdatedAt,
        freshnessWindowSeconds: input.config.priceFreshnessSeconds,
      },
    );
  }

  const allowanceInspection = inspectAllowances({
    participant: input.participant,
    requirements: input.approvals,
  });

  const allowanceOk = allowanceInspection.status === 'satisfied';
  recordCheck(
    checks,
    'rebalance.allowance',
    allowanceOk ? 'pass' : 'fail',
    allowanceOk
      ? 'Allowances satisfy trade requirements'
      : 'Allowances must be increased before rebalancing',
    {
      missing: allowanceInspection.missing,
    },
  );
  if (!allowanceOk) {
    failedRules.add('rebalance.allowance');
    rejection = ensureRejection(
      rejection,
      'AUTHORIZATION_REQUIRED',
      'Participant must approve assets for rebalancing',
      {
        missing: allowanceInspection.missing,
      },
    );
  }

  const status = failedRules.size === 0 ? 'ready' : 'blocked';

  return Object.freeze({
    status,
    checks: Object.freeze(checks),
    rejectionReason: rejection,
    allowanceInspection,
  });
};
