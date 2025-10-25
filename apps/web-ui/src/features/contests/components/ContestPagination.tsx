"use client";

import { useTranslations } from "next-intl";

type ContestPaginationProps = {
  hasPreviousPage: boolean;
  hasNextPage: boolean;
  onPrevious: () => void;
  onNext: () => void;
  isBusy: boolean;
  isInitialLoading: boolean;
  currentPage: number;
};

export function ContestPagination({
  hasPreviousPage,
  hasNextPage,
  onPrevious,
  onNext,
  isBusy,
  isInitialLoading,
  currentPage
}: ContestPaginationProps) {
  const t = useTranslations();

  if (isInitialLoading && !hasPreviousPage && !hasNextPage) {
    return null;
  }

  const disablePrevious = !hasPreviousPage || isBusy;
  const disableNext = !hasNextPage || isBusy;

  return (
    <nav
      aria-label={t("contests.pagination.ariaLabel")}
      className="flex flex-col items-center gap-3 border-t border-slate-800/60 pt-4 sm:flex-row sm:justify-between"
    >
      <button
        type="button"
        onClick={onPrevious}
        disabled={disablePrevious}
        className="w-full rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-slate-500 hover:text-slate-50 focus:outline-none focus:ring focus:ring-slate-500/50 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
      >
        {t("contests.pagination.previous")}
      </button>

      <span className="text-xs uppercase tracking-wide text-slate-400">
        {t("contests.pagination.pageIndicator", { page: currentPage })}
      </span>

      <button
        type="button"
        onClick={onNext}
        disabled={disableNext}
        className="w-full rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-slate-500 hover:text-slate-50 focus:outline-none focus:ring focus:ring-slate-500/50 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
      >
        {t("contests.pagination.next")}
      </button>
    </nav>
  );
}

export default ContestPagination;
