import "./styles/index.css";

import { FunctionFragment, ParamType } from "ethers";

import type {
  CallRequest,
  ContractDescriptor,
  ContractFunction,
  ContractFunctionParam,
} from "./lib/types";
import { CallHistoryView, type CallHistoryRecord } from "./views/callHistory";
import {
  FunctionFormContext,
  FunctionFormSubmitPayload,
  FunctionFormView,
} from "./views/functionForm";
import {
  ContractListItem,
  ContractListView,
} from "./views/contractList";
import { loadEnvironmentConfig } from "./services/config";
import { createAbiRegistry } from "./services/abiRegistry";
import { createRpcProvider } from "./services/provider";
import {
  CallExecutionError,
  CallExecutor,
  type CallExecutionResult,
} from "./services/callExecutor";

async function bootstrap(): Promise<void> {
  const root = document.querySelector<HTMLElement>("#app-root");

  if (!root) {
    throw new Error("Missing #app-root container. Verify base template setup.");
  }

  root.dataset.status = "initializing";
  root.innerHTML = createShellTemplate();

  const contractListEl = root.querySelector<HTMLElement>("#contract-list");
  const functionFormEl = root.querySelector<HTMLElement>("#function-form");
  const historyEl = root.querySelector<HTMLElement>("#history-panel");
  const statusEl = root.querySelector<HTMLElement>("#status-panel");

  if (!contractListEl || !functionFormEl || !historyEl || !statusEl) {
    throw new Error("Base template missing required containers");
  }

  try {
    const { config, meta } = await loadEnvironmentConfig();
    updateStatus(statusEl, `正在连接 RPC ${config.rpcUrl}`, "info");

    const registry = createAbiRegistry();
    const provider = await createRpcProvider(config);
    const executor = new CallExecutor(provider, registry, {
      defaultAccount: config.defaultAccount,
    });

    const historyView = new CallHistoryView(historyEl);

    let activeContext: FunctionFormContext | null = null;
    const records = new Map<string, CallHistoryRecord>();

    const contractListView = new ContractListView(contractListEl, {
      onSelect: ({ contract, fn }) => {
        activeContext = { contract, fn };
        functionFormView.setContext(activeContext);
        updateStatus(statusEl, `已选择 ${contract.name} · ${fn.signature}`, "info");
      },
    });

    const functionFormView = new FunctionFormView(functionFormEl, {
      onSubmit: (payload) => {
        if (!activeContext) {
          updateStatus(statusEl, "请选择函数后再执行调用", "error");
          return;
        }

        handleExecution(
          executor,
          activeContext,
          payload,
          records,
          historyView,
          statusEl,
        ).catch((error) => {
          if (error instanceof CallExecutionError) {
            updateStatus(statusEl, error.detail.message, "error");
          } else if (error instanceof Error) {
            updateStatus(statusEl, error.message, "error");
          } else {
            updateStatus(statusEl, "调用执行发生未知错误", "error");
          }
        });
      },
      onValidationError: (errors) => {
        updateStatus(statusEl, errors.join("；"), "error");
      },
    });

    const items = await buildContractListItems(config.contracts, registry);

    if (items.length === 0) {
      updateStatus(statusEl, "未找到任何合约配置", "error");
    } else {
      contractListView.setItems(items);
      updateStatus(statusEl, `已加载 ${items.length} 个合约`, "success");
    }

    if (meta.contractsPath) {
      statusEl.dataset.contractsPath = meta.contractsPath;
    }

    root.dataset.status = "ready";
  } catch (error) {
    root.dataset.status = "error";
    if (statusEl) {
      if (error instanceof CallExecutionError) {
        updateStatus(statusEl, error.detail.message, "error");
      } else if (error instanceof Error) {
        updateStatus(statusEl, error.message, "error");
      } else {
        updateStatus(statusEl, "初始化失败", "error");
      }
    }
  }
}

