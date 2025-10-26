import { execa } from "execa";

import { DevEnvironmentConfig } from "../config/schema";
import {
  generateComposeFile,
  ComposeGenerationResult,
  DEFAULT_COMPOSE_DIR,
  DEFAULT_COMPOSE_FILENAME,
} from "../compose/generator";
import { DevBootstrapError, ExitCode } from "./errors";

export interface StopEnvironmentOptions {
  config: DevEnvironmentConfig;
  composeDir?: string;
  composeFileName?: string;
  removeVolumes?: boolean;
}

export interface StopEnvironmentResult {
  projectName: string;
  composeFilePath: string;
  services: string[];
}

const normalizeComposeOptions = (
  options: StopEnvironmentOptions,
): { composeDir: string; composeFileName: string } => ({
  composeDir: options.composeDir ?? DEFAULT_COMPOSE_DIR,
  composeFileName: options.composeFileName ?? DEFAULT_COMPOSE_FILENAME,
});

const runComposeDown = async (
  config: DevEnvironmentConfig,
  compose: ComposeGenerationResult,
  removeVolumes: boolean,
): Promise<void> => {
  const args = [
    "compose",
    "--project-name",
    config.projectName,
    "--file",
    compose.filePath,
    "down",
    "--remove-orphans",
  ];

  if (removeVolumes) {
    args.push("--volumes");
  }

  await execa("docker", args, {
    stdout: "inherit",
    stderr: "inherit",
  });
};

export class StopEnvironmentError extends DevBootstrapError {
  constructor(message: string, metadata?: Record<string, unknown>) {
    super(message, ExitCode.TeardownFailed, { metadata });
  }
}

export const stopEnvironment = async (
  options: StopEnvironmentOptions,
): Promise<StopEnvironmentResult> => {
  const { composeDir, composeFileName } = normalizeComposeOptions(options);

  let composeResult: ComposeGenerationResult;
  try {
    composeResult = await generateComposeFile({
      config: options.config,
      outputDir: composeDir,
      fileName: composeFileName,
    });
  } catch (error) {
    throw new StopEnvironmentError(
      "生成 Compose 配置失败",
      {
        cause: error instanceof Error ? error.message : String(error),
      },
    );
  }

  try {
    await runComposeDown(
      options.config,
      composeResult,
      options.removeVolumes ?? false,
    );
  } catch (error) {
    throw new StopEnvironmentError(
      "执行 docker compose down 失败",
      {
        cause: error instanceof Error ? error.message : String(error),
        composeFile: composeResult.filePath,
      },
    );
  }

  return {
    projectName: options.config.projectName,
    composeFilePath: composeResult.filePath,
    services: options.config.services.map((service) => service.name),
  };
};
