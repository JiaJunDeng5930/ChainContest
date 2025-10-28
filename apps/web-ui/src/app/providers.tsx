"use client";

import "@rainbow-me/rainbowkit/styles.css";

import type { SupportedLocale } from "@chaincontest/shared-i18n";
import { RainbowKitProvider, getDefaultConfig, type Locale } from "@rainbow-me/rainbowkit";
import { QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { useEffect, useMemo, useState, type ReactNode } from "react";
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
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? process.env.API_BASE_URL ?? "";

  const rainbowLocale = useMemo<Locale>(() => RAINBOWKIT_LOCALE_MAP[locale] ?? "en", [locale]);
  const defaultTimeZone = "UTC";
  const nestedMessages = useMemo(() => {
    const accumulator: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(messages)) {
      const segments = key.split(".");
      let current: Record<string, unknown> = accumulator;
      segments.forEach((segment, index) => {
        const isLeaf = index === segments.length - 1;
        if (isLeaf) {
          current[segment] = value;
          return;
        }
        if (!current[segment] || typeof current[segment] !== "object") {
          current[segment] = {};
        }
        current = current[segment] as Record<string, unknown>;
      });
    }
    return accumulator;
  }, [messages]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      (window as typeof window & { __CHAINCONTEST_QUERY_CLIENT__?: typeof queryClient }).__CHAINCONTEST_QUERY_CLIENT__ =
        queryClient;
      if (apiBaseUrl) {
        (window as typeof window & { __CHAINCONTEST_API_BASE_URL?: string }).__CHAINCONTEST_API_BASE_URL = apiBaseUrl;
      }
    }
  }, [apiBaseUrl, queryClient]);

  if (typeof window !== "undefined") {
    (window as typeof window & { __CHAINCONTEST_QUERY_CLIENT__?: typeof queryClient }).__CHAINCONTEST_QUERY_CLIENT__ =
      queryClient;
  }

  return (
    <NextIntlClientProvider locale={locale} messages={nestedMessages} timeZone={defaultTimeZone}>
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
