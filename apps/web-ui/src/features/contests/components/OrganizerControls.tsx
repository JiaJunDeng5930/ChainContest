"use client";

import { QUERY_KEYS } from "@chaincontest/shared-i18n";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { useTranslations } from "next-intl";

import useSession from "../../auth/hooks/useSession";
import { useWalletTransactions } from "../../participation/hooks/useWalletTransactions";
import type { ContestSnapshot } from "../api/contests";
import {
  requestFreezePlan,
  requestSealPlan,
  confirmFreezeAction,
  confirmSealAction,
  requestGoLivePlan
} from "../api/admin";

type OrganizerControlsProps = {
  contest: ContestSnapshot;
  onActionComplete?: () => Promise<void> | void;
};

const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;

const normalizeAddress = (value?: string | null): string | null => {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (!ADDRESS_PATTERN.test(trimmed)) {
    return null;
  }
  return trimmed.toLowerCase();
};

const readMetadataPath = (metadata: Record<string, unknown> | null | undefined, path: readonly string[]): unknown => {
  if (!metadata) {
    return undefined;
  }
  let current: unknown = metadata;
  for (const segment of path) {
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
};

const extractOrganizerWallet = (metadata: Record<string, unknown> | null | undefined): string | null => {
  const candidates: readonly (readonly string[])[] = [
    ["organizerWallet"],
    ["creatorWallet"],
    ["runtimeConfig", "defaultAccount"]
  ];

  for (const path of candidates) {
    const value = readMetadataPath(metadata, path);
    const normalized = normalizeAddress(typeof value === "string" ? value : null);
    if (normalized) {
      return normalized;
    }
  }

  return null;
};

const extractTimestamp = (metadata: Record<string, unknown> | null | undefined, paths: readonly (readonly string[])[]) => {
  for (const path of paths) {
    const value = readMetadataPath(metadata, path);
    if (typeof value === "string" && value.length > 0) {
      const parsed = Date.parse(value);
      if (!Number.isNaN(parsed)) {
        return parsed;
      }
    }
  }
  return null;
};

export function OrganizerControls({ contest, onActionComplete }: OrganizerControlsProps) {
  const t = useTranslations();
  const session = useSession();
  const queryClient = useQueryClient();
  const { sendExecutionCall, walletReady } = useWalletTransactions();

  const organizerWallet = useMemo(
    () => extractOrganizerWallet(contest.metadata as Record<string, unknown> | null),
    [contest.metadata]
  );
  const sessionWallet = session.data?.walletAddress?.toLowerCase();
  const isOrganizer = session.status === "authenticated" && organizerWallet && sessionWallet === organizerWallet;

  if (!isOrganizer) {
    return null;
  }

  const registrationClosesAt = extractTimestamp(contest.metadata as Record<string, unknown> | null, [
    ["chainGatewayDefinition", "timeline", "registrationClosesAt"],
    ["timeline", "registrationClosesAt"]
  ]);

  const tradingClosesAt = extractTimestamp(contest.metadata as Record<string, unknown> | null, [
    ["chainGatewayDefinition", "timeline", "tradingClosesAt"],
    ["chainGatewayDefinition", "timeline", "liveEnds"],
    ["timeline", "tradingClosesAt"],
    ["timeline", "liveEnds"]
  ]);

  const now = Date.now();
  const goLiveDisabledReason =
    registrationClosesAt && now < registrationClosesAt ? t("contests.organizer.goLiveBlocked") : null;

  const freezeAvailable = !tradingClosesAt || now >= tradingClosesAt;
  const freezeDisabledReason = freezeAvailable ? null : t("contests.organizer.freezeBlocked");

  const sealDisabledReason =
    contest.phase === "registration" || contest.phase === "active" ? t("contests.organizer.sealBlocked") : null;

  const invalidateContest = async () => {
    await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.contestDetail(contest.contestId) });
    if (onActionComplete) {
      await onActionComplete();
    }
  };

  const freezeMutation = useMutation({
    mutationFn: async () => {
      const plan = await requestFreezePlan(contest.contestId);
      if (plan.status !== "ready" || !plan.transaction) {
        throw new Error(plan.reason?.message ?? t("contests.organizer.freezeBlocked"));
      }
      const { hash } = await sendExecutionCall(plan.transaction);
      await confirmFreezeAction(contest.contestId, { transactionHash: hash });
    },
    onSuccess: async () => {
      await invalidateContest();
    }
  });

  const goLiveMutation = useMutation({
    mutationFn: async () => {
      const plan = await requestGoLivePlan(contest.contestId);
      if (plan.status !== "ready" || !plan.transaction) {
        throw new Error(plan.reason?.message ?? t("contests.organizer.goLiveBlocked"));
      }
      await sendExecutionCall(plan.transaction);
    },
    onSuccess: async () => {
      await invalidateContest();
    }
  });

  const sealMutation = useMutation({
    mutationFn: async () => {
      const plan = await requestSealPlan(contest.contestId);
      if (plan.status !== "ready" || !plan.transaction) {
        throw new Error(plan.reason?.message ?? t("contests.organizer.sealBlocked"));
      }
      const { hash } = await sendExecutionCall(plan.transaction);
      await confirmSealAction(contest.contestId, { transactionHash: hash });
    },
    onSuccess: async () => {
      await invalidateContest();
    }
  });

  return (
    <section className="space-y-4 rounded-xl border border-emerald-900/50 bg-emerald-950/10 p-4">
      <header className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-400">
          {t("contests.organizer.sectionTitle")}
        </p>
        <p className="text-sm text-slate-200">{t("contests.organizer.sectionDescription")}</p>
      </header>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => goLiveMutation.mutate()}
          disabled={Boolean(goLiveDisabledReason) || goLiveMutation.isPending || !walletReady}
          className="rounded border border-amber-600/70 bg-amber-600/10 px-4 py-2 text-sm font-medium text-amber-100 transition hover:border-amber-400 hover:text-amber-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {goLiveMutation.isPending ? t("contests.organizer.actionPending") : t("contests.organizer.goLiveAction")}
        </button>

        <button
          type="button"
          onClick={() => freezeMutation.mutate()}
          disabled={Boolean(freezeDisabledReason) || freezeMutation.isPending || !walletReady}
          className="rounded border border-emerald-600/70 bg-emerald-600/10 px-4 py-2 text-sm font-medium text-emerald-100 transition hover:border-emerald-400 hover:text-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {freezeMutation.isPending ? t("contests.organizer.actionPending") : t("contests.organizer.freezeAction")}
        </button>

        <button
          type="button"
          onClick={() => sealMutation.mutate()}
          disabled={Boolean(sealDisabledReason) || sealMutation.isPending || !walletReady}
          className="rounded border border-indigo-600/70 bg-indigo-600/10 px-4 py-2 text-sm font-medium text-indigo-100 transition hover:border-indigo-400 hover:text-indigo-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {sealMutation.isPending ? t("contests.organizer.actionPending") : t("contests.organizer.sealAction")}
        </button>
      </div>

      {goLiveDisabledReason ? (
        <p className="text-xs text-amber-300">{goLiveDisabledReason}</p>
      ) : null}
      {freezeDisabledReason ? (
        <p className="text-xs text-amber-300">{freezeDisabledReason}</p>
      ) : null}
      {sealDisabledReason ? (
        <p className="text-xs text-amber-300">{sealDisabledReason}</p>
      ) : null}

      {goLiveMutation.isError ? (
        <p className="text-xs text-rose-300">{goLiveMutation.error?.message ?? t("common.status.error")}</p>
      ) : null}
      {freezeMutation.isError ? (
        <p className="text-xs text-rose-300">{freezeMutation.error?.message ?? t("common.status.error")}</p>
      ) : null}
      {sealMutation.isError ? (
        <p className="text-xs text-rose-300">{sealMutation.error?.message ?? t("common.status.error")}</p>
      ) : null}
    </section>
  );
}

export default OrganizerControls;
