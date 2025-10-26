type SummaryCommand = "validate" | "start" | "stop" | "reset";
type SummaryStatus = "success" | "warning" | "error";
type ServiceLifecycleStatus = "starting" | "running" | "stopped" | "failed";

export interface ServiceSummary {
  name: string;
  status: ServiceLifecycleStatus;
  details?: string;
}

export interface SummaryOutcome {
  command: SummaryCommand;
  status: SummaryStatus;
  startedAt: Date;
  completedAt: Date;
  services: ServiceSummary[];
  messages: string[];
}

export interface SummaryReporterOptions {
  outputFormat?: "table" | "json" | "both";
  writer?: (chunk: string) => void;
}

const formatDuration = (startedAt: Date, completedAt: Date): string => {
  const duration = completedAt.getTime() - startedAt.getTime();
  if (duration <= 0) {
    return "0ms";
  }

  if (duration < 1_000) {
    return `${duration}ms`;
  }

  const seconds = duration / 1_000;
  if (seconds < 60) {
    return `${seconds.toFixed(2)}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remaining = seconds - minutes * 60;
  return `${minutes}m ${remaining.toFixed(1)}s`;
};

const serializeOutcome = (outcome: SummaryOutcome): Record<string, unknown> => ({
  command: outcome.command,
  status: outcome.status,
  startedAt: outcome.startedAt.toISOString(),
  completedAt: outcome.completedAt.toISOString(),
  durationMs: outcome.completedAt.getTime() - outcome.startedAt.getTime(),
  services: outcome.services.map((service) => ({
    name: service.name,
    status: service.status,
    details: service.details,
  })),
  messages: [...outcome.messages],
});

const renderServiceTable = (services: ServiceSummary[]): string => {
  if (services.length === 0) {
    return "No services tracked.";
  }

  const header = ["Service", "Status", "Details"];
  const rows = services.map((service) => [
    service.name,
    service.status,
    service.details ?? "",
  ]);
  const widths = header.map((h, index) =>
    Math.max(
      h.length,
      ...rows.map((row) => row[index].length),
    ),
  );

  const renderRow = (columns: string[]): string =>
    columns
      .map((column, index) => column.padEnd(widths[index]))
      .join("  ");

  const lines = [
    renderRow(header),
    renderRow(widths.map((width) => "-".repeat(width))),
    ...rows.map(renderRow),
  ];

  return lines.join("\n");
};

export class SummaryReporter {
  private readonly writer: (chunk: string) => void;

  private format: "table" | "json" | "both";

  private recordedOutcome: SummaryOutcome | null = null;

  constructor(options: SummaryReporterOptions = {}) {
    this.writer = options.writer ?? ((chunk) => process.stdout.write(chunk));
    this.format = options.outputFormat ?? "table";
  }

  public record(outcome: SummaryOutcome): void {
    this.recordedOutcome = {
      ...outcome,
      services: outcome.services.map((service) => ({ ...service })),
      messages: [...outcome.messages],
    };
  }

  public setFormat(format: "table" | "json" | "both"): void {
    this.format = format;
  }

  public flush(): void {
    if (!this.recordedOutcome) {
      throw new Error("尚未记录任何命令执行结果，无法渲染摘要");
    }

    const outcome = this.recordedOutcome;
    const duration = formatDuration(outcome.startedAt, outcome.completedAt);

    if (this.format === "json" || this.format === "both") {
      this.writer(
        `${JSON.stringify(serializeOutcome(outcome), null, 2)}\n`,
      );
    }

    if (this.format === "table" || this.format === "both") {
      const headerLines = [
        `Command : ${outcome.command}`,
        `Status  : ${outcome.status.toUpperCase()} (${duration})`,
        `Started : ${outcome.startedAt.toISOString()}`,
        `Ended   : ${outcome.completedAt.toISOString()}`,
      ];

      const messageLines = outcome.messages.length
        ? ["Messages:", ...outcome.messages.map((message) => `  - ${message}`)]
        : ["Messages: (none)"];

      const serviceSection = ["Services:", renderServiceTable(outcome.services)];

      this.writer(
        `${[...headerLines, "", ...messageLines, "", ...serviceSection].join("\n")}\n`,
      );
    }
  }

  public getOutcome(): SummaryOutcome | null {
    return this.recordedOutcome;
  }
}

export const createSummaryReporter = (
  options?: SummaryReporterOptions,
): SummaryReporter => new SummaryReporter(options);
