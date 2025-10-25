import {
  QUERY_KEYS,
  RUNTIME_CONFIG_REFRESH_INTERVAL_MS,
  SUPPORTED_CHAIN_IDS,
  type SupportedChainId
} from "@chaincontest/shared-i18n";
import { useQuery } from "@tanstack/react-query";

import { ApiError, apiClient } from "../../../lib/api/client";

export type RuntimeContract = {
  id: string;
  name: string;
  address: string;
  abiPath: string;
  tags?: string[];
};

export type RuntimeConfig = {
  rpcUrl: string;
  chainId: number;
  devPort: number;
  defaultAccount?: string | null;
  contracts: RuntimeContract[];
};

const FALLBACK_CHAIN_ID: number =
  SUPPORTED_CHAIN_IDS.find((id) => id === 11155111) ?? SUPPORTED_CHAIN_IDS[0] ?? 11155111;

const FALLBACK_RUNTIME_CONFIG: RuntimeConfig = {
  chainId: FALLBACK_CHAIN_ID,
  rpcUrl: "",
  devPort: 0,
  defaultAccount: null,
  contracts: []
};

type RuntimeConfigResponse = RuntimeConfig | null;

function isSupportedChainId(value: number | null | undefined): value is SupportedChainId {
  return typeof value === "number" && SUPPORTED_CHAIN_IDS.includes(value as SupportedChainId);
}

export function useRuntimeConfig() {
  const query = useQuery<RuntimeConfigResponse, Error>({
    queryKey: QUERY_KEYS.runtimeConfig,
    queryFn: async () => apiClient.get<RuntimeConfigResponse>("/api/runtime/config"),
    refetchInterval: RUNTIME_CONFIG_REFRESH_INTERVAL_MS,
    staleTime: RUNTIME_CONFIG_REFRESH_INTERVAL_MS,
    retry: (failureCount, error) => {
      if (error instanceof ApiError) {
        return error.status >= 500 && failureCount < 2;
      }
      return failureCount < 2;
    }
  });

  const runtimeConfig = query.data ?? FALLBACK_RUNTIME_CONFIG;
  const isFallback = query.data == null;
  const normalizedChainId = isSupportedChainId(runtimeConfig.chainId) ? runtimeConfig.chainId : FALLBACK_CHAIN_ID;
  const data: RuntimeConfig = {
    ...runtimeConfig,
    chainId: normalizedChainId
  };
  const lastLoadedAt = query.dataUpdatedAt ? new Date(query.dataUpdatedAt) : null;

  return {
    ...query,
    data,
    isFallback,
    isDegraded: isFallback,
    lastLoadedAt
  };
}
