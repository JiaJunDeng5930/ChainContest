import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { execa } from "execa";
import os from "node:os";
import path from "node:path";
import { mkdtemp, rm, writeFile } from "node:fs/promises";

import { runStartCommand } from "../../src/commands/start";
import { ExitCode } from "../../src/orchestration/errors";
import { SummaryReporter } from "../../src/reporters/summary";

vi.mock("execa", () => ({
  execa: vi.fn(),
}));

const yamlConfig = `version: "0.1.0"
projectName: "integration-test"
services:
  - name: "postgres"
    image: "postgres:16-alpine"
    ports:
      - host: 5432
        container: 5432
    profiles:
      - "core"
profiles:
  - key: "core"
    description: "Core services"
    defaultEnabled: true
    services:
      - "postgres"
volumes:
  - name: "pg-data"
`;

describe("runStartCommand", () => {
  const mockedExeca = vi.mocked(execa);
  let tempDir: string;
  let configPath: string;
  let composeDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "dev-bootstrap-"));
    configPath = path.join(tempDir, "dev-bootstrap.config.yaml");
    composeDir = path.join(tempDir, ".dev-bootstrap");
    await writeFile(configPath, yamlConfig, "utf8");

    mockedExeca.mockReset();
    mockedExeca.mockImplementation(async (command, args) => {
      if (command !== "docker") {
        throw new Error(`Unexpected command: ${command}`);
      }

      const joined = args.join(" ");

      if (joined.startsWith("version --format")) {
        return { stdout: "24.0.5" } as any;
      }

      if (joined.startsWith("compose version")) {
        return { stdout: "2.24.2" } as any;
      }

      if (joined.includes("ps --format json")) {
        return {
          stdout:
            '{"Service":"postgres","State":"running","Health":"healthy"}',
        } as any;
      }

      if (joined.includes("up")) {
        return { stdout: "", stderr: "", exitCode: 0 } as any;
      }

      throw new Error(`Unhandled execa call: docker ${joined}`);
    });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("starts environment and reports success", async () => {
    const reporter = new SummaryReporter({ writer: () => {} });

    const result = await runStartCommand({
      reporter,
      configPath,
      composeDir,
    });

    expect(result.exitCode).toBe(ExitCode.Success);
    expect(result.summary.status).toBe("success");
    expect(result.summary.services).toHaveLength(1);
    expect(result.summary.services[0].status).toBe("running");
    expect(mockedExeca).toHaveBeenCalled();
  });
});
