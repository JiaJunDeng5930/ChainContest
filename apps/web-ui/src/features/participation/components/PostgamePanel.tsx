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
  requestPriceSourceUpdate,
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
  BlockAnchor,
  RequiredApproval
} from "../api/types";
import { formatContestTimestamp, useContestDateTimeFormatter, truncateIdentifier } from "../../contests/utils/format";
import {
  AnchorDetails,
  StatusBadge,
  TransactionDetails,
  PayoutDetails,
  ChecksList,
  type DisplayCheck,
  type DisplayCall
} from "./ActionArtifacts";
import { useWalletTransactions } from "../hooks/useWalletTransactions";
import useContestParticipationStatus from "../hooks/useContestParticipationStatus";

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
  transactionHash?: string | null;
};

type PrincipalDisplay = {
  status: string;
  payout?: PrincipalRedemptionResult["payout"];
  claimCall?: DisplayCall | null;
  reasonMessage?: string | null;
  anchor: BlockAnchor;
  transactionHash?: string | null;
};

type RebalancePlanDisplay = {
  status: string;
  checks: DisplayCheck[];
  transaction?: DisplayCall | null;
  rollbackAdvice?: RebalancePlanResult["rollbackAdvice"];
  rejectionReasonMessage?: string | null;
  anchor: BlockAnchor;
  approvals: RequiredApproval[];
};

type RebalanceExecutionDisplay = {
  status: string;
  transaction?: DisplayCall | null;
  rollbackAdvice?: RebalanceExecutionResult["rollbackAdvice"];
  reasonMessage?: string | null;
  anchor: BlockAnchor;
  transactionHash?: string | null;
};

type ApprovalState = {
  status: "idle" | "pending" | "success" | "error";
  error?: string | null;
};

const approvalKey = (approval: RequiredApproval): string => {
  const token = approval.tokenAddress?.toLowerCase() ?? "unknown";
  const spender = approval.spender?.toLowerCase() ?? "unknown";
  return `${token}-${spender}-${approval.amount}`;
};

