"use client";

import { QUERY_KEYS } from "@chaincontest/shared-i18n";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useMemo, useState } from "react";

import ErrorBanner from "../../../components/ErrorBanner";
import { trackInteraction } from "../../../lib/telemetry";
import { useNetworkGateState } from "../../network/NetworkGate";
import type { ContestSnapshot } from "../../contests/api/contests";
import {
  executeRewardClaim,
  fetchRewardClaimPlan,
  type RewardClaimInput
} from "../api/registration";
import type { BlockAnchor, RewardClaimResult } from "../api/types";
import { formatContestTimestamp, useContestDateTimeFormatter } from "../../contests/utils/format";
import {
  AnchorDetails,
  StatusBadge,
  TransactionDetails,
  PayoutDetails,
  type DisplayCall
} from "./ActionArtifacts";

type RewardClaimPanelProps = {
  contestId: string;
  contest: ContestSnapshot;
};

type RewardPlanDisplay = {
  status: string;
  payout?: RewardClaimResult["payout"];
  claimCall?: DisplayCall | null;
  reasonMessage?: string | null;
  anchor: BlockAnchor;
};

type RewardExecutionDisplay = {
  status: string;
  payout?: RewardClaimResult["payout"];
  claimCall?: DisplayCall | null;
  reasonMessage?: string | null;
  anchor: BlockAnchor;
};

