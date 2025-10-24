import { QUERY_KEYS, RUNTIME_CONFIG_REFRESH_INTERVAL_MS, SUPPORTED_CHAIN_IDS } from "@chaincontest/shared-i18n";
import { useQuery } from "@tanstack/react-query";

import { apiClient } from "../../../lib/api/client";

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

const FALLBACK_RUNTIME_CONFIG: RuntimeConfig = {
  chainId: SUPPORTED_CHAIN_IDS.includes(11155111) ? 11155111 : SUPPORTED_CHAIN_IDS[0],
  rpcUrl: "",
  devPort: 0,
  defaultAccount: null,
  contracts: []
};

type RuntimeConfigResponse = RuntimeConfig | null;

export function useRuntimeConfig() {
  const query = useQuery<RuntimeConfigResponse, Error>({
    queryKey: QUERY_KEYS.runtimeConfig,
    queryFn: async () => apiClient.get<RuntimeConfigResponse>("/api/runtime/config"),
    refetchInterval: RUNTIME_CONFIG_REFRESH_INTERVAL_MS,
    staleTime: RUNTIME_CONFIG_REFRESH_INTERVAL_MS,
    suspense: false,
    throwOnError: false
  });

  const data = query.data ?? FALLBACK_RUNTIME_CONFIG;
  const isFallback = query.data == null;

  return {
    ...query,
    data,
    isFallback,
    isDegraded: isFallback,
    lastLoadedAt: query.dataUpdatedAt ? new Date(query.dataUpdatedAt) : null
  };
}
