import net from "node:net";
import os from "node:os";

import { execa } from "execa";
import { coerce, gte } from "semver";

import { DevEnvironmentConfig } from "../config/schema.js";
import { DevBootstrapError, ExitCode } from "./errors.js";

export type PreflightIssueLevel = "error" | "warning";

export interface PreflightIssue {
  level: PreflightIssueLevel;
  code: string;
  message: string;
  suggestion?: string;
}

export interface PortStatus {
  port: number;
  available: boolean;
  description?: string;
}

export interface PreflightDetails {
  docker?: {
    engineVersion?: string;
    composeVersion?: string;
  };
  system: {
    cpuCores: number;
    memoryGb: number;
  };
  ports: PortStatus[];
}

export interface PreflightCheckResult {
  passed: boolean;
  issues: PreflightIssue[];
  details: PreflightDetails;
}

export interface PreflightCheckOptions {
  config: DevEnvironmentConfig;
}

const bytesToGb = (bytes: number): number =>
  Math.round((bytes / 1024 / 1024 / 1024) * 10) / 10;

const readDockerEngineVersion = async (): Promise<string> => {
  const { stdout } = await execa("docker", [
    "version",
    "--format",
    "{{.Server.Version}}",
  ]);

  return stdout.trim();
};

const readComposeVersion = async (): Promise<string> => {
  const { stdout } = await execa("docker", ["compose", "version", "--short"]);
  return stdout.trim();
};

const isPortAvailable = (port: number): Promise<boolean> =>
  new Promise((resolve) => {
    const server = net.createServer();

    server.once("error", () => {
      resolve(false);
    });

    server.once("listening", () => {
      server.close(() => resolve(true));
    });

    server.listen({ port, host: "127.0.0.1", exclusive: true });
  });

const compareVersions = (
  actual: string | undefined,
  expected: string | undefined,
): boolean => {
  if (!actual || !expected) {
    return true;
  }

  const actualSemver = coerce(actual);
  const expectedSemver = coerce(expected);

  if (!actualSemver || !expectedSemver) {
    return true;
  }

  return gte(actualSemver, expectedSemver);
};

export class PreflightCheckError extends DevBootstrapError {
  constructor(message: string) {
    super(message, ExitCode.PreflightFailed);
  }
}

export const runPreflightChecks = async (
  options: PreflightCheckOptions,
): Promise<PreflightCheckResult> => {
  const issues: PreflightIssue[] = [];
  const details: PreflightDetails = {
    docker: {},
    system: {
      cpuCores: os.cpus().length,
      memoryGb: bytesToGb(os.totalmem()),
    },
    ports: [],
  };

  const { prerequisites } = options.config;

  try {
    const engineVersion = await readDockerEngineVersion();
    details.docker!.engineVersion = engineVersion;

    if (!compareVersions(engineVersion, prerequisites?.dockerVersion)) {
      issues.push({
        level: "error",
        code: "docker_version_insufficient",
        message: `Docker Engine 版本 ${engineVersion} 低于要求的 ${prerequisites?.dockerVersion}`,
        suggestion: "升级 Docker Desktop 或本地 Docker Engine。",
      });
    }
  } catch (error) {
    issues.push({
      level: "error",
      code: "docker_not_available",
      message: "无法检测 Docker Engine，请确认 docker CLI 可用并已启动。",
      suggestion: "启动 Docker 服务或在 PATH 中安装 docker 命令。",
    });
  }

  try {
    const composeVersion = await readComposeVersion();
    details.docker!.composeVersion = composeVersion;

    if (!compareVersions(composeVersion, prerequisites?.composeVersion)) {
      issues.push({
        level: "error",
        code: "compose_version_insufficient",
        message: `Docker Compose 版本 ${composeVersion} 低于要求的 ${prerequisites?.composeVersion}`,
        suggestion: "升级 Docker Compose v2，或更新 Docker Desktop。",
      });
    }
  } catch {
    issues.push({
      level: "error",
      code: "compose_not_available",
      message: "无法获取 Docker Compose 版本，请确认已启用 docker compose 插件。",
      suggestion: "使用 Docker Desktop 或安装 docker compose v2。",
    });
  }

  if (prerequisites?.cpuCores && details.system.cpuCores < prerequisites.cpuCores) {
    issues.push({
      level: "error",
      code: "insufficient_cpu",
      message: `当前机器 CPU 核心数 ${details.system.cpuCores} 少于要求的 ${prerequisites.cpuCores}`,
      suggestion: "在虚拟化环境调整 CPU 额度或修改配置阈值。",
    });
  }

  if (prerequisites?.memoryGb && details.system.memoryGb < prerequisites.memoryGb) {
    issues.push({
      level: "error",
      code: "insufficient_memory",
      message: `当前机器内存约 ${details.system.memoryGb}GB 少于要求的 ${prerequisites.memoryGb}GB`,
      suggestion: "释放内存、调整 Docker Desktop 资源或降低要求。",
    });
  }

  if (prerequisites?.portsInUse) {
    for (const portCheck of prerequisites.portsInUse) {
      const available = await isPortAvailable(portCheck.port);
      details.ports.push({
        port: portCheck.port,
        available,
        description: portCheck.description,
      });

      if (!available) {
        issues.push({
          level: "error",
          code: "port_in_use",
          message: `端口 ${portCheck.port} 已被占用${portCheck.description ? `（${portCheck.description}）` : ""}`,
          suggestion: "关闭占用进程或在配置中调整端口。",
        });
      }
    }
  }

  return {
    passed: issues.every((issue) => issue.level !== "error"),
    issues,
    details,
  };
};
