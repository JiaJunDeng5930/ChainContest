"use client";

import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import useErrorPresenter from "../lib/errors/useErrorPresenter";

type ErrorBannerProps = {
  error: unknown;
  onRetry?: () => void;
  className?: string;
  footerSlot?: ReactNode;
};

function composeClassName(base: string, extra?: string) {
  return extra ? `${base} ${extra}` : base;
}

export function ErrorBanner({ error, onRetry, className, footerSlot }: ErrorBannerProps) {
  const presentError = useErrorPresenter();
  const t = useTranslations();

  if (!error) {
    return null;
  }

  const presented = presentError(error);

  return (
    <div
      role="alert"
      className={composeClassName(
        "rounded-lg border border-rose-500/70 bg-rose-950/80 p-4 text-sm text-rose-100 shadow-lg shadow-rose-900/40",
        className
      )}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex-1">
          <p className="font-semibold tracking-tight text-rose-50">{presented.headline}</p>
          {presented.description ? <p className="mt-1 text-rose-200">{presented.description}</p> : null}
          {presented.detailItems?.length ? (
            <ul className="mt-2 space-y-1 text-rose-200">
              {presented.detailItems.map((item) => (
                <li key={item} className="list-disc pl-5">
                  {item}
                </li>
              ))}
            </ul>
          ) : null}
          {footerSlot ? <div className="mt-4 text-rose-200">{footerSlot}</div> : null}
        </div>
        {onRetry && presented.retryable ? (
          <button
            type="button"
            onClick={onRetry}
            className="self-end rounded border border-rose-400 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-rose-100 transition focus:outline-none focus:ring focus:ring-rose-400 focus:ring-offset-2 focus:ring-offset-rose-900 hover:bg-rose-400 hover:text-rose-950"
          >
            {t("common.actions.retry")}
          </button>
        ) : null}
      </div>
      {presented.code || presented.status ? (
        <div className="mt-3 flex flex-wrap gap-4 text-xs text-rose-300">
          {presented.status ? <span>Status: {presented.status}</span> : null}
          {presented.code ? <span>Code: {presented.code}</span> : null}
        </div>
      ) : null}
    </div>
  );
}

export default ErrorBanner;
