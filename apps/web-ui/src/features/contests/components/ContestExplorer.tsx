"use client";

import {
  CHAIN_METADATA,
  CONTEST_PHASES,
  CONTEST_PHASE_LABEL_KEYS,
  QUERY_KEYS,
  SUPPORTED_CHAIN_IDS,
  type ContestPhase
} from "@chaincontest/shared-i18n";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useMemo, useState, useTransition, type ChangeEvent } from "react";

import ErrorBanner from "../../../components/ErrorBanner";
import {
  fetchContestList,
  type ContestListQuery,
  type ContestListResponse,
  type ContestSnapshot
} from "../api/contests";
import ContestList from "./ContestList";
import ContestPagination from "./ContestPagination";

type ContestExplorerProps = {
  initialQuery: ContestListQuery;
};

type FilterState = {
  chainId: number | null;
  status: ContestPhase | null;
};

function isContestPhase(value: string): value is ContestPhase {
  return (CONTEST_PHASES as readonly string[]).includes(value);
}

function toQueryParams(filters: FilterState, cursor: string | null): ContestListQuery {
  return {
    chainId: filters.chainId ?? undefined,
    status: filters.status ?? undefined,
    cursor: cursor ?? undefined
  };
}

function buildNavigationUrl(pathname: string, filters: FilterState, cursor: string | null) {
  const params = new URLSearchParams();

  if (filters.chainId) {
    params.set("chainId", String(filters.chainId));
  }

  if (filters.status) {
    params.set("status", filters.status);
  }

  if (cursor) {
    params.set("cursor", cursor);
  }

  const queryString = params.toString();
  return queryString ? `${pathname}?${queryString}` : pathname;
}

