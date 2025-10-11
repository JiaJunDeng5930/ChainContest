import { test, expect } from "@playwright/test";
import type { ChildProcessWithoutNullStreams, SpawnOptionsWithoutStdio } from "node:child_process";
import { spawn } from "node:child_process";
import { once } from "node:events";
import net from "node:net";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { createPublicClient, http, parseAbiItem } from "viem";
import { hardhat } from "viem/chains";

const HARDHAT_HOST = "127.0.0.1";
const HARDHAT_PORT = 8545;
const HARDHAT_URL = `http://${HARDHAT_HOST}:${HARDHAT_PORT}`;
const VITE_PORT = 4173;
const VITE_URL = `http://127.0.0.1:${VITE_PORT}`;
const COMMAND_TIMEOUT_MS = 60_000;

type SetupPayload = {
  contest: string;
  priceSource: string;
  entryAsset: string;
  entryAmount: string;
  participant: {
    address: string;
  };
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
  timeoutMs = 20_000,
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
        new Error(
          `进程提前退出 (code=${code ?? "null"})，未匹配到模式 ${pattern}. 输出：${combined}`,
        ),
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
    // 忽略杀进程过程中可能出现的异常
    console.warn("关闭子进程时发生警告：", error);
  }
}

test.beforeAll(async () => {
  if (!(await isPortAvailable(HARDHAT_PORT))) {
    throw new Error(`Hardhat 需要使用的端口 ${HARDHAT_PORT} 已被占用，请先关闭相关进程后重试`);
  }

  hardhatProcess = spawn(
    "pnpm",
    ["--filter", "@chaincontest/contracts", "node", "--hostname", HARDHAT_HOST, "--port", `${HARDHAT_PORT}`],
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
      "@chaincontest/contracts",
      "exec",
      "--",
      "hardhat",
      "run",
      "scripts/e2e/register-setup.ts",
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

  const viteEnv = {
    ...process.env,
    VITE_PRIMARY_RPC: HARDHAT_URL,
    VITE_FALLBACK_RPC: HARDHAT_URL,
    VITE_CONTEST_ADDRESS: setupPayload.contest,
    VITE_PRICE_SOURCE_ADDRESS: setupPayload.priceSource,
    VITE_TEST_ACCOUNT_ADDRESS: setupPayload.participant.address,
    VITE_CHAIN_ID: `${hardhat.id}`,
  };

  viteProcess = spawn(
    "pnpm",
    ["--filter", "@chaincontest/frontend", "dev", "--host", "127.0.0.1", "--port", `${VITE_PORT}`],
    {
      cwd: repoRoot,
      stdio: "pipe",
      env: viteEnv,
    },
  );

  await waitForPattern(viteProcess, new RegExp(`http://127\\.0\\.0\\.1:${VITE_PORT}`, "i"));
  await sleep(500);
});

test.afterAll(async () => {
  await killProcess(viteProcess);
  await killProcess(hardhatProcess);
});

test("参赛者完成授权与报名流程，并触发链上事件", async ({ page }) => {
  await page.goto(VITE_URL);

  const connectorButton = page.locator('button[data-testid^="connector-"]').first();
  await connectorButton.waitFor({ timeout: 60_000 });
  await connectorButton.click();
  await expect(page.getByTestId("connected-address")).toContainText(
    setupPayload.participant.address.slice(2, 6),
  );
  await page.waitForSelector('[data-testid="register-loading"]', { state: "detached", timeout: 60_000 });

  const approveStatusLocator = page.getByTestId("approve-status");
  await expect(approveStatusLocator).toBeVisible();
  const approveStatusText = await approveStatusLocator.textContent();
  if (!approveStatusText?.includes("已完成")) {
    await page.getByTestId("approve-button").click();
    await expect(approveStatusLocator).toContainText("已完成");
  }

  await page.getByTestId("register-button").click();
  await expect(page.getByTestId("register-status")).toContainText("报名交易已提交");

  await expect(page.getByTestId("participants-list")).toContainText(
    setupPayload.participant.address.slice(0, 6),
  { timeout: 60_000 },
  );

  const client = createPublicClient({
    chain: {
      ...hardhat,
      rpcUrls: {
        default: { http: [HARDHAT_URL] },
        public: { http: [HARDHAT_URL] },
      },
    },
    transport: http(HARDHAT_URL),
  });

  const contestRegisteredEvent = parseAbiItem(
    "event ContestRegistered(bytes32 contestId, address participant, address vault, uint256 amount)",
  );
  let logs = [] as Awaited<ReturnType<typeof client.getLogs>>;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    logs = await client.getLogs({
      address: setupPayload.contest as `0x${string}`,
      event: contestRegisteredEvent,
      fromBlock: 0n,
    });
    if (logs.length > 0) {
      break;
    }
    await sleep(500);
  }

  const participantTopic = `0x000000000000000000000000${setupPayload.participant.address.slice(2).toLowerCase()}`;
  const hasParticipantLog = logs.some((log) => log.topics?.[2]?.toLowerCase() === participantTopic);
  expect(hasParticipantLog).toBeTruthy();

  const participantCount = (await client.readContract({
    address: setupPayload.contest as `0x${string}`,
    abi: [
      {
        type: "function",
        name: "participantCount",
        stateMutability: "view",
        inputs: [],
        outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
      },
    ] as const,
    functionName: "participantCount",
  })) as bigint;

  expect(participantCount).toBe(1n);
});
