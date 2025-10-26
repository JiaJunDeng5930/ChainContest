import { createWriteStream, WriteStream } from "node:fs";
import { promises as fs } from "node:fs";
import path from "node:path";

import { ComposeServiceStatus } from "../orchestration/start";
import { PreflightCheckResult } from "../orchestration/preflight";

export type RuntimeEventType =
  | "preflight"
  | "compose"
  | "service-status"
  | "readiness"
  | "summary";

export interface RuntimeEvent {
  timestamp: string;
  type: RuntimeEventType;
  payload: Record<string, unknown>;
}

export interface RuntimeReporterOptions {
  ndjsonPath?: string;
}

export interface ServiceRuntimeState extends ComposeServiceStatus {
  lastUpdated: string;
}

export interface ReadinessSnapshot {
  ready: boolean;
  running: string[];
  pending: string[];
  failed: string[];
}

export class RuntimeReporter {
  private readonly options: RuntimeReporterOptions;

  private writeStream: WriteStream | null = null;

  private readonly events: RuntimeEvent[] = [];

  private readonly serviceStates = new Map<string, ServiceRuntimeState>();

  constructor(options: RuntimeReporterOptions = {}) {
    this.options = options;
  }

  public async recordPreflight(result: PreflightCheckResult): Promise<void> {
    await this.writeEvent({
      type: "preflight",
      payload: {
        passed: result.passed,
        issues: result.issues,
        system: result.details.system,
        docker: result.details.docker,
      },
    });
  }

  public async recordComposeEvent(payload: Record<string, unknown>): Promise<void> {
    await this.writeEvent({
      type: "compose",
      payload,
    });
  }

  public async recordServiceStatuses(
    statuses: ComposeServiceStatus[],
  ): Promise<void> {
    const timestamp = new Date().toISOString();

    statuses.forEach((status) => {
      this.serviceStates.set(status.name, {
        ...status,
        lastUpdated: timestamp,
      });
    });

    await this.writeEvent({
      type: "service-status",
      payload: {
        services: statuses,
      },
    });

    await this.writeEvent({
      type: "readiness",
      payload: this.getReadinessSnapshot(),
    });
  }

  public async recordSummary(payload: Record<string, unknown>): Promise<void> {
    await this.writeEvent({
      type: "summary",
      payload,
    });
  }

  public getServiceStates(): ServiceRuntimeState[] {
    return Array.from(this.serviceStates.values());
  }

  public getEvents(): RuntimeEvent[] {
    return [...this.events];
  }

  public getReadinessSnapshot(): ReadinessSnapshot {
    const allStates = this.getServiceStates();

    const running: string[] = [];
    const failed: string[] = [];
    const pending: string[] = [];

    allStates.forEach((state) => {
      const normalized = state.state.toLowerCase();
      if (normalized.includes("running")) {
        running.push(state.name);
      } else if (
        normalized.includes("exit") ||
        normalized.includes("dead") ||
        normalized.includes("error")
      ) {
        failed.push(state.name);
      } else {
        pending.push(state.name);
      }
    });

    return {
      ready: pending.length === 0 && failed.length === 0 && running.length > 0,
      running,
      pending,
      failed,
    };
  }

  public async close(): Promise<void> {
    if (this.writeStream) {
      await new Promise<void>((resolve, reject) => {
        this.writeStream!.end((error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      });
      this.writeStream = null;
    }
  }

  private async writeEvent(event: Omit<RuntimeEvent, "timestamp">): Promise<void> {
    const entry: RuntimeEvent = {
      ...event,
      timestamp: new Date().toISOString(),
    };

    this.events.push(entry);

    if (!this.options.ndjsonPath) {
      return;
    }

    if (!this.writeStream) {
      await this.initializeStream();
    }

    this.writeStream!.write(`${JSON.stringify(entry)}\n`);
  }

  private async initializeStream(): Promise<void> {
    if (!this.options.ndjsonPath) {
      return;
    }

    const directory = path.dirname(this.options.ndjsonPath);
    await fs.mkdir(directory, { recursive: true });
    this.writeStream = createWriteStream(this.options.ndjsonPath, {
      flags: "a",
    });
  }
}
