import { createWriteStream, WriteStream } from "node:fs";
import { promises as fs } from "node:fs";
import path from "node:path";

export type LogLevel = "info" | "warn" | "error";

export interface LogStreamEvent {
  timestamp: string;
  source: string;
  level: LogLevel;
  message: string;
  details?: Record<string, unknown>;
}

export interface LogStreamOptions {
  ndjsonPath?: string;
  retainRawLogs?: boolean;
  rawLogPath?: string;
}

export class LogStreamReporter {
  private readonly options: LogStreamOptions;

  private ndjsonStream: WriteStream | null = null;

  private rawStream: WriteStream | null = null;

  constructor(options: LogStreamOptions = {}) {
    this.options = options;
  }

  public async recordEvent(
    event: Omit<LogStreamEvent, "timestamp">,
  ): Promise<void> {
    if (!this.options.ndjsonPath) {
      return;
    }

    const entry: LogStreamEvent = {
      ...event,
      timestamp: new Date().toISOString(),
    };

    await this.ensureNdjsonStream();
    this.ndjsonStream!.write(`${JSON.stringify(entry)}\n`);
  }

  public async recordRawChunk(chunk: string): Promise<void> {
    if (!this.options.retainRawLogs) {
      return;
    }

    await this.ensureRawStream();
    this.rawStream!.write(chunk);
  }

  public async close(): Promise<void> {
    await Promise.all([
      this.closeStream(this.ndjsonStream),
      this.closeStream(this.rawStream),
    ]);
    this.ndjsonStream = null;
    this.rawStream = null;
  }

  private async ensureNdjsonStream(): Promise<void> {
    if (this.ndjsonStream || !this.options.ndjsonPath) {
      return;
    }

    const directory = path.dirname(this.options.ndjsonPath);
    await fs.mkdir(directory, { recursive: true });
    this.ndjsonStream = createWriteStream(this.options.ndjsonPath, {
      flags: "a",
    });
  }

  private async ensureRawStream(): Promise<void> {
    if (this.rawStream || !this.options.retainRawLogs) {
      return;
    }

    const rawPath = this.options.rawLogPath ??
      (this.options.ndjsonPath
        ? path.join(path.dirname(this.options.ndjsonPath), "compose.log")
        : path.join(process.cwd(), ".dev-bootstrap", "compose.log"));

    const directory = path.dirname(rawPath);
    await fs.mkdir(directory, { recursive: true });
    this.rawStream = createWriteStream(rawPath, {
      flags: "a",
    });
  }

  private async closeStream(stream: WriteStream | null): Promise<void> {
    if (!stream) {
      return;
    }

    await new Promise<void>((resolve, reject) => {
      stream.end((error?: Error | null) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }
}
