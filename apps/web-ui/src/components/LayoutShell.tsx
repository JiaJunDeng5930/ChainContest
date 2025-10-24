"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

type NavigationItem = {
  href: string;
  labelKey: string;
};

const PRIMARY_NAVIGATION: NavigationItem[] = [
  { href: "/", labelKey: "nav.home" },
  { href: "/contests", labelKey: "nav.contests" },
  { href: "/contests/create", labelKey: "nav.myContests" },
  { href: "/profile/participation", labelKey: "nav.participation" },
  { href: "/runtime", labelKey: "nav.runtime" }
];

type LayoutShellProps = {
  children: ReactNode;
};

export function LayoutShell({ children }: LayoutShellProps) {
  const pathname = usePathname();
  const t = useTranslations();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:rounded focus:bg-slate-100 focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-slate-900"
      >
        {t("common.actions.skipToContent")}
      </a>

      <header className="border-b border-slate-800 bg-slate-950/70 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="text-lg font-semibold tracking-tight text-slate-50">
            {t("app.title")}
          </Link>
          <nav aria-label={t("nav.contests")}>
            <ul className="flex items-center gap-4 text-sm font-medium">
              {PRIMARY_NAVIGATION.map((item) => {
                const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={`rounded px-3 py-2 transition ${
                        isActive
                          ? "bg-slate-800 text-slate-50"
                          : "text-slate-300 hover:bg-slate-900 hover:text-slate-50"
                      }`}
                      aria-current={isActive ? "page" : undefined}
                    >
                      {t(item.labelKey)}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        </div>
      </header>

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
