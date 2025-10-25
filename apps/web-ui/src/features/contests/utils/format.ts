import {
  CHAIN_METADATA,
  CONTEST_PHASE_LABEL_KEYS,
  type ContestPhase
} from "@chaincontest/shared-i18n";
import { useMemo } from "react";
import { formatEther } from "viem";

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
  numberFormatter
}: {
  value: string;
  chainId: number;
  numberFormatter: Intl.NumberFormat;
}): string {
  const metadata = CHAIN_METADATA[chainId as keyof typeof CHAIN_METADATA];
  const symbol = metadata?.nativeCurrencySymbol ?? "ETH";

  try {
    const etherValue = formatEther(BigInt(value));
    const numeric = Number.parseFloat(etherValue);
    if (!Number.isFinite(numeric)) {
      return `${etherValue} ${symbol}`;
    }
    return `${numberFormatter.format(numeric)} ${symbol}`;
  } catch (_error) {
    return `${value} ${symbol}`;
  }
}

export function formatContestTimestamp(timestamp: string, formatter: Intl.DateTimeFormat): string {
  try {
    return formatter.format(new Date(timestamp));
  } catch (_error) {
    return timestamp;
  }
}
