'use client';

import React, { useMemo, useState } from "react";
import { useOrganizerComponents } from "../../../features/components/useOrganizerComponents";

const STATUS_OPTIONS = [
  { value: "pending", label: "Pending" },
  { value: "confirmed", label: "Confirmed" },
  { value: "failed", label: "Failed" }
] as const;

type ComponentTypeFilter = "all" | "vault_implementation" | "price_source";

type StatusFilter = (typeof STATUS_OPTIONS)[number]["value"];

export default function OrganizerComponentsPage() {
  const [componentType, setComponentType] = useState<ComponentTypeFilter>("all");
  const [networkId, setNetworkId] = useState<string>("");
  const [selectedStatuses, setSelectedStatuses] = useState<StatusFilter[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);

  const query = useMemo(() => {
    return {
      type: componentType === "all" ? undefined : componentType,
      networkId: networkId ? Number(networkId) : undefined,
      statuses: selectedStatuses.length > 0 ? selectedStatuses : undefined,
      pageSize: 10,
      cursor
    };
  }, [componentType, networkId, selectedStatuses, cursor]);

  const { data, isFetching, error, refetch } = useOrganizerComponents(query);
  const items = data?.items ?? [];

  const toggleStatus = (status: StatusFilter) => {
    setCursor(null);
    setSelectedStatuses((prev) =>
      prev.includes(status) ? prev.filter((value) => value !== status) : [...prev, status]
    );
  };

  const resetFilters = () => {
    setComponentType("all");
    setNetworkId("");
    setSelectedStatuses([]);
    setCursor(null);
    void refetch();
  };

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">我的组件</h1>
        <p className="text-sm text-muted-foreground">
          查看并管理部署的 Vault 实现与 PriceSource 组件，可按网络与状态过滤结果。
        </p>
      </header>

      <section className="rounded border p-4">
        <form
          className="grid gap-4 md:grid-cols-[repeat(3,minmax(0,1fr))]"
          onSubmit={(event) => {
            event.preventDefault();
            setCursor(null);
            void refetch();
          }}
        >
          <label className="flex flex-col gap-1 text-sm">
            组件类型
            <select
              value={componentType}
              onChange={(event) => {
                setComponentType(event.target.value as ComponentTypeFilter);
                setCursor(null);
              }}
              className="rounded border px-2 py-1"
            >
              <option value="all">全部</option>
              <option value="vault_implementation">Vault 实现</option>
              <option value="price_source">PriceSource</option>
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm">
            网络 ID
            <input
              type="number"
              min={1}
              value={networkId}
              onChange={(event) => {
                setNetworkId(event.target.value);
                setCursor(null);
              }}
              className="rounded border px-2 py-1"
              placeholder="全部"
            />
          </label>

          <fieldset className="flex flex-col gap-2 text-sm">
            <legend>状态筛选</legend>
            <div className="flex flex-wrap gap-3">
              {STATUS_OPTIONS.map((option) => (
                <label key={option.value} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={selectedStatuses.includes(option.value)}
                    onChange={() => toggleStatus(option.value)}
                  />
                  {option.label}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="flex items-end gap-3">
            <button
              type="submit"
              className="rounded bg-black px-3 py-2 text-sm font-medium text-white"
            >
              应用
            </button>
            <button
              type="button"
              onClick={resetFilters}
              className="rounded border px-3 py-2 text-sm"
            >
              重置
            </button>
          </div>
        </form>
      </section>

      {error && (
        <p className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          加载失败：{error.message}
        </p>
      )}

      <section className="rounded border">
        <table className="w-full table-fixed text-sm">
          <thead className="bg-muted text-left">
            <tr>
              <th className="px-3 py-2">类型</th>
              <th className="px-3 py-2">网络</th>
              <th className="px-3 py-2">合约地址</th>
              <th className="px-3 py-2">状态</th>
              <th className="px-3 py-2">交易哈希</th>
              <th className="px-3 py-2">更新时间</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && !isFetching ? (
              <tr>
                <td className="px-3 py-4 text-center text-muted-foreground" colSpan={6}>
                  暂无符合条件的组件。
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={item.id} className="border-t">
                  <td className="px-3 py-2">{item.componentType}</td>
                  <td className="px-3 py-2">{item.networkId}</td>
                  <td className="px-3 py-2 font-mono text-xs">
                    {item.contractAddress} 
                  </td>
                  <td className="px-3 py-2">{item.status}</td>
                  <td className="px-3 py-2 font-mono text-xs">{item.transactionHash ?? "-"}</td>
                  <td className="px-3 py-2 text-xs">{item.updatedAt}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {isFetching ? "刷新中..." : `共 ${items.length} 项`}
        </span>
        <div className="flex gap-3">
          <button
            type="button"
            className="rounded border px-3 py-2 text-sm"
            onClick={() => setCursor(null)}
            disabled={!cursor}
          >
            返回首页
          </button>
          <button
            type="button"
            className="rounded border px-3 py-2 text-sm"
            onClick={() => setCursor(data?.nextCursor ?? null)}
            disabled={!data?.nextCursor}
          >
            下一页
          </button>
        </div>
      </div>
    </div>
  );
}
