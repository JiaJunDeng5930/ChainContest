"use client";

import { QUERY_KEYS } from "@chaincontest/shared-i18n";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useMemo, useState } from "react";

import ErrorBanner from "../../../components/ErrorBanner";
import { trackInteraction } from "../../../lib/telemetry";
import { useNetworkGateState } from "../../network/NetworkGate";
import type { ContestSnapshot } from "../../contests/api/contests";
import { executeRegistration, fetchRegistrationPlan } from "../api/registration";
import type { BlockAnchor } from "../api/types";
import { formatContestTimestamp, useContestDateTimeFormatter } from "../../contests/utils/format";
import {
  AnchorDetails,
  StatusBadge,
  ChecksList,
  ApprovalsList,
  TransactionDetails,
  type DisplayCheck,
  type DisplayApproval,
  type DisplayCall
} from "./ActionArtifacts";
import useSession from "../../auth/hooks/useSession";
import { useWalletTransactions } from "../hooks/useWalletTransactions";

type RegistrationPanelProps = {
  contestId: string;
  contest: ContestSnapshot;
};

type PlanDisplay = {
  status: string;
  checks: DisplayCheck[];
  approvals: DisplayApproval[];
  transaction?: DisplayCall | null;
  estimatedFeesLabel?: {
    amount: string;
    currency: string;
  } | null;
  rejectionReasonMessage?: string | null;
  anchor: BlockAnchor;
};

type ExecutionDisplay = {
  status: string;
  transaction?: DisplayCall | null;
  approvals: DisplayApproval[];
  reasonMessage?: string | null;
  anchor: BlockAnchor;
  transactionHash?: string | null;
};

type ApprovalStatus = {
  status: "idle" | "pending" | "success" | "error";
  transactionHash?: string | null;
  errorMessage?: string | null;
};

const approvalKeyFor = (approval: DisplayApproval): string =>
  `${approval.tokenAddress.toLowerCase()}-${approval.spender.toLowerCase()}`;

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

