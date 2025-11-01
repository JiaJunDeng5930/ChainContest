"use client";

import { QUERY_KEYS, type ContestPhase } from "@chaincontest/shared-i18n";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";

import ErrorBanner from "../../../components/ErrorBanner";
import { fetchContestSnapshot, type ContestSnapshot } from "../api/contests";
import {
  formatContestTimestamp,
  formatPrizeAmount,
  getChainLabel,
  getPhaseLabel,
  truncateIdentifier,
  useContestDateTimeFormatter,
  useContestNumberFormatter
} from "../utils/format";
import RegistrationPanel from "../../participation/components/RegistrationPanel";
import RewardClaimPanel from "../../participation/components/RewardClaimPanel";
import PostgamePanel from "../../participation/components/PostgamePanel";

type ContestDetailProps = {
  contestId: string;
};

function ContestDetailSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="h-8 w-48 rounded bg-slate-800/60" />
        <div className="h-10 w-32 rounded bg-slate-800/40" />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="space-y-2 rounded-xl border border-slate-800/60 bg-slate-900/40 p-4">
            <div className="h-4 w-24 rounded bg-slate-800/60" />
            <div className="h-6 w-32 rounded bg-slate-800/60" />
            <div className="h-4 w-40 rounded bg-slate-800/40" />
          </div>
        ))}
      </div>
      <div className="h-40 rounded-xl border border-slate-800/60 bg-slate-900/40" />
    </div>
  );
}

