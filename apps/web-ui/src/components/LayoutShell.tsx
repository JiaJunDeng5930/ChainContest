"use client";

import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import Header from "./Header";

type LayoutShellProps = {
  children: ReactNode;
};

export function LayoutShell({ children }: LayoutShellProps) {
  const t = useTranslations();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:rounded focus:bg-slate-100 focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-slate-900"
      >
        {t("common.actions.skipToContent")}
      </a>

      <Header />

      <main id="main-content" className="mx-auto max-w-6xl px-6 py-8">
        {children}
      </main>

      <footer className="border-t border-slate-800 bg-slate-950/70">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-6 py-6 text-sm text-slate-400 sm:flex-row sm:items-center sm:justify-between">
          <p>{t("app.tagline")}</p>
          <p>&copy; {new Date().getFullYear()} ChainContest</p>
        </div>
      </footer>
    </div>
  );
}

export default LayoutShell;
