import { ZodError } from "zod";

import {
  ExitCode,
  isDevBootstrapError,
  resolveExitCode,
} from "../orchestration/errors.js";
import {
  loadDevEnvironmentConfig,
  LoadConfigOptions,
  LoadConfigResult,
} from "../config/loader.js";
import {
  createSummaryReporter,
  SummaryOutcome,
  SummaryReporter,
  SummaryReporterOptions,
} from "../reporters/summary.js";
import {
  buildValidationMessagesFromZod,
  renderValidationMessages,
} from "../reporters/validation.js";
import {
  startEnvironment,
  StartEnvironmentOptions,
  StartEnvironmentResult,
  ComposeServiceStatus,
} from "../orchestration/start.js";
import {
  PreflightIssue,
  PreflightCheckResult,
} from "../orchestration/preflight.js";

export interface StartCommandOptions
  extends LoadConfigOptions,
    Pick<StartEnvironmentOptions, "enableProfiles" | "disableProfiles" | "composeDir" | "composeFileName" | "detach"> {
  reporter?: SummaryReporter;
  reporterOptions?: SummaryReporterOptions;
}

export interface StartCommandResult {
  exitCode: ExitCode;
  summary: SummaryOutcome;
  sources: LoadConfigResult["sources"];
  config?: LoadConfigResult["config"];
  composeFilePath?: string;
  services?: ComposeServiceStatus[];
  preflight?: PreflightCheckResult;
  profiles?: string[];
}

const mapServiceStatus = (
  services: ComposeServiceStatus[] = [],
): SummaryOutcome["services"] =>
  services.map((service) => {
    const state = service.state.toLowerCase();
    let status: "starting" | "running" | "stopped" | "failed" = "starting";

    if (state.includes("running")) {
      status = "running";
    } else if (state.includes("exit") || state.includes("dead") || state.includes("error")) {
      status = "failed";
    } else if (state.includes("stopped")) {
      status = "stopped";
    }

    const details = service.health
      ? `health: ${service.health}`
      : service.state;

    return {
      name: service.name,
      status,
      details,
    };
  });

const renderPreflightIssues = (issues: PreflightIssue[] = []): string[] =>
  issues.map((issue) => {
    const prefix = issue.level === "warning" ? "⚠️" : "✗";
    return `${prefix} ${issue.message}`;
  });

const collectFailureMessages = (error: unknown): string[] => {
  if (isDevBootstrapError(error)) {
    if (error.cause instanceof ZodError) {
      return renderValidationMessages(
        buildValidationMessagesFromZod(error.cause),
      );
    }

    const issues = Array.isArray(error.metadata?.issues)
      ? (error.metadata.issues as PreflightIssue[])
      : [];

    if (issues.length > 0) {
      return renderPreflightIssues(issues);
    }

    return [error.message];
  }

  if (error instanceof ZodError) {
    return renderValidationMessages(buildValidationMessagesFromZod(error));
  }

  if (error instanceof Error) {
    return [error.message];
  }

  return ["发生未知错误"];
};

const buildSuccessMessages = (
  result: StartEnvironmentResult,
): string[] => {
  const profileMessage =
    result.profiles.length > 0
      ? `启用的 profiles：${result.profiles.join(", ")}`
      : "未启用额外 profiles（仅默认服务）";

  const composePath = result.composeFilePath.startsWith(process.cwd())
    ? pathRelativeToCwd(result.composeFilePath)
    : result.composeFilePath;

  const warningCount = result.preflight.issues.filter(
    (issue) => issue.level === "warning",
  ).length;

  const preflightMessage =
    warningCount > 0
      ? `预检通过，但包含 ${warningCount} 条警告`
      : "预检已通过，Docker 环境满足要求";

  return [
    preflightMessage,
    profileMessage,
    `已生成 Compose 文件：${composePath}`,
  ];
};

const pathRelativeToCwd = (target: string): string => {
  const cwd = process.cwd();
  return target.startsWith(cwd)
    ? `.${target.slice(cwd.length)}`
    : target;
};

export const runStartCommand = async (
  options: StartCommandOptions = {},
): Promise<StartCommandResult> => {
  const startedAt = new Date();
  const reporter =
    options.reporter ?? createSummaryReporter(options.reporterOptions);

  let loadResult: LoadConfigResult | undefined;
  let startResult: StartEnvironmentResult | undefined;

  try {
    loadResult = await loadDevEnvironmentConfig(options);

    startResult = await startEnvironment({
      config: loadResult.config,
      composeDir: options.composeDir,
      composeFileName: options.composeFileName,
      enableProfiles: options.enableProfiles,
      disableProfiles: options.disableProfiles,
      detach: options.detach ?? true,
    });

    const completedAt = new Date();
    const summary: SummaryOutcome = {
      command: "start",
      status: "success",
      startedAt,
      completedAt,
      services: mapServiceStatus(startResult.services),
      messages: buildSuccessMessages(startResult),
    };

    reporter.record(summary);
    reporter.flush();

    return {
      exitCode: ExitCode.Success,
      summary,
      sources: loadResult.sources,
      config: loadResult.config,
      composeFilePath: startResult.composeFilePath,
      services: startResult.services,
      preflight: startResult.preflight,
      profiles: startResult.profiles,
    };
  } catch (error) {
    const completedAt = new Date();
    const exitCode = resolveExitCode(error);
    const messages = collectFailureMessages(error);

    const summary: SummaryOutcome = {
      command: "start",
      status: "error",
      startedAt,
      completedAt,
      services: startResult ? mapServiceStatus(startResult.services) : [],
      messages,
    };

    reporter.record(summary);
    reporter.flush();

    return {
      exitCode,
      summary,
      sources: loadResult?.sources ?? [],
      config: loadResult?.config,
      composeFilePath: startResult?.composeFilePath,
      services: startResult?.services,
      preflight: startResult?.preflight,
      profiles: startResult?.profiles,
    };
  }
};
