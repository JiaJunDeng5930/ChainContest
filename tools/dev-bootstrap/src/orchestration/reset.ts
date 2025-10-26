import { promises as fs } from "node:fs";
import path from "node:path";

import { execa } from "execa";

import { DevEnvironmentConfig } from "../config/schema";
import { stopEnvironment, StopEnvironmentOptions, StopEnvironmentResult } from "./stop";
import { DevBootstrapError, ExitCode } from "./errors";

export type ResetMode = "preserve" | "selective" | "full";

export interface ResetEnvironmentOptions
  extends Omit<StopEnvironmentOptions, "removeVolumes"> {
  mode?: ResetMode;
  selectiveVolumes?: string[];
}

export interface ResetEnvironmentResult {
  mode: ResetMode;
  projectName: string;
  composeFilePath: string;
  services: string[];
  removedVolumes: string[];
}

export class ResetEnvironmentError extends DevBootstrapError {
  constructor(message: string, metadata?: Record<string, unknown>) {
    super(message, ExitCode.TeardownFailed, { metadata });
  }
}

const determineMode = (
  config: DevEnvironmentConfig,
  requested?: ResetMode,
): ResetMode => requested ?? config.resetPolicy?.mode ?? "preserve";

const determineSelectiveVolumes = (
  config: DevEnvironmentConfig,
  requested?: string[],
): string[] => {
  if (requested && requested.length > 0) {
    return requested;
  }

  return config.resetPolicy?.selectiveVolumes ?? [];
};

const resolveVolumeRule = (
  config: DevEnvironmentConfig,
  volumeName: string,
) => config.volumes.find((volume) => volume.name === volumeName);

const dockerVolumeName = (projectName: string, volumeName: string): string =>
  `${projectName}_${volumeName}`;

const removeDockerVolume = async (qualifiedName: string): Promise<void> => {
  await execa("docker", ["volume", "rm", qualifiedName]);
};

const removeBindPath = async (targetPath: string): Promise<void> => {
  const absolute = path.isAbsolute(targetPath)
    ? targetPath
    : path.join(process.cwd(), targetPath);
  await fs.rm(absolute, { recursive: true, force: true });
};

export const resetEnvironment = async (
  options: ResetEnvironmentOptions,
): Promise<ResetEnvironmentResult> => {
  const mode = determineMode(options.config, options.mode);
  const selectiveVolumes = determineSelectiveVolumes(
    options.config,
    options.selectiveVolumes,
  );

  if (mode === "selective" && selectiveVolumes.length === 0) {
    throw new ResetEnvironmentError("选择性重置要求至少指定一个卷名称");
  }

  const missingVolume = selectiveVolumes.find(
    (volumeName) => !resolveVolumeRule(options.config, volumeName),
  );

  if (missingVolume) {
    throw new ResetEnvironmentError(
      `未在配置中找到卷 ${missingVolume}`,
      {
        volume: missingVolume,
      },
    );
  }

  let stopResult: StopEnvironmentResult;
  try {
    stopResult = await stopEnvironment({
      config: options.config,
      composeDir: options.composeDir,
      composeFileName: options.composeFileName,
      removeVolumes: mode === "full",
    });
  } catch (error) {
    throw new ResetEnvironmentError(
      "停止环境失败，无法继续重置",
      {
        cause: error instanceof Error ? error.message : String(error),
      },
    );
  }

  const removedVolumes: string[] = [];

  if (mode === "full") {
    removedVolumes.push(...options.config.volumes.map((volume) => volume.name));
  }

  if (mode === "selective") {
    for (const volumeName of selectiveVolumes) {
      const volumeRule = resolveVolumeRule(options.config, volumeName);
      if (!volumeRule) {
        continue;
      }

      try {
        if (volumeRule.path) {
          await removeBindPath(volumeRule.path);
        } else {
          await removeDockerVolume(
            dockerVolumeName(options.config.projectName, volumeName),
          );
        }
        removedVolumes.push(volumeName);
      } catch (error) {
        throw new ResetEnvironmentError(
          `清理卷 ${volumeName} 时失败`,
          {
            cause: error instanceof Error ? error.message : String(error),
            volume: volumeName,
          },
        );
      }
    }
  }

  return {
    mode,
    projectName: stopResult.projectName,
    composeFilePath: stopResult.composeFilePath,
    services: stopResult.services,
    removedVolumes,
  };
};