export function ContestDetail({ contestId }: ContestDetailProps) {
  const t = useTranslations();
  const locale = useLocale();
  const numberFormatter = useContestNumberFormatter(locale);
  const dateFormatter = useContestDateTimeFormatter(locale);

  const query: UseQueryResult<ContestSnapshot, Error> = useQuery<ContestSnapshot, Error>({
    queryKey: QUERY_KEYS.contestDetail(contestId),
    queryFn: async () => fetchContestSnapshot(contestId),
    enabled: Boolean(contestId),
    staleTime: 30_000,
    refetchOnWindowFocus: false
  });

  if (query.isLoading) {
    return <ContestDetailSkeleton />;
  }

  if (query.isError) {
    return (
      <ErrorBanner
        error={query.error}
        onRetry={async () => {
          await query.refetch();
        }}
      />
    );
  }

  const contest = query.data;
  if (!contest) {
    return (
      <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-8 text-center text-sm text-slate-300">
        <p>{t("common.status.empty")}</p>
      </div>
    );
  }

  const normalisePhase = (phase: string): ContestPhase => {
    switch (phase) {
      case "registered":
        return "registration";
      case "sealed":
        return "settled";
      case "registration":
      case "active":
      case "settled":
      case "closed":
        return phase;
      default:
        return "registration";
    }
  };

  const normalizedPhase = normalisePhase(contest.phase);

  const chainLabel = getChainLabel(contest.chainId, t);
  const phaseLabel = getPhaseLabel(normalizedPhase, t);
  const prizeLabel = formatPrizeAmount({
    value: contest.prizePool.currentBalance,
    chainId: contest.chainId,
    numberFormatter
  });
  const capacityLabel = `${contest.registrationCapacity.registered} / ${contest.registrationCapacity.maximum}`;
  const isFull = contest.registrationCapacity.isFull;

  const registrationOpensAt = formatContestTimestamp(contest.timeline.registrationOpensAt, dateFormatter);
  const registrationClosesAt = formatContestTimestamp(contest.timeline.registrationClosesAt, dateFormatter);
  const derivedAt = formatContestTimestamp(contest.derivedAt.timestamp, dateFormatter);

  const valuationAnchor = contest.prizePool.valuationAnchor
    ? {
        price: contest.prizePool.valuationAnchor.price,
        currency: contest.prizePool.valuationAnchor.currency,
        observedAt: formatContestTimestamp(contest.prizePool.valuationAnchor.observedAt, dateFormatter)
      }
    : null;

  const leaderboardEntries = contest.leaderboard?.entries ?? [];

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-4 border-b border-slate-800/60 pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <h2 className="text-3xl font-semibold tracking-tight text-slate-50">
            {truncateIdentifier(contest.contestId)}
          </h2>
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-300">
            <span className="rounded bg-slate-800 px-2 py-1">{chainLabel}</span>
            <span className="rounded bg-slate-800 px-2 py-1">{phaseLabel}</span>
            {isFull ? (
              <span className="rounded bg-amber-500/10 px-2 py-1 text-amber-200">
                {t("contests.list.fullLabel")}
              </span>
            ) : null}
          </div>
        </div>
        <button
          type="button"
          onClick={async () => {
            await query.refetch();
          }}
          disabled={query.isFetching}
          className="w-full rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-slate-500 hover:text-slate-50 focus:outline-none focus:ring focus:ring-slate-500/50 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
        >
          {t("contests.detail.blockRefresh")}
        </button>
      </header>

      {query.isFetching ? (
        <p className="text-xs text-slate-400">{t("common.status.loading")}</p>
      ) : null}

      <dl className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-2 rounded-xl border border-slate-800/60 bg-slate-900/40 p-4">
          <dt className="text-xs uppercase tracking-wide text-slate-400">{t("contests.detail.timeline")}</dt>
          <dd className="text-sm text-slate-200">
            <span>{registrationOpensAt}</span>
            <span className="mx-1 text-slate-500">→</span>
            <span>{registrationClosesAt}</span>
          </dd>
        </div>

        <div className="space-y-2 rounded-xl border border-slate-800/60 bg-slate-900/40 p-4">
          <dt className="text-xs uppercase tracking-wide text-slate-400">{t("contests.detail.prizePool")}</dt>
          <dd className="text-sm text-slate-200">{prizeLabel}</dd>
          {contest.prizePool.accumulatedInflow ? (
            <dd className="text-xs text-slate-400">
              {t("contests.detail.inflowLabel", {
                amount: formatPrizeAmount({
                  value: contest.prizePool.accumulatedInflow,
                  chainId: contest.chainId,
                  numberFormatter
                })
              })}
            </dd>
          ) : null}
          {valuationAnchor ? (
            <dd className="text-xs text-slate-400">
              {t("contests.detail.valuationAnchor", {
                price: valuationAnchor.price,
                currency: valuationAnchor.currency,
                timestamp: valuationAnchor.observedAt
              })}
            </dd>
          ) : null}
        </div>

        <div className="space-y-2 rounded-xl border border-slate-800/60 bg-slate-900/40 p-4">
          <dt className="text-xs uppercase tracking-wide text-slate-400">{t("contests.detail.capacity")}</dt>
          <dd className="text-sm text-slate-200">{capacityLabel}</dd>
          {isFull ? (
            <dd className="text-xs text-amber-300">{t("contests.detail.capacityFull")}</dd>
          ) : null}
        </div>
      </dl>

      <section className="space-y-3 rounded-xl border border-slate-800/60 bg-slate-900/40 p-6">
        <header className="space-y-1">
          <p className="text-xs uppercase tracking-wide text-slate-400">
            {t("contests.detail.blockAnchor", { blockNumber: contest.derivedAt.blockNumber })}
          </p>
          <p className="text-sm text-slate-300">
            {t("contests.detail.lastDerived", { timestamp: derivedAt })}
          </p>
          {contest.derivedAt.blockHash ? (
            <p className="text-xs text-slate-500">
              {t("contests.detail.blockHashLabel")}: {truncateIdentifier(contest.derivedAt.blockHash, 10, 10)}
            </p>
          ) : null}
        </header>
      </section>

      {normalizedPhase === "registration" ? (
        <RegistrationPanel contestId={contestId} contest={contest} />
      ) : null}

      {normalizedPhase === "settled" || normalizedPhase === "closed" ? (
        <RewardClaimPanel contestId={contestId} contest={contest} />
      ) : null}

      {normalizedPhase === "active" || normalizedPhase === "settled" || normalizedPhase === "closed" ? (
        <PostgamePanel contestId={contestId} contest={contest} />
      ) : null}

      <section className="space-y-4 rounded-xl border border-slate-800/60 bg-slate-900/40 p-6">
        <header className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-50">{t("contests.detail.leaderboard")}</h3>
          {contest.leaderboard?.version ? (
            <span className="text-xs text-slate-400">v{contest.leaderboard.version}</span>
          ) : null}
        </header>
        {leaderboardEntries.length ? (
          <ol className="space-y-2">
            {leaderboardEntries.map((entry) => (
              <li
                key={`${contest.contestId}-${entry.rank}-${entry.walletAddress}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-800/60 bg-slate-900/60 px-3 py-2 text-sm text-slate-200"
              >
                <span className="font-semibold text-slate-100">
                  #{entry.rank} · {truncateIdentifier(entry.walletAddress)}
                </span>
                {entry.score ? <span className="text-xs text-slate-400">{entry.score}</span> : null}
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-slate-300">{t("common.status.empty")}</p>
        )}
      </section>
    </div>
  );
}

export default ContestDetail;
