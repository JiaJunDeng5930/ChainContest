import { ApiError } from "./api/client";

export type InteractionAction =
  | "registration-plan"
  | "registration-execute"
  | "reward-plan"
  | "reward-execute"
  | "settlement-execute"
  | "principal-plan"
  | "principal-execute"
  | "rebalance-plan"
  | "rebalance-execute";

export type TelemetryStage = "start" | "success" | "error";

export type TelemetryAnchor = {
  blockNumber?: number | string;
  blockHash?: string | null;
  timestamp?: string;
} | null;

export type TelemetryEvent = {
  action: InteractionAction;
  stage: TelemetryStage;
  contestId: string;
  chainId: number;
  walletAddress?: string | null;
  status?: string;
  anchor?: TelemetryAnchor;
  metadata?: Record<string, unknown>;
  error?: {
    name?: string;
    message: string;
    status?: number;
    code?: string;
  } | null;
  elapsedMs?: number;
  timestamp: string;
};

export type TelemetryReporter = (event: TelemetryEvent) => void;

const reporters = new Set<TelemetryReporter>();
const timerStore = new Map<string, number>();

function getHighResolutionTime(): number {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

function buildTimerKey(
  action: InteractionAction,
  contestId: string,
  chainId: number,
  walletAddress?: string | null
): string {
  return [action, contestId, chainId, walletAddress ?? "anonymous"].join("|");
}

function serializeError(error: unknown): TelemetryEvent["error"] {
  if (!error) {
    return null;
  }

  if (error instanceof ApiError) {
    return {
      name: error.name,
      message: error.message,
      status: error.status
    };
  }

  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message
    };
  }

  if (typeof error === "string") {
    return {
      message: error
    };
  }

  if (typeof error === "object") {
    const record = error as Record<string, unknown>;
    const message = typeof record.message === "string" ? record.message : JSON.stringify(record);
    const status =
      typeof record.status === "number"
        ? record.status
        : typeof record.statusCode === "number"
          ? record.statusCode
          : undefined;
    const code = typeof record.code === "string" ? record.code : undefined;
    return {
      message,
      status,
      code
    };
  }

  return {
    message: String(error)
  };
}

function notify(event: TelemetryEvent) {
  reporters.forEach((reporter) => {
    try {
      reporter(event);
    } catch (error) {
      if (process.env.NODE_ENV !== "production" && typeof console !== "undefined") {
        console.error("[telemetry] reporter error", error);
      }
    }
  });

  if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
    window.dispatchEvent(new CustomEvent("chaincontest:telemetry", { detail: event }));
  }
}

export function registerTelemetryReporter(reporter: TelemetryReporter): () => void {
  reporters.add(reporter);
  return () => {
    reporters.delete(reporter);
  };
}

registerTelemetryReporter((event) => {
  if (typeof console === "undefined") {
    return;
  }

  const summary = `${event.action}:${event.stage}`;
  if (event.error) {
    console.error("[telemetry]", summary, event);
    return;
  }
  console.debug("[telemetry]", summary, event);
});

type TrackInteractionInput = {
  action: InteractionAction;
  stage: TelemetryStage;
  contestId: string;
  chainId: number;
  walletAddress?: string | null;
  status?: string;
  anchor?: TelemetryAnchor;
  metadata?: Record<string, unknown>;
  error?: unknown;
};

export function trackInteraction({
  action,
  stage,
  contestId,
  chainId,
  walletAddress,
  status,
  anchor,
  metadata,
  error
}: TrackInteractionInput) {
  const timerKey = buildTimerKey(action, contestId, chainId, walletAddress);

  if (stage === "start") {
    timerStore.set(timerKey, getHighResolutionTime());
  }

  let elapsedMs: number | undefined;
  if (stage !== "start") {
    const startedAt = timerStore.get(timerKey);
    if (typeof startedAt === "number") {
      elapsedMs = Math.max(getHighResolutionTime() - startedAt, 0);
      timerStore.delete(timerKey);
    }
  }

  const event: TelemetryEvent = {
    action,
    stage,
    contestId,
    chainId,
    walletAddress,
    status,
    anchor: anchor ?? null,
    metadata,
    error: stage === "error" ? serializeError(error) : null,
    elapsedMs,
    timestamp: new Date().toISOString()
  };

  notify(event);
}
