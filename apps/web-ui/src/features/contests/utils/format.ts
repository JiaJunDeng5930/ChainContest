import {
  CHAIN_METADATA,
  CONTEST_PHASE_LABEL_KEYS,
  type ContestPhase
} from "@chaincontest/shared-i18n";
import { useMemo } from "react";
import { formatUnits } from "viem";

export function truncateIdentifier(value: string, prefixLength = 6, suffixLength = 4): string {
  if (value.length <= prefixLength + suffixLength) {
    return value;
  }

  return `${value.slice(0, prefixLength)}…${value.slice(-suffixLength)}`;
}

export function getChainLabel(chainId: number, translate: (key: string) => string): string {
  const metadata = CHAIN_METADATA[chainId as keyof typeof CHAIN_METADATA];
  if (!metadata) {
    return `Chain ${chainId}`;
  }

  return translate(metadata.shortNameKey);
}

export function getPhaseLabel(phase: ContestPhase, translate: (key: string) => string): string {
  const key = CONTEST_PHASE_LABEL_KEYS[phase];
  return translate(key);
}

export function useContestNumberFormatter(locale: string) {
  return useMemo(
    () =>
      new Intl.NumberFormat(locale, {
        maximumFractionDigits: 4,
        notation: "standard"
      }),
    [locale]
  );
}

export function useContestDateTimeFormatter(locale: string) {
  return useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        year: "numeric",
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit"
      }),
    [locale]
  );
}

export function formatPrizeAmount({
  value,
  chainId,
  numberFormatter,
  decimals,
  symbol
}: {
  value: string;
  chainId: number;
  numberFormatter: Intl.NumberFormat;
  decimals?: number;
  symbol?: string;
}): string {
  const metadata = CHAIN_METADATA[chainId as keyof typeof CHAIN_METADATA];
  const resolvedSymbol = symbol ?? metadata?.nativeCurrencySymbol ?? "ETH";
  const resolvedDecimals = typeof decimals === "number" && Number.isFinite(decimals) ? decimals : 18;

  try {
    const formattedValue = formatUnits(BigInt(value), resolvedDecimals);
    const numeric = Number.parseFloat(formattedValue);
    if (!Number.isFinite(numeric)) {
      return `${formattedValue} ${resolvedSymbol}`;
    }
    return `${numberFormatter.format(numeric)} ${resolvedSymbol}`;
  } catch (_error) {
    return `${value} ${resolvedSymbol}`;
  }
}

export function formatContestTimestamp(timestamp: string, formatter: Intl.DateTimeFormat): string {
  try {
    return formatter.format(new Date(timestamp));
  } catch (_error) {
    return timestamp;
  }
}
