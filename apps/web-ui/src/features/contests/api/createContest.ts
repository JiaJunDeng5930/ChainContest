import { apiClient } from "../../../lib/api/client";

export type ContestCreationPayload = Record<string, unknown>;

export type ContestCreationRequestSummary = {
  requestId: string;
  userId: string;
  networkId: number;
  payload: ContestCreationPayload;
  createdAt: string;
  updatedAt: string;
};

export type ContestCreationArtifact = {
  artifactId: string;
  requestId: string;
  contestId: string | null;
  networkId: number;
  registrarAddress: string | null;
  treasuryAddress: string | null;
  settlementAddress: string | null;
  rewardsAddress: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type ContestCreationReceipt = {
  status: string;
  requestId: string;
  organizer: string;
  networkId: number;
  acceptedAt: string;
  metadata: Record<string, unknown>;
};

export type ContestCreationAggregate = {
  status: string;
  request: ContestCreationRequestSummary;
  artifact: ContestCreationArtifact | null;
  receipt: ContestCreationReceipt;
};

export type ContestCreationRequest = {
  networkId: number;
  payload: ContestCreationPayload;
};

export async function submitContestCreation(
  request: ContestCreationRequest
): Promise<ContestCreationAggregate> {
  return apiClient.post<ContestCreationAggregate>("/api/contests/create", request);
}
