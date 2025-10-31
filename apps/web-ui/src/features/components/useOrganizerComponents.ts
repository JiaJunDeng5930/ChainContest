'use client';

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { apiClient, ApiError } from "../../lib/api/client";

export interface OrganizerComponentQuery {
  type?: "vault_implementation" | "price_source";
  networkId?: number;
  statuses?: Array<"pending" | "confirmed" | "failed">;
  pageSize?: number;
  cursor?: string | null;
}

export interface OrganizerComponentItem {
  id: string;
  userId: string;
  walletAddress: string | null;
  networkId: number;
  componentType: "vault_implementation" | "price_source";
  contractAddress: string;
  config: Record<string, unknown>;
  configHash: string;
  status: "pending" | "confirmed" | "failed";
  transactionHash: string | null;
  failureReason: Record<string, unknown> | null;
  confirmedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OrganizerComponentList {
  items: OrganizerComponentItem[];
  nextCursor: string | null;
}

const buildRequestUrl = (query: OrganizerComponentQuery): string => {
  const params = new URLSearchParams();

  if (query.type) {
    params.set("type", query.type);
  }

  if (typeof query.networkId === "number") {
    params.set("networkId", String(query.networkId));
  }

  query.statuses?.forEach((status) => params.append("status", status));

  if (typeof query.pageSize === "number") {
    params.set("pageSize", String(query.pageSize));
  }

  if (query.cursor) {
    params.set("cursor", query.cursor);
  }

  const queryString = params.toString();
  return queryString.length > 0 ? `/api/organizer/components?${queryString}` : "/api/organizer/components";
};

const fetchOrganizerComponents = async (query: OrganizerComponentQuery): Promise<OrganizerComponentList> => {
  const endpoint = buildRequestUrl(query);

  try {
    return await apiClient.get<OrganizerComponentList>(endpoint);
  } catch (error) {
    if (error instanceof ApiError) {
      const body = (error.body && typeof error.body === "object" ? error.body : {}) as {
        message?: unknown;
      };
      const message =
        typeof body.message === "string"
          ? body.message
          : error.statusText || `Request failed with status ${error.status}`;
      throw new Error(message);
    }

    throw error;
  }
};

export const useOrganizerComponents = (
  query: OrganizerComponentQuery
): UseQueryResult<OrganizerComponentList, Error> => {
  return useQuery<OrganizerComponentList, Error, OrganizerComponentList, [string, OrganizerComponentQuery]>({
    queryKey: ["organizer-components", query],
    queryFn: () => fetchOrganizerComponents(query)
  });
};
