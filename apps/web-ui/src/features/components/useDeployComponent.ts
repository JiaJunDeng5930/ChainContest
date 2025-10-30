'use client';

import { useMutation, type UseMutationResult } from "@tanstack/react-query";
import { apiClient, ApiError } from "../../lib/api/client";

interface VaultComponentPayload {
  componentType: "vault_implementation";
  networkId: number;
  baseAsset: string;
  quoteAsset: string;
  metadata?: Record<string, unknown>;
}

interface PriceSourceComponentPayload {
  componentType: "price_source";
  networkId: number;
  poolAddress: string;
  twapSeconds: number;
  metadata?: Record<string, unknown>;
}

export type DeployComponentPayload = VaultComponentPayload | PriceSourceComponentPayload;

export interface DeployComponentResponse {
  status: string;
  component: Record<string, unknown>;
  transactionHash: string | null;
  confirmedAt: string | null;
  configHash?: string;
  config: Record<string, unknown>;
}

const resolveEndpoint = (payload: DeployComponentPayload): string => {
  switch (payload.componentType) {
    case "vault_implementation":
      return "/api/organizer/components/vaults";
    case "price_source":
      return "/api/organizer/components/price-sources";
    default:
      return "/api/organizer/components";
  }
};

const request = async (payload: DeployComponentPayload): Promise<DeployComponentResponse> => {
  const endpoint = resolveEndpoint(payload);

  try {
    return await apiClient.post<DeployComponentResponse>(endpoint, payload);
  } catch (error) {
    if (error instanceof ApiError) {
      const body = error.body as Record<string, unknown> | undefined;
      const message = typeof body?.message === "string" ? body.message : error.statusText || `Request failed with status ${error.status}`;
      throw new Error(message);
    }
    throw error;
  }
};

export const useDeployComponent = (): UseMutationResult<DeployComponentResponse, Error, DeployComponentPayload> =>
  useMutation({
    mutationFn: request
  });
