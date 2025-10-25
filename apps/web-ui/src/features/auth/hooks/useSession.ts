"use client";

import { QUERY_KEYS } from "@chaincontest/shared-i18n";
import { useQuery } from "@tanstack/react-query";
import { useCallback } from "react";

import { ApiError, apiClient } from "../../../lib/api/client";

export type SessionStatus = "loading" | "authenticated" | "unauthenticated";

export type SessionSummary = {
  walletAddress: string;
  addressChecksum: string;
  needsRefresh: boolean;
  expiresAt?: string | null;
};

type SessionEndpointResponse = {
  walletAddress: string;
  addressChecksum: string;
  needsRefresh?: boolean;
  expiresAt?: string | null;
} | null;

export type UseSessionResult = {
  status: SessionStatus;
  data: SessionSummary | null;
  refetch: () => Promise<void>;
};

export function useSession(): UseSessionResult {
  const query = useQuery<SessionSummary | null, Error>({
    queryKey: QUERY_KEYS.session,
    queryFn: async () => {
      try {
        const response = await apiClient.get<SessionEndpointResponse>("/api/auth/session");
        if (!response) {
          return null;
        }

        return {
          walletAddress: response.walletAddress,
          addressChecksum: response.addressChecksum,
          needsRefresh: response.needsRefresh ?? false,
          expiresAt: response.expiresAt ?? null
        };
      } catch (error) {
        if (error instanceof ApiError && (error.status === 401 || error.status === 403 || error.status === 404)) {
          return null;
        }
        throw error;
      }
    },
    refetchInterval: 5 * 60_000,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    retry: (failureCount, error) => {
      if (error instanceof ApiError && error.status >= 500) {
        return failureCount < 2;
      }
      return failureCount < 2;
    }
  });

  const sessionStatus: SessionStatus = query.isLoading ? "loading" : query.data ? "authenticated" : "unauthenticated";
  const refetch = useCallback(async () => {
    await query.refetch();
  }, [query]);

  return {
    status: sessionStatus,
    data: query.data ?? null,
    refetch
  };
}

export default useSession;
