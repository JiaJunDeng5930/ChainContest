import { apiClient } from "../../../lib/api/client";
import {
  type SettlementResult,
  type PrincipalRedemptionResult,
  type RebalancePlanResult,
  type RebalanceExecutionResult,
  type TransactionEnvelope
} from "./types";
import type { BlockTag } from "./registration";

export type SettlementInput = {
  caller: string;
  blockTag?: BlockTag | null;
};

export type PrincipalRedemptionInput = {
  participant: string;
  blockTag?: BlockTag | null;
};

export type RebalanceIntent = {
  sellAsset: string;
  buyAsset: string;
  amount: string;
  minimumReceived?: string | null;
  quoteId?: string | null;
};

export type RebalanceInput = {
  participant: string;
  intent: RebalanceIntent;
  blockTag?: BlockTag | null;
};

const CONTEST_ID_ERROR = "contestId is required";

const PARTICIPANT_ERROR = "participant is required";

const CALLER_ERROR = "caller is required";

const INTENT_ERROR = "intent is required";

const sanitizePayload = <T extends Record<string, unknown>>(payload: T): Record<string, unknown> => {
  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined && value !== null && value !== "")
  );
};

const ensureContestId = (contestId: string): string => {
  if (!contestId) {
    throw new Error(CONTEST_ID_ERROR);
  }
  return contestId;
};

const ensureParticipant = (participant: string): string => {
  if (!participant) {
    throw new Error(PARTICIPANT_ERROR);
  }
  return participant;
};

const ensureCaller = (caller: string): string => {
  if (!caller) {
    throw new Error(CALLER_ERROR);
  }
  return caller;
};

const ensureIntent = (intent: RebalanceIntent | null | undefined): RebalanceIntent => {
  if (!intent) {
    throw new Error(INTENT_ERROR);
  }
  if (!intent.sellAsset || !intent.buyAsset || !intent.amount) {
    throw new Error("intent is missing required fields");
  }
  return intent;
};

export async function executeSettlement(contestId: string, input: SettlementInput): Promise<SettlementResult> {
  const safeContestId = ensureContestId(contestId);
  const safeCaller = ensureCaller(input.caller);

  const body = sanitizePayload({
    caller: safeCaller,
    blockTag: input.blockTag
  });

  return apiClient.post<SettlementResult>(`/api/contests/${encodeURIComponent(safeContestId)}/settlement`, body);
}

export async function fetchPrincipalRedemptionPlan(
  contestId: string,
  input: PrincipalRedemptionInput
): Promise<PrincipalRedemptionResult> {
  const safeContestId = ensureContestId(contestId);
  const safeParticipant = ensureParticipant(input.participant);

  const body = sanitizePayload({
    participant: safeParticipant,
    blockTag: input.blockTag
  });

  return apiClient.post<PrincipalRedemptionResult>(
    `/api/contests/${encodeURIComponent(safeContestId)}/principal-redemption`,
    body
  );
}

export async function executePrincipalRedemption(
  contestId: string,
  input: PrincipalRedemptionInput
): Promise<PrincipalRedemptionResult> {
  const safeContestId = ensureContestId(contestId);
  const safeParticipant = ensureParticipant(input.participant);

  const body = sanitizePayload({
    participant: safeParticipant,
    blockTag: input.blockTag
  });

  return apiClient.post<PrincipalRedemptionResult>(
    `/api/contests/${encodeURIComponent(safeContestId)}/execute/principal-redemption`,
    body
  );
}

export async function fetchRebalancePlan(contestId: string, input: RebalanceInput): Promise<RebalancePlanResult> {
  const safeContestId = ensureContestId(contestId);
  const safeParticipant = ensureParticipant(input.participant);
  const safeIntent = ensureIntent(input.intent);

  const body = sanitizePayload({
    participant: safeParticipant,
    intent: sanitizePayload({
      sellAsset: safeIntent.sellAsset,
      buyAsset: safeIntent.buyAsset,
      amount: safeIntent.amount,
      minimumReceived: safeIntent.minimumReceived,
      quoteId: safeIntent.quoteId
    }),
    blockTag: input.blockTag
  });

  return apiClient.post<RebalancePlanResult>(
    `/api/contests/${encodeURIComponent(safeContestId)}/rebalance-plan`,
    body
  );
}

export async function executeRebalance(contestId: string, input: RebalanceInput): Promise<RebalanceExecutionResult> {
  const safeContestId = ensureContestId(contestId);
  const safeParticipant = ensureParticipant(input.participant);
  const safeIntent = ensureIntent(input.intent);

  const body = sanitizePayload({
    participant: safeParticipant,
    intent: sanitizePayload({
      sellAsset: safeIntent.sellAsset,
      buyAsset: safeIntent.buyAsset,
      amount: safeIntent.amount,
      minimumReceived: safeIntent.minimumReceived,
      quoteId: safeIntent.quoteId
    }),
    blockTag: input.blockTag
  });

  return apiClient.post<RebalanceExecutionResult>(
    `/api/contests/${encodeURIComponent(safeContestId)}/execute/rebalance`,
    body
  );
}

export async function requestPriceSourceUpdate(contestId: string): Promise<TransactionEnvelope> {
  const safeContestId = ensureContestId(contestId);
  return apiClient.post<TransactionEnvelope>(
    `/api/contests/${encodeURIComponent(safeContestId)}/price-source/update`,
    {}
  );
}
