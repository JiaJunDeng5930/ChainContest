import type { LogEntry, LogLevel, LogSource } from "../lib/types";

export interface LogMessage {
  level: LogLevel;
  source: LogSource;
  message: string;
  context?: Record<string, unknown>;
}

type Listener = (entry: LogEntry) => void;

export class LogPipeline {
  private readonly logs: LogEntry[] = [];
  private readonly listeners = new Set<Listener>();

  push(message: LogMessage): LogEntry {
    const entry: LogEntry = {
      id: crypto.randomUUID(),
      level: message.level,
      source: message.source,
      message: message.message,
      context: message.context,
      timestamp: new Date(),
    };

    this.logs.push(entry);
    this.listeners.forEach((listener) => {
      try {
        listener(entry);
      } catch (error) {
        console.error("Log listener failed", error);
      }
    });

    return entry;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  list(): LogEntry[] {
    return [...this.logs];
  }

  clear(): void {
    this.logs.length = 0;
  }
}
