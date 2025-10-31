export const SUPPORTED_LOCALES = ["en", "zh-CN"] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export const CONTEST_PHASES = ["registration", "active", "settled", "closed"] as const;
export type ContestPhase = (typeof CONTEST_PHASES)[number];

export const CONTEST_PHASE_LABEL_KEYS: Record<ContestPhase, string> = {
  registration: "contests.status.registration",
  active: "contests.status.active",
  settled: "contests.status.settled",
  closed: "contests.status.closed"
};

export const CONTEST_SORT_OPTIONS = {
  LATEST: "latest",
  EXPIRING: "expiring",
  HIGHEST_PRIZE: "highestPrize"
} as const;

export type ContestSortOption = (typeof CONTEST_SORT_OPTIONS)[keyof typeof CONTEST_SORT_OPTIONS];

export const CONTEST_SORT_LABEL_KEYS: Record<ContestSortOption, string> = {
  latest: "contests.sort.latest",
  expiring: "contests.sort.expiring",
  highestPrize: "contests.sort.highestPrize"
};

export const CHAIN_METADATA = {
  1: {
    id: 1,
    nameKey: "chains.1.name",
    shortNameKey: "chains.1.shortName",
    nativeCurrencySymbol: "ETH"
  },
  31337: {
    id: 31337,
    nameKey: "chains.31337.name",
    shortNameKey: "chains.31337.shortName",
    nativeCurrencySymbol: "ETH"
  },
  11155111: {
    id: 11155111,
    nameKey: "chains.11155111.name",
    shortNameKey: "chains.11155111.shortName",
    nativeCurrencySymbol: "ETH"
  }
} as const;

export type SupportedChainId = (typeof CHAIN_METADATA)[keyof typeof CHAIN_METADATA]["id"];

export const SUPPORTED_CHAIN_IDS = Object.values(CHAIN_METADATA).map((chain) => chain.id) as SupportedChainId[];

export const DEFAULT_CONTEST_PAGE_SIZE = 25;

export const QUERY_KEYS = {
  runtimeConfig: ["runtime-config"] as const,
  session: ["session", "current"] as const,
  contests: <T extends object>(params: T) => ["contests", params] as const,
  contestDetail: (contestId: string) => ["contest-detail", contestId] as const,
  creatorContests: <T extends object>(params: T) => ["creator-contests", params] as const,
  participationHistory: <T extends object>(params: T) => ["participation-history", params] as const,
  participationSummary: <T extends object>(params: T) => ["participation-summary", params] as const
};

export const ERROR_MESSAGE_KEYS = {
  generic: "errors.fallback",
  network: "errors.network",
  timeout: "errors.timeout",
  unauthorized: "errors.unauthorized",
  forbidden: "errors.forbidden",
  notFound: "errors.notFound",
  validation: "errors.validation",
  chainMismatch: "errors.chainMismatch"
} as const;

export const RUNTIME_CONFIG_REFRESH_INTERVAL_MS = 60_000;
