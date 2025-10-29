'use client';

import { useMutation, type UseMutationResult } from "@tanstack/react-query";

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

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => ({ message: response.statusText }))) as Record<string, unknown>;
    const message = typeof errorBody.message === "string" ? errorBody.message : response.statusText;
    throw new Error(message);
  }

  return response.json() as Promise<DeployComponentResponse>;
};

export const useDeployComponent = (): UseMutationResult<DeployComponentResponse, Error, DeployComponentPayload> =>
  useMutation({
    mutationFn: request
  });