function formatApprovals(approvals: unknown): DisplayApproval[] {
  if (!Array.isArray(approvals)) {
    return [];
  }

  const formatted: DisplayApproval[] = [];

  for (const candidate of approvals) {
    if (!candidate || typeof candidate !== "object") {
      continue;
    }

    const record = candidate as Record<string, unknown>;
    const tokenAddress = typeof record.tokenAddress === "string" ? record.tokenAddress : "";
    const spender = typeof record.spender === "string" ? record.spender : "";
    const amount = typeof record.amount === "string" ? record.amount : String(record.amount ?? "");

    if (!tokenAddress || !spender || !amount) {
      continue;
    }

    formatted.push({
      tokenAddress,
      spender,
      amount,
      symbol: typeof record.symbol === "string" ? record.symbol : undefined,
      reason: typeof record.reason === "string" ? record.reason : null,
      decimals: typeof record.decimals === "number" ? record.decimals : undefined
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
    maxPriorityFeePerGas: typeof record.maxPriorityFeePerGas === "string" ? record.maxPriorityFeePerGas : undefined,
    deadline: typeof record.deadline === "string" ? record.deadline : undefined,
    route: typeof record.route === "string" ? record.route : undefined
  } satisfies DisplayCall;
}

function formatEstimatedFees(fees: unknown):
  | {
      amount: string;
      currency: string;
    }
  | null {
  if (!fees || typeof fees !== "object") {
    return null;
  }

  const record = fees as Record<string, unknown>;
  const amount = typeof record.estimatedCost === "string" ? record.estimatedCost : undefined;
  const currency = typeof record.currency === "string" ? record.currency : undefined;

  if (!amount || !currency) {
    return null;
  }

  return { amount, currency };
}

export default function RegistrationPanel({ contestId, contest }: RegistrationPanelProps) {
  const t = useTranslations();
  const locale = useLocale();
  const dateFormatter = useContestDateTimeFormatter(locale);
  const gate = useNetworkGateState();
  const session = useSession();
  const queryClient = useQueryClient();
  const { approveToken, sendExecutionCall, walletReady } = useWalletTransactions();

  const [planDisplay, setPlanDisplay] = useState<PlanDisplay | null>(null);
  const [executionDisplay, setExecutionDisplay] = useState<ExecutionDisplay | null>(null);
  const [lastError, setLastError] = useState<unknown>(null);
  const [approvalStates, setApprovalStates] = useState<Record<string, ApprovalStatus>>({});

  const isRegistrationPhase = contest.phase === "registration";
  const isCapacityFull = contest.registrationCapacity.isFull;
  const participantAddress = gate.address ?? session.data?.walletAddress ?? null;

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
    if (!isRegistrationPhase) {
      return t("participation.messages.registrationPhaseOnly");
    }
    if (isCapacityFull) {
      return t("participation.messages.registrationClosed");
    }
    if (!participantAddress) {
      return t("participation.messages.walletRequired");
    }
    return null;
  }, [
    gate.isSessionActive,
    gate.isSupportedNetwork,
    gate.isWalletConnected,
    isRegistrationPhase,
    isCapacityFull,
    participantAddress,
    t
  ]);

  const planMutation = useMutation({
    mutationFn: async () => {
      if (!participantAddress) {
        throw new Error(t("participation.messages.walletRequired"));
      }
      return fetchRegistrationPlan(contestId, {
        participant: participantAddress
      });
    },
    onSuccess: (result) => {
      const formattedChecks = formatChecks(result.checks);
      const formattedApprovals = formatApprovals(result.requiredApprovals);
      const formattedTransaction = formatCall(result.transaction);
      const formattedAnchor = formatAnchor(result.derivedAt) ?? {
        blockNumber: "-",
        blockHash: undefined,
        timestamp: "-"
      };

      trackInteraction({
        action: "registration-plan",
        stage: "success",
        contestId,
        chainId: contest.chainId,
        walletAddress: participantAddress ?? null,
        status: result.status,
        anchor: result.derivedAt ?? null,
        metadata: {
          checks: Array.isArray(result.checks) ? result.checks.length : 0,
          approvals: Array.isArray(result.requiredApprovals) ? result.requiredApprovals.length : 0
        }
      });
      setPlanDisplay({
        status: result.status,
        checks: formattedChecks,
        approvals: formattedApprovals,
        transaction: formattedTransaction,
        estimatedFeesLabel: formatEstimatedFees(result.estimatedFees),
        rejectionReasonMessage: result.rejectionReason?.message ?? null,
        anchor: formattedAnchor
      });
      setApprovalStates((previous) => {
        const next: Record<string, ApprovalStatus> = {};
        formattedApprovals.forEach((approval) => {
          const key = approvalKeyFor(approval);
          next[key] = previous[key] ?? { status: "idle", transactionHash: null, errorMessage: null };
        });
        return next;
      });
      setExecutionDisplay(null);
      setLastError(null);
    },
    onError: (error) => {
      trackInteraction({
        action: "registration-plan",
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
      if (!participantAddress) {
        throw new Error(t("participation.messages.walletRequired"));
      }
      const result = await executeRegistration(contestId, {
        participant: participantAddress
      });
      let transactionHash: string | null = null;
      if (result.status.toLowerCase() === "executed" && result.transaction) {
        const execution = await sendExecutionCall(result.transaction);
        transactionHash = execution.hash;
      }
      return {
        result,
        transactionHash
      };
    },
    onSuccess: async ({ result, transactionHash }) => {
      const formattedTransaction = formatCall(result.transaction);
      const formattedApprovals = formatApprovals(result.requiredApprovals);
      const formattedAnchor = formatAnchor(result.derivedAt) ?? {
        blockNumber: "-",
        blockHash: undefined,
        timestamp: "-"
      };

      trackInteraction({
        action: "registration-execute",
        stage: "success",
        contestId,
        chainId: contest.chainId,
        walletAddress: participantAddress ?? null,
        status: result.status,
        anchor: result.derivedAt ?? null,
        metadata: {
          approvals: formattedApprovals.length
        }
      });
      setExecutionDisplay({
        status: result.status,
        transaction: formattedTransaction,
        approvals: formattedApprovals,
        reasonMessage:
          typeof result.reason === "string"
            ? result.reason
            : result.reason?.message ?? null,
        anchor: formattedAnchor,
        transactionHash: transactionHash ?? null
      });
      setLastError(null);
      await queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.contestDetail(contestId)
      });
    },
    onError: (error) => {
      trackInteraction({
        action: "registration-execute",
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
      action: "registration-plan",
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
      action: "registration-execute",
      stage: "start",
      contestId,
      chainId: contest.chainId,
      walletAddress: participantAddress ?? null
    });
    await executeMutation.mutateAsync();
  }, [executeMutation, contest.chainId, contestId, participantAddress]);

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
    return Boolean(planDisplay.transaction);
  }, [planDisplay, walletReady]);

  const handleApprove = useCallback(
    async (approval: DisplayApproval) => {
      const key = approvalKeyFor(approval);
      setApprovalStates((previous) => ({
        ...previous,
        [key]: {
          status: "pending",
          transactionHash: previous[key]?.transactionHash ?? null,
          errorMessage: null
        }
      }));
      try {
        const execution = await approveToken({
          tokenAddress: approval.tokenAddress,
          spender: approval.spender,
          amount: approval.amount,
          symbol: approval.symbol,
          decimals: approval.decimals,
          reason: approval.reason ?? undefined
        });
        setApprovalStates((previous) => ({
          ...previous,
          [key]: {
            status: "success",
            transactionHash: execution.hash,
            errorMessage: null
          }
        }));
        await planMutation.mutateAsync();
      } catch (error) {
        setApprovalStates((previous) => ({
          ...previous,
          [key]: {
            status: "error",
            transactionHash: previous[key]?.transactionHash ?? null,
            errorMessage: error instanceof Error ? error.message : String(error)
          }
        }));
        setLastError(error);
      }
    },
    [approveToken, planMutation]
  );

  const renderApprovalAction = useCallback(
    (approval: DisplayApproval) => {
      const key = approvalKeyFor(approval);
      const state = approvalStates[key] ?? { status: "idle", transactionHash: null, errorMessage: null };
      const isPending = state.status === "pending";
      return (
        <div className="space-y-1">
          <button
            type="button"
            onClick={() => void handleApprove(approval)}
            disabled={
              Boolean(disableReason) ||
              planMutation.isPending ||
              executeMutation.isPending ||
              isPending ||
              !walletReady
            }
            className="rounded border border-slate-600 bg-slate-800 px-3 py-1 text-[0.7rem] font-semibold text-slate-100 transition hover:border-slate-400 hover:text-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPending ? t("participation.actions.approving") : t("participation.actions.approve")}
          </button>
          {state.status === "success" && state.transactionHash ? (
            <p className="text-[0.65rem] text-emerald-300">
              Tx: {state.transactionHash.slice(0, 10)}…{state.transactionHash.slice(-6)}
            </p>
          ) : null}
          {state.status === "error" && state.errorMessage ? (
            <p className="text-[0.65rem] text-rose-300">{state.errorMessage}</p>
          ) : null}
        </div>
      );
    },
    [approvalStates, disableReason, executeMutation.isPending, handleApprove, planMutation.isPending, t, walletReady]
  );

  return (
    <section className="space-y-4 rounded-xl border border-slate-800/60 bg-slate-900/40 p-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-50">{t("participation.registration.title")}</h3>
          <p className="text-sm text-slate-300">{t("participation.registration.subtitle")}</p>
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
          <h4 className="text-sm font-semibold text-slate-200">{t("participation.registration.planSummary")}</h4>
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
                  <ChecksList checks={planDisplay.checks} emptyLabel={t("participation.labels.noChecks")} />
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  {t("participation.labels.approvals")}
                </p>
                <div className="mt-2">
                  <ApprovalsList
                    approvals={planDisplay.approvals}
                    emptyLabel={t("participation.labels.noApprovals")}
                    labels={{
                      token: t("participation.labels.token"),
                      spender: t("participation.labels.spender"),
                      amount: t("participation.labels.amount"),
                      reason: t("participation.labels.reason")
                    }}
                    renderAction={renderApprovalAction}
                  />
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
              {planDisplay.estimatedFeesLabel ? (
                <p className="text-xs text-slate-300">
                  {t("participation.labels.estimatedFees", {
                    amount: planDisplay.estimatedFeesLabel.amount,
                    currency: planDisplay.estimatedFeesLabel.currency
                  })}
                </p>
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
          <h4 className="text-sm font-semibold text-slate-200">{t("participation.registration.executionSummary")}</h4>
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
                  {t("participation.labels.approvals")}
                </p>
                <div className="mt-2">
                  <ApprovalsList
                    approvals={executionDisplay.approvals}
                    emptyLabel={t("participation.labels.noApprovals")}
                    labels={{
                      token: t("participation.labels.token"),
                      spender: t("participation.labels.spender"),
                      amount: t("participation.labels.amount"),
                      reason: t("participation.labels.reason")
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
            </>
          ) : (
            <p className="text-sm text-slate-400">{t("participation.messages.executionPlaceholder")}</p>
          )}
        </div>
      </div>
    </section>
  );
}
