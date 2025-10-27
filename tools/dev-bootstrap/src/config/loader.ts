import { promises as fs } from "node:fs";
import path from "node:path";
import { parseDocument } from "yaml";
import { ZodError } from "zod";

import {
  ConfigFileNotFoundError,
  ConfigParseError,
  ConfigValidationError,
  extractIssuesFromZodError,
} from "../orchestration/errors.js";
import {
  DevEnvironmentConfig,
  devEnvironmentConfigSchema,
} from "./schema.js";

const DEFAULT_CONFIG_FILENAME = "dev-bootstrap.config.yaml";
const DEFAULT_OVERRIDE_FILENAME = "dev-bootstrap.config.local.yaml";

type PlainObject = Record<string, unknown>;

export interface LoadConfigOptions {
  rootDir?: string;
  configPath?: string;
  overridePath?: string;
}

export interface ConfigSourceDescriptor {
  path: string;
  optional: boolean;
  exists: boolean;
}

export interface LoadConfigResult {
  config: DevEnvironmentConfig;
  rawConfig: PlainObject;
  sources: ConfigSourceDescriptor[];
}

const isPlainObject = (value: unknown): value is PlainObject =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const readYamlFile = async (
  absolutePath: string,
): Promise<{ exists: boolean; payload?: unknown }> => {
  try {
    const content = await fs.readFile(absolutePath, "utf8");
    if (content.trim().length === 0) {
      return { exists: true, payload: {} };
    }

    const document = parseDocument(content);
    if (document.errors.length > 0) {
      const [error] = document.errors;
      throw new ConfigParseError(
        `无法解析配置文件：${absolutePath}`,
        { cause: error, metadata: { path: absolutePath } },
      );
    }

    return { exists: true, payload: document.toJSON() };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { exists: false };
    }

    if (error instanceof ConfigParseError) {
      throw error;
    }

    throw new ConfigParseError(
      `读取配置文件失败：${absolutePath}`,
      { cause: error, metadata: { path: absolutePath } },
    );
  }
};

const ensurePlainObject = (value: unknown, label: string): PlainObject => {
  if (!isPlainObject(value)) {
    throw new ConfigParseError(
      `配置文件 ${label} 必须是对象结构`,
      { metadata: { path: label } },
    );
  }

  return value;
};

const mergeObjects = (base: PlainObject, override: PlainObject): PlainObject => {
  const merged: PlainObject = { ...base };

  for (const [key, value] of Object.entries(override)) {
    if (value === undefined) {
      continue;
    }

    const existing = merged[key];

    if (isPlainObject(existing) && isPlainObject(value)) {
      merged[key] = mergeObjects(existing, value);
      continue;
    }

    merged[key] = value;
  }

  return merged;
};

const resolvePath = (rootDir: string, candidate: string): string =>
  path.isAbsolute(candidate) ? candidate : path.join(rootDir, candidate);

export const loadDevEnvironmentConfig = async (
  options: LoadConfigOptions = {},
): Promise<LoadConfigResult> => {
  const rootDir = options.rootDir ?? process.cwd();
  const configPath = resolvePath(
    rootDir,
    options.configPath ?? DEFAULT_CONFIG_FILENAME,
  );
  const overridePath = resolvePath(
    rootDir,
    options.overridePath ?? DEFAULT_OVERRIDE_FILENAME,
  );

  const sources: ConfigSourceDescriptor[] = [];

  const baseResult = await readYamlFile(configPath);
  if (!baseResult.exists) {
    throw new ConfigFileNotFoundError(configPath);
  }

  sources.push({
    path: configPath,
    optional: false,
    exists: true,
  });

  let rawConfig = ensurePlainObject(baseResult.payload, configPath);

  const overrideResult = await readYamlFile(overridePath);
  if (overrideResult.exists) {
    sources.push({
      path: overridePath,
      optional: true,
      exists: true,
    });
    const overrideObject = ensurePlainObject(overrideResult.payload, overridePath);
    rawConfig = mergeObjects(rawConfig, overrideObject);
  } else {
    sources.push({
      path: overridePath,
      optional: true,
      exists: false,
    });
  }

  let config: DevEnvironmentConfig;
  try {
    config = devEnvironmentConfigSchema.parse(rawConfig);
  } catch (error) {
    if (error instanceof ConfigValidationError) {
      throw error;
    }

    if (error instanceof ZodError) {
      throw new ConfigValidationError(
        extractIssuesFromZodError(error),
        { cause: error },
      );
    }

    throw error;
  }

  return {
    config,
    rawConfig,
    sources,
  };
};

export const parseDevEnvironmentConfig = (
  value: unknown,
): DevEnvironmentConfig => devEnvironmentConfigSchema.parse(value);
