import { execa } from "execa";
import {
  DevEnvironmentConfig,
} from "../config/schema";
import {
  generateComposeFile,
  ComposeGenerationOptions,
  ComposeGenerationResult,
  DEFAULT_COMPOSE_DIR,
  DEFAULT_COMPOSE_FILENAME,
} from "../compose/generator";
import {
  runPreflightChecks,
  PreflightCheckResult,
} from "./preflight";
import {
  DevBootstrapError,
  ExitCode,
} from "./errors";

export interface ComposeServiceStatus {
  name: string;
  state: string;
  health?: string;
}

export interface StartEnvironmentOptions {
  config: DevEnvironmentConfig;
  composeDir?: string;
  composeFileName?: string;
  enableProfiles?: string[];
  disableProfiles?: string[];
  detach?: boolean;
}

export interface StartEnvironmentResult {
  projectName: string;
  composeFilePath: string;
  preflight: PreflightCheckResult;
  services: ComposeServiceStatus[];
  profiles: string[];
}

const determineProfiles = (
  config: DevEnvironmentConfig,
  enableProfiles: string[] = [],
  disableProfiles: string[] = [],
): string[] => {
  const enabled = new Set<string>(
    config.profiles
      .filter((profile) => profile.defaultEnabled)
      .map((profile) => profile.key),
  );

  for (const profile of enableProfiles) {
    enabled.add(profile);
  }

  for (const profile of disableProfiles) {
    enabled.delete(profile);
  }

  return Array.from(enabled);
};

const collectComposeStatuses = async (
  projectName: string,
  composeFilePath: string,
): Promise<ComposeServiceStatus[]> => {
  try {
    const { stdout } = await execa("docker", [
      "compose",
      "--project-name",
      projectName,
      "--file",
      composeFilePath,
      "ps",
      "--format",
      "json",
    ]);

    const lines = stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    if (lines.length === 0) {
      return [];
    }

    return lines.map((line) => {
      const parsed = JSON.parse(line) as Record<string, string>;
      return {
        name: parsed.Service ?? parsed.Name ?? "unknown",
        state: parsed.State ?? "unknown",
        health: parsed.Health ?? parsed.HealthStatus,
      };
    });
  } catch {
    try {
      const { stdout } = await execa("docker", [
        "compose",
        "--project-name",
        projectName,
        "--file",
        composeFilePath,
        "ps",
        "--services",
        "--all",
      ]);

      const services = stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0);

      return services.map((service) => ({
        name: service,
        state: "unknown",
      }));
    } catch {
      return [];
    }
  }
};

const normalizeComposeGenerationOptions = (
  options: StartEnvironmentOptions,
): ComposeGenerationOptions => ({
  config: options.config,
  outputDir: options.composeDir ?? DEFAULT_COMPOSE_DIR,
  fileName: options.composeFileName ?? DEFAULT_COMPOSE_FILENAME,
});

const runComposeUp = async (
  config: DevEnvironmentConfig,
  compose: ComposeGenerationResult,
  profiles: string[],
  detach: boolean,
): Promise<void> => {
  const args = [
    "compose",
    "--project-name",
    config.projectName,
    "--file",
    compose.filePath,
    ...profiles.flatMap((profile) => ["--profile", profile]),
    "up",
  ];

  if (detach) {
    args.push("--detach");
  }

  args.push("--remove-orphans");

  await execa("docker", args, {
    stdout: "inherit",
    stderr: "inherit",
  });
};

export class StartEnvironmentError extends DevBootstrapError {
  constructor(message: string, metadata?: Record<string, unknown>) {
    super(message, ExitCode.OrchestrationFailed, { metadata });
  }
}

export const startEnvironment = async (
  options: StartEnvironmentOptions,
): Promise<StartEnvironmentResult> => {
  const profiles = determineProfiles(
    options.config,
    options.enableProfiles,
    options.disableProfiles,
  );

  const preflight = await runPreflightChecks({ config: options.config });
  if (!preflight.passed) {
    throw new StartEnvironmentError(
      "预检未通过，无法启动环境",
      {
        issues: preflight.issues,
      },
    );
  }

  let composeResult: ComposeGenerationResult;
  try {
    composeResult = await generateComposeFile(
      normalizeComposeGenerationOptions(options),
    );
  } catch (error) {
    throw new StartEnvironmentError(
      "生成 Compose 配置失败",
      {
        cause: error instanceof Error ? error.message : String(error),
      },
    );
  }

  try {
    await runComposeUp(options.config, composeResult, profiles, options.detach ?? true);
  } catch (error) {
    throw new StartEnvironmentError(
      "执行 docker compose up 失败",
      {
        cause: error instanceof Error ? error.message : String(error),
        composeFile: composeResult.filePath,
      },
    );
  }

  const statuses = await collectComposeStatuses(
    options.config.projectName,
    composeResult.filePath,
  );

  return {
    projectName: options.config.projectName,
    composeFilePath: composeResult.filePath,
    preflight,
    services: statuses,
    profiles,
  };
};
