import { test, expect } from "@playwright/test";
import type { ChildProcessWithoutNullStreams, SpawnOptionsWithoutStdio } from "node:child_process";
import { spawn } from "node:child_process";
import { once } from "node:events";
import net from "node:net";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const HARDHAT_HOST = "127.0.0.1";
const HARDHAT_PORT = 8547;
const HARDHAT_URL = `http://${HARDHAT_HOST}:${HARDHAT_PORT}`;
const VITE_PORT = 4175;
const VITE_URL = `http://127.0.0.1:${VITE_PORT}`;
const COMMAND_TIMEOUT_MS = 90_000;

type ParticipantInfo = {
  address: string;
  privateKey: string;
  bonus: string;
};

type SetupPayload = {
  contest: string;
  priceSource: string;
  entryAsset: string;
  quoteAsset: string;
  entryAmount: string;
  payouts: number[];
  timelines: {
    registeringEnds: string;
    liveEnds: string;
    claimEnds: string;
  };
  operator: {
    address: string;
    privateKey: string;
  };
  participants: ParticipantInfo[];
  vaults: Record<string, string>;
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../../..");

let hardhatProcess: ChildProcessWithoutNullStreams | undefined;
let viteProcess: ChildProcessWithoutNullStreams | undefined;
let setupPayload: SetupPayload;

async function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const tester = net.createServer();
    tester.once("error", (error: NodeJS.ErrnoException) => {
      tester.close();
      if (error.code === "EADDRINUSE") {
        resolve(false);
        return;
      }
      reject(error);
    });
    tester.once("listening", () => {
      tester.close(() => resolve(true));
    });
    tester.listen(port, HARDHAT_HOST);
  });
}

async function waitForPattern(
  proc: ChildProcessWithoutNullStreams,
  pattern: RegExp,
  timeoutMs = 30_000,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let combined = "";
    const stripAnsi = (value: string) => value.replace(/\u001b\[[0-9;]*m/g, "");
    const onStdout = (chunk: Buffer) => {
      combined += stripAnsi(chunk.toString());
      pattern.lastIndex = 0;
      if (pattern.test(combined)) {
        cleanup();
        resolve();
      }
    };
    const onStderr = (chunk: Buffer) => {
      combined += stripAnsi(chunk.toString());
      pattern.lastIndex = 0;
      if (pattern.test(combined)) {
        cleanup();
        resolve();
      }
    };
    const onClose = (code: number | null) => {
      cleanup();
      reject(
        new Error(`进程提前退出 (code=${code ?? "null"})，未匹配到模式 ${pattern}. 输出：${combined}`),
      );
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`等待模式 ${pattern} 超时。输出：${combined}`));
    }, timeoutMs);
    const cleanup = () => {
      clearTimeout(timer);
      proc.stdout.off("data", onStdout);
      proc.stderr.off("data", onStderr);
      proc.off("close", onClose);
    };
    proc.stdout.on("data", onStdout);
    proc.stderr.on("data", onStderr);
    proc.once("close", onClose);
  });
}

async function runCommand(
  command: string[],
  options: SpawnOptionsWithoutStdio,
  timeoutMs = COMMAND_TIMEOUT_MS,
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command[0]!, command.slice(1), {
      ...options,
      stdio: "pipe",
    });
    let stdout = "";
    let stderr = "";
    let settled = false;

    const finalize = (fn: () => void) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      child.stdout.off("data", onStdout);
      child.stderr.off("data", onStderr);
      child.off("error", onError);
      child.off("close", onClose);
      fn();
    };

    const onStdout = (chunk: Buffer) => {
      stdout += chunk.toString();
    };
    const onStderr = (chunk: Buffer) => {
      stderr += chunk.toString();
    };
    const onError = (error: Error) => {
      finalize(() => reject(error));
    };
    const onClose = (code: number | null) => {
      finalize(() => {
        if (code === 0) {
          resolve({ stdout, stderr });
        } else {
          reject(
            new Error(
              `命令 ${command.join(" ")} 退出码 ${code}\nstdout: ${stdout}\nstderr: ${stderr}`,
            ),
          );
        }
      });
    };

    const timer = setTimeout(() => {
      finalize(() => {
        child.kill("SIGTERM");
        reject(new Error(`命令 ${command.join(" ")} 超时\nstdout: ${stdout}\nstderr: ${stderr}`));
      });
    }, timeoutMs);

    child.stdout.on("data", onStdout);
    child.stderr.on("data", onStderr);
    child.once("error", onError);
    child.once("close", onClose);
  });
}

async function killProcess(proc: ChildProcessWithoutNullStreams | undefined): Promise<void> {
  if (!proc) {
    return;
  }

  try {
    proc.kill("SIGTERM");
    const exited = await Promise.race([
      once(proc, "exit").then(() => true),
      sleep(5_000).then(() => false),
    ]);

    if (!exited) {
      proc.kill("SIGKILL");
      await Promise.race([once(proc, "exit"), sleep(2_000)]);
    }
  } catch (error) {
    console.warn("关闭子进程时发生警告：", error);
  }
}