export function ContestExplorer({ initialQuery }: ContestExplorerProps) {
  const t = useTranslations();
  const router = useRouter();
  const pathname = usePathname();
  const [isRouting, startTransition] = useTransition();

  const initialCursor = initialQuery.cursor ?? null;

  const [filters, setFilters] = useState<FilterState>({
    chainId: initialQuery.chainId ?? null,
    status: initialQuery.status ?? null
  });
  const [cursor, setCursor] = useState<string | null>(initialCursor);
  const [cursorHistory, setCursorHistory] = useState<Array<string | null>>(initialCursor ? [null] : []);

  const queryVariables = useMemo(() => toQueryParams(filters, cursor), [filters, cursor]);

  const contestsQuery = useQuery<ContestListResponse, Error>({
    queryKey: QUERY_KEYS.contests(queryVariables),
    queryFn: async () => fetchContestList(queryVariables),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    refetchOnWindowFocus: false
  });

  const navigateWithState = useCallback(
    (nextFilters: FilterState, nextCursor: string | null) => {
      const targetUrl = buildNavigationUrl(pathname, nextFilters, nextCursor);
      startTransition(() => {
        router.replace(targetUrl, { scroll: false });
      });
    },
    [pathname, router]
  );

  const handleChainChange = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => {
      const value = event.target.value;
      const nextChainId = value ? Number.parseInt(value, 10) : null;
      setFilters((previous) => {
        const nextFilters: FilterState = {
          chainId: Number.isFinite(nextChainId) && nextChainId ? nextChainId : null,
          status: previous.status
        };
        setCursor(null);
        setCursorHistory([]);
        navigateWithState(nextFilters, null);
        return nextFilters;
      });
    },
    [navigateWithState]
  );

  const handleStatusChange = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => {
      const value = event.target.value;
      setFilters((previous) => {
        const nextFilters: FilterState = {
          chainId: previous.chainId,
          status: value && isContestPhase(value) ? value : null
        };
        setCursor(null);
        setCursorHistory([]);
        navigateWithState(nextFilters, null);
        return nextFilters;
      });
    },
    [navigateWithState]
  );

  const handleResetFilters = useCallback(() => {
    const nextFilters: FilterState = {
      chainId: null,
      status: null
    };
    setFilters(nextFilters);
    setCursor(null);
    setCursorHistory([]);
    navigateWithState(nextFilters, null);
  }, [navigateWithState]);

  const handleRefresh = useCallback(async () => {
    await contestsQuery.refetch();
  }, [contestsQuery]);

  const nextCursor = contestsQuery.data?.nextCursor ?? null;

  const handleNextPage = useCallback(() => {
    if (!nextCursor) {
      return;
    }

    setCursorHistory((previous) => [...previous, cursor]);
    setCursor(nextCursor);
    navigateWithState(filters, nextCursor);
  }, [cursor, filters, navigateWithState, nextCursor]);

  const handlePreviousPage = useCallback(() => {
    if (!cursorHistory.length) {
      if (cursor !== null) {
        setCursor(null);
        navigateWithState(filters, null);
      }
      return;
    }

    const updatedHistory = [...cursorHistory];
    const previousCursorValue = updatedHistory.pop() ?? null;
    setCursorHistory(updatedHistory);
    setCursor(previousCursorValue);
    navigateWithState(filters, previousCursorValue);
  }, [cursor, cursorHistory, filters, navigateWithState]);

  const currentChainId = filters.chainId;
  const currentStatus = filters.status;

  const chainOptions = useMemo(
    () =>
      SUPPORTED_CHAIN_IDS.map((chainId) => ({
        id: chainId,
        label: t(CHAIN_METADATA[chainId].shortNameKey)
      })),
    [t]
  );

  const statusOptions = useMemo(
    () =>
      CONTEST_PHASES.map((phase) => ({
        id: phase,
        label: t(CONTEST_PHASE_LABEL_KEYS[phase])
      })),
    [t]
  );

  const isLoading = contestsQuery.isLoading;
  const isFetching = contestsQuery.isFetching && !contestsQuery.isLoading;
  const contestItems = contestsQuery.data?.items;
  const contests: ContestSnapshot[] = contestItems ? [...contestItems] : [];
  const hasNextPage = Boolean(nextCursor);
  const hasPreviousPage = cursorHistory.length > 0;
  const currentPage = cursorHistory.length + 1;
  const isPaginationBusy = isRouting || contestsQuery.isFetching;

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-wrap items-end gap-4">
          <label className="flex flex-col text-sm text-slate-200">
            <span className="mb-1 text-xs uppercase tracking-wide text-slate-400">
              {t("contests.filters.chain")}
            </span>
            <select
              value={currentChainId ?? ""}
              onChange={handleChainChange}
              disabled={isRouting}
              className="rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring focus:ring-slate-500/50"
            >
              <option value="">{t("contests.filters.allChains")}</option>
              {chainOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col text-sm text-slate-200">
            <span className="mb-1 text-xs uppercase tracking-wide text-slate-400">
              {t("contests.filters.status")}
            </span>
            <select
              value={currentStatus ?? ""}
              onChange={handleStatusChange}
              disabled={isRouting}
              className="rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring focus:ring-slate-500/50"
            >
              <option value="">{t("contests.filters.allStatuses")}</option>
              {statusOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={handleResetFilters}
            disabled={isRouting}
            className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-slate-500 hover:text-slate-50 focus:outline-none focus:ring focus:ring-slate-500/50"
          >
            {t("contests.filters.reset")}
          </button>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={isRouting || contestsQuery.isFetching}
            className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-slate-500 hover:text-slate-50 focus:outline-none focus:ring focus:ring-slate-500/50"
          >
            {t("contests.refresh")}
          </button>
        </div>
      </div>

      {contestsQuery.isError ? (
        <ErrorBanner error={contestsQuery.error} onRetry={handleRefresh} />
      ) : null}

      <ContestList items={contests} isLoading={isLoading} isFetching={isFetching} />

      <ContestPagination
        hasPreviousPage={hasPreviousPage}
        hasNextPage={hasNextPage}
        onPrevious={handlePreviousPage}
        onNext={handleNextPage}
        isBusy={isPaginationBusy}
        isInitialLoading={isLoading}
        currentPage={currentPage}
      />
    </section>
  );
}

export default ContestExplorer;
