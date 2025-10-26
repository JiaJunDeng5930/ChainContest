import { describe, expect, it } from "vitest";

import {
  devEnvironmentConfigSchema,
  DevEnvironmentConfig,
} from "../../src/config/schema";

const baseConfig: DevEnvironmentConfig = {
  version: "0.1.0",
  projectName: "chaincontest-dev",
  services: [
    {
      name: "postgres",
      image: "postgres:16-alpine",
      ports: [
        {
          host: 5432,
          container: 5432,
          protocol: "tcp",
        },
      ],
      environment: {
        POSTGRES_USER: "chaincontest",
      },
      dependsOn: [],
      profiles: ["core"],
    },
  ],
  profiles: [
    {
      key: "core",
      description: "Core services",
      defaultEnabled: true,
      services: ["postgres"],
    },
  ],
  volumes: [
    {
      name: "pg-data",
      preserveOnReset: true,
    },
  ],
  envFiles: [],
  prerequisites: {
    dockerVersion: "24.0.0",
    composeVersion: "2.24.0",
    cpuCores: 8,
    memoryGb: 16,
    portsInUse: [],
  },
  logging: {
    format: "table",
    retainComposeLogs: false,
  },
  resetPolicy: {
    mode: "preserve",
    selectiveVolumes: [],
  },
};

const cloneConfig = (): DevEnvironmentConfig => structuredClone(baseConfig);

describe("devEnvironmentConfigSchema", () => {
  it("accepts a valid configuration", () => {
    const config = cloneConfig();
    const parsed = devEnvironmentConfigSchema.parse(config);

    expect(parsed.projectName).toBe("chaincontest-dev");
    expect(parsed.services).toHaveLength(1);
  });

  it("rejects service definitions without image or dockerfile", () => {
    const config = cloneConfig();
    delete config.services[0].image;

    expect(() => devEnvironmentConfigSchema.parse(config)).toThrow(
      /service must provide either dockerfile or image/,
    );
  });

  it("rejects duplicate host ports across services", () => {
    const config = cloneConfig();
    config.services.push({
      name: "api",
      image: "node:20-alpine",
      ports: [
        {
          host: 5432,
          container: 3000,
          protocol: "tcp",
        },
      ],
      environment: {},
      dependsOn: [],
      profiles: ["core"],
    });
    config.profiles[0].services.push("api");

    expect(() => devEnvironmentConfigSchema.parse(config)).toThrow(
      /host port 5432\/tcp already used/
    );
  });

  it("rejects logging JSON output without ndjsonPath", () => {
    const config = cloneConfig();
    config.logging = {
      format: "json",
      retainComposeLogs: false,
    };

    expect(() => devEnvironmentConfigSchema.parse(config)).toThrow(
      /ndjsonPath is required/
    );
  });

  it("rejects selective reset volumes that are not declared", () => {
    const config = cloneConfig();
    config.resetPolicy = {
      mode: "selective",
      selectiveVolumes: ["missing-volume"],
    };

    expect(() => devEnvironmentConfigSchema.parse(config)).toThrow(
      /selective volume "missing-volume" is not declared/
    );
  });

  it("accepts selective reset when volumes are declared", () => {
    const config = cloneConfig();
    config.resetPolicy = {
      mode: "selective",
      selectiveVolumes: ["pg-data"],
    };

    const parsed = devEnvironmentConfigSchema.parse(config);

    expect(parsed.resetPolicy?.mode).toBe("selective");
    expect(parsed.resetPolicy?.selectiveVolumes).toContain("pg-data");
  });
});
