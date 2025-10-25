import { apiClient } from "../../../lib/api/client";

export type SiweStartRequest = {
  address: `0x${string}`;
  chainId: number;
};

export type SiweStartResponse = {
  nonce: string;
  expiresAt: string;
};

export type SiweVerifyRequest = {
  message: string;
  signature: string;
};

export type SiweVerifyResponse = {
  status: "ok";
  user: {
    walletAddress: string;
    addressChecksum: string;
  };
};

export async function requestSiweNonce(payload: SiweStartRequest): Promise<SiweStartResponse> {
  return apiClient.post<SiweStartResponse>("/api/auth/siwe/start", payload);
}

export async function verifySiweSignature(payload: SiweVerifyRequest): Promise<SiweVerifyResponse> {
  return apiClient.post<SiweVerifyResponse>("/api/auth/siwe/verify", payload);
}

export async function logoutSession(): Promise<void> {
  await apiClient.post("/api/auth/logout", undefined, { parseResponse: false });
}

