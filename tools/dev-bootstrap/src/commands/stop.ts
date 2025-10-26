import { ExitCode, isDevBootstrapError, resolveExitCode } from "../orchestration/errors";
import { loadDevEnvironmentConfig, LoadConfigOptions, LoadConfigResult } from "../config/loader";
import { createSummaryReporter, SummaryOutcome, SummaryReporter, SummaryReporterOptions } from "../reporters/summary";
import { stopEnvironment, StopEnvironmentOptions, StopEnvironmentResult } from "../orchestration/stop";

export interface StopCommandOptions extends LoadConfigOptions, Pick<StopEnvironmentOptions, "composeDir" | "composeFileName" | "removeVolumes"> {
  reporter?: SummaryReporter;
  reporterOptions?: SummaryReporterOptions;
}

export interface StopCommandResult {
  exitCode: ExitCode;
  summary: SummaryOutcome;
  sources: LoadConfigResult["sources"];
  config?: LoadConfigResult["config"];
  composeFilePath?: string;
  services?: StopEnvironmentResult["services"];
}

const mapServiceStatus = (services: string[]): SummaryOutcome["services"] =>
  services.map((service) => ({
    name: service,
    status: "stopped",
    details: "service stopped",
  }));

const buildSuccessMessages = (result: StopEnvironmentResult, removeVolumes: boolean | undefined): string[] => {
  const base = removeVolumes
    ? "已停止环境并移除全部卷"
    : "已停止环境（保留卷数据）";

  return [
    base,
    `涉及服务：${result.services.join(", ")}`,
  ];
};

const collectFailureMessages = (error: unknown): string[] => {
  if (isDevBootstrapError(error)) {
    return [error.message];
  }

  if (error instanceof Error) {
    return [error.message];
  }

  return ["发生未知错误"];
};

export const runStopCommand = async (
  options: StopCommandOptions = {},
): Promise<StopCommandResult> => {
  const startedAt = new Date();
  const reporter = options.reporter ?? createSummaryReporter(options.reporterOptions);

  let loadResult: LoadConfigResult | undefined;
  let stopResult: StopEnvironmentResult | undefined;

  try {
    loadResult = await loadDevEnvironmentConfig(options);
    stopResult = await stopEnvironment({
      config: loadResult.config,
      composeDir: options.composeDir,
      composeFileName: options.composeFileName,
      removeVolumes: options.removeVolumes ?? false,
    });

    const completedAt = new Date();
    reporter.setMetrics({
      serviceCount: stopResult.services.length,
      volumesRemoved: Boolean(options.removeVolumes),
    });

    const summary: SummaryOutcome = {
      command: "stop",
      status: "success",
      startedAt,
      completedAt,
      services: mapServiceStatus(stopResult.services),
      messages: buildSuccessMessages(stopResult, options.removeVolumes),
    };

    reporter.record(summary);
    reporter.flush();
    reporter.clearAnnotations();

    return {
      exitCode: ExitCode.Success,
      summary,
      sources: loadResult.sources,
      config: loadResult.config,
      composeFilePath: stopResult.composeFilePath,
      services: stopResult.services,
    };
  } catch (error) {
    const completedAt = new Date();
    const exitCode = resolveExitCode(error);
    const messages = collectFailureMessages(error);

    const summary: SummaryOutcome = {
      command: "stop",
      status: "error",
      startedAt,
      completedAt,
      services: stopResult ? mapServiceStatus(stopResult.services) : [],
      messages,
    };

    reporter.record(summary);
    reporter.flush();
    reporter.clearAnnotations();

    return {
      exitCode,
      summary,
      sources: loadResult?.sources ?? [],
      config: loadResult?.config,
      composeFilePath: stopResult?.composeFilePath,
      services: stopResult?.services,
    };
  }
};
