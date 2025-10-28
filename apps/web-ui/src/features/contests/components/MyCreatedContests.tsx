"use client";

import {
  CHAIN_METADATA,
  CONTEST_PHASES,
  CONTEST_PHASE_LABEL_KEYS,
  SUPPORTED_CHAIN_IDS,
  type ContestPhase,
  type SupportedChainId
} from "@chaincontest/shared-i18n";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useCallback, useMemo, useState, type ChangeEvent } from "react";

import ErrorBanner from "../../../components/ErrorBanner";
import {
  fetchCreatorContests,
  type CreatorContestListQuery,
  type CreatorContestListResponse,
  type CreatorContestRecord
} from "../api/creatorContests";

const DEFAULT_PAGE_SIZE = 10;

const CREATION_STATUS_LABEL_KEYS: Record<string, string> = {
  accepted: "contests.create.list.status.accepted",
  deployed: "contests.create.list.status.deployed"
};

const CREATION_STATUS_BADGE_STYLES: Record<string, string> = {
  accepted: "border-sky-500/40 bg-sky-500/10 text-sky-100",
  deployed: "border-emerald-500/40 bg-emerald-500/10 text-emerald-100"
};

type FilterState = {
  networkId: number | null;
};

function formatIsoDate(timestamp: string): string {
  const parsed = Date.parse(timestamp);
  if (Number.isNaN(parsed)) {
    return timestamp;
  }
  return new Date(parsed).toLocaleString();
}

function resolveChainLabel(chainId: number | null, t: ReturnType<typeof useTranslations>) {
  if (chainId == null) {
    return t("contests.create.list.filters.all");
  }

  if (Object.hasOwn(CHAIN_METADATA, chainId)) {
    return t(CHAIN_METADATA[chainId as SupportedChainId].shortNameKey);
  }

  return String(chainId);
}

function resolveContestStatusLabel(status: string, t: ReturnType<typeof useTranslations>) {
  const normalized = status.toLowerCase();
  if ((CONTEST_PHASES as readonly string[]).includes(normalized)) {
    return t(CONTEST_PHASE_LABEL_KEYS[normalized as ContestPhase]);
  }
  return status;
}

function resolveCreationStatus(status: string, t: ReturnType<typeof useTranslations>) {
  const normalized = status.toLowerCase();
  const key = CREATION_STATUS_LABEL_KEYS[normalized];
  if (key) {
    return t(key);
  }
  return t("contests.create.list.status.unknown", { status });
}

function resolveStatusBadgeClass(status: string) {
  const normalized = status.toLowerCase();
  return CREATION_STATUS_BADGE_STYLES[normalized] ?? "border-slate-600 bg-slate-900 text-slate-200";
}

function buildQueryVariables(filters: FilterState, cursor: string | null): CreatorContestListQuery {
  return {
    networkId: filters.networkId ?? undefined,
    cursor: cursor ?? undefined,
    pageSize: DEFAULT_PAGE_SIZE
  };
}

function renderMetadata(metadata: Record<string, unknown> | null) {
  if (!metadata || !Object.keys(metadata).length) {
    return null;
  }

  return (
    <pre className="mt-2 overflow-x-auto rounded border border-slate-800/60 bg-slate-950/60 p-3 text-xs text-slate-200">
      {JSON.stringify(metadata, null, 2)}
    </pre>
  );
}

