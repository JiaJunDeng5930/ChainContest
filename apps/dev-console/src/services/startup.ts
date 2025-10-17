import type { ErrorDetail } from "../lib/types";

import {
  ConfigLoadError,
  ConfigValidationError,
  loadEnvironmentConfig,
} from "./config";
import {
  ProviderAccountError,
  ProviderChainMismatchError,
  ProviderConnectionError,
  createRpcProvider,
} from "./provider";
import { createAbiRegistry } from "./abiRegistry";

export interface StartupSuccess {
  ok: true;
  config: Awaited<ReturnType<typeof loadEnvironmentConfig>>;
  provider: Awaited<ReturnType<typeof createRpcProvider>>;
  registry: ReturnType<typeof createAbiRegistry>;
}

export interface StartupFailure {
  ok: false;
  error: ErrorDetail;
}

export type StartupResult = StartupSuccess | StartupFailure;

export interface StartupOptions {
  signal?: AbortSignal;
}

export async function performStartup(
  options: StartupOptions = {},
): Promise<StartupResult> {
  try {
    const config = await loadEnvironmentConfig({ signal: options.signal });
    const provider = await createRpcProvider(config.config);
    const registry = createAbiRegistry();

    return {
      ok: true,
      config,
      provider,
      registry,
    } satisfies StartupSuccess;
  } catch (error) {
    return {
      ok: false,
      error: convertToErrorDetail(error),
    } satisfies StartupFailure;
  }
}

function convertToErrorDetail(error: unknown): ErrorDetail {
  if (error instanceof ConfigValidationError) {
    return {
      code: "CONFIG_VALIDATION_FAILED",
      message: error.message,
      raw: error.issues,
      hint: "检查环境变量与运行时配置是否完整",
    };
  }

  if (error instanceof ConfigLoadError) {
    return {
      code: "CONFIG_LOAD_FAILED",
      message: error.message,
      raw: error.cause,
      hint: "确认后端 /api/runtime/config 可访问",
    };
  }

  if (error instanceof ProviderChainMismatchError) {
    return {
      code: "CHAIN_ID_MISMATCH",
      message: error.message,
      hint: "确认 RPC 节点链 ID 与配置一致",
      raw: { expected: error.expected, received: error.received },
    };
  }

  if (error instanceof ProviderAccountError) {
    return {
      code: "NO_UNLOCKED_ACCOUNT",
      message: error.message,
      hint: "解锁一个账户或配置 defaultAccount",
    };
  }

  if (error instanceof ProviderConnectionError) {
    return {
      code: "RPC_UNREACHABLE",
      message: error.message,
      raw: error.cause,
      hint: "确认 RPC URL 可访问且节点在线",
    };
  }

  if (error instanceof Error) {
    return {
      code: error.name || "UNEXPECTED",
      message: error.message,
      raw: error,
    };
  }

  return {
    code: "UNEXPECTED",
    message: "启动握手失败",
    raw: error,
  };
}
