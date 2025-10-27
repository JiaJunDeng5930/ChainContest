import { ExitCode, isDevBootstrapError, resolveExitCode } from "../orchestration/errors.js";
import { loadDevEnvironmentConfig, LoadConfigOptions, LoadConfigResult } from "../config/loader.js";
import { createSummaryReporter, SummaryOutcome, SummaryReporter, SummaryReporterOptions } from "../reporters/summary.js";
import { resetEnvironment, ResetEnvironmentOptions, ResetEnvironmentResult } from "../orchestration/reset.js";

export interface ResetCommandOptions extends LoadConfigOptions, Pick<ResetEnvironmentOptions, "composeDir" | "composeFileName" | "mode" | "selectiveVolumes"> {
  reporter?: SummaryReporter;
  reporterOptions?: SummaryReporterOptions;
}

export interface ResetCommandResult {
  exitCode: ExitCode;
  summary: SummaryOutcome;
  sources: LoadConfigResult["sources"];
  config?: LoadConfigResult["config"];
  composeFilePath?: string;
  services?: string[];
  removedVolumes?: string[];
  mode?: ResetEnvironmentResult["mode"];
}

const mapServiceStatus = (services: string[]): SummaryOutcome["services"] =>
  services.map((service) => ({
    name: service,
    status: "stopped",
    details: "service stopped",
  }));

const buildSuccessMessages = (result: ResetEnvironmentResult): string[] => {
  const volumeMessage = (() => {
    if (result.mode === "full") {
      return "已移除全部 Compose 卷";
    }

    if (result.mode === "selective") {
      return result.removedVolumes.length > 0
        ? `已移除卷：${result.removedVolumes.join(", ")}`
        : "未移除任何卷（配置未匹配）";
    }

    return "仅停止容器，保留卷数据";
  })();

  return [
    `重置模式：${result.mode}`,
    volumeMessage,
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

export const runResetCommand = async (
  options: ResetCommandOptions = {},
): Promise<ResetCommandResult> => {
  const startedAt = new Date();
  const reporter = options.reporter ?? createSummaryReporter(options.reporterOptions);

  let loadResult: LoadConfigResult | undefined;
  let resetResult: ResetEnvironmentResult | undefined;

  try {
    loadResult = await loadDevEnvironmentConfig(options);
    resetResult = await resetEnvironment({
      config: loadResult.config,
      composeDir: options.composeDir,
      composeFileName: options.composeFileName,
      mode: options.mode,
      selectiveVolumes: options.selectiveVolumes,
    });

    const requestedSelective = resetResult.mode === "selective"
      ? options.selectiveVolumes && options.selectiveVolumes.length > 0
        ? options.selectiveVolumes
        : loadResult.config.resetPolicy?.selectiveVolumes ?? []
      : [];

    if (resetResult.mode === "selective" && resetResult.removedVolumes.length === 0) {
      reporter.addWarning("未移除任何卷，请确认选择的卷名称是否存在并未被保留。");
    }

    reporter.setMetrics({
      serviceCount: resetResult.services.length,
      removedVolumeCount: resetResult.removedVolumes.length,
      requestedVolumeCount: requestedSelective.length,
      mode: resetResult.mode,
    });

    const completedAt = new Date();
    const summary: SummaryOutcome = {
      command: "reset",
      status: "success",
      startedAt,
      completedAt,
      services: mapServiceStatus(resetResult.services),
      messages: buildSuccessMessages(resetResult),
    };

    reporter.record(summary);
    reporter.flush();
    reporter.clearAnnotations();

    return {
      exitCode: ExitCode.Success,
      summary,
      sources: loadResult.sources,
      config: loadResult.config,
      composeFilePath: resetResult.composeFilePath,
      services: resetResult.services,
      removedVolumes: resetResult.removedVolumes,
      mode: resetResult.mode,
    };
  } catch (error) {
    const completedAt = new Date();
    const exitCode = resolveExitCode(error);
    const messages = collectFailureMessages(error);

    const summary: SummaryOutcome = {
      command: "reset",
      status: "error",
      startedAt,
      completedAt,
      services: resetResult ? mapServiceStatus(resetResult.services) : [],
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
      composeFilePath: resetResult?.composeFilePath,
      services: resetResult?.services,
      removedVolumes: resetResult?.removedVolumes,
      mode: resetResult?.mode,
    };
  }
};
