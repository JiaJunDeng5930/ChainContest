"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";

import type { ContestSnapshot } from "../api/contests";
import {
  formatContestTimestamp,
  formatPrizeAmount,
  getChainLabel,
  getPhaseLabel,
  truncateIdentifier,
  useContestDateTimeFormatter,
  useContestNumberFormatter
} from "../utils/format";

type ContestListProps = {
  items: ContestSnapshot[];
  isLoading: boolean;
  isFetching: boolean;
};

const SKELETON_ITEMS = 3;

function ContestListSkeleton() {
  return (
    <div className="space-y-4">
      {Array.from({ length: SKELETON_ITEMS }).map((_, index) => (
        <div
          key={index}
          className="animate-pulse rounded-xl border border-slate-800/60 bg-slate-900/40 p-6 shadow-sm shadow-slate-950/40"
        >
          <div className="flex flex-col gap-4">
            <div className="h-6 w-1/3 rounded bg-slate-800/80" />
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-2">
                <div className="h-4 w-1/2 rounded bg-slate-800/60" />
                <div className="h-4 w-3/4 rounded bg-slate-800/60" />
              </div>
              <div className="space-y-2">
                <div className="h-4 w-1/2 rounded bg-slate-800/60" />
                <div className="h-4 w-2/3 rounded bg-slate-800/60" />
              </div>
              <div className="space-y-2">
                <div className="h-4 w-1/2 rounded bg-slate-800/60" />
                <div className="h-4 w-2/3 rounded bg-slate-800/60" />
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function ContestCard({ contest }: { contest: ContestSnapshot }) {
  const t = useTranslations();
  const locale = useLocale();
  const numberFormatter = useContestNumberFormatter(locale);
  const dateFormatter = useContestDateTimeFormatter(locale);

  const chainLabel = getChainLabel(contest.chainId, t);
  const phaseLabel = getPhaseLabel(contest.phase, t);
  const prizeAsset = contest.prizePool.asset;
  const prizeLabel = formatPrizeAmount({
    value: contest.prizePool.currentBalance,
    chainId: contest.chainId,
    numberFormatter,
    decimals: prizeAsset?.decimals,
    symbol: prizeAsset?.symbol
  });
  const capacityLabel = `${contest.registrationCapacity.registered} / ${contest.registrationCapacity.maximum}`;
  const isFull = contest.registrationCapacity.isFull;

  const registrationOpensAt = formatContestTimestamp(contest.timeline.registrationOpensAt, dateFormatter);
  const registrationClosesAt = formatContestTimestamp(contest.timeline.registrationClosesAt, dateFormatter);
  const derivedAt = formatContestTimestamp(contest.derivedAt.timestamp, dateFormatter);

  const leaderboardEntries = contest.leaderboard?.entries?.slice(0, 3) ?? [];

  return (
    <article className="group rounded-xl border border-slate-800 bg-slate-900/40 p-6 shadow-sm shadow-slate-950/40 transition hover:border-slate-600 hover:bg-slate-900/60">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <h2 className="text-xl font-semibold tracking-tight text-slate-50">
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
          <Link
            href={`/contests/${encodeURIComponent(contest.contestId)}`}
            className="self-start rounded-lg border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-slate-500 hover:text-slate-50 focus:outline-none focus:ring focus:ring-slate-500/60 focus:ring-offset-2 focus:ring-offset-slate-950"
          >
            {t("contests.list.cta.view")}
          </Link>
        </div>

        <dl className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1">
            <dt className="text-xs uppercase tracking-wide text-slate-400">{t("contests.detail.timeline")}</dt>
            <dd className="text-sm text-slate-200">
              <span>{registrationOpensAt}</span>
              <span className="mx-1 text-slate-500">→</span>
              <span>{registrationClosesAt}</span>
            </dd>
          </div>

          <div className="space-y-1">
            <dt className="text-xs uppercase tracking-wide text-slate-400">{t("contests.detail.prizePool")}</dt>
            <dd className="text-sm text-slate-200">{prizeLabel}</dd>
            {contest.prizePool.accumulatedInflow ? (
              <dd className="text-xs text-slate-400">
                {t("contests.detail.inflowLabel", {
                  amount: formatPrizeAmount({
                    value: contest.prizePool.accumulatedInflow,
                    chainId: contest.chainId,
                    numberFormatter,
                    decimals: prizeAsset?.decimals,
                    symbol: prizeAsset?.symbol
                  })
                })}
              </dd>
            ) : null}
          </div>

          <div className="space-y-1">
            <dt className="text-xs uppercase tracking-wide text-slate-400">{t("contests.detail.capacity")}</dt>
            <dd className="text-sm text-slate-200">{capacityLabel}</dd>
            {isFull ? (
              <dd className="text-xs text-amber-300">{t("contests.detail.capacityFull")}</dd>
            ) : null}
          </div>
        </dl>

        {leaderboardEntries.length ? (
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-wide text-slate-400">{t("contests.detail.leaderboard")}</p>
            <ul className="space-y-1 text-sm text-slate-200">
              {leaderboardEntries.map((entry) => (
                <li key={`${contest.contestId}-${entry.rank}`} className="flex items-center justify-between rounded bg-slate-900/80 px-3 py-2">
                  <span className="font-semibold text-slate-300">
                    #{entry.rank} · {truncateIdentifier(entry.walletAddress)}
                  </span>
                  {entry.score ? <span className="text-xs text-slate-400">{entry.score}</span> : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500">
          <span>{t("contests.detail.blockAnchor", { blockNumber: contest.derivedAt.blockNumber })}</span>
          <span>{t("contests.detail.lastDerived", { timestamp: derivedAt })}</span>
        </div>
      </div>
    </article>
  );
}

export function ContestList({ items, isLoading, isFetching }: ContestListProps) {
  const t = useTranslations();

  if (isLoading) {
    return <ContestListSkeleton />;
  }

  if (!items.length) {
    return (
      <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-12 text-center text-sm text-slate-300">
        <p>{t("contests.list.empty")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-4">
        {items.map((contest) => (
          <ContestCard key={contest.contestId} contest={contest} />
        ))}
      </div>
      {isFetching ? (
        <p className="text-xs text-slate-400">{t("common.status.loading")}</p>
      ) : null}
    </div>
  );
}

export default ContestList;
