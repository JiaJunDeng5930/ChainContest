"use client";

import { useConnectModal } from "@rainbow-me/rainbowkit";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useState } from "react";
import { SiweMessage } from "siwe";
import { useAccount, useChainId, useDisconnect, useSignMessage } from "wagmi";

import useSession from "../hooks/useSession";
import { logoutSession, requestSiweNonce, verifySiweSignature } from "../api/siwe";
import useErrorPresenter, { type PresentedError } from "../../../lib/errors/useErrorPresenter";

type InteractionStep = "idle" | "wallet" | "nonce" | "signature" | "verification" | "logout";

function formatWalletAddress(address: string): string {
  if (address.length <= 10) {
    return address;
  }
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function resolveDomain(): string {
  if (typeof window === "undefined") {
    return "";
  }

  return window.location.host;
}

function resolveUri(): string {
  if (typeof window === "undefined") {
    return "";
  }

  return window.location.origin;
}

export default function WalletConnectButton() {
  const t = useTranslations();
  const session = useSession();
  const { address, status: walletStatus } = useAccount();
  const chainId = useChainId();
  const { disconnectAsync } = useDisconnect();
  const { signMessageAsync } = useSignMessage();
  const { openConnectModal } = useConnectModal();
  const presentError = useErrorPresenter();

  const [pendingStep, setPendingStep] = useState<InteractionStep>("idle");
  const [pendingSiweAfterConnect, setPendingSiweAfterConnect] = useState(false);
  const [error, setError] = useState<PresentedError | null>(null);

  const isProcessing = pendingStep !== "idle" && pendingStep !== "wallet";
  const isWalletConnected = walletStatus === "connected";

  const sessionStatusText = useMemo(() => {
    if (session.status === "authenticated" && session.data) {
      if (session.data.needsRefresh) {
        return t("auth.session.expiring");
      }
      return t("auth.session.active");
    }

    if (session.status === "unauthenticated") {
      return t("auth.guard.requiresLogin");
    }

    return t("auth.connecting");
  }, [session.data, session.status, t]);

  const buttonLabel = useMemo(() => {
    if (isProcessing) {
      switch (pendingStep) {
        case "nonce":
          return t("auth.connecting");
        case "signature":
          return t("auth.connecting");
        case "verification":
          return t("auth.connecting");
        case "logout":
          return t("auth.disconnect");
        default:
          return t("auth.connecting");
      }
    }

    if (session.status === "authenticated") {
      return t("auth.disconnect");
    }

    return t("auth.connect");
  }, [isProcessing, pendingStep, session.status, t]);

  const clearError = useCallback(() => setError(null), []);

  const handleSiwe = useCallback(async () => {
    if (!isWalletConnected || !address) {
      return;
    }

    if (!chainId) {
      setError(
        presentError(
          new Error(
            "Wallet connected without chain context. Please ensure a supported network is selected before signing."
          )
        )
      );
      return;
    }

    setPendingStep("nonce");
    clearError();

    try {
      const { nonce, expiresAt } = await requestSiweNonce({ address, chainId });

      setPendingStep("signature");

      const message = new SiweMessage({
        domain: resolveDomain(),
        address,
        statement: t("auth.siwe.statement"),
        uri: resolveUri(),
        version: "1",
        chainId,
        nonce,
        issuedAt: new Date().toISOString(),
        expirationTime: expiresAt
      });

      const preparedMessage = message.prepareMessage();
      const signature = await signMessageAsync({ message: preparedMessage });

      setPendingStep("verification");
      await verifySiweSignature({
        message: preparedMessage,
        signature
      });

      await session.refetch();
    } catch (caught) {
      setError(presentError(caught));
    } finally {
      setPendingStep("idle");
      setPendingSiweAfterConnect(false);
    }
  }, [address, chainId, clearError, isWalletConnected, presentError, session, signMessageAsync, t]);

  useEffect(() => {
    if (pendingSiweAfterConnect && isWalletConnected && !isProcessing && session.status !== "authenticated") {
      void handleSiwe();
    }
  }, [handleSiwe, isProcessing, isWalletConnected, pendingSiweAfterConnect, session.status]);

  const handleConnectClick = useCallback(async () => {
    clearError();

    if (!isWalletConnected) {
      setPendingSiweAfterConnect(true);
      setPendingStep("wallet");
      openConnectModal?.();
      return;
    }

    await handleSiwe();
  }, [clearError, handleSiwe, isWalletConnected, openConnectModal]);

  const handleDisconnectClick = useCallback(async () => {
    clearError();
    setPendingStep("logout");

    try {
      await logoutSession();
      await session.refetch();
      await disconnectAsync().catch(() => undefined);
    } catch (caught) {
      setError(presentError(caught));
    } finally {
      setPendingStep("idle");
    }
  }, [clearError, disconnectAsync, presentError, session]);

  const handlePrimaryAction = useCallback(async () => {
    if (session.status === "authenticated") {
      await handleDisconnectClick();
    } else {
      await handleConnectClick();
    }
  }, [handleConnectClick, handleDisconnectClick, session.status]);

  const walletDisplayAddress = session.data?.addressChecksum ?? address ?? null;

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => void handlePrimaryAction()}
        disabled={isProcessing}
        className={`rounded-full border border-slate-500/60 bg-slate-900 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:border-slate-300 hover:text-slate-50 ${isProcessing ? "opacity-60" : ""}`}
      >
        {buttonLabel}
      </button>
      {walletDisplayAddress ? (
        <div className="flex flex-col items-end text-xs leading-tight text-slate-300">
          <span className="font-mono uppercase tracking-wide text-slate-200">{formatWalletAddress(walletDisplayAddress)}</span>
          <span>{sessionStatusText}</span>
        </div>
      ) : (
        <span className="text-xs text-slate-400">{sessionStatusText}</span>
      )}
      {error ? (
        <p className="max-w-xs text-right text-xs text-rose-300" role="alert">
          {error.headline}
        </p>
      ) : null}
    </div>
  );
}
