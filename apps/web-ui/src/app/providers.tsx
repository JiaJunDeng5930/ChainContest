"use client";

import "@rainbow-me/rainbowkit/styles.css";

import type { SupportedLocale } from "@chaincontest/shared-i18n";
import { RainbowKitProvider, getDefaultConfig, type Locale } from "@rainbow-me/rainbowkit";
import { QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { useMemo, useState, type ReactNode } from "react";
import { WagmiProvider } from "wagmi";
import { http } from "wagmi";
import { mainnet, sepolia } from "wagmi/chains";

import { createQueryClient } from "../lib/api/client";

type ProvidersProps = {
  children: ReactNode;
  locale: SupportedLocale;
  messages: Record<string, string>;
};

const APP_NAME = "ChainContest";
const SUPPORTED_CHAINS = [mainnet, sepolia] as const;

const transports = SUPPORTED_CHAINS.reduce<
  Record<
    (typeof SUPPORTED_CHAINS)[number]["id"],
    ReturnType<typeof http>
  >
>(
  (acc, chain) => {
    acc[chain.id] = http();
    return acc;
  },
  {} as Record<(typeof SUPPORTED_CHAINS)[number]["id"], ReturnType<typeof http>>
);

const walletConnectProjectId =
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "00000000000000000000000000000000";

const wagmiConfig = getDefaultConfig({
  appName: APP_NAME,
  chains: SUPPORTED_CHAINS,
  projectId: walletConnectProjectId,
  transports,
  ssr: true
});

const RAINBOWKIT_LOCALE_MAP: Record<SupportedLocale, Locale> = {
  en: "en",
  "zh-CN": "zh-CN"
};

export function AppProviders({ children, locale, messages }: ProvidersProps) {
  const [queryClient] = useState(() => createQueryClient());

  const rainbowLocale = useMemo<Locale>(() => RAINBOWKIT_LOCALE_MAP[locale] ?? "en", [locale]);

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <QueryClientProvider client={queryClient}>
        <WagmiProvider config={wagmiConfig}>
          <RainbowKitProvider locale={rainbowLocale}>
            {children}
          </RainbowKitProvider>
        </WagmiProvider>
      </QueryClientProvider>
    </NextIntlClientProvider>
  );
}
