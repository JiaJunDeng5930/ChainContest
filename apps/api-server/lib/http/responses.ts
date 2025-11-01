import { NextResponse } from 'next/server';
import type {
  BlockAnchorShape,
  ExecutionCallShape,
  RegistrationPlan,
  RebalancePlan,
  SettlementResult,
  RewardClaimResult,
  RedemptionResult,
  RegistrationExecutionResult,
  RebalanceExecutionResult,
  TokenApprovalRequestShape,
  QualificationCheck,
  PolicyCheck
} from '@chaincontest/chain';

type IntegerLike = bigint | number | string;

const formatInteger = (value: IntegerLike | undefined): string | undefined => {
  if (value === undefined) {
    return undefined;
  }
  try {
    if (typeof value === 'bigint') {
      return value.toString();
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return Math.trunc(value).toString();
    }
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
  } catch {
    /* noop */
  }
  return undefined;
};

const formatBlockNumber = (value: bigint | undefined): number | string | undefined => {
  if (value === undefined) {
    return undefined;
  }
  const asNumber = Number(value);
  return Number.isSafeInteger(asNumber) ? asNumber : value.toString();
};

const normalizeDerivedAt = (anchor: BlockAnchorShape) => ({
  blockNumber: formatBlockNumber(anchor.blockNumber),
  blockHash: anchor.blockHash,
  timestamp: anchor.timestamp
});

const normalizeChecks = (
  checks: readonly QualificationCheck[] | readonly PolicyCheck[]
): Array<{
  rule: string;
  passed: boolean;
  severity?: string;
  message?: string;
  detail?: unknown;
}> => {
  return checks.map((check) => ({
    rule: 'rule' in check ? check.rule : 'policy',
    passed: 'passed' in check ? Boolean(check.passed) : check.status === 'pass',
    severity: 'severity' in check ? check.severity : undefined,
    message: check.message,
    detail: 'detail' in check ? check.detail : undefined
  }));
};

const normalizeApprovals = (
  approvals: readonly TokenApprovalRequestShape[] | undefined
) => {
  if (!approvals) {
    return undefined;
  }
  return approvals.map((approval) => ({
    tokenAddress: approval.tokenAddress,
    spender: approval.spender,
    amount: approval.amount,
    decimals: approval.decimals,
    symbol: approval.symbol,
    reason: approval.reason
  }));
};

const normalizeExecutionCall = (call: ExecutionCallShape | undefined) => {
  if (!call) {
    return undefined;
  }

  const extras = call as ExecutionCallShape & {
    gasPrice?: IntegerLike;
    deadline?: string;
    route?: unknown;
  };

  return {
    to: call.to,
    data: call.data,
    value: formatInteger(call.value) ?? '0',
    gasLimit: formatInteger(call.gasLimit),
    maxFeePerGas: formatInteger(call.maxFeePerGas),
    maxPriorityFeePerGas: formatInteger(call.maxPriorityFeePerGas),
    gasPrice: formatInteger(extras.gasPrice),
    deadline: extras.deadline,
    route: extras.route
  };
};

const jsonResponse = (payload: unknown, status = 200): NextResponse => {
  return NextResponse.json(payload, {
    status,
    headers: {
      'Cache-Control': 'no-store'
    }
  });
};

export const registrationPlanResponse = (plan: RegistrationPlan): NextResponse => {
  return jsonResponse({
    status: plan.status,
    checks: normalizeChecks(plan.qualifications ?? []),
    requiredApprovals: normalizeApprovals(plan.requiredApprovals) ?? [],
    transaction: normalizeExecutionCall(plan.registrationCall),
    estimatedFees: plan.estimatedFees ?? undefined,
    rejectionReason: plan.rejectionReason ?? undefined,
    derivedAt: normalizeDerivedAt(plan.derivedAt)
  });
};

export const rebalancePlanResponse = (plan: RebalancePlan): NextResponse => {
  return jsonResponse({
    status: plan.status,
    checks: normalizeChecks(plan.policyChecks ?? []),
    transaction: normalizeExecutionCall(plan.transaction),
    rollbackAdvice: plan.rollbackAdvice,
    rejectionReason: plan.rejectionReason ?? undefined,
    derivedAt: normalizeDerivedAt(plan.derivedAt)
  });
};

export const registrationExecutionResponse = (
  result: RegistrationExecutionResult
): NextResponse => {
  return jsonResponse({
    status: result.status,
    transaction: normalizeExecutionCall(result.transaction),
    requiredApprovals: normalizeApprovals(result.requiredApprovals) ?? [],
    reason: result.reason ?? undefined,
    derivedAt: normalizeDerivedAt(result.derivedAt)
  });
};

export const rebalanceExecutionResponse = (
  result: RebalanceExecutionResult
): NextResponse => {
  return jsonResponse({
    status: result.status,
    transaction: normalizeExecutionCall(result.transaction),
    rollbackAdvice: result.rollbackAdvice,
    reason: result.reason ?? undefined,
    derivedAt: normalizeDerivedAt(result.derivedAt)
  });
};

export const settlementResponse = (result: SettlementResult): NextResponse => {
  return jsonResponse({
    status: result.status,
    settlementCall: normalizeExecutionCall(result.settlementCall),
    detail: result.detail ?? undefined,
    rejectionReason: result.rejectionReason ?? undefined,
    frozenAt: normalizeDerivedAt(result.frozenAt)
  });
};

export const rewardClaimResponse = (result: RewardClaimResult): NextResponse => {
  return jsonResponse({
    status: result.status,
    payout: result.payout ?? undefined,
    claimCall: normalizeExecutionCall(result.claimCall),
    reason: result.reason ?? undefined,
    derivedAt: normalizeDerivedAt(result.derivedAt)
  });
};

export const redemptionResponse = (result: RedemptionResult): NextResponse => {
  const legacy = result as RedemptionResult & { redemptionCall?: ExecutionCallShape };
  return jsonResponse({
    status: result.status,
    payout: result.payout ?? undefined,
    claimCall: normalizeExecutionCall(result.claimCall ?? legacy.redemptionCall),
    reason: result.reason ?? undefined,
    derivedAt: normalizeDerivedAt(result.derivedAt)
  });
};

export const errorResponse = (error: unknown): Response => {
  const normalized = error instanceof Response ? error : undefined;
  if (normalized) {
    return normalized;
  }
  return jsonResponse({
    code: 'internal_error',
    message: 'Internal server error'
  }, 500);
};

export const createJsonResponse = jsonResponse;
