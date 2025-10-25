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
  executeSettlement,
  fetchPrincipalRedemptionPlan,
  executePrincipalRedemption,
  fetchRebalancePlan,
  executeRebalance,
  type SettlementInput,
  type PrincipalRedemptionInput,
  type RebalanceInput,
  type RebalanceIntent
} from "../api/postgame";
import type {
  SettlementResult,
  PrincipalRedemptionResult,
  RebalancePlanResult,
  RebalanceExecutionResult,
  BlockAnchor
} from "../api/types";
import { formatContestTimestamp, useContestDateTimeFormatter } from "../../contests/utils/format";
import {
  AnchorDetails,
  StatusBadge,
  TransactionDetails,
  PayoutDetails,
  ChecksList,
  type DisplayCheck,
  type DisplayCall
} from "./ActionArtifacts";

type PostgamePanelProps = {
  contestId: string;
  contest: ContestSnapshot;
};

type Translate = ReturnType<typeof useTranslations>;

type GateState = ReturnType<typeof useNetworkGateState>;

type SettlementDisplay = {
  status: string;
  settlementCall?: DisplayCall | null;
  detail?: SettlementResult["detail"];
  rejectionReasonMessage?: string | null;
  anchor: BlockAnchor;
};

type PrincipalDisplay = {
  status: string;
  payout?: PrincipalRedemptionResult["payout"];
  claimCall?: DisplayCall | null;
  reasonMessage?: string | null;
  anchor: BlockAnchor;
};

type RebalancePlanDisplay = {
  status: string;
  checks: DisplayCheck[];
  transaction?: DisplayCall | null;
  rollbackAdvice?: RebalancePlanResult["rollbackAdvice"];
  rejectionReasonMessage?: string | null;
  anchor: BlockAnchor;
};

type RebalanceExecutionDisplay = {
  status: string;
  transaction?: DisplayCall | null;
  rollbackAdvice?: RebalanceExecutionResult["rollbackAdvice"];
  reasonMessage?: string | null;
  anchor: BlockAnchor;
};

