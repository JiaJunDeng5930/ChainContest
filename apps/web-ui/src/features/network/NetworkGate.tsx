"use client";

import { CHAIN_METADATA, SUPPORTED_CHAIN_IDS, type SupportedChainId } from "@chaincontest/shared-i18n";
import { useTranslations } from "next-intl";
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useAccount, useChainId } from "wagmi";

import ErrorBanner from "../../components/ErrorBanner";
import useSession, { type SessionStatus } from "../auth/hooks/useSession";
import { useRuntimeConfig } from "../runtime/hooks/useRuntimeConfig";

type NetworkGateState = {
  isWalletConnected: boolean;
  isSupportedNetwork: boolean;
  requiredChainId: number | null;
  currentChainId: number | null;
  runtimeDegraded: boolean;
  sessionStatus: SessionStatus;
  isSessionActive: boolean;
  address?: `0x${string}`;
};

const NetworkGateContext = createContext<NetworkGateState | null>(null);

export function useNetworkGateState() {
  const context = useContext(NetworkGateContext);
  if (!context) {
    throw new Error("useNetworkGateState must be used within NetworkGate");
  }
  return context;
}

type NetworkGateProps = {
  children: ReactNode;
};

function toSupportedChainId(chainId: number | null): SupportedChainId | null {
  if (chainId == null) {
    return null;
  }

  return SUPPORTED_CHAIN_IDS.includes(chainId as SupportedChainId) ? (chainId as SupportedChainId) : null;
}

export function NetworkGate({ children }: NetworkGateProps) {
  const t = useTranslations();
  const runtimeQuery = useRuntimeConfig();
  const session = useSession();
  const { address, status: walletStatus } = useAccount();
  const activeChainId = useChainId();

  const requiredChainId = runtimeQuery.data?.chainId ?? null;
  const isWalletConnected = walletStatus === "connected";
  const currentChainId = activeChainId ?? null;

  const isSupportedNetwork = !isWalletConnected || !requiredChainId || currentChainId === requiredChainId;
  const isSessionActive = session.status === "authenticated";

  const contextValue = useMemo<NetworkGateState>(
    () => ({
      isWalletConnected,
      isSupportedNetwork,
      requiredChainId,
      currentChainId,
      runtimeDegraded: runtimeQuery.isDegraded,
      sessionStatus: session.status,
      isSessionActive,
      address: address ?? undefined
    }),
    [
      address,
      currentChainId,
      isSessionActive,
      isSupportedNetwork,
      isWalletConnected,
      requiredChainId,
      runtimeQuery.isDegraded,
      session.status
    ]
  );

  const warnings: Array<{
    key: string;
    error: unknown;
    onRetry?: () => Promise<void> | void;
    footerSlot?: ReactNode;
    forceRetryable?: boolean;
  }> = [];

  if (runtimeQuery.isDegraded) {
    const lastRefreshed = runtimeQuery.lastLoadedAt
      ? t("runtime.refreshedAt", { timestamp: runtimeQuery.lastLoadedAt.toLocaleString() })
      : null;

    warnings.push({
      key: "runtime",
      error: new Error(t("runtime.degraded")),
      onRetry: runtimeQuery.refetch,
      forceRetryable: true,
      footerSlot: (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
          <button
            type="button"
            onClick={() => runtimeQuery.refetch()}
            className="w-full rounded border border-slate-200/40 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-50 transition hover:bg-slate-100 hover:text-slate-950 sm:w-auto"
          >
            {t("runtime.reload")}
          </button>
          {lastRefreshed ? <span className="text-xs text-slate-300">{lastRefreshed}</span> : null}
        </div>
      )
    });
  }

  if (isWalletConnected && !isSupportedNetwork) {
    const requiredChainMetadata = toSupportedChainId(requiredChainId);
    const currentChainMetadata = toSupportedChainId(currentChainId);
    const requiredChainName = requiredChainMetadata ? CHAIN_METADATA[requiredChainMetadata].nameKey : null;
    const currentChainName = currentChainMetadata ? CHAIN_METADATA[currentChainMetadata].nameKey : null;

    warnings.push({
      key: "network",
      error: new Error(t("auth.guard.unsupportedNetwork")),
      footerSlot: (
        <div className="space-y-1 text-xs text-rose-200">
          <p>
            {t("runtime.requiredChain", {
              chain: requiredChainName ? t(requiredChainName) : String(requiredChainId ?? "N/A")
            })}
          </p>
          {currentChainName ? (
            <p>
              {t("runtime.currentChain", {
                chain: t(currentChainName)
              })}
            </p>
          ) : null}
        </div>
      )
    });
  }

  if (session.status === "unauthenticated") {
    warnings.push({
      key: "session",
      error: new Error(t("auth.guard.requiresLogin"))
    });
  }

  return (
    <NetworkGateContext.Provider value={contextValue}>
      {warnings.length ? (
        <div className="space-y-4 pb-6">
          {warnings.map(({ key, error, onRetry, footerSlot, forceRetryable }) => (
            <ErrorBanner
              key={key}
              error={error}
              onRetry={
                onRetry
                  ? async () => {
                      await onRetry();
                    }
                  : undefined
              }
              footerSlot={footerSlot}
              forceRetryable={forceRetryable}
            />
          ))}
        </div>
      ) : null}
      {children}
    </NetworkGateContext.Provider>
  );
}

export default NetworkGate;
