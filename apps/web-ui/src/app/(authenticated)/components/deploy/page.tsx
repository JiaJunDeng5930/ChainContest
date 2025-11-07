'use client';

import React, { useState } from "react";
import { useDeployComponent } from "../../../../features/components/useDeployComponent";

const DEFAULT_TWAP_SECONDS = 900;
const inputClassName =
  "rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20";

type ComponentType = "vault_implementation" | "price_source";

const extractContractAddress = (component: unknown): string => {
  if (!component || typeof component !== "object") {
    return "-";
  }

  const record = component as Record<string, unknown>;
  const value = record.contractAddress;
  return typeof value === "string" ? value : "-";
};

export default function DeployComponentPage() {
  const [componentType, setComponentType] = useState<ComponentType>("vault_implementation");
  const [networkIdInput, setNetworkIdInput] = useState<string>("11155111");
  const [baseAsset, setBaseAsset] = useState<string>("");
  const [quoteAsset, setQuoteAsset] = useState<string>("");
  const [poolAddress, setPoolAddress] = useState<string>("");
  const [twapSeconds, setTwapSeconds] = useState<number>(DEFAULT_TWAP_SECONDS);
  const [metadata, setMetadata] = useState<string>("");

  const mutation = useDeployComponent();

  const handleSubmit: React.FormEventHandler<HTMLFormElement> = (event) => {
    event.preventDefault();

    let parsedMetadata: Record<string, unknown> | undefined;
    if (metadata.trim().length > 0) {
      try {
        parsedMetadata = JSON.parse(metadata) as Record<string, unknown>;
      } catch (error) {
        alert(`无法解析元数据: ${(error as Error).message}`);
        return;
      }
    }

    const parsedNetworkId = Number.parseInt(networkIdInput, 10);
    if (!Number.isInteger(parsedNetworkId) || parsedNetworkId <= 0) {
      alert("请输入有效的网络 ID");
      return;
    }

    if (componentType === "vault_implementation") {
      mutation.mutate({
        componentType,
        networkId: parsedNetworkId,
        baseAsset,
        quoteAsset,
        metadata: parsedMetadata
      });
      return;
    }

    mutation.mutate({
      componentType,
      networkId: parsedNetworkId,
      poolAddress,
      twapSeconds,
      metadata: parsedMetadata
    });
  };

  const children: React.ReactNode[] = [];

  const header = React.createElement(
    "header",
    { className: "space-y-2" },
    React.createElement("h1", { className: "text-2xl font-semibold" }, "部署可复用组件"),
    React.createElement(
      "p",
      { className: "text-sm text-muted-foreground" },
      "部署 Vault 实现或 PriceSource，以便创建比赛时复用。"
    )
  );

  children.push(header);

  const formFields: React.ReactNode[] = [];

  const componentSelector = React.createElement(
    "fieldset",
    { className: "space-y-2" },
    React.createElement("legend", { className: "text-sm font-medium text-slate-200" }, "组件类型"),
    React.createElement(
      "div",
      { className: "flex gap-4" },
      React.createElement(
        "label",
        { className: "flex items-center gap-2 text-sm text-slate-100" },
        React.createElement("input", {
          type: "radio",
          name: "component-type",
          value: "vault_implementation",
          checked: componentType === "vault_implementation",
          onChange: () => setComponentType("vault_implementation"),
          className: "h-4 w-4 rounded border-slate-600 bg-slate-900 text-emerald-500 focus:ring-emerald-500/40"
        }),
        "Vault 实现"
      ),
      React.createElement(
        "label",
        { className: "flex items-center gap-2 text-sm text-slate-100" },
        React.createElement("input", {
          type: "radio",
          name: "component-type",
          value: "price_source",
          checked: componentType === "price_source",
          onChange: () => setComponentType("price_source"),
          className: "h-4 w-4 rounded border-slate-600 bg-slate-900 text-emerald-500 focus:ring-emerald-500/40"
        }),
        "PriceSource"
      )
    )
  );

  formFields.push(componentSelector);

  const networkField = React.createElement(
    "label",
    { className: "flex flex-col gap-1 text-sm text-slate-200" },
    "网络 ID",
    React.createElement("input", {
      type: "text",
      inputMode: "numeric",
      pattern: "[0-9]*",
      value: networkIdInput,
      onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
        const nextValue = event.target.value;
        if (nextValue === "") {
          setNetworkIdInput("");
          return;
        }
        if (/^\d+$/.test(nextValue)) {
          setNetworkIdInput(nextValue);
        }
      },
      className: inputClassName,
      placeholder: "请输入网络 ID"
    })
  );

  formFields.push(networkField);

  if (componentType === "vault_implementation") {
    formFields.push(
      React.createElement(
        "div",
        { className: "grid gap-4 md:grid-cols-2" },
        React.createElement(
          "label",
          { className: "flex flex-col gap-1 text-sm text-slate-200" },
          "Base Asset",
          React.createElement("input", {
            type: "text",
            value: baseAsset,
            onChange: (event: React.ChangeEvent<HTMLInputElement>) => setBaseAsset(event.target.value),
            className: inputClassName,
            placeholder: "0x..."
          })
        ),
        React.createElement(
          "label",
          { className: "flex flex-col gap-1 text-sm text-slate-200" },
          "Quote Asset",
          React.createElement("input", {
            type: "text",
            value: quoteAsset,
            onChange: (event: React.ChangeEvent<HTMLInputElement>) => setQuoteAsset(event.target.value),
            className: inputClassName,
            placeholder: "0x..."
          })
        )
      )
    );
  } else {
    formFields.push(
      React.createElement(
        "div",
        { className: "grid gap-4 md:grid-cols-2" },
        React.createElement(
          "label",
          { className: "flex flex-col gap-1 text-sm text-slate-200" },
          "池地址",
          React.createElement("input", {
            type: "text",
            value: poolAddress,
            onChange: (event: React.ChangeEvent<HTMLInputElement>) => setPoolAddress(event.target.value),
            className: inputClassName,
            placeholder: "0x..."
          })
        ),
        React.createElement(
          "label",
          { className: "flex flex-col gap-1 text-sm text-slate-200" },
          "TWAP 秒数",
          React.createElement("input", {
            type: "number",
            min: 60,
            value: twapSeconds,
            onChange: (event: React.ChangeEvent<HTMLInputElement>) => setTwapSeconds(Number(event.target.value)),
            className: inputClassName
          })
        )
      )
    );
  }

  const metadataField = React.createElement(
    "label",
    { className: "flex flex-col gap-1 text-sm text-slate-200" },
    "元数据 (JSON)",
    React.createElement("textarea", {
      value: metadata,
      onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => setMetadata(event.target.value),
      className: `h-24 font-mono text-xs ${inputClassName}`,
      placeholder: '{\n  "label": "My component"\n}'
    })
  );

  formFields.push(metadataField);

  const submitButton = React.createElement(
    "button",
    {
      type: "submit",
      className:
        "rounded bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50",
      disabled: mutation.isPending
    },
    mutation.isPending ? "部署中..." : "立即部署"
  );

  formFields.push(submitButton);

  const form = React.createElement(
    "form",
    { onSubmit: handleSubmit, className: "space-y-4" },
    ...formFields
  );

  children.push(form);

  if (mutation.isSuccess) {
    const deploymentSummary = React.createElement(
      "section",
      { className: "rounded border p-4 text-sm" },
      React.createElement("h2", { className: "text-base font-medium" }, "部署结果"),
      React.createElement(
        "dl",
        { className: "mt-2 space-y-1" },
        React.createElement(
          "div",
          { className: "flex gap-2" },
          React.createElement("dt", { className: "text-muted-foreground" }, "状态"),
          React.createElement("dd", null, mutation.data.status)
        ),
        React.createElement(
          "div",
          { className: "flex gap-2" },
          React.createElement("dt", { className: "text-muted-foreground" }, "合约地址"),
         React.createElement(
           "dd",
            null,
            extractContractAddress(mutation.data.component)
          )
        ),
        React.createElement(
          "div",
          { className: "flex gap-2" },
          React.createElement("dt", { className: "text-muted-foreground" }, "交易哈希"),
          React.createElement("dd", null, mutation.data.transactionHash ?? "-")
        )
      )
    );

    children.push(deploymentSummary);
  }

  if (mutation.isError) {
    children.push(
      React.createElement(
        "p",
        { className: "rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700" },
        `部署失败：${mutation.error.message}`
      )
    );
  }

  return React.createElement("div", { className: "space-y-6" }, ...children);
}