export default function PostgamePanel({ contestId, contest }: PostgamePanelProps) {
  const t = useTranslations();
  const locale = useLocale();
  const dateFormatter = useContestDateTimeFormatter(locale);
  const gate = useNetworkGateState();
  const queryClient = useQueryClient();

  const participantAddress = gate.address ?? null;

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

  const formatAnchor = useCallback(
    (anchor: BlockAnchor | undefined | null): BlockAnchor | null => {
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

  return (
    <section className="space-y-6 rounded-xl border border-slate-800/60 bg-slate-900/40 p-6">
      <header className="space-y-2">
        <h3 className="text-lg font-semibold text-slate-50">{t("participation.postgame.title")}</h3>
        <p className="text-sm text-slate-300">{t("participation.postgame.subtitle")}</p>
      </header>
      <SettlementSection
        contestId={contestId}
        contest={contest}
        gate={gate}
        statusLabel={statusLabel}
        formatAnchor={formatAnchor}
        queryClient={queryClient}
        translate={t}
        participantAddress={participantAddress}
      />
      <PrincipalSection
        contestId={contestId}
        contest={contest}
        gate={gate}
        statusLabel={statusLabel}
        formatAnchor={formatAnchor}
        queryClient={queryClient}
        translate={t}
        participantAddress={participantAddress}
      />
      <RebalanceSection
        contestId={contestId}
        contest={contest}
        gate={gate}
        statusLabel={statusLabel}
        formatAnchor={formatAnchor}
        queryClient={queryClient}
        translate={t}
        participantAddress={participantAddress}
      />
    </section>
  );
}

type SectionBaseProps = {
  contestId: string;
  contest: ContestSnapshot;
  gate: GateState;
  statusLabel: (status: string) => string;
  formatAnchor: (anchor: BlockAnchor | null | undefined) => BlockAnchor | null;
  queryClient: ReturnType<typeof useQueryClient>;
  translate: Translate;
  participantAddress: string | null;
};

function SettlementSection({
  contestId,
  contest,
  gate,
  statusLabel,
  formatAnchor,
  queryClient,
  translate: t,
  participantAddress
}: SectionBaseProps) {
  const [result, setResult] = useState<SettlementDisplay | null>(null);
  const [lastError, setLastError] = useState<unknown>(null);

  const isEligiblePhase = contest.phase === "active" || contest.phase === "settled";

  const disableReason = useMemo(() => {
    if (!gate.isSessionActive) {
      return t("participation.messages.notAuthenticated");
    }
    if (!gate.isSupportedNetwork) {
      return t("participation.messages.unsupportedNetwork");
    }
    if (!isEligiblePhase) {
      return t("participation.messages.settlementPhaseOnly");
    }
    if (!participantAddress) {
      return t("participation.messages.walletRequired");
    }
    return null;
  }, [gate.isSessionActive, gate.isSupportedNetwork, isEligiblePhase, participantAddress, t]);

  const mutation = useMutation({
    mutationFn: async () =>
      executeSettlement(contestId, {
        caller: participantAddress ?? ""
      } satisfies SettlementInput),
    onSuccess: async (payload: SettlementResult) => {
      trackInteraction({
        action: "settlement-execute",
        stage: "success",
        contestId,
        chainId: contest.chainId,
        walletAddress: participantAddress ?? null,
        status: payload.status,
        anchor: payload.frozenAt ?? null,
        metadata: {
          hasCall: Boolean(payload.settlementCall)
        }
      });
      setResult({
        status: payload.status,
        settlementCall: formatCall(payload.settlementCall),
        detail: payload.detail ?? null,
        rejectionReasonMessage: payload.rejectionReason?.message ?? null,
        anchor: formatAnchor(payload.frozenAt) ?? {
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
        action: "settlement-execute",
        stage: "error",
        contestId,
        chainId: contest.chainId,
        walletAddress: participantAddress ?? null,
        error
      });
      setLastError(error);
    }
  });

  const handleExecute = useCallback(async () => {
    setLastError(null);
    trackInteraction({
      action: "settlement-execute",
      stage: "start",
      contestId,
      chainId: contest.chainId,
      walletAddress: participantAddress ?? null
    });
    await mutation.mutateAsync();
  }, [contest.chainId, contestId, mutation, participantAddress]);

  return (
    <div className="space-y-4 rounded border border-slate-800/60 bg-slate-900/40 p-5">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h4 className="text-base font-semibold text-slate-200">{t("participation.postgame.settlement.title")}</h4>
          <p className="text-sm text-slate-300">{t("participation.postgame.settlement.subtitle")}</p>
        </div>
        {result ? <StatusBadge status={result.status} label={statusLabel(result.status)} /> : null}
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
      <button
        type="button"
        onClick={() => void handleExecute()}
        disabled={Boolean(disableReason) || mutation.isPending}
        className="w-full rounded border border-emerald-500/50 bg-emerald-600/20 px-4 py-2 text-sm font-semibold text-emerald-100 transition hover:border-emerald-300 hover:text-emerald-50 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
      >
        {mutation.isPending ? t("participation.actions.executing") : t("participation.postgame.settlement.execute")}
      </button>
      <div className="space-y-4 rounded border border-slate-800/60 bg-slate-900/40 p-4">
        {result ? (
          <>
            <AnchorDetails
              anchor={result.anchor}
              labels={{
                block: t("participation.labels.blockNumber"),
                hash: t("participation.labels.blockHash"),
                timestamp: t("participation.labels.timestamp")
              }}
            />
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                {t("participation.labels.transaction")}
              </p>
              <div className="mt-2">
                <TransactionDetails
                  call={result.settlementCall}
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
            {result.detail ? (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  {t("participation.postgame.settlement.detail")}
                </p>
                <pre className="mt-2 overflow-x-auto rounded bg-slate-950/60 p-3 text-[0.7rem] leading-snug text-slate-200">
                  {JSON.stringify(result.detail, null, 2)}
                </pre>
              </div>
            ) : null}
            {result.rejectionReasonMessage ? (
              <p className="rounded border border-rose-400/40 bg-rose-500/10 p-2 text-xs text-rose-100">
                {result.rejectionReasonMessage ?? t("participation.labels.reasonFallback")}
              </p>
            ) : null}
          </>
        ) : (
          <p className="text-sm text-slate-400">{t("participation.messages.executionPlaceholder")}</p>
        )}
      </div>
    </div>
  );
}

function PrincipalSection({
  contestId,
  contest,
  gate,
  statusLabel,
  formatAnchor,
  queryClient,
  translate: t,
  participantAddress
}: SectionBaseProps) {
  const [planDisplay, setPlanDisplay] = useState<PrincipalDisplay | null>(null);
  const [executionDisplay, setExecutionDisplay] = useState<PrincipalDisplay | null>(null);
  const [lastError, setLastError] = useState<unknown>(null);

  const isEligiblePhase = contest.phase === "settled" || contest.phase === "closed";

  const disableReason = useMemo(() => {
    if (!gate.isSessionActive) {
      return t("participation.messages.notAuthenticated");
    }
    if (!gate.isSupportedNetwork) {
      return t("participation.messages.unsupportedNetwork");
    }
    if (!isEligiblePhase) {
      return t("participation.messages.redemptionPhaseOnly");
    }
    if (!participantAddress) {
      return t("participation.messages.walletRequired");
    }
    return null;
  }, [gate.isSessionActive, gate.isSupportedNetwork, isEligiblePhase, participantAddress, t]);

  const toInput = (): PrincipalRedemptionInput => {
    if (!participantAddress) {
      throw new Error(t("participation.messages.walletRequired"));
    }
    return {
      participant: participantAddress
    };
  };

  const planMutation = useMutation({
    mutationFn: async () => fetchPrincipalRedemptionPlan(contestId, toInput()),
    onSuccess: (result) => {
      trackInteraction({
        action: "principal-plan",
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
        action: "principal-plan",
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
    mutationFn: async () => executePrincipalRedemption(contestId, toInput()),
    onSuccess: async (result) => {
      trackInteraction({
        action: "principal-execute",
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
        action: "principal-execute",
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
      action: "principal-plan",
      stage: "start",
      contestId,
      chainId: contest.chainId,
      walletAddress: participantAddress ?? null
    });
    await planMutation.mutateAsync();
  }, [contest.chainId, contestId, participantAddress, planMutation]);

  const handleExecute = useCallback(async () => {
    setLastError(null);
    trackInteraction({
      action: "principal-execute",
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
    <div className="space-y-4 rounded border border-slate-800/60 bg-slate-900/40 p-5">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h4 className="text-base font-semibold text-slate-200">{t("participation.postgame.redemption.title")}</h4>
          <p className="text-sm text-slate-300">{t("participation.postgame.redemption.subtitle")}</p>
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
          <h5 className="text-sm font-semibold text-slate-200">{t("participation.postgame.redemption.planSummary")}</h5>
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
          <h5 className="text-sm font-semibold text-slate-200">{t("participation.postgame.redemption.executionSummary")}</h5>
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
    </div>
  );
}

function RebalanceSection({
  contestId,
  contest,
  gate,
  statusLabel,
  formatAnchor,
  queryClient,
  translate: t,
  participantAddress
}: SectionBaseProps) {
  const [intent, setIntent] = useState<RebalanceIntent>({
    sellAsset: "",
    buyAsset: "",
    amount: "",
    minimumReceived: "",
    quoteId: ""
  });
  const [planDisplay, setPlanDisplay] = useState<RebalancePlanDisplay | null>(null);
  const [executionDisplay, setExecutionDisplay] = useState<RebalanceExecutionDisplay | null>(null);
  const [lastError, setLastError] = useState<unknown>(null);

  const isEligiblePhase = contest.phase === "active";

  const disableReason = useMemo(() => {
    if (!gate.isSessionActive) {
      return t("participation.messages.notAuthenticated");
    }
    if (!gate.isSupportedNetwork) {
      return t("participation.messages.unsupportedNetwork");
    }
    if (!isEligiblePhase) {
      return t("participation.messages.rebalancePhaseOnly");
    }
    if (!participantAddress) {
      return t("participation.messages.walletRequired");
    }
    if (!intent.sellAsset || !intent.buyAsset || !intent.amount) {
      return t("participation.messages.rebalanceIntentIncomplete");
    }
    return null;
  }, [gate.isSessionActive, gate.isSupportedNetwork, isEligiblePhase, participantAddress, intent.amount, intent.buyAsset, intent.sellAsset, t]);

  const toInput = (): RebalanceInput => {
    if (!participantAddress) {
      throw new Error(t("participation.messages.walletRequired"));
    }
    return {
      participant: participantAddress,
      intent: {
        sellAsset: intent.sellAsset,
        buyAsset: intent.buyAsset,
        amount: intent.amount,
        minimumReceived: intent.minimumReceived || undefined,
        quoteId: intent.quoteId || undefined
      }
    };
  };

  const planMutation = useMutation({
    mutationFn: async () => fetchRebalancePlan(contestId, toInput()),
    onSuccess: (result) => {
      trackInteraction({
        action: "rebalance-plan",
        stage: "success",
        contestId,
        chainId: contest.chainId,
        walletAddress: participantAddress ?? null,
        status: result.status,
        anchor: result.derivedAt ?? null,
        metadata: {
          checks: Array.isArray(result.checks) ? result.checks.length : 0,
          hasTransaction: Boolean(result.transaction)
        }
      });
      setPlanDisplay({
        status: result.status,
        checks: formatChecks(result.checks),
        transaction: formatCall(result.transaction),
        rollbackAdvice: result.rollbackAdvice ?? null,
        rejectionReasonMessage: result.rejectionReason?.message ?? null,
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
        action: "rebalance-plan",
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
    mutationFn: async () => executeRebalance(contestId, toInput()),
    onSuccess: async (result) => {
      trackInteraction({
        action: "rebalance-execute",
        stage: "success",
        contestId,
        chainId: contest.chainId,
        walletAddress: participantAddress ?? null,
        status: result.status,
        anchor: result.derivedAt ?? null,
        metadata: {
          hasTransaction: Boolean(result.transaction),
          hasRollbackAdvice: Boolean(result.rollbackAdvice)
        }
      });
      setExecutionDisplay({
        status: result.status,
        transaction: formatCall(result.transaction),
        rollbackAdvice: result.rollbackAdvice ?? null,
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
        action: "rebalance-execute",
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
      action: "rebalance-plan",
      stage: "start",
      contestId,
      chainId: contest.chainId,
      walletAddress: participantAddress ?? null,
      metadata: {
        sellAsset: intent.sellAsset,
        buyAsset: intent.buyAsset
      }
    });
    await planMutation.mutateAsync();
  }, [contest.chainId, contestId, intent.buyAsset, intent.sellAsset, participantAddress, planMutation]);

  const handleExecute = useCallback(async () => {
    setLastError(null);
    trackInteraction({
      action: "rebalance-execute",
      stage: "start",
      contestId,
      chainId: contest.chainId,
      walletAddress: participantAddress ?? null,
      metadata: {
        sellAsset: intent.sellAsset,
        buyAsset: intent.buyAsset
      }
    });
    await executeMutation.mutateAsync();
  }, [contest.chainId, contestId, executeMutation, intent.buyAsset, intent.sellAsset, participantAddress]);

  const canExecute = useMemo(() => {
    if (!planDisplay) {
      return false;
    }
    if (planDisplay.status.toLowerCase() === "blocked") {
      return false;
    }
    return planDisplay.transaction != null;
  }, [planDisplay]);

  return (
    <div className="space-y-4 rounded border border-slate-800/60 bg-slate-900/40 p-5">
      <header className="space-y-2">
        <h4 className="text-base font-semibold text-slate-200">{t("participation.postgame.rebalance.title")}</h4>
        <p className="text-sm text-slate-300">{t("participation.postgame.rebalance.subtitle")}</p>
      </header>
      <form
        className="grid gap-4 rounded border border-slate-800/60 bg-slate-950/40 p-4 sm:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (!disableReason) {
            void handlePlan();
          }
        }}
      >
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-400" htmlFor="rebalance-sell">
            {t("participation.postgame.rebalance.sellAsset")}
          </label>
          <input
            id="rebalance-sell"
            value={intent.sellAsset}
            onChange={(event) => setIntent((prev) => ({ ...prev, sellAsset: event.target.value }))}
            className="rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
            placeholder="0x..."
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-400" htmlFor="rebalance-buy">
            {t("participation.postgame.rebalance.buyAsset")}
          </label>
          <input
            id="rebalance-buy"
            value={intent.buyAsset}
            onChange={(event) => setIntent((prev) => ({ ...prev, buyAsset: event.target.value }))}
            className="rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
            placeholder="0x..."
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-400" htmlFor="rebalance-amount">
            {t("participation.postgame.rebalance.amount")}
          </label>
          <input
            id="rebalance-amount"
            value={intent.amount}
            onChange={(event) => setIntent((prev) => ({ ...prev, amount: event.target.value }))}
            className="rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
            placeholder="1000000000000000000"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-400" htmlFor="rebalance-minimum">
            {t("participation.postgame.rebalance.minimumReceived")}
          </label>
          <input
            id="rebalance-minimum"
            value={intent.minimumReceived ?? ""}
            onChange={(event) => setIntent((prev) => ({ ...prev, minimumReceived: event.target.value }))}
            className="rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
            placeholder="optional"
          />
        </div>
        <div className="flex flex-col gap-1 sm:col-span-2">
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-400" htmlFor="rebalance-quote">
            {t("participation.postgame.rebalance.quoteId")}
          </label>
          <input
            id="rebalance-quote"
            value={intent.quoteId ?? ""}
            onChange={(event) => setIntent((prev) => ({ ...prev, quoteId: event.target.value }))}
            className="rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
            placeholder="optional"
          />
        </div>
        <div className="sm:col-span-2">
          <button
            type="submit"
            disabled={Boolean(disableReason) || planMutation.isPending || executeMutation.isPending}
            className="w-full rounded border border-slate-600 bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:border-slate-400 hover:text-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {planMutation.isPending ? t("participation.actions.generating") : t("participation.actions.generatePlan")}
          </button>
        </div>
      </form>
      {disableReason && !intent.sellAsset ? (
        <p className="text-xs text-slate-400">{t("participation.postgame.rebalance.intentHint")}</p>
      ) : null}
      {lastError ? (
        <ErrorBanner
          error={lastError}
          onRetry={() => {
            setLastError(null);
          }}
        />
      ) : null}
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
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4 rounded border border-slate-800/60 bg-slate-900/40 p-4">
          <h5 className="text-sm font-semibold text-slate-200">{t("participation.postgame.rebalance.planSummary")}</h5>
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
                  {t("participation.labels.qualifications")}
                </p>
                <div className="mt-2">
                  <ChecksList checks={planDisplay.checks ?? []} emptyLabel={t("participation.labels.noChecks")} />
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  {t("participation.labels.transaction")}
                </p>
                <div className="mt-2">
                  <TransactionDetails
                    call={planDisplay.transaction}
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
              {planDisplay.rollbackAdvice ? (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                    {t("participation.postgame.rebalance.rollbackAdvice")}
                  </p>
                  <pre className="mt-2 overflow-x-auto rounded bg-slate-950/60 p-3 text-[0.7rem] leading-snug text-slate-200">
                    {JSON.stringify(planDisplay.rollbackAdvice, null, 2)}
                  </pre>
                </div>
              ) : null}
              {planDisplay.rejectionReasonMessage ? (
                <p className="rounded border border-rose-400/40 bg-rose-500/10 p-2 text-xs text-rose-100">
                  {planDisplay.rejectionReasonMessage ?? t("participation.labels.reasonFallback")}
                </p>
              ) : null}
            </>
          ) : (
            <p className="text-sm text-slate-400">{t("participation.messages.planPlaceholder")}</p>
          )}
        </div>
        <div className="space-y-4 rounded border border-slate-800/60 bg-slate-900/40 p-4">
          <h5 className="text-sm font-semibold text-slate-200">{t("participation.postgame.rebalance.executionSummary")}</h5>
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
                  {t("participation.labels.transaction")}
                </p>
                <div className="mt-2">
                  <TransactionDetails
                    call={executionDisplay.transaction}
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
              {executionDisplay.rollbackAdvice ? (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                    {t("participation.postgame.rebalance.rollbackAdvice")}
                  </p>
                  <pre className="mt-2 overflow-x-auto rounded bg-slate-950/60 p-3 text-[0.7rem] leading-snug text-slate-200">
                    {JSON.stringify(executionDisplay.rollbackAdvice, null, 2)}
                  </pre>
                </div>
              ) : null}
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
    </div>
  );
}

function formatChecks(checks: unknown): DisplayCheck[] {
  if (!Array.isArray(checks)) {
    return [];
  }

  return checks
    .map((candidate) => {
      if (!candidate || typeof candidate !== "object") {
        return null;
      }

      const record = candidate as Record<string, unknown>;
      const detailValue = record.detail;
      let detailMessage: string | null = null;
      if (detailValue != null) {
        detailMessage = typeof detailValue === "string" ? detailValue : JSON.stringify(detailValue, null, 2);
      }

      return {
        rule: typeof record.rule === "string" ? record.rule : "",
        passed: typeof record.passed === "boolean" ? record.passed : Boolean(record.passed),
        severity: typeof record.severity === "string" ? record.severity : undefined,
        message: typeof record.message === "string" ? record.message : undefined,
        detail: detailMessage
      } satisfies DisplayCheck;
    })
    .filter((entry): entry is DisplayCheck => entry !== null);
}

function formatCall(call: unknown): DisplayCall | null {
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
    maxPriorityFeePerGas:
      typeof record.maxPriorityFeePerGas === "string" ? record.maxPriorityFeePerGas : undefined,
    deadline: typeof record.deadline === "string" ? record.deadline : undefined,
    route: typeof record.route === "string" ? record.route : undefined
  } satisfies DisplayCall;
}
