"use client";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { useMemo } from "react";

import ErrorBanner from "../../../../components/ErrorBanner";
import InteractionSummary from "../../../../features/participation/components/InteractionSummary";
import { fetchParticipationHistory } from "../../../../features/participation/api/history";
import type {
  ParticipationEvent,
  RewardClaimEvent,
  UserContestListResponse,
  UserContestRecord
} from "../../../../features/participation/api/types";
import { useNetworkGateState } from "../../../../features/network/NetworkGate";
import {
  formatContestTimestamp,
  getChainLabel,
  getPhaseLabel,
  truncateIdentifier,
  useContestDateTimeFormatter
} from "../../../../features/contests/utils/format";

const PAGE_SIZE = 10;

export default function ParticipationHistoryPage() {
  const t = useTranslations();
  const gate = useNetworkGateState();

  const historyQuery = useInfiniteQuery<UserContestListResponse>({
    queryKey: ["participation-history", gate.requiredChainId ?? null] as const,
    initialPageParam: null,
    queryFn: ({ pageParam }) =>
      fetchParticipationHistory({
        cursor: pageParam ?? undefined,
        pageSize: PAGE_SIZE,
        networkId: gate.requiredChainId ?? undefined
      }),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: gate.isSessionActive
  });

  const records = useMemo<UserContestRecord[]>(() => {
    if (!historyQuery.data?.pages?.length) {
      return [];
    }
    return historyQuery.data.pages.flatMap((page) => page.items ?? []);
  }, [historyQuery.data?.pages]);

  const isEmpty = !historyQuery.isLoading && !records.length;

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold text-slate-50">{t("participation.history.title")}</h1>
        <p className="text-sm text-slate-300">{t("participation.history.subtitle")}</p>
      </header>

      <InteractionSummary networkId={gate.requiredChainId ?? undefined} />

      {historyQuery.isError ? (
        <ErrorBanner
          error={historyQuery.error}
          onRetry={() => {
            void historyQuery.refetch();
          }}
        />
      ) : null}

      {historyQuery.isLoading ? (
        <p className="text-sm text-slate-300">{t("participation.history.loading")}</p>
      ) : null}

      {isEmpty ? (
        <p className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-4 text-sm text-slate-300">
          {t("participation.history.empty")}
        </p>
      ) : null}

      {records.length ? (
        <div className="space-y-4">
          {records.map((record) => (
            <ParticipationRecordCard key={`${record.contest.contestId}-${record.lastActivity ?? "none"}`} record={record} />
          ))}
        </div>
      ) : null}

      {historyQuery.hasNextPage ? (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => {
              void historyQuery.fetchNextPage();
            }}
            disabled={historyQuery.isFetchingNextPage}
            className="rounded border border-slate-600 bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:border-slate-400 hover:text-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {historyQuery.isFetchingNextPage
              ? t("participation.history.loadingMore")
              : t("participation.history.loadMore")}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function ParticipationRecordCard({ record }: { record: UserContestRecord }) {
  const t = useTranslations();
  const locale = useLocale();
  const dateFormatter = useContestDateTimeFormatter(locale);
  const { contest, participations, rewardClaims, lastActivity } = record;

  const chainLabel = getChainLabel(contest.chainId, t);
  const phaseLabel = getPhaseLabel(contest.phase, t);

  const formattedLastActivity = lastActivity ? dateFormatter.format(new Date(lastActivity)) : null;

  return (
    <article className="space-y-4 rounded-xl border border-slate-800/60 bg-slate-900/40 p-5">
      <header className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-50">{truncateIdentifier(contest.contestId)}</h2>
          <div className="mt-1 flex flex-wrap gap-2 text-xs uppercase tracking-wide text-slate-400">
            <span className="rounded bg-slate-800 px-2 py-1">{chainLabel}</span>
            <span className="rounded bg-slate-800 px-2 py-1">{phaseLabel}</span>
          </div>
        </div>
        {formattedLastActivity ? (
          <p className="text-xs text-slate-400">
            {t("participation.history.lastActivity", {
              timestamp: formattedLastActivity
            })}
          </p>
        ) : null}
      </header>

      <section>
        <h3 className="text-sm font-semibold text-slate-200">{t("participation.history.participationsHeading")}</h3>
        {participations?.length ? (
          <ul className="mt-2 space-y-2 text-sm text-slate-200">
            {participations.map((event: ParticipationEvent) => (
              <li key={`${event.contestId}-${event.occurredAt}`} className="rounded border border-slate-800/60 bg-slate-900/60 p-3">
                <p className="font-semibold">{t("participation.history.participationEntry", { amount: event.amount })}</p>
                <p className="text-xs text-slate-400">{formatContestTimestamp(event.occurredAt, dateFormatter)}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-slate-400">{t("participation.history.noParticipations")}</p>
        )}
      </section>

      <section>
        <h3 className="text-sm font-semibold text-slate-200">{t("participation.history.rewardsHeading")}</h3>
        {rewardClaims?.length ? (
          <ul className="mt-2 space-y-2 text-sm text-slate-200">
            {rewardClaims.map((event: RewardClaimEvent) => (
              <li key={`${event.contestId}-${event.claimedAt}`} className="rounded border border-slate-800/60 bg-slate-900/60 p-3">
                <p className="font-semibold">{t("participation.history.rewardEntry", { amount: event.amount })}</p>
                <p className="text-xs text-slate-400">{formatContestTimestamp(event.claimedAt, dateFormatter)}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-slate-400">{t("participation.history.noRewards")}</p>
        )}
      </section>
    </article>
  );
}
