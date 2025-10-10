import "./styles/index.css";

import { FunctionFragment, ParamType } from "ethers";

import type {
  CallRequest,
  ContractDescriptor,
  ContractFunction,
  ContractFunctionParam,
} from "./lib/types";
import { CallHistoryView, type CallHistoryRecord } from "./views/callHistory";
import { LogPanelView } from "./views/logPanel";
import { ErrorOverlay } from "./views/errorOverlay";
import { ConnectionBanner } from "./views/connectionBanner";
import {
  FunctionFormContext,
  FunctionFormSubmitPayload,
  FunctionFormView,
} from "./views/functionForm";
import {
  ContractListItem,
  ContractListView,
} from "./views/contractList";
import { performStartup } from "./services/startup";
import type { AbiRegistry } from "./services/abiRegistry";
import { CallExecutionError, CallExecutor } from "./services/callExecutor";
import { StatusTracker } from "./services/statusTracker";
import { LogPipeline } from "./services/logPipeline";

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
  const logEl = root.querySelector<HTMLElement>("#log-panel");
  const bannerEl = root.querySelector<HTMLElement>("#connection-banner");
  const errorOverlayEl = root.querySelector<HTMLElement>("#error-overlay");

  if (
    !contractListEl ||
    !functionFormEl ||
    !historyEl ||
    !statusEl ||
    !logEl ||
    !bannerEl ||
    !errorOverlayEl
  ) {
    throw new Error("Base template missing required containers");
  }

  const errorOverlay = new ErrorOverlay(errorOverlayEl);

  try {
    const startup = await performStartup();

    if (!startup.ok) {
      errorOverlay.show(startup.error);
      updateStatus(statusEl, startup.error.message, "error");
      root.dataset.status = "error";
      return;
    }

    const connectionBanner = new ConnectionBanner(bannerEl);
    const configContext = startup.config;
    const envConfig = configContext.config;

    updateStatus(statusEl, `正在连接 RPC ${envConfig.rpcUrl}`, "info");
    connectionBanner.setState({
      rpcUrl: envConfig.rpcUrl,
      chainId: envConfig.chainId,
      defaultAccount: envConfig.defaultAccount,
      status: "connected",
      message: "RPC 节点连接正常",
    });

    const historyView = new CallHistoryView(historyEl);
    const logPanelView = new LogPanelView(logEl);
    const statusTracker = new StatusTracker();
    const logPipeline = new LogPipeline();
    const executor = new CallExecutor(startup.provider, startup.registry, {
      defaultAccount: envConfig.defaultAccount,
    });

    logPipeline.subscribe((entry) => {
      logPanelView.append(entry);
    });

    let activeContext: FunctionFormContext | null = null;
    const records = new Map<string, CallHistoryRecord>();
    const activeRequestRef: { id: string | null } = { id: null };
    const baseBannerState = {
      rpcUrl: envConfig.rpcUrl,
      chainId: envConfig.chainId,
      defaultAccount: envConfig.defaultAccount,
    };

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
          statusTracker,
          logPipeline,
          activeContext,
          payload,
          records,
          historyView,
          statusEl,
          functionFormView,
          activeRequestRef,
          errorOverlay,
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

    statusTracker.subscribe((event) => {
      let record = records.get(event.request.id);
      if (!record) {
        record = { request: event.request };
        records.set(event.request.id, record);
      } else {
        record.request = event.request;
      }

      historyView.upsertRecord(record);
      historyView.updateStatus(event.request.id, event.request.status);

      if (activeRequestRef.id === event.request.id) {
        const detail = event.request.error?.message;
        functionFormView.setStatus(event.request.status, detail);
      }

      if (event.request.error) {
        connectionBanner.setState({
          ...baseBannerState,
          status: "degraded",
          message: event.request.error.message,
        });
      } else if (event.request.status === "confirmed") {
        connectionBanner.setState({
          ...baseBannerState,
          status: "connected",
          message: "RPC 节点连接正常",
        });
      }
    });

    const items = await buildContractListItems(envConfig.contracts, startup.registry);

    if (items.length === 0) {
      updateStatus(statusEl, "未找到任何合约配置", "error");
    } else {
      contractListView.setItems(items);
      updateStatus(statusEl, `已加载 ${items.length} 个合约`, "success");
    }

    if (configContext.meta.contractsPath) {
      statusEl.dataset.contractsPath = configContext.meta.contractsPath;
    }

    root.dataset.status = "ready";
  } catch (error) {
    root.dataset.status = "error";
    const detail =
      error instanceof CallExecutionError
        ? error.detail
        : {
            code: error instanceof Error ? error.name || "UNEXPECTED" : "UNEXPECTED",
            message: error instanceof Error ? error.message : "初始化失败",
            raw: error,
          };
    updateStatus(statusEl, detail.message, "error");
    errorOverlay.show(detail);
  }
}

