import { ZodError } from "zod";

export enum ExitCode {
  Success = 0,
  ConfigFileNotFound = 10,
  ConfigParseFailed = 11,
  ConfigValidationFailed = 12,
  PreflightFailed = 20,
  OrchestrationFailed = 30,
  TeardownFailed = 31,
  UnexpectedError = 99,
}

export interface DevBootstrapErrorOptions {
  cause?: unknown;
  metadata?: Record<string, unknown>;
}

export class DevBootstrapError extends Error {
  public readonly exitCode: ExitCode;

  public readonly metadata: Record<string, unknown>;

  constructor(
    message: string,
    exitCode: ExitCode,
    options: DevBootstrapErrorOptions = {},
  ) {
    super(message, { cause: options.cause });
    this.name = this.constructor.name;
    this.exitCode = exitCode;
    this.metadata = options.metadata ?? {};
  }
}

export class ConfigFileNotFoundError extends DevBootstrapError {
  constructor(path: string, options: DevBootstrapErrorOptions = {}) {
    super(`未找到配置文件：${path}`, ExitCode.ConfigFileNotFound, {
      ...options,
      metadata: {
        ...(options.metadata ?? {}),
        path,
      },
    });
  }
}

export class ConfigParseError extends DevBootstrapError {
  constructor(message: string, options: DevBootstrapErrorOptions = {}) {
    super(message, ExitCode.ConfigParseFailed, options);
  }
}

export class ConfigValidationError extends DevBootstrapError {
  constructor(
    issues: string[],
    options: DevBootstrapErrorOptions = {},
  ) {
    super("配置校验失败", ExitCode.ConfigValidationFailed, {
      ...options,
      metadata: {
        ...(options.metadata ?? {}),
        issues,
      },
    });
  }
}

export class PreflightCheckError extends DevBootstrapError {
  constructor(message: string, options: DevBootstrapErrorOptions = {}) {
    super(message, ExitCode.PreflightFailed, options);
  }
}

export class OrchestrationError extends DevBootstrapError {
  constructor(message: string, options: DevBootstrapErrorOptions = {}) {
    super(message, ExitCode.OrchestrationFailed, options);
  }
}

export class TeardownError extends DevBootstrapError {
  constructor(message: string, options: DevBootstrapErrorOptions = {}) {
    super(message, ExitCode.TeardownFailed, options);
  }
}

export const isDevBootstrapError = (
  error: unknown,
): error is DevBootstrapError => error instanceof DevBootstrapError;

export const extractIssuesFromZodError = (error: ZodError): string[] =>
  error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join(".") : "<root>";
    return `${path}: ${issue.message}`;
  });

export const resolveExitCode = (error: unknown): ExitCode => {
  if (isDevBootstrapError(error)) {
    return error.exitCode;
  }

  if (error instanceof ZodError) {
    return ExitCode.ConfigValidationFailed;
  }

  return ExitCode.UnexpectedError;
};
