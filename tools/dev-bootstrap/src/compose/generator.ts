import { promises as fs } from "node:fs";
import path from "node:path";
import { stringify } from "yaml";

import {
  DevEnvironmentConfig,
  ServiceDefinition,
  VolumeRule,
} from "../config/schema.js";

export const DEFAULT_COMPOSE_DIR = ".dev-bootstrap";
export const DEFAULT_COMPOSE_FILENAME = "docker-compose.generated.yaml";

export interface ComposeGenerationOptions {
  config: DevEnvironmentConfig;
  outputDir?: string;
  fileName?: string;
}

export interface ComposeGenerationResult {
  filePath: string;
  services: string[];
  profiles: string[];
}

type ServiceHealthcheck = NonNullable<ServiceDefinition["healthcheck"]>;

const CMD_PREFIX = "CMD ";
const CMD_SHELL_PREFIX = "CMD-SHELL ";

const splitCommandArgs = (command: string): string[] => {
  const matches = command.match(/"[^"]*"|'[^']*'|\S+/g);
  if (!matches) {
    return [];
  }
  return matches.map((segment) => {
    const trimmed = segment.trim();
    if (
      (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'"))
    ) {
      return trimmed.slice(1, -1);
    }
    return trimmed;
  });
};

const buildHealthcheckDefinition = (
  healthcheck: ServiceHealthcheck,
): Record<string, unknown> => {
  const definition: Record<string, unknown> = {};
  const test = healthcheck.test?.trim();

  if (test) {
    if (test.startsWith(CMD_SHELL_PREFIX)) {
      const command = test.slice(CMD_SHELL_PREFIX.length).trim();
      definition.test = ["CMD-SHELL", command];
    } else if (test.startsWith(CMD_PREFIX)) {
      const command = test.slice(CMD_PREFIX.length).trim();
      definition.test = ["CMD", ...splitCommandArgs(command)];
    } else {
      definition.test = ["CMD-SHELL", test];
    }
  }

  if (healthcheck.interval) {
    definition.interval = healthcheck.interval;
  }

  if (healthcheck.timeout) {
    definition.timeout = healthcheck.timeout;
  }

  if (typeof healthcheck.retries === "number") {
    definition.retries = healthcheck.retries;
  }

  return definition;
};

const buildServiceDefinition = (
  service: ServiceDefinition,
  envFiles: string[],
): Record<string, unknown> => {
  const definition: Record<string, unknown> = {};

  if (service.image) {
    definition.image = service.image;
  }

  if (service.dockerfile) {
    definition.build = {
      dockerfile: service.dockerfile,
      ...(service.context ? { context: service.context } : {}),
    };
  }

  if (service.command) {
    definition.command = service.command;
  }

  if (service.environment && Object.keys(service.environment).length > 0) {
    definition.environment = service.environment;
  }

  if (service.dependsOn.length > 0) {
    definition.depends_on = service.dependsOn;
  }

  if (envFiles.length > 0) {
    definition.env_file = envFiles;
  }

  if (service.profiles.length > 0) {
    definition.profiles = service.profiles;
  }

  if (service.healthcheck) {
    definition.healthcheck = buildHealthcheckDefinition(service.healthcheck);
  }

  if (service.ports.length > 0) {
    definition.ports = service.ports.map((port) => {
      const base = `${port.host}:${port.container}`;
      return port.protocol ? `${base}/${port.protocol}` : base;
    });
  }

  if (service.volumes.length > 0) {
    definition.volumes = service.volumes;
  }

  return definition;
};

const buildVolumeDefinition = (volume: VolumeRule): Record<string, unknown> => {
  if (!volume.path) {
    return {};
  }

  return {
    driver: "local",
    driver_opts: {
      type: "none",
      o: "bind",
      device: volume.path,
    },
  };
};

const buildComposeDocument = (config: DevEnvironmentConfig): Record<string, unknown> => {
  const services = Object.fromEntries(
    config.services.map((service) => [
      service.name,
      buildServiceDefinition(service, config.envFiles),
    ]),
  );

  const volumes = Object.fromEntries(
    config.volumes.map((volume) => [volume.name, buildVolumeDefinition(volume)]),
  );

  const document: Record<string, unknown> = {
    name: config.projectName,
    services,
  };

  if (config.volumes.length > 0) {
    document.volumes = volumes;
  }

  document["x-dev-bootstrap"] = {
    resetPolicy: config.resetPolicy,
    volumes: config.volumes,
  };

  return document;
};

export const generateComposeFile = async (
  options: ComposeGenerationOptions,
): Promise<ComposeGenerationResult> => {
  const outputDir = options.outputDir ?? DEFAULT_COMPOSE_DIR;
  const fileName = options.fileName ?? DEFAULT_COMPOSE_FILENAME;
  const composeDocument = buildComposeDocument(options.config);
  const yamlContent = stringify(composeDocument, { aliasDuplicateObjects: false });
  const absoluteDir = path.isAbsolute(outputDir)
    ? outputDir
    : path.join(process.cwd(), outputDir);

  await fs.mkdir(absoluteDir, { recursive: true });
  const filePath = path.join(absoluteDir, fileName);
  await fs.writeFile(filePath, yamlContent, "utf8");

  return {
    filePath,
    services: options.config.services.map((service) => service.name),
    profiles: options.config.profiles.map((profile) => profile.key),
  };
};
