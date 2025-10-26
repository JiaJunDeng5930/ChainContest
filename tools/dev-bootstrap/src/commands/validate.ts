import { ZodError } from "zod";

import {
  ExitCode,
  extractIssuesFromZodError,
  isDevBootstrapError,
  resolveExitCode,
} from "../orchestration/errors";
import {
  loadDevEnvironmentConfig,
  LoadConfigOptions,
  LoadConfigResult,
} from "../config/loader";
import {
  createSummaryReporter,
  SummaryOutcome,
  SummaryReporter,
  SummaryReporterOptions,
} from "../reporters/summary";

export interface ValidateCommandOptions extends LoadConfigOptions {
  reporter?: SummaryReporter;
  reporterOptions?: SummaryReporterOptions;
}

export interface ValidateCommandResult {
  exitCode: ExitCode;
  summary: SummaryOutcome;
  sources: LoadConfigResult["sources"];
  config?: LoadConfigResult["config"];
}

const collectFailureMessages = (error: unknown): string[] => {
  if (isDevBootstrapError(error)) {
    const issues = Array.isArray(error.metadata.issues)
      ? error.metadata.issues.map((issue) => String(issue))
      : [];

    return issues.length > 0 ? issues : [error.message];
  }

  if (error instanceof ZodError) {
    return extractIssuesFromZodError(error);
  }

  if (error instanceof Error) {
    return [error.message];
  }

  return ["发生未知错误"];
};

const deriveFailureSources = (
  error: unknown,
): LoadConfigResult["sources"] => {
  if (!isDevBootstrapError(error)) {
    return [];
  }

  const attemptedPath =
    typeof error.metadata.path === "string" ? error.metadata.path : undefined;

  if (!attemptedPath) {
    return [];
  }

  return [
    {
      path: attemptedPath,
      optional: Boolean(error.metadata.optional ?? false),
      exists: false,
    },
  ];
};

export const runValidateCommand = async (
  options: ValidateCommandOptions = {},
): Promise<ValidateCommandResult> => {
  const startedAt = new Date();
  const reporter =
    options.reporter ?? createSummaryReporter(options.reporterOptions);

  try {
    const loadResult = await loadDevEnvironmentConfig(options);

    const completedAt = new Date();
    const baseSource = loadResult.sources.find((source) => !source.optional);

    const summary: SummaryOutcome = {
      command: "validate",
      status: "success",
      startedAt,
      completedAt,
      services: loadResult.config.services.map((service) => ({
        name: service.name,
        status: "stopped",
        details: `validated service definition with ${service.profiles.length} profile link(s)`,
      })),
      messages: [
        `主配置文件：${baseSource?.path ?? "未知"}`,
        `已验证配置文件，服务数量：${loadResult.config.services.length}`,
        `已检测可选配置文件：${loadResult.sources
          .filter((source) => source.optional && source.exists)
          .map((source) => source.path)
          .join(", ") || "无"}`,
      ],
    };

    reporter.record(summary);
    reporter.flush();

    return {
      exitCode: ExitCode.Success,
      summary,
      sources: loadResult.sources,
      config: loadResult.config,
    };
  } catch (error) {
    const completedAt = new Date();
    const exitCode = resolveExitCode(error);
    const messages = collectFailureMessages(error);

    const summary: SummaryOutcome = {
      command: "validate",
      status: "error",
      startedAt,
      completedAt,
      services: [],
      messages,
    };

    reporter.record(summary);
    reporter.flush();

    return {
      exitCode,
      summary,
      sources: deriveFailureSources(error),
    };
  }
};
