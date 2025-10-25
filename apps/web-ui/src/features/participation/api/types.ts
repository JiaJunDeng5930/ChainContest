export type BlockAnchor = {
  blockNumber: number | string;
  blockHash?: string | null;
  timestamp: string;
};

export type ActionCheck = {
  rule: string;
  passed: boolean;
  severity?: string;
  message?: string;
  detail?: unknown;
};

export type RequiredApproval = {
  tokenAddress: string;
  spender: string;
  amount: string;
  decimals?: number;
  symbol?: string;
  reason?: string;
};

export type ExecutionCall = {
  to: string;
  data: string;
  value?: string;
  gasLimit?: string;
  gasPrice?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
  deadline?: string;
  route?: string;
};

export type ActionReason = {
  code?: string;
  message: string;
  detail?: unknown;
};

export type EstimatedFees = {
  currency: string;
  estimatedCost: string;
};

export type ActionPayout = {
  amount: string;
  currency?: string;
  destination?: string;
};

export type RegistrationPlanResult = {
  status: string;
  checks: ActionCheck[];
  requiredApprovals: RequiredApproval[];
  transaction?: ExecutionCall | null;
  estimatedFees?: EstimatedFees | null;
  rejectionReason?: ActionReason | null;
  derivedAt: BlockAnchor;
};

export type RegistrationExecutionResult = {
  status: string;
  transaction?: ExecutionCall | null;
  requiredApprovals: RequiredApproval[];
  reason?: ActionReason | string | null;
  derivedAt: BlockAnchor;
};

export type RewardClaimResult = {
  status: string;
  payout?: ActionPayout | null;
  claimCall?: ExecutionCall | null;
  reason?: ActionReason | null;
  derivedAt: BlockAnchor;
};

export type SettlementResult = {
  status: string;
  settlementCall?: ExecutionCall | null;
  detail?: Record<string, unknown> | null;
  rejectionReason?: ActionReason | null;
  frozenAt: BlockAnchor;
};

export type PrincipalRedemptionResult = {
  status: string;
  payout?: ActionPayout | null;
  claimCall?: ExecutionCall | null;
  reason?: ActionReason | null;
  derivedAt: BlockAnchor;
};

export type RebalancePlanResult = {
  status: string;
  checks: ActionCheck[];
  transaction?: ExecutionCall | null;
  rollbackAdvice?: Record<string, unknown> | null;
  rejectionReason?: ActionReason | null;
  derivedAt: BlockAnchor;
};

export type RebalanceExecutionResult = {
  status: string;
  transaction?: ExecutionCall | null;
  rollbackAdvice?: Record<string, unknown> | null;
  reason?: ActionReason | null;
  derivedAt: BlockAnchor;
};
