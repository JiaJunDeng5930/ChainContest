'use client';

import { useTranslations } from "next-intl";

import ErrorBanner from "../../../components/ErrorBanner";
import { useRuntimeConfig } from "../../../features/runtime/hooks/useRuntimeConfig";

export default function RuntimeConfigPage() {
  const t = useTranslations();
  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
    isFallback,
    lastLoadedAt
  } = useRuntimeConfig();

  if (isLoading) {
    return (
      <main className="flex min-h-[50vh] items-center justify-center">
        <p className="text-sm text-slate-300">{t("runtime.loading", { defaultMessage: "加载运行时配置…" })}</p>
      </main>
    );
  }

  if (isError) {
    return (
      <main className="space-y-4">
        <ErrorBanner
          error={error}
          onRetry={async () => {
            await refetch();
          }}
          forceRetryable
        />
      </main>
    );
  }

  const contracts = data.contracts ?? [];
  const refreshedAtLabel = lastLoadedAt ? lastLoadedAt.toLocaleString() : null;

  return (
    <main className="space-y-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold text-slate-50">{t("runtime.title", { defaultMessage: "运行时配置" })}</h1>
        <p className="text-sm text-slate-300">
          {isFallback
            ? t("runtime.fallbackNotice", { defaultMessage: "当前显示默认配置，稍后请再次刷新。" })
            : t("runtime.description", {
                defaultMessage: "链上与 API 服务使用的实时配置，可用于排查本地环境问题。"
              })}
        </p>
        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
          {refreshedAtLabel ? <span>{t("runtime.refreshedAt", { defaultMessage: "刷新时间：{timestamp}" , timestamp: refreshedAtLabel })}</span> : null}
          <button
            type="button"
            onClick={() => {
              void refetch();
            }}
            className="rounded border border-slate-700 px-3 py-1 text-xs font-medium text-slate-200 transition hover:border-slate-500 hover:text-slate-50 focus:outline-none focus:ring focus:ring-slate-500/40"
          >
            {t("runtime.reload", { defaultMessage: "重新加载" })}
          </button>
        </div>
      </header>

      <section className="grid gap-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-6 text-sm text-slate-200 md:grid-cols-2">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-wide text-slate-400">{t("runtime.chainId", { defaultMessage: "链 ID" })}</p>
          <p className="text-base font-semibold text-white">{data.chainId}</p>
        </div>
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-wide text-slate-400">{t("runtime.rpcUrl", { defaultMessage: "RPC 地址" })}</p>
          <p className="font-mono break-all text-slate-100">{data.rpcUrl || t("runtime.emptyValue", { defaultMessage: "未配置" })}</p>
        </div>
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-wide text-slate-400">{t("runtime.devPort", { defaultMessage: "本地端口" })}</p>
          <p className="text-base font-semibold text-white">{data.devPort}</p>
        </div>
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-wide text-slate-400">{t("runtime.defaultAccount", { defaultMessage: "默认账户" })}</p>
          <p className="font-mono break-all text-slate-100">
            {data.defaultAccount ?? t("runtime.emptyValue", { defaultMessage: "未配置" })}
          </p>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">
            {t("runtime.contracts.title", { defaultMessage: "已注册合约" })}
          </h2>
          <span className="text-xs text-slate-400">
            {t("runtime.contracts.count", { defaultMessage: "{count} 个条目", count: contracts.length })}
          </span>
        </div>
        <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900/40">
          <table className="min-w-full table-fixed text-sm">
            <thead className="bg-slate-900/80 text-left text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="w-36 px-4 py-3">ID</th>
                <th className="w-40 px-4 py-3">名称</th>
                <th className="px-4 py-3">地址</th>
                <th className="w-40 px-4 py-3">ABI 路径</th>
                <th className="w-48 px-4 py-3">标签</th>
              </tr>
            </thead>
            <tbody>
              {contracts.length === 0 ? (
                <tr>
                  <td className="px-4 py-4 text-center text-slate-400" colSpan={5}>
                    {t("runtime.contracts.empty", { defaultMessage: "暂无合约配置" })}
                  </td>
                </tr>
              ) : (
                contracts.map((contract) => (
                  <tr key={`${contract.id}-${contract.address}`} className="border-t border-slate-800/60">
                    <td className="truncate px-4 py-3 font-mono text-xs text-slate-300">{contract.id}</td>
                    <td className="px-4 py-3 text-slate-100">{contract.name}</td>
                    <td className="px-4 py-3 font-mono text-xs text-emerald-200">{contract.address}</td>
                    <td className="truncate px-4 py-3 font-mono text-xs text-slate-300">{contract.abiPath}</td>
                    <td className="px-4 py-3 text-xs text-slate-300">
                      {contract.tags && contract.tags.length > 0 ? contract.tags.join(", ") : "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
