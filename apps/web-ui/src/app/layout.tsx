import "../styles/globals.css";

import { loadMessages, SUPPORTED_LOCALES, type SupportedLocale } from "@chaincontest/shared-i18n";
import type { Metadata } from "next";
import { headers } from "next/headers";
import type { ReactNode } from "react";

import { AppProviders } from "./providers";
import LayoutShell from "../components/LayoutShell";
import NetworkGate from "../features/network/NetworkGate";

export const metadata: Metadata = {
  title: "ChainContest",
  description: "ChainContest web experience"
};

const DEFAULT_LOCALE: SupportedLocale = "en";

function resolveLocale(): SupportedLocale {
  const acceptLanguage = headers().get("accept-language");
  if (!acceptLanguage) {
    return DEFAULT_LOCALE;
  }

  const requested = acceptLanguage
    .split(",")
    .map((value) => value.split(";")[0]?.trim().toLowerCase())
    .filter(Boolean) as string[];

  for (const candidate of requested) {
    const exact = SUPPORTED_LOCALES.find((locale) => locale.toLowerCase() === candidate);
    if (exact) {
      return exact;
    }

    const base = candidate.split("-")[0] ?? candidate;
    const partial = SUPPORTED_LOCALES.find((locale) => locale.toLowerCase().startsWith(base));
    if (partial) {
      return partial;
    }
  }

  return DEFAULT_LOCALE;
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = resolveLocale();
  const messages = await loadMessages(locale);

  return (
    <html lang={locale} className="h-full">
      <body className="min-h-screen bg-slate-950 text-slate-100 antialiased">
        <AppProviders locale={locale} messages={messages}>
          <LayoutShell>
            <NetworkGate>{children}</NetworkGate>
          </LayoutShell>
        </AppProviders>
      </body>
    </html>
  );
}
