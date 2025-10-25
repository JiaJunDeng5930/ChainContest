import { apiClient } from "../../../lib/api/client";
import {
  type RegistrationPlanResult,
  type RegistrationExecutionResult,
  type RewardClaimResult
} from "./types";

export type BlockTag = "latest" | number | `${number}`;

export type RegistrationPlanInput = {
  participant: string;
  referrer?: string | null;
  blockTag?: BlockTag | null;
};

export type RegistrationExecutionInput = RegistrationPlanInput;

export type RewardClaimInput = {
  participant: string;
  blockTag?: BlockTag | null;
};

const PARTICIPANT_ERROR = "participant is required";

const CONTEST_ID_ERROR = "contestId is required";

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

export async function fetchRegistrationPlan(
  contestId: string,
  input: RegistrationPlanInput
): Promise<RegistrationPlanResult> {
  const safeContestId = ensureContestId(contestId);
  const safeParticipant = ensureParticipant(input.participant);

  const body = sanitizePayload({
    participant: safeParticipant,
    referrer: input.referrer,
    blockTag: input.blockTag
  });

  return apiClient.post<RegistrationPlanResult>(
    `/api/contests/${encodeURIComponent(safeContestId)}/registration-plan`,
    body
  );
}

export async function executeRegistration(
  contestId: string,
  input: RegistrationExecutionInput
): Promise<RegistrationExecutionResult> {
  const safeContestId = ensureContestId(contestId);
  const safeParticipant = ensureParticipant(input.participant);

  const body = sanitizePayload({
    participant: safeParticipant,
    referrer: input.referrer,
    blockTag: input.blockTag
  });

  return apiClient.post<RegistrationExecutionResult>(
    `/api/contests/${encodeURIComponent(safeContestId)}/execute/register`,
    body
  );
}

export async function fetchRewardClaimPlan(
  contestId: string,
  input: RewardClaimInput
): Promise<RewardClaimResult> {
  const safeContestId = ensureContestId(contestId);
  const safeParticipant = ensureParticipant(input.participant);

  const body = sanitizePayload({
    participant: safeParticipant,
    blockTag: input.blockTag
  });

  return apiClient.post<RewardClaimResult>(
    `/api/contests/${encodeURIComponent(safeContestId)}/reward-claim`,
    body
  );
}

export async function executeRewardClaim(
  contestId: string,
  input: RewardClaimInput
): Promise<RewardClaimResult> {
  const safeContestId = ensureContestId(contestId);
  const safeParticipant = ensureParticipant(input.participant);

  const body = sanitizePayload({
    participant: safeParticipant,
    blockTag: input.blockTag
  });

  return apiClient.post<RewardClaimResult>(
    `/api/contests/${encodeURIComponent(safeContestId)}/execute/reward-claim`,
    body
  );
}
