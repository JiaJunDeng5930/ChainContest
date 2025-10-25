"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

import WalletConnectButton from "../features/auth/components/WalletConnectButton";
import useSession from "../features/auth/hooks/useSession";

type NavigationItem = {
  href: string;
  labelKey: string;
  requiresSession?: boolean;
  excludePaths?: string[];
};

const NAVIGATION_ITEMS: NavigationItem[] = [
  { href: "/", labelKey: "nav.home", requiresSession: false },
  { href: "/contests", labelKey: "nav.contests", requiresSession: true, excludePaths: ["/contests/create"] },
  { href: "/contests/create", labelKey: "nav.myContests", requiresSession: true },
  { href: "/profile/participation", labelKey: "nav.participation", requiresSession: true },
  { href: "/runtime", labelKey: "nav.runtime", requiresSession: true }
];

export default function Header() {
  const pathname = usePathname();
  const t = useTranslations();
  const session = useSession();

  return (
    <header className="border-b border-slate-800 bg-slate-950/70 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-8">
          <Link href="/" className="text-lg font-semibold tracking-tight text-slate-50">
            {t("app.title")}
          </Link>
          <nav aria-label={t("nav.contests")}>
            <ul className="flex flex-wrap items-center gap-2 text-sm font-medium">
              {NAVIGATION_ITEMS.map((item) => {
                const isExactMatch = pathname === item.href;
                const isNestedMatch =
                  !isExactMatch &&
                  item.href !== "/" &&
                  pathname.startsWith(`${item.href}/`) &&
                  !(item.excludePaths ?? []).some((excluded) => pathname.startsWith(excluded));
                const isActive = isExactMatch || isNestedMatch;
                const requiresSession = item.requiresSession ?? false;
                const isLocked = requiresSession && session.status !== "authenticated";

                if (isLocked) {
                  return (
                    <li key={item.href}>
                      <span
                        className="cursor-not-allowed rounded px-3 py-2 text-slate-500"
                        aria-disabled="true"
                        title={t("auth.guard.requiresLogin")}
                      >
                        {t(item.labelKey)}
                      </span>
                    </li>
                  );
                }

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
        <WalletConnectButton />
      </div>
    </header>
  );
}