export default function MyCreatedContests() {
  const t = useTranslations();
  const [filters, setFilters] = useState<FilterState>({ networkId: null });
  const [cursor, setCursor] = useState<string | null>(null);
  const [cursorHistory, setCursorHistory] = useState<Array<string | null>>([]);

  const queryVariables = useMemo(
    () => buildQueryVariables(filters, cursor),
    [filters, cursor]
  );

  const queryKey = useMemo(
    () => ["creator-contests", queryVariables] as const,
    [queryVariables]
  );

  const {
    data: creatorData,
    error: creatorError,
    isLoading,
    isFetching,
    isError,
    refetch
  } = useQuery({
    queryKey,
    queryFn: (): Promise<CreatorContestListResponse> => fetchCreatorContests(queryVariables),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    refetchOnWindowFocus: false
  });

  const records: CreatorContestRecord[] = creatorData?.items ?? [];
  const nextCursor: string | null = creatorData?.nextCursor ?? null;
  const hasNextPage = Boolean(nextCursor);
  const hasPreviousPage = cursorHistory.length > 0;
  const currentPage = cursorHistory.length + 1;

  const handleNetworkChange = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => {
      const value = event.target.value;
      const parsed = value ? Number.parseInt(value, 10) : NaN;
      setFilters({
        networkId: Number.isFinite(parsed) ? parsed : null
      });
      setCursor(null);
      setCursorHistory([]);
    },
    []
  );

  const handleResetFilters = useCallback(() => {
    setFilters({ networkId: null });
    setCursor(null);
    setCursorHistory([]);
  }, []);

  const handleRefresh = useCallback(() => {
    void refetch();
  }, [refetch]);

  const handleNextPage = useCallback(() => {
    if (!nextCursor) {
      return;
    }

    setCursorHistory((history) => [...history, cursor]);
    setCursor(nextCursor);
  }, [nextCursor, cursor]);

  const handlePreviousPage = useCallback(() => {
    if (!cursorHistory.length) {
      setCursor(null);
      return;
    }

    setCursorHistory((history) => {
      const updated = [...history];
      const previousCursor = updated.pop() ?? null;
      setCursor(previousCursor);
      return updated;
    });
  }, [cursorHistory]);

  const chainOptions = useMemo(
    () =>
      SUPPORTED_CHAIN_IDS.map((chainId) => ({
        id: chainId,
        label: t(CHAIN_METADATA[chainId].shortNameKey)
      })),
    [t]
  );


  return (
    <section className="space-y-5">
      <header className="space-y-2">
        <h2 className="text-xl font-semibold text-slate-50">{t("contests.create.list.title")}</h2>
        <p className="text-sm text-slate-300">{t("contests.create.list.subtitle")}</p>
      </header>

      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="flex flex-wrap items-end gap-4">
          <label className="flex flex-col text-sm text-slate-200">
            <span className="mb-1 text-xs uppercase tracking-wide text-slate-400">
              {t("contests.create.list.filters.network")}
            </span>
            <select
              value={filters.networkId ?? ""}
              onChange={handleNetworkChange}
              disabled={isFetching}
              className="rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring focus:ring-slate-500/50"
            >
              <option value="">{t("contests.create.list.filters.all")}</option>
              {chainOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={handleResetFilters}
            disabled={isFetching || (!filters.networkId && !cursorHistory.length && cursor === null)}
            className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-slate-500 hover:text-slate-50 focus:outline-none focus:ring focus:ring-slate-500/50"
          >
            {t("contests.filters.reset")}
          </button>
        </div>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={isFetching}
          className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-slate-500 hover:text-slate-50 focus:outline-none focus:ring focus:ring-slate-500/50"
        >
          {t("common.actions.refresh")}
        </button>
      </div>

      {isError && creatorError ? <ErrorBanner error={creatorError} /> : null}

      <div className="space-y-4">
        {isLoading ? (
          <div className="rounded-lg border border-slate-800 bg-slate-950/30 p-6 text-sm text-slate-300">
            {t("common.status.loading")}
          </div>
        ) : records.length === 0 ? (
          <div className="rounded-lg border border-slate-800 bg-slate-950/30 p-6 text-sm text-slate-300">
            {t("contests.create.list.empty")}
          </div>
        ) : (
          <ul className="space-y-4">
            {records.map((record) => (
              <li
                key={`${record.request.requestId}-${record.request.createdAt}`}
                className="space-y-4 rounded-lg border border-slate-800 bg-slate-950/40 p-5"
              >
                <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-1">
                    <span
                      className={`inline-flex w-fit items-center rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide ${
                        resolveStatusBadgeClass(record.status)
                      }`}
                    >
                      {resolveCreationStatus(record.status, t)}
                    </span>
                    <p className="text-xs text-slate-400">
                      {t("contests.create.list.requestSummary", {
                        network: resolveChainLabel(record.request.networkId, t),
                        createdAt: formatIsoDate(record.request.createdAt),
                        updatedAt: formatIsoDate(record.request.updatedAt)
                      })}
                    </p>
                  </div>
                  <div className="text-xs text-slate-400">
                    {t("contests.create.result.requestId")}: {record.request.requestId}
                  </div>
                </header>

                <div className="grid gap-4 lg:grid-cols-3">
                  <section className="space-y-3 rounded-lg border border-slate-800 bg-slate-950/30 p-4">
                    <h3 className="text-sm font-semibold text-slate-100">
                      {t("contests.create.list.request.sectionTitle")}
                    </h3>
                    <dl className="space-y-2 text-sm text-slate-200">
                      <div>
                        <dt className="text-xs uppercase tracking-wide text-slate-400">
                          {t("contests.create.list.request.networkLabel")}
                        </dt>
                        <dd>{resolveChainLabel(record.request.networkId, t)}</dd>
                      </div>
                      <div>
                        <dt className="text-xs uppercase tracking-wide text-slate-400">
                          {t("contests.create.list.request.createdAt")}
                        </dt>
                        <dd>{formatIsoDate(record.request.createdAt)}</dd>
                      </div>
                      <div>
                        <dt className="text-xs uppercase tracking-wide text-slate-400">
                          {t("contests.create.list.request.updatedAt")}
                        </dt>
                        <dd>{formatIsoDate(record.request.updatedAt)}</dd>
                      </div>
                    </dl>
                    <details className="rounded border border-slate-800/60 bg-slate-950/60">
                      <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-slate-300 hover:text-slate-50">
                        {t("contests.create.list.payloadToggle")}
                      </summary>
                      <pre className="px-3 pb-3 text-xs text-slate-200">
                        {JSON.stringify(record.request.payload, null, 2)}
                      </pre>
                    </details>
                  </section>

                  <section className="space-y-3 rounded-lg border border-slate-800 bg-slate-950/30 p-4">
                    <h3 className="text-sm font-semibold text-slate-100">
                      {t("contests.create.list.artifact.title")}
                    </h3>
                    {record.artifact ? (
                      <>
                        <dl className="space-y-2 text-sm text-slate-200">
                          <div>
                            <dt className="text-xs uppercase tracking-wide text-slate-400">
                              {t("contests.create.result.artifactId")}
                            </dt>
                            <dd className="break-all">{record.artifact.artifactId}</dd>
                          </div>
                          <div>
                            <dt className="text-xs uppercase tracking-wide text-slate-400">
                              {t("contests.create.result.registrarAddress")}
                            </dt>
                            <dd className="break-all">{record.artifact.registrarAddress ?? "—"}</dd>
                          </div>
                          <div>
                            <dt className="text-xs uppercase tracking-wide text-slate-400">
                              {t("contests.create.result.treasuryAddress")}
                            </dt>
                            <dd className="break-all">{record.artifact.treasuryAddress ?? "—"}</dd>
                          </div>
                          <div>
                            <dt className="text-xs uppercase tracking-wide text-slate-400">
                              {t("contests.create.result.settlementAddress")}
                            </dt>
                            <dd className="break-all">{record.artifact.settlementAddress ?? "—"}</dd>
                          </div>
                          <div>
                            <dt className="text-xs uppercase tracking-wide text-slate-400">
                              {t("contests.create.result.rewardsAddress")}
                            </dt>
                            <dd className="break-all">{record.artifact.rewardsAddress ?? "—"}</dd>
                          </div>
                          <div>
                            <dt className="text-xs uppercase tracking-wide text-slate-400">
                              {t("contests.create.result.createdAt")}
                            </dt>
                            <dd>{formatIsoDate(record.artifact.createdAt)}</dd>
                          </div>
                          <div>
                            <dt className="text-xs uppercase tracking-wide text-slate-400">
                              {t("contests.create.result.updatedAt")}
                            </dt>
                            <dd>{formatIsoDate(record.artifact.updatedAt)}</dd>
                          </div>
                        </dl>
                        <details className="rounded border border-slate-800/60 bg-slate-950/60">
                          <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-slate-300 hover:text-slate-50">
                            {t("contests.create.list.metadataToggle")}
                          </summary>
                          {renderMetadata(record.artifact.metadata) ?? (
                            <p className="px-3 pb-3 text-xs text-slate-400">{t("contests.create.list.metadataEmpty")}</p>
                          )}
                        </details>
                      </>
                    ) : (
                      <p className="text-sm text-slate-400">{t("contests.create.list.artifact.none")}</p>
                    )}
                  </section>

                  <section className="space-y-3 rounded-lg border border-slate-800 bg-slate-950/30 p-4">
                    <h3 className="text-sm font-semibold text-slate-100">
                      {t("contests.create.list.contest.title")}
                    </h3>
                    {record.contest ? (
                      <>
                        <dl className="space-y-2 text-sm text-slate-200">
                          <div>
                            <dt className="text-xs uppercase tracking-wide text-slate-400">
                              {t("contests.create.result.contestId")}
                            </dt>
                            <dd>{record.contest.contestId}</dd>
                          </div>
                          <div>
                            <dt className="text-xs uppercase tracking-wide text-slate-400">
                              {t("contests.create.list.contest.contractAddress")}
                            </dt>
                            <dd className="break-all">{record.contest.contractAddress}</dd>
                          </div>
                          <div>
                            <dt className="text-xs uppercase tracking-wide text-slate-400">
                              {t("contests.create.list.contest.status")}
                            </dt>
                            <dd>{resolveContestStatusLabel(record.contest.status, t)}</dd>
                          </div>
                          <div>
                            <dt className="text-xs uppercase tracking-wide text-slate-400">
                              {t("contests.create.list.request.networkLabel")}
                            </dt>
                            <dd>{resolveChainLabel(record.contest.chainId, t)}</dd>
                          </div>
                          <div>
                            <dt className="text-xs uppercase tracking-wide text-slate-400">
                              {t("contests.create.list.contest.originTag")}
                            </dt>
                            <dd>{record.contest.originTag ?? "—"}</dd>
                          </div>
                          <div>
                            <dt className="text-xs uppercase tracking-wide text-slate-400">
                              {t("contests.create.list.contest.timeWindow")}
                            </dt>
                            <dd>
                              {formatIsoDate(record.contest.timeWindowStart)} →{" "}
                              {formatIsoDate(record.contest.timeWindowEnd)}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-xs uppercase tracking-wide text-slate-400">
                              {t("contests.create.result.createdAt")}
                            </dt>
                            <dd>{formatIsoDate(record.contest.createdAt)}</dd>
                          </div>
                          <div>
                            <dt className="text-xs uppercase tracking-wide text-slate-400">
                              {t("contests.create.result.updatedAt")}
                            </dt>
                            <dd>{formatIsoDate(record.contest.updatedAt)}</dd>
                          </div>
                        </dl>
                        <details className="rounded border border-slate-800/60 bg-slate-950/60">
                          <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-slate-300 hover:text-slate-50">
                            {t("contests.create.list.metadataToggle")}
                          </summary>
                          {renderMetadata(record.contest.metadata) ?? (
                            <p className="px-3 pb-3 text-xs text-slate-400">{t("contests.create.list.metadataEmpty")}</p>
                          )}
                        </details>
                      </>
                    ) : (
                      <p className="text-sm text-slate-400">{t("contests.create.list.contest.none")}</p>
                    )}
                  </section>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <footer className="flex flex-col justify-between gap-3 border-t border-slate-800 pt-4 sm:flex-row sm:items-center">
        <div className="text-xs text-slate-400">
          {t("contests.create.list.pagination.pageIndicator", { page: currentPage })}
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={handlePreviousPage}
            disabled={!hasPreviousPage || isFetching}
            className="rounded-lg border border-slate-700 px-3 py-2 text-sm font-medium text-slate-200 transition hover:border-slate-500 hover:text-slate-50 disabled:cursor-not-allowed disabled:border-slate-800 disabled:text-slate-500"
          >
            {t("contests.create.list.pagination.previous")}
          </button>
          <button
            type="button"
            onClick={handleNextPage}
            disabled={!hasNextPage || isFetching}
            className="rounded-lg border border-slate-700 px-3 py-2 text-sm font-medium text-slate-200 transition hover:border-slate-500 hover:text-slate-50 disabled:cursor-not-allowed disabled:border-slate-800 disabled:text-slate-500"
          >
            {t("contests.create.list.pagination.next")}
          </button>
        </div>
      </footer>
    </section>
  );
}
