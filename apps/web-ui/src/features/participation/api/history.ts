import { apiClient } from "../../../lib/api/client";
import type { UserContestListResponse } from "./types";

export type ParticipationHistoryParams = {
  cursor?: string | null;
  pageSize?: number;
  networkId?: number;
};

function buildHistoryPath({ cursor, pageSize, networkId }: ParticipationHistoryParams = {}): string {
  const searchParams = new URLSearchParams({
    kind: "participated"
  });

  if (typeof pageSize === "number" && Number.isFinite(pageSize) && pageSize > 0) {
    searchParams.set("pageSize", String(pageSize));
  }

  if (cursor) {
    searchParams.set("cursor", cursor);
  }

  if (typeof networkId === "number" && Number.isFinite(networkId) && networkId > 0) {
    searchParams.set("networkId", String(networkId));
  }

  return `/api/me/contests?${searchParams.toString()}`;
}

export async function fetchParticipationHistory(params: ParticipationHistoryParams = {}): Promise<UserContestListResponse> {
  return apiClient.get<UserContestListResponse>(buildHistoryPath(params));
}
