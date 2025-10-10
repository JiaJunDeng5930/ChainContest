import { Contract, JsonRpcProvider, type TransactionReceipt } from "ethers";

import type {
  CallStatus,
  ContractDescriptor,
  ContractFunction,
  ErrorDetail,
  LogLevel,
} from "../lib/types";

import { AbiRegistry } from "./abiRegistry";

export interface ExecuteCallArgs {
  requestId: string;
  descriptor: ContractDescriptor;
  fn: ContractFunction;
  orderedArguments: unknown[];
  overrides?: {
    value?: string;
  };
  onStatusChange?: (event: CallStatusEvent) => void;
  onLog?: (event: CallLogEvent) => void;
}

export interface CallStatusEvent {
  requestId: string;
  status: CallStatus;
  txHash?: string;
  receipt?: TransactionReceipt;
  error?: ErrorDetail;
}

export interface CallLogEvent {
  requestId: string;
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
}

export type CallExecutionResult =
  | {
      kind: "read";
      requestId: string;
      result: unknown;
    }
  | {
      kind: "write";
      requestId: string;
      txHash: string;
      receipt: TransactionReceipt;
    };

export class CallExecutionError extends Error {
  readonly detail: ErrorDetail;

  constructor(message: string, detail: ErrorDetail, options?: ErrorOptions) {
    super(message, options);
    this.name = "CallExecutionError";
    this.detail = detail;
  }
}

export interface CallExecutorOptions {
  defaultAccount?: string;
}

export class CallExecutor {
  private readonly provider: JsonRpcProvider;
  private readonly registry: AbiRegistry;
  private readonly defaultAccount?: string;
  private readonly contractCache = new Map<string, Contract>();
  private writeQueue: Promise<unknown> = Promise.resolve();

  constructor(
    provider: JsonRpcProvider,
    registry: AbiRegistry,
    options: CallExecutorOptions = {},
  ) {
    this.provider = provider;
    this.registry = registry;
    this.defaultAccount = options.defaultAccount;
  }

  execute(args: ExecuteCallArgs): Promise<CallExecutionResult> {
    if (args.fn.stateMutability === "view" || args.fn.stateMutability === "pure") {
      return this.executeRead(args);
    }

    return this.enqueueWrite(args);
  }

  private async executeRead(
    args: ExecuteCallArgs,
  ): Promise<CallExecutionResult> {
    const { descriptor, fn } = args;

    args.onStatusChange?.({
      requestId: args.requestId,
      status: "submitted",
    });

    try {
      const contract = await this.resolveContract(descriptor);
      const method = contract.getFunction(fn.signature);
      const result = await method.staticCall(...args.orderedArguments);

      args.onStatusChange?.({
        requestId: args.requestId,
        status: "confirmed",
      });

      args.onLog?.({
        requestId: args.requestId,
        level: "info",
        message: `${fn.signature} 调用成功`,
        context: { contractId: descriptor.id },
      });

      return {
        kind: "read",
        requestId: args.requestId,
        result,
      };
    } catch (error) {
      const detail = normalizeError(error);
      args.onStatusChange?.({
        requestId: args.requestId,
        status: "failed",
        error: detail,
      });

      args.onLog?.({
        requestId: args.requestId,
        level: "error",
        message: `${fn.signature} 调用失败`,
        context: { contractId: descriptor.id, error: detail },
      });

      throw new CallExecutionError("Read execution failed", detail, {
        cause: error instanceof Error ? error : undefined,
      });
    }
  }

  private enqueueWrite(args: ExecuteCallArgs): Promise<CallExecutionResult> {
    args.onStatusChange?.({
      requestId: args.requestId,
      status: "queued",
    });

    const task = async (): Promise<CallExecutionResult> => {
      args.onStatusChange?.({
        requestId: args.requestId,
        status: "submitted",
      });

      try {
        const contract = await this.resolveContract(args.descriptor, true);
        const method = contract.getFunction(args.fn.signature);
        const overrides = this.buildOverrides(args);

        const response = await method.send(...args.orderedArguments, overrides);

        args.onStatusChange?.({
          requestId: args.requestId,
          status: "submitted",
          txHash: response.hash,
        });

        args.onLog?.({
          requestId: args.requestId,
          level: "info",
          message: `${args.fn.signature} 已提交，等待确认`,
          context: { contractId: args.descriptor.id, txHash: response.hash },
        });

        const receipt = await response.wait();

        args.onStatusChange?.({
          requestId: args.requestId,
          status: "confirmed",
          txHash: response.hash,
          receipt,
        });

        args.onLog?.({
          requestId: args.requestId,
          level: "info",
          message: `${args.fn.signature} 已确认`,
          context: { contractId: args.descriptor.id, txHash: response.hash },
        });

        return {
          kind: "write",
          requestId: args.requestId,
          txHash: response.hash,
          receipt,
        };
      } catch (error) {
        const detail = normalizeError(error);
        args.onStatusChange?.({
          requestId: args.requestId,
          status: "failed",
          error: detail,
        });

        args.onLog?.({
          requestId: args.requestId,
          level: "error",
          message: `${args.fn.signature} 发送失败`,
          context: {
            contractId: args.descriptor.id,
            error: detail,
          },
        });

        throw new CallExecutionError("Write execution failed", detail, {
          cause: error instanceof Error ? error : undefined,
        });
      }
    };

    const execution = this.writeQueue.then(task, task);

    this.writeQueue = execution
      .then(() => undefined)
      .catch(() => undefined);

    return execution;
  }

  private async resolveContract(
    descriptor: ContractDescriptor,
    withSigner = false,
  ): Promise<Contract> {
    const cached = this.contractCache.get(descriptor.id);

    if (cached) {
      if (withSigner) {
        return cached.connect(await this.resolveSigner());
      }

      return cached;
    }

    const { iface } = await this.registry.getInterface(descriptor);
    const baseContract = new Contract(descriptor.address, iface, this.provider);

    this.contractCache.set(descriptor.id, baseContract);

    if (withSigner) {
      return baseContract.connect(await this.resolveSigner());
    }

    return baseContract;
  }

  private async resolveSigner() {
    if (this.defaultAccount) {
      return this.provider.getSigner(this.defaultAccount);
    }

    return this.provider.getSigner();
  }

  private buildOverrides(args: ExecuteCallArgs): Record<string, unknown> {
    const overrides: Record<string, unknown> = {};

    if (args.overrides?.value) {
      overrides.value = BigInt(args.overrides.value);
    }

    return overrides;
  }
}

function normalizeError(error: unknown): ErrorDetail {
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    const code = typeof record.code === "string" ? record.code : "UNKNOWN";
    const message =
      typeof record.message === "string"
        ? record.message
        : error instanceof Error
          ? error.message
          : "调用执行失败";

    return {
      code,
      message,
      raw: error,
    };
  }

  return {
    code: "UNKNOWN",
    message: error instanceof Error ? error.message : "调用执行失败",
    raw: error,
  };
}
