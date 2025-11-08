"use client";

import "@rainbow-me/rainbowkit/styles.css";

import type { SupportedLocale } from "@chaincontest/shared-i18n";
import { RainbowKitProvider, getDefaultConfig, type Locale } from "@rainbow-me/rainbowkit";
import { QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider, type AbstractIntlMessages } from "next-intl";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { WagmiProvider } from "wagmi";
import { http } from "wagmi";
import { hardhat, mainnet, sepolia } from "wagmi/chains";

import { createQueryClient } from "../lib/api/client";

type ProvidersProps = {
  children: ReactNode;
  locale: SupportedLocale;
  messages: Record<string, string>;
};

const APP_NAME = "ChainContest";
const SUPPORTED_CHAINS = [mainnet, sepolia, hardhat] as const;

const resolveHardhatRpcUrl = (): string => {
  const normalize = (value: string | undefined): string | undefined => {
    if (!value) {
      return undefined;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  };

  if (typeof window !== "undefined") {
    const explicitBrowser = normalize(process.env.NEXT_PUBLIC_HARDHAT_RPC_URL);
    if (explicitBrowser) {
      return explicitBrowser;
    }
    const { protocol, hostname } = window.location;
    return `${protocol}//${hostname}:8545`;
  }

  return (
    normalize(process.env.HARDHAT_RPC_URL) ??
    normalize(process.env.NEXT_PUBLIC_HARDHAT_RPC_URL) ??
    "http://hardhat-node:8545"
  );
};

const buildTransports = () =>
  SUPPORTED_CHAINS.reduce<
    Record<
      (typeof SUPPORTED_CHAINS)[number]["id"],
      ReturnType<typeof http>
    >
  >((acc, chain) => {
    if (chain.id === hardhat.id) {
      acc[chain.id] = http(resolveHardhatRpcUrl());
      return acc;
    }
    acc[chain.id] = http();
    return acc;
  }, {} as Record<(typeof SUPPORTED_CHAINS)[number]["id"], ReturnType<typeof http>>);

const walletConnectProjectId =
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "00000000000000000000000000000000";

const RAINBOWKIT_LOCALE_MAP: Record<SupportedLocale, Locale> = {
  en: "en",
  "zh-CN": "zh-CN"
};

export function AppProviders({ children, locale, messages }: ProvidersProps) {
  const [queryClient] = useState(() => createQueryClient());
  const [wagmiConfig] = useState(() =>
    getDefaultConfig({
      appName: APP_NAME,
      chains: SUPPORTED_CHAINS,
      projectId: walletConnectProjectId,
      transports: buildTransports(),
      ssr: true
    })
  );
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? process.env.API_BASE_URL ?? "";

  const rainbowLocale = useMemo<Locale>(() => RAINBOWKIT_LOCALE_MAP[locale] ?? "en", [locale]);
  const defaultTimeZone = "UTC";
  const isIntlMessageRecord = useCallback((candidate: unknown): candidate is AbstractIntlMessages => {
    return Boolean(candidate) && typeof candidate === "object" && !Array.isArray(candidate);
  }, []);
  const nestedMessages = useMemo<AbstractIntlMessages>(() => {
    const accumulator: AbstractIntlMessages = {};

    const ensureNestedSegment = (container: AbstractIntlMessages, segment: string): AbstractIntlMessages => {
      const existing = container[segment];
      if (isIntlMessageRecord(existing)) {
        return existing;
      }

      const next: AbstractIntlMessages = {};
      container[segment] = next;
      return next;
    };

    for (const [key, value] of Object.entries(messages)) {
      const segments = key.split(".");
      let current = accumulator;

      segments.forEach((segment, index) => {
        const isLeaf = index === segments.length - 1;
        if (isLeaf) {
          current[segment] = value;
          return;
        }

        current = ensureNestedSegment(current, segment);
      });
    }

    return accumulator;
  }, [isIntlMessageRecord, messages]);

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
