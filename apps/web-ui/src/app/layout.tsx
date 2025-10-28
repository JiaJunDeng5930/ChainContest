import "../styles/globals.css";

import { loadMessages } from "@chaincontest/shared-i18n";
import type { Metadata } from "next";
import { unstable_setRequestLocale } from "next-intl/server";
import type { ReactNode } from "react";

import { AppProviders } from "./providers";
import LayoutShell from "../components/LayoutShell";
import NetworkGate from "../features/network/NetworkGate";
import { resolveRequestLocale } from "../lib/i18n/requestLocale";

export const metadata: Metadata = {
  title: "ChainContest",
  description: "ChainContest web experience"
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = resolveRequestLocale();
  const messages = await loadMessages(locale);
  unstable_setRequestLocale(locale);

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
