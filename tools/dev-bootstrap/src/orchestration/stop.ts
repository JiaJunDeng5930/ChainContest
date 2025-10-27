import { execa } from "execa";

import { DevEnvironmentConfig } from "../config/schema.js";
import {
  generateComposeFile,
  ComposeGenerationResult,
  DEFAULT_COMPOSE_DIR,
  DEFAULT_COMPOSE_FILENAME,
} from "../compose/generator.js";
import { DevBootstrapError, ExitCode } from "./errors.js";

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

const listProjectResources = async (
  projectName: string,
  type: "container" | "volume" | "network",
): Promise<string[]> => {
  const label = `com.docker.compose.project=${projectName}`;
  const formatFlag = type === "container" ? "{{.ID}}" : "{{.Name}}";
  const baseArgs =
    type === "container"
      ? ["ps", "--all", "--filter", `label=${label}`, "--format", formatFlag]
      : type === "volume"
        ? ["volume", "ls", "--filter", `label=${label}`, "--format", formatFlag]
        : ["network", "ls", "--filter", `label=${label}`, "--format", formatFlag];

  try {
    const { stdout } = await execa("docker", baseArgs);
    return stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  } catch {
    return [];
  }
};

const forceRemoveContainers = async (containerIds: string[]): Promise<void> => {
  if (containerIds.length === 0) {
    return;
  }

  await execa("docker", ["rm", "-f", ...containerIds], {
    stdout: "inherit",
    stderr: "inherit",
  });
};

const forceRemoveVolumes = async (volumeNames: string[]): Promise<void> => {
  if (volumeNames.length === 0) {
    return;
  }

  await execa("docker", ["volume", "rm", ...volumeNames], {
    stdout: "inherit",
    stderr: "inherit",
  });
};

const forceRemoveNetworks = async (networkNames: string[]): Promise<void> => {
  if (networkNames.length === 0) {
    return;
  }

  await execa("docker", ["network", "rm", ...networkNames], {
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

  const remainingContainers = await listProjectResources(
    options.config.projectName,
    "container",
  );

  if (remainingContainers.length > 0) {
    try {
      await forceRemoveContainers(remainingContainers);
    } catch (error) {
      throw new StopEnvironmentError(
        "强制移除残留容器失败",
        {
          cause: error instanceof Error ? error.message : String(error),
          containers: remainingContainers,
        },
      );
    }
  }

  if (options.removeVolumes) {
    const remainingVolumes = await listProjectResources(
      options.config.projectName,
      "volume",
    );

    if (remainingVolumes.length > 0) {
      try {
        await forceRemoveVolumes(remainingVolumes);
      } catch (error) {
        throw new StopEnvironmentError(
          "强制移除残留卷失败",
          {
            cause: error instanceof Error ? error.message : String(error),
            volumes: remainingVolumes,
          },
        );
      }
    }
  }

  const remainingNetworks = await listProjectResources(
    options.config.projectName,
    "network",
  );

  if (remainingNetworks.length > 0) {
    try {
      await forceRemoveNetworks(remainingNetworks);
    } catch (error) {
      throw new StopEnvironmentError(
        "强制移除残留网络失败",
        {
          cause: error instanceof Error ? error.message : String(error),
          networks: remainingNetworks,
        },
      );
    }
  }

  return {
    projectName: options.config.projectName,
    composeFilePath: composeResult.filePath,
    services: options.config.services.map((service) => service.name),
  };
};
