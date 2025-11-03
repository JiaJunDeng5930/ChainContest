"use client";

import type { ReactNode } from "react";
import type { BlockAnchor, ActionPayout } from "../api/types";
import { truncateIdentifier } from "../../contests/utils/format";

export type DisplayCheck = {
  rule: string;
  passed: boolean;
  severity?: string;
  message?: string;
  detail?: string | null;
};

export function resolveStatusTone(status: string): string {
  const normalized = status.toLowerCase();
  switch (normalized) {
    case "ready":
    case "executed":
    case "applied":
    case "success":
      return "bg-emerald-500/20 text-emerald-200 border border-emerald-400/50";
    case "blocked":
    case "failed":
    case "rejected":
      return "bg-rose-500/20 text-rose-100 border border-rose-400/60";
    case "pending":
    case "queued":
    case "awaiting":
      return "bg-amber-500/20 text-amber-200 border border-amber-400/50";
    default:
      return "bg-slate-700/40 text-slate-200 border border-slate-500/40";
  }
}

export function StatusBadge({ status, label }: { status: string; label: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold uppercase tracking-wide ${resolveStatusTone(status)}`}
    >
      {label}
    </span>
  );
}

export function AnchorDetails({
  anchor,
  labels
}: {
  anchor: BlockAnchor;
  labels: {
    block: string;
    hash: string;
    timestamp: string;
  };
}) {
  return (
    <dl className="grid gap-1 text-xs text-slate-300 sm:grid-cols-3">
      <div>
        <dt className="text-slate-500">{labels.block}</dt>
        <dd className="font-mono text-slate-200">#{anchor.blockNumber}</dd>
      </div>
      {anchor.blockHash ? (
        <div>
          <dt className="text-slate-500">{labels.hash}</dt>
          <dd className="font-mono text-slate-200">{truncateIdentifier(anchor.blockHash, 10, 10)}</dd>
        </div>
      ) : null}
      <div className="sm:col-span-2 sm:text-right">
        <dt className="text-slate-500">{labels.timestamp}</dt>
        <dd className="text-slate-200">{anchor.timestamp}</dd>
      </div>
    </dl>
  );
}

export function ChecksList({ checks, emptyLabel }: { checks: DisplayCheck[]; emptyLabel: string }) {
  if (!checks.length) {
    return <p className="text-xs text-slate-400">{emptyLabel}</p>;
  }

  return (
    <ul className="space-y-2">
      {checks.map((check) => {
        const key = `${check.rule}-${check.message ?? "n/a"}`;
        const tone = check.passed ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-100" : "border-rose-500/40 bg-rose-500/10 text-rose-100";
        return (
        <li key={key} className={`rounded border px-3 py-2 text-xs ${tone}`}>
          <p className="font-semibold">{check.message ?? check.rule}</p>
          {check.severity ? (
            <p className="mt-1 text-[0.7rem] uppercase tracking-wide opacity-80">{check.severity}</p>
          ) : null}
          {check.detail ? (
            <p className="mt-2 whitespace-pre-wrap break-words text-[0.7rem] text-slate-200">{check.detail}</p>
          ) : null}
        </li>
      );
    })}
  </ul>
);
}

export type DisplayApproval = {
  tokenAddress: string;
  spender: string;
  amount: string;
  symbol?: string;
  reason?: string | null;
  decimals?: number;
};

export type DisplayCall = {
  to: string;
  data: string;
  value?: string;
  gasLimit?: string;
  gasPrice?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
  deadline?: string;
  route?: string;
};

export function ApprovalsList({
  approvals,
  emptyLabel,
  labels,
  renderAction
}: {
  approvals: DisplayApproval[];
  emptyLabel: string;
  labels: {
    token: string;
    spender: string;
    amount: string;
    reason: string;
  };
  renderAction?: (approval: DisplayApproval) => ReactNode;
}) {
  if (!approvals.length) {
    return <p className="text-xs text-slate-400">{emptyLabel}</p>;
  }

  return (
    <ul className="space-y-2">
      {approvals.map((approval) => (
        <li key={`${approval.tokenAddress}-${approval.spender}`} className="rounded border border-slate-700/60 bg-slate-900/60 p-3 text-xs">
          <p className="font-semibold text-slate-200">
            {labels.token}: {truncateIdentifier(approval.tokenAddress)}
          </p>
          <p className="mt-1 text-slate-300">
            {labels.spender}: {truncateIdentifier(approval.spender)}
          </p>
          <p className="text-slate-300">
            {labels.amount}: {approval.amount}
            {approval.symbol ? ` ${approval.symbol}` : ""}
          </p>
          {approval.reason ? <p className="mt-1 text-slate-400">{labels.reason}: {approval.reason}</p> : null}
          {renderAction ? <div className="mt-3">{renderAction(approval)}</div> : null}
        </li>
      ))}
    </ul>
  );
}

export function TransactionDetails({
  call,
  emptyLabel,
  labels
}: {
  call?: DisplayCall | null;
  emptyLabel: string;
  labels: {
    to: string;
    value: string;
    data: string;
    gasLimit: string;
    maxFee: string;
    priorityFee: string;
    gasPrice: string;
    deadline: string;
    route: string;
  };
}) {
  if (!call) {
    return <p className="text-xs text-slate-400">{emptyLabel}</p>;
  }

  return (
    <dl className="grid gap-2 text-xs text-slate-200 sm:grid-cols-2">
      <div>
        <dt className="text-slate-500">{labels.to}</dt>
        <dd className="font-mono">{truncateIdentifier(call.to)}</dd>
      </div>
      <div>
        <dt className="text-slate-500">{labels.value}</dt>
        <dd className="font-mono">{call.value ?? "0"}</dd>
      </div>
      <div className="sm:col-span-2">
        <dt className="text-slate-500">{labels.data}</dt>
        <dd className="break-all font-mono text-[0.7rem] text-slate-300">{call.data}</dd>
      </div>
      {call.gasLimit ? (
        <div>
          <dt className="text-slate-500">{labels.gasLimit}</dt>
          <dd className="font-mono">{call.gasLimit}</dd>
        </div>
      ) : null}
      {call.maxFeePerGas ? (
        <div>
          <dt className="text-slate-500">{labels.maxFee}</dt>
          <dd className="font-mono">{call.maxFeePerGas}</dd>
        </div>
      ) : null}
      {call.maxPriorityFeePerGas ? (
        <div>
          <dt className="text-slate-500">{labels.priorityFee}</dt>
          <dd className="font-mono">{call.maxPriorityFeePerGas}</dd>
        </div>
      ) : null}
      {call.gasPrice ? (
        <div>
          <dt className="text-slate-500">{labels.gasPrice}</dt>
          <dd className="font-mono">{call.gasPrice}</dd>
        </div>
      ) : null}
      {call.deadline ? (
        <div>
          <dt className="text-slate-500">{labels.deadline}</dt>
          <dd className="font-mono">{call.deadline}</dd>
        </div>
      ) : null}
      {call.route ? (
        <div className="sm:col-span-2">
          <dt className="text-slate-500">{labels.route}</dt>
          <dd className="font-mono">{call.route}</dd>
        </div>
      ) : null}
    </dl>
  );
}

export function PayoutDetails({
  payout,
  emptyLabel,
  labels
}: {
  payout?: ActionPayout | null;
  emptyLabel: string;
  labels: {
    amount: string;
    destination: string;
  };
}) {
  if (!payout) {
    return <p className="text-xs text-slate-400">{emptyLabel}</p>;
  }

  return (
    <dl className="space-y-2 text-xs text-slate-200">
      <div>
        <dt className="text-slate-500">{labels.amount}</dt>
        <dd className="font-mono">
          {payout.amount}
          {payout.currency ? ` ${payout.currency}` : ""}
        </dd>
      </div>
      {payout.destination ? (
        <div>
          <dt className="text-slate-500">{labels.destination}</dt>
          <dd className="font-mono">{truncateIdentifier(payout.destination)}</dd>
        </div>
      ) : null}
    </dl>
  );
}
