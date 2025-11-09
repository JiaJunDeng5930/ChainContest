"use client";

import type { BlockAnchor, ExecutionCall } from "../../participation/api/types";
import { apiClient, type JsonValue } from "../../../lib/api/client";

export type AdminPlanResponse = {
  status: string;
  transaction?: ExecutionCall | null;
  reason?: { code?: string; message?: string; detail?: unknown } | null;
  derivedAt?: BlockAnchor;
};

const buildEndpoint = (contestId: string, action: string): string => {
  if (!contestId) {
    throw new Error("contestId is required");
  }
  return `/api/contests/${encodeURIComponent(contestId)}/${action}`;
};

export async function requestFreezePlan(contestId: string): Promise<AdminPlanResponse> {
  return apiClient.post<AdminPlanResponse>(buildEndpoint(contestId, "freeze-plan"));
}

export async function requestSealPlan(contestId: string): Promise<AdminPlanResponse> {
  return apiClient.post<AdminPlanResponse>(buildEndpoint(contestId, "seal-plan"));
}

export async function confirmFreezeAction(
  contestId: string,
  payload: { transactionHash: string }
): Promise<AdminPlanResponse> {
  const body: JsonValue = { transactionHash: payload.transactionHash };
  return apiClient.post<AdminPlanResponse>(
    buildEndpoint(contestId, "freeze-plan/confirm"),
    body
  );
}

export async function confirmSealAction(
  contestId: string,
  payload: { transactionHash: string }
): Promise<AdminPlanResponse> {
  const body: JsonValue = { transactionHash: payload.transactionHash };
  return apiClient.post<AdminPlanResponse>(
    buildEndpoint(contestId, "seal-plan/confirm"),
    body
  );
}