function createShellTemplate(): string {
  return `
    <main id="app-shell">
      <aside id="contract-list" aria-label="合约列表"></aside>
      <section id="workspace">
        <section id="function-form" aria-label="函数表单"></section>
        <section id="status-panel" aria-label="状态栏" data-state="idle">系统尚未准备。</section>
        <section id="log-panel" aria-label="日志面板"></section>
      </section>
      <aside id="history-panel" aria-label="调用历史"></aside>
    </main>
  `;
}

async function buildContractListItems(
  descriptors: ContractDescriptor[],
  registry: ReturnType<typeof createAbiRegistry>,
): Promise<ContractListItem[]> {
  const items: ContractListItem[] = [];

  for (const descriptor of descriptors) {
    try {
      const entry = await registry.getInterface(descriptor);
      const functions = entry.iface.fragments
        .filter((fragment): fragment is FunctionFragment => fragment.type === "function")
        .map((fragment) => convertFragment(fragment));

      items.push({ descriptor, functions });
    } catch (error) {
      console.error("Failed to load ABI for", descriptor.id, error);
    }
  }

  return items;
}

async function handleExecution(
  executor: CallExecutor,
  context: FunctionFormContext,
  payload: FunctionFormSubmitPayload,
  records: Map<string, CallHistoryRecord>,
  historyView: CallHistoryView,
  statusEl: HTMLElement,
): Promise<void> {
  const request: CallRequest = {
    id: crypto.randomUUID(),
    contractId: context.contract.id,
    functionSignature: context.fn.signature,
    arguments: payload.arguments,
    value: payload.value,
    status: "validated",
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const record: CallHistoryRecord = { request };
  records.set(request.id, record);
  historyView.upsertRecord(record);

  updateStatus(statusEl, `已发起 ${context.fn.signature}`, "info");

  try {
    const result = await executor.execute({
      requestId: request.id,
      descriptor: context.contract,
      fn: context.fn,
      orderedArguments: payload.orderedArguments,
      overrides: {
        value: payload.value,
      },
      onStatusChange: (event) => {
        request.status = event.status;
        request.updatedAt = new Date();

        if (event.txHash) {
          request.txHash = event.txHash;
        }

        if (event.error) {
          request.error = event.error;
          updateStatus(statusEl, event.error.message, "error");
        }

        if (event.receipt) {
          record.response = event.receipt;
        }

        historyView.upsertRecord(record);
      },
      onLog: (event) => {
        if (event.level === "error") {
          updateStatus(statusEl, event.message, "error");
        }
      },
    });

    request.updatedAt = new Date();

    if (result.kind === "read") {
      record.response = result.result;
      request.status = "confirmed";
      updateStatus(statusEl, "读取成功", "success");
    } else {
      record.response = result.receipt;
      request.txHash = result.txHash;
      request.status = "confirmed";
      updateStatus(statusEl, `交易 ${result.txHash} 已确认`, "success");
    }

    historyView.upsertRecord(record);
  } catch (error) {
    if (error instanceof CallExecutionError) {
      request.status = "failed";
      request.error = error.detail;
      request.updatedAt = new Date();
      historyView.upsertRecord(record);
      throw error;
    }

    request.status = "failed";
    request.error = {
      code: "UNKNOWN",
      message: error instanceof Error ? error.message : "调用执行失败",
    };
    request.updatedAt = new Date();
    historyView.upsertRecord(record);
    throw error;
  }
}

function convertFragment(fragment: FunctionFragment): ContractFunction {
  const signature = fragment.format("sighash");

  return {
    signature,
    stateMutability: fragment.stateMutability,
    inputs: fragment.inputs.map(convertParam),
    outputs: fragment.outputs?.map(convertParam) ?? [],
    payable: fragment.stateMutability === "payable",
  };
}

function convertParam(param: ParamType): ContractFunctionParam {
  return {
    name: param.name ?? "",
    type: param.format("full"),
    internalType: param.internalType ?? param.type,
    components: param.components?.map(convertParam),
  };
}

function updateStatus(
  element: HTMLElement,
  message: string,
  variant: "info" | "error" | "success",
): void {
  element.textContent = message;
  element.dataset.state = variant;
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    void bootstrap();
  });
} else {
  void bootstrap();
}
