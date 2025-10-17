import type { CallRequest, LogEntry } from "../lib/types";

function triggerDownload(filename: string, content: string): void {
  const blob = new Blob([content], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

function timestampSuffix(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

export function exportLogs(logs: LogEntry[], filename?: string): void {
  const safeName = filename ?? `logs-${timestampSuffix()}.json`;
  const payload = logs.map((log) => ({
    ...log,
    timestamp: log.timestamp.toISOString(),
  }));
  triggerDownload(safeName, JSON.stringify(payload, null, 2));
}

export function exportCallHistory(
  calls: CallRequest[],
  filename?: string,
): void {
  const safeName = filename ?? `call-history-${timestampSuffix()}.json`;
  const payload = calls.map((call) => ({
    ...call,
    createdAt: call.createdAt.toISOString(),
    updatedAt: call.updatedAt.toISOString(),
  }));
  triggerDownload(safeName, JSON.stringify(payload, null, 2));
}
