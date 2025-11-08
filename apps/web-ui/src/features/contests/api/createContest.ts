import { apiClient, type JsonValue } from "../../../lib/api/client";

export interface ContestDeploymentConfigPayload {
  entryAsset: string;
  entryAmount: string;
  entryFee: string;
  priceSource: string;
  swapPool: string;
  priceToleranceBps: number;
  settlementWindow: number;
  maxParticipants: number;
  topK: number;
}

export interface ContestDeploymentTimelinePayload {
  registeringEnds: string;
  liveEnds: string;
  claimEnds: string;
}

export interface ContestCreationPayload {
  contestId: string;
  vaultComponentId: string;
  priceSourceComponentId: string;
  vaultImplementation: string;
  config: ContestDeploymentConfigPayload;
  timeline: ContestDeploymentTimelinePayload;
  initialPrizeAmount: string;
  payoutSchedule: number[];
  metadata?: Record<string, unknown>;
}

export interface ContestCreationRequestSummary {
  requestId: string;
  userId: string;
  networkId: number;
  payload: Record<string, unknown>;
  vaultComponentId: string | null;
  priceSourceComponentId: string | null;
  failureReason: Record<string, unknown> | null;
  transactionHash: string | null;
  confirmedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ContestCreationArtifact {
  artifactId: string;
  requestId: string;
  contestId: string | null;
  networkId: number;
  contestAddress: string | null;
  vaultFactoryAddress: string | null;
  registrarAddress: string | null;
  treasuryAddress: string | null;
  settlementAddress: string | null;
  rewardsAddress: string | null;
  transactionHash: string | null;
  confirmedAt: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface ContestCreationReceiptArtifact {
  networkId: number;
  contestAddress: string;
  vaultFactoryAddress: string;
  registrarAddress: string | null;
  treasuryAddress: string | null;
  settlementAddress: string | null;
  rewardsAddress: string | null;
  transactionHash: string | null;
  confirmedAt: string | null;
  metadata: Record<string, unknown>;
}

export interface OwnerInitializationMetadata {
  contestAddress: string;
  vaultFactoryAddress: string;
  callData: string;
  args: {
    config: {
      entryAsset: string;
      entryAmount: string;
      entryFee: string;
      priceSource: string;
      swapPool: string;
      priceToleranceBps: number;
      settlementWindow: number;
      maxParticipants: number;
      topK: number;
    };
    initialPrizeAmount: string;
  };
}

export interface ContestCreationReceipt {
  status: string;
  requestId: string;
  organizer: string;
  networkId: number;
  acceptedAt: string;
  metadata: Record<string, unknown>;
  artifact: ContestCreationReceiptArtifact | null;
}

export interface ContestCreationAggregate {
  status: string;
  request: ContestCreationRequestSummary;
  artifact: ContestCreationArtifact | null;
  receipt: ContestCreationReceipt;
}

export interface ContestCreationRequest {
  networkId: number;
  payload: ContestCreationPayload;
}

export async function submitContestCreation(
  request: ContestCreationRequest
): Promise<ContestCreationAggregate> {
  return apiClient.post<ContestCreationAggregate>("/api/contests/create", request as unknown as JsonValue);
}

export interface FinalizeContestCreationPayload {
  requestId: string;
  transactionHash: string;
}

export async function finalizeContestCreation(
  request: FinalizeContestCreationPayload
): Promise<ContestCreationAggregate> {
  return apiClient.post<ContestCreationAggregate>(
    "/api/contests/create/finalize",
    request as unknown as JsonValue
  );
}
