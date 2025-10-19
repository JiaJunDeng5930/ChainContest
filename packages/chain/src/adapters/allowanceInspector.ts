import type { Address } from 'viem';
import type { TokenApprovalRequestShape } from '@chain/gateway/domainModels';
import type { ContestParticipantProfile } from '@chain/gateway/types';
import { lowercaseAddress } from '@chain/gateway/types';

export interface AllowanceInspectionDetail {
  readonly tokenAddress: Address;
  readonly spender: Address;
  readonly requiredAmount: string;
  readonly actualAmount: string;
}

export interface AllowanceInspectionResult {
  readonly requirements: readonly TokenApprovalRequestShape[];
  readonly missing: readonly TokenApprovalRequestShape[];
  readonly satisfied: readonly TokenApprovalRequestShape[];
  readonly detail: readonly AllowanceInspectionDetail[];
  readonly status: 'satisfied' | 'insufficient';
}

const zero = BigInt(0);

const toBigInt = (value: string | undefined): bigint => {
  if (!value) {
    return zero;
  }

  try {
    return BigInt(value);
  } catch {
    return zero;
  }
};

const cloneRequirement = (
  requirement: TokenApprovalRequestShape,
  override?: Partial<TokenApprovalRequestShape>,
): TokenApprovalRequestShape => ({
  tokenAddress: requirement.tokenAddress,
  spender: requirement.spender,
  amount: requirement.amount,
  decimals: requirement.decimals,
  symbol: requirement.symbol,
  reason: override?.reason ?? requirement.reason,
});

export const inspectAllowances = (
  options: {
    readonly participant: ContestParticipantProfile;
    readonly requirements: readonly TokenApprovalRequestShape[];
  },
): AllowanceInspectionResult => {
  const participantAllowances = options.participant.allowances;
  const detail: AllowanceInspectionDetail[] = [];
  const missing: TokenApprovalRequestShape[] = [];
  const satisfied: TokenApprovalRequestShape[] = [];

  for (const requirement of options.requirements) {
    const tokenKey = lowercaseAddress(requirement.tokenAddress);
    const spenderKey = lowercaseAddress(requirement.spender);
    const allowanceRecord = participantAllowances[tokenKey];
    const actualAmount = allowanceRecord?.[spenderKey] ?? '0';

    const requiredAmountBigInt = toBigInt(requirement.amount);
    const actualAmountBigInt = toBigInt(actualAmount);

    detail.push({
      tokenAddress: requirement.tokenAddress,
      spender: requirement.spender,
      requiredAmount: requirement.amount,
      actualAmount,
    });

    if (actualAmountBigInt < requiredAmountBigInt) {
      missing.push(
        cloneRequirement(requirement, {
          reason:
            requirement.reason ?? 'allowance-insufficient-set-required-amount',
        }),
      );
      continue;
    }

    satisfied.push(cloneRequirement(requirement));
  }

  const status = missing.length > 0 ? 'insufficient' : 'satisfied';

  return Object.freeze({
    requirements: Object.freeze([...options.requirements]),
    missing: Object.freeze(missing),
    satisfied: Object.freeze(satisfied),
    detail: Object.freeze(detail),
    status,
  });
};
