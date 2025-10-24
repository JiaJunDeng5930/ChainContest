"use client";

export type SessionStatus = "unknown" | "loading" | "authenticated" | "unauthenticated";

export type SessionSummary = {
  walletAddress: string;
  addressChecksum: string;
  needsRefresh: boolean;
  expiresAt?: string;
};

export type UseSessionResult = {
  status: SessionStatus;
  data: SessionSummary | null;
  refetch: () => Promise<void>;
};

export function useSession(): UseSessionResult {
  return {
    status: "unknown",
    data: null,
    refetch: async () => undefined
  };
}

export default useSession;
