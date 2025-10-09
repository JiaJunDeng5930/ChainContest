const ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;
const RPC_TIMEOUT_MS = 2_500;

export type ContestAddresses = {
  contest: string;
  priceSource: string;
};

let cachedRpcUrl: string | null = null;

const DEFAULT_CHAIN_ID = 11155111;

const chainIdEnv = import.meta.env.VITE_CHAIN_ID;
const parsedChainId = chainIdEnv ? Number(chainIdEnv) : DEFAULT_CHAIN_ID;

if (!Number.isInteger(parsedChainId) || parsedChainId <= 0) {
  throw new Error(`链 ID 配置无效：${chainIdEnv}`);
}

export const configuredChainId = parsedChainId;
export const configuredChainName =
  configuredChainId === 31337 ? "Hardhat (localhost)" : "Sepolia";

const primaryRpc = import.meta.env.VITE_PRIMARY_RPC ?? "";
const fallbackRpc = import.meta.env.VITE_FALLBACK_RPC ?? "";

if (!primaryRpc) {
  throw new Error("缺少环境变量 VITE_PRIMARY_RPC");
}
if (!fallbackRpc) {
  throw new Error("缺少环境变量 VITE_FALLBACK_RPC");
}

const contestAddress = import.meta.env.VITE_CONTEST_ADDRESS ?? "";
const priceSourceAddress = import.meta.env.VITE_PRICE_SOURCE_ADDRESS ?? "";

if (!ADDRESS_REGEX.test(contestAddress)) {
  throw new Error(`合约地址 VITE_CONTEST_ADDRESS 非法：${contestAddress}`);
}
if (!ADDRESS_REGEX.test(priceSourceAddress)) {
  throw new Error(`合约地址 VITE_PRICE_SOURCE_ADDRESS 非法：${priceSourceAddress}`);
}

export const contestAddresses: ContestAddresses = {
  contest: contestAddress,
  priceSource: priceSourceAddress,
};

async function probeRpc(url: string): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), RPC_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_chainId",
        params: [],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      return false;
    }

    const payload = await response.json();
    return typeof payload?.result === "string";
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

export async function resolveRpcEndpoint(): Promise<string> {
  if (cachedRpcUrl) {
    return cachedRpcUrl;
  }

  if (await probeRpc(primaryRpc)) {
    cachedRpcUrl = primaryRpc;
    return cachedRpcUrl;
  }

  if (await probeRpc(fallbackRpc)) {
    cachedRpcUrl = fallbackRpc;
    return cachedRpcUrl;
  }

  throw new Error("所有 RPC 终结点均不可用，请稍后重试");
}

export function getRpcCandidates(): string[] {
  return [primaryRpc, fallbackRpc];
}
