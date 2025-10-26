import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { execa } from "execa";
import os from "node:os";
import path from "node:path";
import { mkdtemp, rm, writeFile } from "node:fs/promises";

import { runStopCommand } from "../../src/commands/stop";
import { runResetCommand } from "../../src/commands/reset";
import { ExitCode } from "../../src/orchestration/errors";
import { SummaryReporter } from "../../src/reporters/summary";

vi.mock("execa", () => ({
  execa: vi.fn(),
}));

const yamlConfig = `version: "0.1.0"
projectName: "integration-reset"
services:
  - name: "postgres"
    image: "postgres:16-alpine"
    profiles:
      - "core"
profiles:
  - key: "core"
    defaultEnabled: true
    services:
      - "postgres"
volumes:
  - name: "pg-data"
resetPolicy:
  mode: "selective"
  selectiveVolumes:
    - "pg-data"
`;

describe("stop/reset commands", () => {
  const mockedExeca = vi.mocked(execa);
  let originalCwd: string;
  let tempDir: string;

  beforeEach(async () => {
    originalCwd = process.cwd();
    tempDir = await mkdtemp(path.join(os.tmpdir(), "dev-bootstrap-reset-"));
    await writeFile(path.join(tempDir, "dev-bootstrap.config.yaml"), yamlConfig, "utf8");
    process.chdir(tempDir);

    mockedExeca.mockReset();
    mockedExeca.mockImplementation(async (command, args) => {
      if (command !== "docker") {
        throw new Error(`Unexpected command: ${command}`);
      }

      const joined = args.join(" ");

      if (joined.includes("compose") && joined.includes("down")) {
        return { stdout: "", stderr: "", exitCode: 0 } as any;
      }

      if (joined.startsWith("volume rm")) {
        return { stdout: "", stderr: "", exitCode: 0 } as any;
      }

      throw new Error(`Unhandled execa call: docker ${joined}`);
    });
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await rm(tempDir, { recursive: true, force: true });
  });

  it("stops environment without removing volumes", async () => {
    const reporter = new SummaryReporter({ writer: () => {} });

    const result = await runStopCommand({ reporter });

    expect(result.exitCode).toBe(ExitCode.Success);
    expect(result.summary.status).toBe("success");
    expect(mockedExeca).toHaveBeenCalledWith(
      "docker",
      expect.arrayContaining(["down"]),
      expect.any(Object),
    );
  });

  it("resets environment with selective volumes", async () => {
    const reporter = new SummaryReporter({ writer: () => {} });

    const result = await runResetCommand({
      reporter,
      mode: "selective",
      selectiveVolumes: ["pg-data"],
    });

    expect(result.exitCode).toBe(ExitCode.Success);
    expect(result.summary.status).toBe("success");
    expect(result.removedVolumes).toContain("pg-data");
    expect(mockedExeca).toHaveBeenCalledWith(
      "docker",
      expect.arrayContaining(["volume", "rm", "integration-reset_pg-data"]),
    );
  });
});
