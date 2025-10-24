"use client";

import "@rainbow-me/rainbowkit/styles.css";

import type { SupportedLocale } from "@chaincontest/shared-i18n";
import {
  RainbowKitProvider,
  coinbaseWallet,
  connectorsForWallets,
  injectedWallet,
  walletConnectWallet
} from "@rainbow-me/rainbowkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useMemo, useState, type ReactNode } from "react";
import { WagmiConfig, createConfig, http } from "wagmi";
import { mainnet, sepolia } from "wagmi/chains";
import { NextIntlClientProvider } from "next-intl";

type ProvidersProps = {
  children: ReactNode;
  locale: SupportedLocale;
  messages: Record<string, string>;
};

const APP_NAME = "ChainContest";
const SUPPORTED_CHAINS = [mainnet, sepolia] as const;

const wagmiTransports = SUPPORTED_CHAINS.reduce<Record<number, ReturnType<typeof http>>>((acc, chain) => {
  acc[chain.id] = http();
  return acc;
}, {});

const walletConnectProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "";

const recommendedWallets = [
  injectedWallet({ chains: SUPPORTED_CHAINS }),
  coinbaseWallet({ chains: SUPPORTED_CHAINS, appName: APP_NAME })
];

if (walletConnectProjectId) {
  recommendedWallets.push(
    walletConnectWallet({
      chains: SUPPORTED_CHAINS,
      projectId: walletConnectProjectId
    })
  );
}

const wagmiConfig = createConfig({
  autoConnect: true,
  connectors: connectorsForWallets([
    {
      groupName: "Recommended",
      wallets: recommendedWallets
    }
  ]),
  transports: wagmiTransports,
  ssr: true
});

export function AppProviders({ children, locale, messages }: ProvidersProps) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            refetchOnWindowFocus: false,
            retry: 1
          },
          mutations: {
            retry: 0
          }
        }
      })
  );

  const rainbowLocale = useMemo(() => locale.replace("_", "-"), [locale]);

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <QueryClientProvider client={queryClient}>
        <WagmiConfig config={wagmiConfig}>
          <RainbowKitProvider chains={SUPPORTED_CHAINS} locale={rainbowLocale}>
            {children}
          </RainbowKitProvider>
        </WagmiConfig>
      </QueryClientProvider>
    </NextIntlClientProvider>
  );
}
