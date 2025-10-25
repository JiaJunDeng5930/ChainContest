"use client";

import { useTranslations, useLocale } from "next-intl";

import ErrorBanner from "../../../components/ErrorBanner";
import {
  getChainLabel,
  getPhaseLabel,
  truncateIdentifier,
  useContestDateTimeFormatter
} from "../../contests/utils/format";
import useLastInteractionSummary from "../hooks/useLastInteractionSummary";

type InteractionSummaryProps = {
  networkId?: number;
};

export default function InteractionSummary({ networkId }: InteractionSummaryProps) {
  const t = useTranslations();
  const locale = useLocale();
  const dateFormatter = useContestDateTimeFormatter(locale);

  const summaryQuery = useLastInteractionSummary({ networkId });

  if (summaryQuery.isLoading) {
    return (
      <section className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-4 text-sm text-slate-300">
        {t("participation.summary.loading")}
      </section>
    );
  }

  if (summaryQuery.isError) {
    return (
      <ErrorBanner
        error={summaryQuery.error}
        onRetry={() => {
          void summaryQuery.refetch();
        }}
      />
    );
  }

  const summary = summaryQuery.summary;
  if (!summary) {
    return (
      <section className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-4 text-sm text-slate-300">
        <h3 className="text-base font-semibold text-slate-50">{t("participation.summary.title")}</h3>
        <p className="mt-2 text-slate-400">{t("participation.summary.empty")}</p>
      </section>
    );
  }

  const { contest, action, amount, timestamp } = summary;
  const chainLabel = getChainLabel(contest.chainId, t);
  const phaseLabel = getPhaseLabel(contest.phase, t);
  const formattedTimestamp = dateFormatter.format(new Date(timestamp));
  const actionLabel = t(`participation.summary.action.${action}`);

  return (
    <section className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-4 text-sm text-slate-200">
      <header className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-base font-semibold text-slate-50">{t("participation.summary.title")}</h3>
        <span className="text-xs text-slate-400">{t("participation.summary.latestAction")}</span>
      </header>
      <dl className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <dt className="text-xs uppercase tracking-wide text-slate-500">{t("participation.summary.contest")}</dt>
          <dd className="text-sm font-semibold text-slate-100">{truncateIdentifier(contest.contestId)}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-slate-500">{t("participation.summary.chain")}</dt>
          <dd className="text-sm text-slate-200">{chainLabel}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-slate-500">{t("participation.summary.phase")}</dt>
          <dd className="text-sm text-slate-200">{phaseLabel}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-slate-500">{t("participation.summary.actionLabel")}</dt>
          <dd className="text-sm text-slate-200">{actionLabel}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-slate-500">{t("participation.summary.amount")}</dt>
          <dd className="text-sm text-slate-200">{amount}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-slate-500">{t("participation.summary.timestamp")}</dt>
          <dd className="text-sm text-slate-200">{formattedTimestamp}</dd>
        </div>
      </dl>
    </section>
  );
}