export default function RewardClaimPanel({ contestId, contest }: RewardClaimPanelProps) {
  const t = useTranslations();
  const locale = useLocale();
  const dateFormatter = useContestDateTimeFormatter(locale);
  const gate = useNetworkGateState();
  const queryClient = useQueryClient();

  const [planDisplay, setPlanDisplay] = useState<RewardPlanDisplay | null>(null);
  const [executionDisplay, setExecutionDisplay] = useState<RewardExecutionDisplay | null>(null);
  const [lastError, setLastError] = useState<unknown>(null);

  const participantAddress = gate.address ?? null;
  const isEligiblePhase = contest.phase === "settled" || contest.phase === "closed";

  const formatAnchor = useCallback(
    (anchor: RewardClaimResult["derivedAt"] | undefined | null): BlockAnchor | null => {
      if (!anchor) {
        return null;
      }
      return {
        blockNumber: anchor.blockNumber,
        blockHash: anchor.blockHash,
        timestamp: formatContestTimestamp(anchor.timestamp, dateFormatter)
      };
    },
    [dateFormatter]
  );

const statusLabel = useCallback(
  (status: string) => {
    const key = `participation.status.${status.toLowerCase()}`;
    try {
      return t(key);
    } catch (_error) {
      return status;
    }
  },
  [t]
);

const formatCall = (call: RewardClaimResult["claimCall"] | null | undefined): DisplayCall | null => {
  if (!call || typeof call !== "object") {
    return null;
  }

  const record = call as Record<string, unknown>;
  const to = typeof record.to === "string" ? record.to : "";
  const data = typeof record.data === "string" ? record.data : "";

  if (!to || !data) {
    return null;
  }

  return {
    to,
    data,
    value: typeof record.value === "string" ? record.value : undefined,
    gasLimit: typeof record.gasLimit === "string" ? record.gasLimit : undefined,
    gasPrice: typeof record.gasPrice === "string" ? record.gasPrice : undefined,
    maxFeePerGas: typeof record.maxFeePerGas === "string" ? record.maxFeePerGas : undefined,
    maxPriorityFeePerGas: typeof record.maxPriorityFeePerGas === "string" ? record.maxPriorityFeePerGas : undefined,
    deadline: typeof record.deadline === "string" ? record.deadline : undefined,
    route: typeof record.route === "string" ? record.route : undefined
  } satisfies DisplayCall;
};

  const disableReason = useMemo(() => {
    if (!gate.isSessionActive) {
      return t("participation.messages.notAuthenticated");
    }
    if (!gate.isSupportedNetwork) {
      return t("participation.messages.unsupportedNetwork");
    }
    if (!isEligiblePhase) {
      return t("participation.messages.rewardPhaseOnly");
    }
    if (!participantAddress) {
      return t("participation.messages.walletRequired");
    }
    return null;
  }, [gate.isSessionActive, gate.isSupportedNetwork, isEligiblePhase, participantAddress, t]);

  const toInput = (): RewardClaimInput => {
    if (!participantAddress) {
      throw new Error(t("participation.messages.walletRequired"));
    }
    return {
      participant: participantAddress
    };
  };

  const planMutation = useMutation({
    mutationFn: async () => fetchRewardClaimPlan(contestId, toInput()),
    onSuccess: (result) => {
      trackInteraction({
        action: "reward-plan",
        stage: "success",
        contestId,
        chainId: contest.chainId,
        walletAddress: participantAddress ?? null,
        status: result.status,
        anchor: result.derivedAt ?? null,
        metadata: {
          hasPayout: Boolean(result.payout),
          hasCall: Boolean(result.claimCall)
        }
      });
      setPlanDisplay({
        status: result.status,
        payout: result.payout ?? null,
        claimCall: formatCall(result.claimCall),
        reasonMessage: result.reason?.message ?? null,
        anchor: formatAnchor(result.derivedAt) ?? {
          blockNumber: "-",
          blockHash: undefined,
          timestamp: "-"
        }
      });
      setExecutionDisplay(null);
      setLastError(null);
    },
    onError: (error) => {
      trackInteraction({
        action: "reward-plan",
        stage: "error",
        contestId,
        chainId: contest.chainId,
        walletAddress: participantAddress ?? null,
        error
      });
      setLastError(error);
    }
  });

  const executeMutation = useMutation({
    mutationFn: async () => executeRewardClaim(contestId, toInput()),
    onSuccess: async (result) => {
      trackInteraction({
        action: "reward-execute",
        stage: "success",
        contestId,
        chainId: contest.chainId,
        walletAddress: participantAddress ?? null,
        status: result.status,
        anchor: result.derivedAt ?? null,
        metadata: {
          hasPayout: Boolean(result.payout),
          hasCall: Boolean(result.claimCall)
        }
      });
      setExecutionDisplay({
        status: result.status,
        payout: result.payout ?? null,
        claimCall: formatCall(result.claimCall),
        reasonMessage: result.reason?.message ?? null,
        anchor: formatAnchor(result.derivedAt) ?? {
          blockNumber: "-",
          blockHash: undefined,
          timestamp: "-"
        }
      });
      setLastError(null);
      await queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.contestDetail(contestId)
      });
    },
    onError: (error) => {
      trackInteraction({
        action: "reward-execute",
        stage: "error",
        contestId,
        chainId: contest.chainId,
        walletAddress: participantAddress ?? null,
        error
      });
      setLastError(error);
    }
  });

  const handlePlan = useCallback(async () => {
    setLastError(null);
    trackInteraction({
      action: "reward-plan",
      stage: "start",
      contestId,
      chainId: contest.chainId,
      walletAddress: participantAddress ?? null
    });
    await planMutation.mutateAsync();
  }, [planMutation, contest.chainId, contestId, participantAddress]);

  const handleExecute = useCallback(async () => {
    setLastError(null);
    trackInteraction({
      action: "reward-execute",
      stage: "start",
      contestId,
      chainId: contest.chainId,
      walletAddress: participantAddress ?? null
    });
    await executeMutation.mutateAsync();
  }, [contest.chainId, contestId, executeMutation, participantAddress]);

  const canExecute = useMemo(() => {
    if (!planDisplay) {
      return false;
    }
    if (planDisplay.status.toLowerCase() === "blocked") {
      return false;
    }
    return planDisplay.claimCall != null || planDisplay.payout != null;
  }, [planDisplay]);

  return (
    <section className="space-y-4 rounded-xl border border-slate-800/60 bg-slate-900/40 p-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-50">{t("participation.reward.title")}</h3>
          <p className="text-sm text-slate-300">{t("participation.reward.subtitle")}</p>
        </div>
        {planDisplay ? <StatusBadge status={planDisplay.status} label={statusLabel(planDisplay.status)} /> : null}
      </header>

      {disableReason ? (
        <div className="rounded border border-amber-500/40 bg-amber-900/40 p-3 text-sm text-amber-100">{disableReason}</div>
      ) : null}

      {lastError ? (
        <ErrorBanner
          error={lastError}
          onRetry={() => {
            setLastError(null);
          }}
        />
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <button
          type="button"
          onClick={() => void handlePlan()}
          disabled={Boolean(disableReason) || planMutation.isPending || executeMutation.isPending}
          className="w-full rounded border border-slate-600 bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:border-slate-400 hover:text-slate-50 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
        >
          {planMutation.isPending ? t("participation.actions.generating") : t("participation.actions.generatePlan")}
        </button>
        <button
          type="button"
          onClick={() => void handleExecute()}
          disabled={
            Boolean(disableReason) ||
            !canExecute ||
            planMutation.isPending ||
            executeMutation.isPending
          }
          className="w-full rounded border border-emerald-500/50 bg-emerald-600/20 px-4 py-2 text-sm font-semibold text-emerald-100 transition hover:border-emerald-300 hover:text-emerald-50 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
        >
          {executeMutation.isPending ? t("participation.actions.executing") : t("participation.actions.execute")}
        </button>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4 rounded border border-slate-800/60 bg-slate-900/40 p-4">
          <h4 className="text-sm font-semibold text-slate-200">{t("participation.reward.planSummary")}</h4>
          {planDisplay ? (
            <>
              <AnchorDetails
                anchor={planDisplay.anchor}
                labels={{
                  block: t("participation.labels.blockNumber"),
                  hash: t("participation.labels.blockHash"),
                  timestamp: t("participation.labels.timestamp")
                }}
              />
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  {t("participation.labels.payout")}
                </p>
                <div className="mt-2">
                  <PayoutDetails
                    payout={planDisplay.payout}
                    emptyLabel={t("participation.labels.noPayout")}
                    labels={{
                      amount: t("participation.labels.amount"),
                      destination: t("participation.labels.destination")
                    }}
                  />
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  {t("participation.labels.transaction")}
                </p>
                <div className="mt-2">
                  <TransactionDetails
                    call={planDisplay.claimCall}
                    emptyLabel={t("participation.labels.noTransaction")}
                    labels={{
                      to: t("participation.labels.call.to"),
                      value: t("participation.labels.call.value"),
                      data: t("participation.labels.call.data"),
                      gasLimit: t("participation.labels.call.gasLimit"),
                      maxFee: t("participation.labels.call.maxFee"),
                      priorityFee: t("participation.labels.call.priorityFee"),
                      gasPrice: t("participation.labels.call.gasPrice"),
                      deadline: t("participation.labels.call.deadline"),
                      route: t("participation.labels.call.route")
                    }}
                  />
                </div>
              </div>
              {planDisplay.reasonMessage ? (
                <p className="rounded border border-amber-400/40 bg-amber-500/10 p-2 text-xs text-amber-100">
                  {planDisplay.reasonMessage ?? t("participation.labels.reasonFallback")}
                </p>
              ) : null}
            </>
          ) : (
            <p className="text-sm text-slate-400">{t("participation.messages.planPlaceholder")}</p>
          )}
        </div>
        <div className="space-y-4 rounded border border-slate-800/60 bg-slate-900/40 p-4">
          <h4 className="text-sm font-semibold text-slate-200">{t("participation.reward.executionSummary")}</h4>
          {executionDisplay ? (
            <>
              <StatusBadge status={executionDisplay.status} label={statusLabel(executionDisplay.status)} />
              <AnchorDetails
                anchor={executionDisplay.anchor}
                labels={{
                  block: t("participation.labels.blockNumber"),
                  hash: t("participation.labels.blockHash"),
                  timestamp: t("participation.labels.timestamp")
                }}
              />
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  {t("participation.labels.payout")}
                </p>
                <div className="mt-2">
                  <PayoutDetails
                    payout={executionDisplay.payout}
                    emptyLabel={t("participation.labels.noPayout")}
                    labels={{
                      amount: t("participation.labels.amount"),
                      destination: t("participation.labels.destination")
                    }}
                  />
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  {t("participation.labels.transaction")}
                </p>
                <div className="mt-2">
                  <TransactionDetails
                    call={executionDisplay.claimCall}
                    emptyLabel={t("participation.labels.noTransaction")}
                    labels={{
                      to: t("participation.labels.call.to"),
                      value: t("participation.labels.call.value"),
                      data: t("participation.labels.call.data"),
                      gasLimit: t("participation.labels.call.gasLimit"),
                      maxFee: t("participation.labels.call.maxFee"),
                      priorityFee: t("participation.labels.call.priorityFee"),
                      gasPrice: t("participation.labels.call.gasPrice"),
                      deadline: t("participation.labels.call.deadline"),
                      route: t("participation.labels.call.route")
                    }}
                  />
                </div>
              </div>
              {executionDisplay.reasonMessage ? (
                <p className="rounded border border-amber-400/40 bg-amber-500/10 p-2 text-xs text-amber-100">
                  {executionDisplay.reasonMessage ?? t("participation.labels.reasonFallback")}
                </p>
              ) : null}
            </>
          ) : (
            <p className="text-sm text-slate-400">{t("participation.messages.executionPlaceholder")}</p>
          )}
        </div>
      </div>
    </section>
  );
}