async function switchAccount(page: import("@playwright/test").Page, address: string) {
  await page.getByTestId(`switch-account-${address.toLowerCase()}`).click();
  await expect(page.getByTestId("connected-address")).toContainText(address.slice(2, 6));
}

test.beforeAll(async () => {
  if (!(await isPortAvailable(HARDHAT_PORT))) {
    throw new Error(`Hardhat 需要使用的端口 ${HARDHAT_PORT} 已被占用，请先关闭相关进程后重试`);
  }

  hardhatProcess = spawn(
    "pnpm",
    ["--filter", "@bc/contracts", "node", "--hostname", HARDHAT_HOST, "--port", `${HARDHAT_PORT}`],
    {
      cwd: repoRoot,
      stdio: "pipe",
      env: {
        ...process.env,
      },
    },
  );

  await waitForPattern(hardhatProcess, new RegExp(`(Hardhat Network|Started HTTP).+${HARDHAT_PORT}`, "i"));

  const setupResult = await runCommand(
    [
      "pnpm",
      "--filter",
      "@bc/contracts",
      "exec",
      "--",
      "hardhat",
      "run",
      "scripts/e2e/settlement-setup.ts",
      "--network",
      "localhost",
    ],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        HARDHAT_NETWORK: "localhost",
      },
    },
  );

  setupPayload = JSON.parse(setupResult.stdout) as SetupPayload;

  const testAccounts = [setupPayload.operator.address, ...setupPayload.participants.map((item) => item.address)];

  const viteEnv = {
    ...process.env,
    VITE_PRIMARY_RPC: HARDHAT_URL,
    VITE_FALLBACK_RPC: HARDHAT_URL,
    VITE_CONTEST_ADDRESS: setupPayload.contest,
    VITE_PRICE_SOURCE_ADDRESS: setupPayload.priceSource,
    VITE_CHAIN_ID: "31337",
    VITE_TEST_ACCOUNTS: testAccounts.join(","),
    VITE_OPERATOR_ADDRESS: setupPayload.operator.address,
  };

  viteProcess = spawn(
    "pnpm",
    ["--filter", "@bc/frontend", "dev", "--host", "127.0.0.1", "--port", `${VITE_PORT}`],
    {
      cwd: repoRoot,
      stdio: "pipe",
      env: viteEnv,
    },
  );

  await waitForPattern(viteProcess, new RegExp(`http://127\\.0\\.0\\.1:${VITE_PORT}`, "i"));
  await sleep(750);
});

test.afterAll(async () => {
  await killProcess(viteProcess);
  await killProcess(hardhatProcess);
});

test("管理员冻结并结算比赛，赢家领奖，其他参赛者退出", async ({ page }) => {
  await page.goto(VITE_URL);

  const connectorButton = page.locator('button[data-testid^="connector-"]').first();
  await connectorButton.waitFor({ timeout: 60_000 });
  await connectorButton.click();
  await expect(page.getByTestId("connected-address")).toContainText(setupPayload.operator.address.slice(2, 6));

  await page.waitForSelector('[data-testid="register-loading"]', { state: "detached", timeout: 60_000 });

  await page.getByTestId("action-freeze").click();
  await expect(page.getByTestId("action-status")).toContainText("冻结完成");

  for (const participant of setupPayload.participants) {
    await page.getByTestId("action-settle-address").fill(participant.address);
    await page.getByTestId("action-settle-submit").click();
    await expect(page.getByTestId("action-status")).toContainText("结算成功");
  }

  await page.getByTestId("action-update-leaders").click();
  await expect(page.getByTestId("action-status")).toContainText("榜单已更新");

  await page.getByTestId("action-seal").click();
  await expect(page.getByTestId("action-status")).toContainText("封榜完成");

  const leaderboardRows = page.locator('[data-testid^="leaderboard-row-"]');
  await expect(leaderboardRows).toHaveCount(2);
  await expect(page.getByTestId("leaderboard-row-0")).toContainText(setupPayload.participants[0]!.address.slice(2, 6));
  await expect(page.getByTestId("leaderboard-row-1")).toContainText(setupPayload.participants[1]!.address.slice(2, 6));

  await switchAccount(page, setupPayload.participants[0]!.address);
  await page.getByTestId("claim-button").click();
  await expect(page.getByTestId("claim-status")).toContainText("领奖完成");

  await switchAccount(page, setupPayload.participants[1]!.address);
  await page.getByTestId("claim-button").click();
  await expect(page.getByTestId("claim-status")).toContainText("领奖完成");

  await switchAccount(page, setupPayload.participants[2]!.address);
  await page.getByTestId("exit-button").click();
  await expect(page.getByTestId("exit-status")).toContainText("退出完成");

  await switchAccount(page, setupPayload.operator.address);
  await expect(page.getByTestId("prize-pool-amount")).toHaveText("0");
});