export default function PostgamePanel({ contestId, contest }: PostgamePanelProps) {
  const t = useTranslations();
  const locale = useLocale();
  const dateFormatter = useContestDateTimeFormatter(locale);
  const gate = useNetworkGateState();
  const queryClient = useQueryClient();
  const { isParticipant, isLoading: isParticipationLoading } = useContestParticipationStatus(contest.contestId);

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

  const showParticipationNotice = gate.isSessionActive && !isParticipationLoading && !isParticipant;

  return (
    <section className="space-y-6 rounded-xl border border-slate-800/60 bg-slate-900/40 p-6">
      {showParticipationNotice ? (
        <p className="rounded border border-amber-400/40 bg-amber-500/10 p-3 text-sm text-amber-100">
          {t("participation.messages.notRegistered")}
        </p>
      ) : null}
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
        isParticipant={isParticipant}
        isParticipationLoading={isParticipationLoading}
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

type RebalanceSectionProps = SectionBaseProps & {
  isParticipant: boolean;
  isParticipationLoading: boolean;
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
  const { sendExecutionCall, walletReady } = useWalletTransactions();

  const phaseValue = (contest.phase ?? "").toLowerCase();
  const isEligiblePhase = ["active", "frozen", "settled"].includes(phaseValue);

  const disableReason = useMemo(() => {
    if (!gate.isSessionActive) {
      return t("participation.messages.notAuthenticated");
    }
    if (!gate.isSupportedNetwork) {
      return t("participation.messages.unsupportedNetwork");
    }
    if (!gate.isWalletConnected) {
      return t("participation.messages.walletRequired");
    }
    if (!isEligiblePhase) {
      return t("participation.messages.settlementPhaseOnly");
    }
    if (!participantAddress) {
      return t("participation.messages.walletRequired");
    }
    return null;
  }, [gate.isSessionActive, gate.isSupportedNetwork, gate.isWalletConnected, isEligiblePhase, participantAddress, t]);

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = await executeSettlement(contestId, {
        caller: participantAddress ?? ""
      } satisfies SettlementInput);
      let transactionHash: string | null = null;
      if (payload.status === "applied" && payload.settlementCall) {
        const execution = await sendExecutionCall(payload.settlementCall);
        transactionHash = execution.hash;
      }
      return { payload, transactionHash };
    },
    onSuccess: async ({ payload, transactionHash }) => {
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
        },
        transactionHash: transactionHash ?? null
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
        disabled={Boolean(disableReason) || mutation.isPending || !walletReady}
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
            {result.transactionHash ? (
              <p className="text-xs text-emerald-300">
                Tx: {result.transactionHash.slice(0, 10)}…{result.transactionHash.slice(-6)}
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
  const { sendExecutionCall, walletReady } = useWalletTransactions();

  const isEligiblePhase = contest.phase === "settled" || contest.phase === "closed";

  const disableReason = useMemo(() => {
    if (!gate.isSessionActive) {
      return t("participation.messages.notAuthenticated");
    }
    if (!gate.isSupportedNetwork) {
      return t("participation.messages.unsupportedNetwork");
    }
    if (!gate.isWalletConnected) {
      return t("participation.messages.walletRequired");
    }
    if (!isEligiblePhase) {
      return t("participation.messages.redemptionPhaseOnly");
    }
    if (!participantAddress) {
      return t("participation.messages.walletRequired");
    }
    return null;
  }, [gate.isSessionActive, gate.isSupportedNetwork, gate.isWalletConnected, isEligiblePhase, participantAddress, t]);

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
    mutationFn: async () => {
      const result = await executePrincipalRedemption(contestId, toInput());
      let transactionHash: string | null = null;
      if (result.claimCall) {
        const execution = await sendExecutionCall(result.claimCall);
        transactionHash = execution.hash;
      }
      return { result, transactionHash };
    },
    onSuccess: async ({ result, transactionHash }) => {
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
        },
        transactionHash: transactionHash ?? null
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
    if (planDisplay.claimCall && !walletReady) {
      return false;
    }
    return planDisplay.claimCall != null || planDisplay.payout != null;
  }, [planDisplay, walletReady]);

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
              {executionDisplay.transactionHash ? (
                <p className="text-xs text-emerald-300">
                  Tx: {executionDisplay.transactionHash.slice(0, 10)}…{executionDisplay.transactionHash.slice(-6)}
                </p>
              ) : null}
              {executionDisplay.transactionHash ? (
                <p className="text-xs text-emerald-300">
                  Tx: {executionDisplay.transactionHash.slice(0, 10)}…{executionDisplay.transactionHash.slice(-6)}
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
  participantAddress,
  isParticipant,
  isParticipationLoading
}: RebalanceSectionProps) {
  const [intent, setIntent] = useState<RebalanceIntent>({
    sellAsset: "",
    buyAsset: "",
    amount: "",
    minimumReceived: "",
    quoteId: ""
  });
  const [planDisplay, setPlanDisplay] = useState<RebalancePlanDisplay | null>(null);
  const [executionDisplay, setExecutionDisplay] = useState<RebalanceExecutionDisplay | null>(null);
  const [approvalStates, setApprovalStates] = useState<Record<string, ApprovalState>>({});
  const [lastError, setLastError] = useState<unknown>(null);
  const { approveToken, sendExecutionCall, walletReady } = useWalletTransactions();

  const isEligiblePhase = contest.phase === "active";

  const disableReason = useMemo(() => {
    if (!gate.isSessionActive) {
      return t("participation.messages.notAuthenticated");
    }
    if (!gate.isSupportedNetwork) {
      return t("participation.messages.unsupportedNetwork");
    }
    if (!gate.isWalletConnected) {
      return t("participation.messages.walletRequired");
    }
    if (!isEligiblePhase) {
      return t("participation.messages.rebalancePhaseOnly");
    }
    if (gate.isSessionActive && !isParticipationLoading && !isParticipant) {
      return t("participation.messages.notRegistered");
    }
    if (!participantAddress) {
      return t("participation.messages.walletRequired");
    }
    if (!intent.sellAsset || !intent.buyAsset || !intent.amount) {
      return t("participation.messages.rebalanceIntentIncomplete");
    }
    return null;
  }, [
    gate.isSessionActive,
    gate.isSupportedNetwork,
    gate.isWalletConnected,
    isEligiblePhase,
    isParticipationLoading,
    isParticipant,
    participantAddress,
    intent.amount,
    intent.buyAsset,
    intent.sellAsset,
    t
  ]);

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
      const approvals = result.requiredApprovals ?? [];
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
        },
        approvals
      });
      setApprovalStates((previous) => {
        if (!approvals.length) {
          return {};
        }
        const next: Record<string, ApprovalState> = {};
        approvals.forEach((approval) => {
          const key = approvalKey(approval);
          next[key] = previous[key] ?? { status: "idle" };
        });
        return next;
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

  const priceRefreshMutation = useMutation({
    mutationFn: async () => {
      const { transaction } = await requestPriceSourceUpdate(contestId);
      return sendExecutionCall(transaction);
    },
    onSuccess: async () => {
      await planMutation.mutateAsync();
      setLastError(null);
    },
    onError: (error) => {
      setLastError(error);
    }
  });

  const executeMutation = useMutation({
    mutationFn: async () => {
      const result = await executeRebalance(contestId, toInput());
      let transactionHash: string | null = null;
      if (result.transaction) {
        const execution = await sendExecutionCall(result.transaction);
        transactionHash = execution.hash;
      }
      return { result, transactionHash };
    },
    onSuccess: async ({ result, transactionHash }) => {
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
        },
        transactionHash: transactionHash ?? null
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

  const handleRefreshPrice = useCallback(async () => {
    setLastError(null);
    await priceRefreshMutation.mutateAsync();
  }, [priceRefreshMutation]);

  const canExecute = useMemo(() => {
    if (!planDisplay) {
      return false;
    }
    if (planDisplay.status.toLowerCase() === "blocked") {
      return false;
    }
    if (!walletReady) {
      return false;
    }
    return planDisplay.transaction != null;
  }, [planDisplay, walletReady]);

  const needsPriceRefresh = useMemo(() => {
    if (!planDisplay) {
      return false;
    }
    return planDisplay.checks.some((check) => check.rule === "rebalance.price-freshness" && !check.passed);
  }, [planDisplay]);

  const handleApproval = useCallback(
    async (approval: RequiredApproval) => {
      const key = approvalKey(approval);
      setApprovalStates((prev) => ({
        ...prev,
        [key]: { status: "pending" }
      }));
      try {
        await approveToken(approval);
        setApprovalStates((prev) => ({
          ...prev,
          [key]: { status: "success" }
        }));
        await planMutation.mutateAsync();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setApprovalStates((prev) => ({
          ...prev,
          [key]: { status: "error", error: message }
        }));
        setLastError(error);
      }
    },
    [approveToken, planMutation, setLastError]
  );

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
              {planDisplay.approvals.length ? (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                    {t("participation.labels.approvals")}
                  </p>
                  <div className="mt-2 space-y-2">
                    {planDisplay.approvals.map((approval) => {
                      const key = approvalKey(approval);
                      const state = approvalStates[key]?.status ?? "idle";
                      const isPending = state === "pending" || planMutation.isPending;
                      const isSuccess = state === "success";
                      const isError = state === "error";
                      const errorMessage = approvalStates[key]?.error;

                      return (
                        <div
                          key={key}
                          className="rounded border border-slate-800/60 bg-slate-950/30 p-3 text-sm text-slate-200"
                        >
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                              <p className="font-semibold">
                                {approval.symbol ?? truncateIdentifier(approval.tokenAddress)} · {approval.amount}
                              </p>
                              <p className="text-xs text-slate-400">
                                {truncateIdentifier(approval.tokenAddress)} → {truncateIdentifier(approval.spender)}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              {isSuccess ? (
                                <span className="text-xs font-semibold text-emerald-300">
                                  {t("participation.status.success")}
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => {
                                    void handleApproval(approval);
                                  }}
                                  disabled={!walletReady || isPending || executeMutation.isPending}
                                  className="rounded border border-amber-400/60 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-100 transition hover:border-amber-300 hover:text-amber-50 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  {isPending
                                    ? t("participation.actions.approving")
                                    : t("participation.actions.approve")}
                                </button>
                              )}
                            </div>
                          </div>
                          {isError && errorMessage ? (
                            <p className="mt-2 text-xs text-rose-300">{errorMessage}</p>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}
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
              {needsPriceRefresh ? (
                <div className="rounded border border-amber-400/60 bg-amber-500/5 p-3 text-xs text-amber-100">
                  <p>{t("participation.postgame.rebalance.refreshPriceHint")}</p>
                  <button
                    type="button"
                    onClick={() => {
                      void handleRefreshPrice();
                    }}
                    disabled={priceRefreshMutation.isPending || planMutation.isPending || !walletReady}
                    className="mt-2 inline-flex items-center gap-2 rounded border border-amber-300/60 bg-amber-400/10 px-3 py-1 text-amber-50 transition hover:border-amber-200 hover:text-amber-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {priceRefreshMutation.isPending
                      ? t("participation.actions.refreshingPrice")
                      : t("participation.actions.refreshPrice")}
                  </button>
                </div>
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

  const formatted: DisplayCheck[] = [];

  for (const candidate of checks) {
    if (!candidate || typeof candidate !== "object") {
      continue;
    }

    const record = candidate as Record<string, unknown>;
    const detailValue = record.detail;
    let detailMessage: string | null = null;
    if (detailValue != null) {
      detailMessage = typeof detailValue === "string" ? detailValue : JSON.stringify(detailValue, null, 2);
    }

    formatted.push({
      rule: typeof record.rule === "string" ? record.rule : "",
      passed: typeof record.passed === "boolean" ? record.passed : Boolean(record.passed),
      severity: typeof record.severity === "string" ? record.severity : undefined,
      message: typeof record.message === "string" ? record.message : undefined,
      detail: detailMessage
    });
  }

  return formatted;
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
