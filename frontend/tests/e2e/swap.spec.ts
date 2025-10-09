import { test, expect } from "@playwright/test";
import type { ChildProcessWithoutNullStreams, SpawnOptionsWithoutStdio } from "node:child_process";
import { spawn } from "node:child_process";
import { once } from "node:events";
import net from "node:net";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { createPublicClient, createWalletClient, http, parseAbiItem } from "viem";
import { hardhat } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";

const HARDHAT_HOST = "127.0.0.1";
const HARDHAT_PORT = 8546;
const HARDHAT_URL = `http://${HARDHAT_HOST}:${HARDHAT_PORT}`;
const VITE_PORT = 4174;
const VITE_URL = `http://127.0.0.1:${VITE_PORT}`;
const COMMAND_TIMEOUT_MS = 60_000;

type SetupPayload = {
  contest: string;
  priceSource: string;
  entryAsset: string;
  quoteAsset: string;
  pool: string;
  entryAmount: string;
  participant: {
    address: string;
    privateKey: string;
  };
  deployer: {
    address: string;
    privateKey: string;
  };
  vault: string;
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
    console.warn("关闭子进程时发生警告：", error);
  }
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
      "scripts/e2e/swap-setup.ts",
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
    VITE_CHAIN_ID: `${hardhat.id}`,
    VITE_CONTEST_ADDRESS: setupPayload.contest,
    VITE_PRICE_SOURCE_ADDRESS: setupPayload.priceSource,
    VITE_TEST_ACCOUNT_ADDRESS: setupPayload.participant.address,
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
  await sleep(500);
});

test.afterAll(async () => {
  await killProcess(viteProcess);
  await killProcess(hardhatProcess);
});

test("参赛者在 LIVE 阶段完成合法换仓并拒绝违规请求", async ({ page }) => {
  await page.goto(VITE_URL);

  const connectorButton = page.locator('button[data-testid^="connector-"]').first();
  await connectorButton.waitFor({ timeout: 60_000 });
  await connectorButton.click();
  await expect(page.getByTestId("connected-address")).toContainText(
    setupPayload.participant.address.slice(2, 6),
  );

  await page.waitForSelector('[data-testid="register-loading"]', { state: "detached", timeout: 60_000 });
  await expect(page.getByTestId("contest-state")).toHaveText("当前状态：Live");

  const amountInput = page.getByTestId("swap-amount-input");
  await amountInput.fill("0.2");
  await page.getByTestId("swap-submit-button").click();
  await expect(page.getByTestId("swap-status")).toContainText("换仓交易已提交");

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

  const vaultSwapped = parseAbiItem(
    "event VaultSwapped(address contest,address participant,address pool,address tokenIn,address tokenOut,uint256 amountIn,uint256 amountOut,uint256 twap,int32 priceImpactBps)",
  );
  let logs = [] as Awaited<ReturnType<typeof client.getLogs>>;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    logs = await client.getLogs({
      address: setupPayload.vault as `0x${string}`,
      event: vaultSwapped,
      fromBlock: 0n,
    });
    if (logs.length > 0) {
      break;
    }
    await sleep(500);
  }

  expect(logs.length).toBeGreaterThan(0);

  await expect(page.getByTestId("vault-base-balance")).toContainText("3.8");

  const walletClient = createWalletClient({
    account: privateKeyToAccount(setupPayload.deployer.privateKey as `0x${string}`),
    chain: hardhat,
    transport: http(HARDHAT_URL),
  });

  await walletClient.writeContract({
    address: setupPayload.pool as `0x${string}`,
    abi: [
      {
        type: "function",
        name: "setTick",
        stateMutability: "nonpayable",
        inputs: [{ internalType: "int24", name: "tick_", type: "int24" }],
        outputs: [],
      },
    ] as const,
    functionName: "setTick",
    args: [120],
  });

  await amountInput.fill("0.15");
  await page.getByTestId("swap-submit-button").click();
  await expect(page.getByTestId("swap-error")).toContainText("价格偏离超出容忍度");
});