function createShellTemplate(): string {
  return `
    <main id="app-shell">
      <aside id="contract-list" aria-label="合约列表"></aside>
      <section id="workspace">
        <section id="connection-banner" aria-label="连接状态"></section>
        <section id="function-form" aria-label="函数表单"></section>
        <section id="status-panel" aria-label="状态栏" data-state="idle">系统尚未准备。</section>
        <section id="log-panel" aria-label="日志面板"></section>
      </section>
      <aside id="history-panel" aria-label="调用历史"></aside>
    </main>
    <section id="error-overlay" aria-hidden="true"></section>
  `;
}

async function buildContractListItems(
  descriptors: ContractDescriptor[],
  registry: AbiRegistry,
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
  tracker: StatusTracker,
  logger: LogPipeline,
  context: FunctionFormContext,
  payload: FunctionFormSubmitPayload,
  records: Map<string, CallHistoryRecord>,
  historyView: CallHistoryView,
  statusEl: HTMLElement,
  functionFormView: FunctionFormView,
  activeRequestRef: { id: string | null },
  errorOverlay: ErrorOverlay,
): Promise<void> {
  const baseRequest: CallRequest = {
    id: crypto.randomUUID(),
    contractId: context.contract.id,
    functionSignature: context.fn.signature,
    arguments: payload.arguments,
    value: payload.value,
    status: "validated",
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const tracked = tracker.register(baseRequest);
  const record: CallHistoryRecord = { request: tracked };
  records.set(tracked.id, record);
  historyView.upsertRecord(record);
  historyView.updateStatus(tracked.id, tracked.status);
  functionFormView.setStatus(tracked.status, "待执行");

  activeRequestRef.id = tracked.id;
  errorOverlay.hide();

  updateStatus(statusEl, `已发起 ${context.fn.signature}`, "info");

  try {
    const result = await executor.execute({
      requestId: tracked.id,
      descriptor: context.contract,
      fn: context.fn,
      orderedArguments: payload.orderedArguments,
      overrides: {
        value: payload.value,
      },
      onStatusChange: (event) => {
        tracker.update({
          requestId: event.requestId,
          status: event.status,
          txHash: event.txHash,
          error: event.error,
        });

        if (event.receipt) {
          const target = records.get(event.requestId);
          if (target) {
            target.response = event.receipt;
            historyView.upsertRecord(target);
          }
        }

        if (event.status === "failed" && event.error) {
          updateStatus(statusEl, event.error.message, "error");
        }
      },
      onLog: (event) => {
        logger.push({
          level: event.level,
          source: event.source,
          message: event.message,
          context: { ...event.context, requestId: tracked.id },
        });

        if (event.level === "error") {
          updateStatus(statusEl, event.message, "error");
        }
      },
    });

    if (result.kind === "read") {
      const target = records.get(tracked.id);
      if (target) {
        target.response = result.result;
        historyView.upsertRecord(target);
      }
      tracker.update({
        requestId: tracked.id,
        status: "confirmed",
      });
      updateStatus(statusEl, "读取成功", "success");
      functionFormView.setStatus("confirmed", "读取成功");
      errorOverlay.hide();
    } else {
      const target = records.get(tracked.id);
      if (target) {
        target.response = result.receipt;
        historyView.upsertRecord(target);
      }
      tracker.update({
        requestId: tracked.id,
        status: "confirmed",
        txHash: result.txHash,
      });
      updateStatus(statusEl, `交易 ${result.txHash} 已确认`, "success");
      functionFormView.setStatus("confirmed", "交易已确认");
      errorOverlay.hide();
    }
  } catch (error) {
    const detail =
      error instanceof CallExecutionError
        ? error.detail
        : {
            code: "UNKNOWN",
            message: error instanceof Error ? error.message : "调用执行失败",
          };

    tracker.update({
      requestId: baseRequest.id,
      status: "failed",
      error: detail,
    });

    logger.push({
      level: "error",
      source: "ui",
      message: detail.message,
      context: { requestId: baseRequest.id },
    });

    updateStatus(statusEl, detail.message, "error");
    functionFormView.setStatus("failed", detail.message);
    errorOverlay.show(detail);

    if (error instanceof CallExecutionError) {
      throw error;
    }

    throw error instanceof Error ? error : new Error("调用执行失败");
  } finally {
    activeRequestRef.id = null;
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
