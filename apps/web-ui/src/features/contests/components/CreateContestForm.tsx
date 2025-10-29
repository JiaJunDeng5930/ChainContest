"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";

import ErrorBanner from "../../../components/ErrorBanner";
import { useNetworkGateState } from "../../network/NetworkGate";
import {
  submitContestCreation,
  type ContestCreationAggregate
} from "../api/createContest";
import { useOrganizerComponents } from "../../components/useOrganizerComponents";
import type { OrganizerComponentItem } from "../../components/useOrganizerComponents";

const ADDRESS_REGEX = /^0x[0-9a-fA-F]{40}$/u;
const BYTES32_REGEX = /^0x[0-9a-fA-F]{64}$/u;

type FormMessages = {
  networkRequired: string;
  unsupportedNetwork: string;
  contestIdRequired: string;
  contestIdInvalid: string;
  vaultComponentRequired: string;
  priceSourceComponentRequired: string;
  entryAssetRequired: string;
  entryAssetInvalid: string;
  entryAmountRequired: string;
  entryFeeRequired: string;
  swapPoolRequired: string;
  swapPoolInvalid: string;
  numericRequired: string;
  dateRequired: string;
  dateInvalid: string;
  payoutScheduleRequired: string;
  payoutScheduleInvalid: string;
  metadataInvalid: string;
};

const numericStringSchema = (messages: FormMessages, field: keyof Pick<FormMessages, "entryAmountRequired" | "entryFeeRequired">) =>
  z
    .string()
    .min(1, { message: messages[field] })
    .refine((value) => {
      try {
        // eslint-disable-next-line no-new
        BigInt(value);
        return true;
      } catch {
        return false;
      }
    }, { message: messages.numericRequired });

const addressSchema = (requiredMessage: string, invalidMessage: string) =>
  z
    .string()
    .min(1, { message: requiredMessage })
    .refine((value) => ADDRESS_REGEX.test(value), { message: invalidMessage });

const datetimeSchema = (messages: FormMessages, field: keyof Pick<FormMessages, "dateRequired" | "dateInvalid">) =>
  z
    .string()
    .min(1, { message: messages[field] })
    .refine((value) => !Number.isNaN(Date.parse(value)), { message: messages.dateInvalid });

const buildFormSchema = (messages: FormMessages) =>
  z.object({
    networkId: z.string().min(1, { message: messages.networkRequired }),
    contestId: z
      .string()
      .min(1, { message: messages.contestIdRequired })
      .refine((value) => BYTES32_REGEX.test(value), { message: messages.contestIdInvalid }),
    vaultComponentId: z.string().min(1, { message: messages.vaultComponentRequired }),
    priceSourceComponentId: z.string().min(1, { message: messages.priceSourceComponentRequired }),
    entryAsset: addressSchema(messages.entryAssetRequired, messages.entryAssetInvalid),
    entryAmount: numericStringSchema(messages, "entryAmountRequired"),
    entryFee: numericStringSchema(messages, "entryFeeRequired"),
    swapPool: addressSchema(messages.swapPoolRequired, messages.swapPoolInvalid),
    priceToleranceBps: z
      .string()
      .min(1, { message: messages.numericRequired })
      .refine((value) => Number.isInteger(Number(value)) && Number(value) >= 0, {
        message: messages.numericRequired
      }),
    settlementWindow: z
      .string()
      .min(1, { message: messages.numericRequired })
      .refine((value) => Number.isInteger(Number(value)) && Number(value) > 0, {
        message: messages.numericRequired
      }),
    maxParticipants: z
      .string()
      .min(1, { message: messages.numericRequired })
      .refine((value) => Number.isInteger(Number(value)) && Number(value) > 0, {
        message: messages.numericRequired
      }),
    topK: z
      .string()
      .min(1, { message: messages.numericRequired })
      .refine((value) => Number.isInteger(Number(value)) && Number(value) > 0, {
        message: messages.numericRequired
      }),
    registeringEnds: datetimeSchema(messages, "dateRequired"),
    liveEnds: datetimeSchema(messages, "dateRequired"),
    claimEnds: datetimeSchema(messages, "dateRequired"),
    initialPrizeAmount: numericStringSchema(messages, "entryAmountRequired"),
    payoutSchedule: z
      .string()
      .min(1, { message: messages.payoutScheduleRequired })
      .refine((value) => {
        const parts = value
          .split(",")
          .map((part) => part.trim())
          .filter(Boolean);
        if (!parts.length || parts.length > 32) {
          return false;
        }
        return parts.every((part) => Number.isInteger(Number(part)) && Number(part) >= 0);
      }, { message: messages.payoutScheduleInvalid }),
    metadata: z
      .string()
      .optional()
      .refine((value) => {
        if (!value || !value.trim()) {
          return true;
        }
        try {
          JSON.parse(value);
          return true;
        } catch {
          return false;
        }
      }, { message: messages.metadataInvalid })
  });

type ContestFormSchema = ReturnType<typeof buildFormSchema>;
type ContestFormInput = z.input<ContestFormSchema>;

function generateContestId(): string {
  if (typeof crypto === "undefined" || !crypto.getRandomValues) {
    return "0x".padEnd(66, "0");
  }
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return `0x${Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")}`;
}

const toSeconds = (value: string): bigint => {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    throw new Error("Invalid datetime value");
  }
  return BigInt(Math.floor(timestamp / 1000));
};

const parsePayoutSchedule = (value: string): number[] =>
  value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => Number.parseInt(part, 10));

const parseMetadata = (value?: string) => {
  if (!value || !value.trim()) {
    return {} as Record<string, unknown>;
  }
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    return parsed;
  } catch {
    return {} as Record<string, unknown>;
  }
};

const SummarySection = ({
  title,
  items,
  emptyLabel
}: {
  title: string;
  items: Array<{ label: string; value: string | null }>;
  emptyLabel: string;
}) => (
  <section className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
    <h3 className="text-sm font-semibold text-slate-100">{title}</h3>
    {items.length === 0 ? (
      <p className="mt-2 text-sm text-slate-400">{emptyLabel}</p>
    ) : (
      <dl className="mt-3 grid gap-3 sm:grid-cols-2">
        {items.map((item) => (
          <div key={item.label} className="rounded border border-slate-800/60 bg-slate-950/40 p-3">
            <dt className="text-xs uppercase tracking-wide text-slate-400">{item.label}</dt>
            <dd className="mt-1 break-all text-sm text-slate-100">{item.value ?? "—"}</dd>
          </div>
        ))}
      </dl>
    )}
  </section>
);

export default function CreateContestForm() {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const { requiredChainId, isSupportedNetwork, isSessionActive } = useNetworkGateState();

  const messages = useMemo<FormMessages>(
    () => ({
      networkRequired: t("contests.create.validation.networkRequired", { defaultMessage: "请选择网络" }),
      unsupportedNetwork: t("contests.create.validation.networkUnsupported", { defaultMessage: "当前网络不受支持" }),
      contestIdRequired: t("contests.create.validation.contestIdRequired", { defaultMessage: "请填写 Contest ID" }),
      contestIdInvalid: t("contests.create.validation.contestIdInvalid", { defaultMessage: "Contest ID 必须为 32 字节十六进制" }),
      vaultComponentRequired: t("contests.create.validation.vaultComponentRequired", { defaultMessage: "请选择 Vault 组件" }),
      priceSourceComponentRequired: t("contests.create.validation.priceSourceComponentRequired", { defaultMessage: "请选择 Price Source 组件" }),
      entryAssetRequired: t("contests.create.validation.entryAssetRequired", { defaultMessage: "请填写参赛资产地址" }),
      entryAssetInvalid: t("contests.create.validation.entryAssetInvalid", { defaultMessage: "资产地址格式不正确" }),
      entryAmountRequired: t("contests.create.validation.entryAmountRequired", { defaultMessage: "请填写参赛金额" }),
      entryFeeRequired: t("contests.create.validation.entryFeeRequired", { defaultMessage: "请填写报名手续费" }),
      swapPoolRequired: t("contests.create.validation.swapPoolRequired", { defaultMessage: "请填写 Swap 池地址" }),
      swapPoolInvalid: t("contests.create.validation.swapPoolInvalid", { defaultMessage: "Swap 池地址格式不正确" }),
      numericRequired: t("contests.create.validation.numericRequired", { defaultMessage: "请输入有效的数字" }),
      dateRequired: t("contests.create.validation.dateRequired", { defaultMessage: "请填写时间" }),
      dateInvalid: t("contests.create.validation.dateInvalid", { defaultMessage: "时间格式不正确" }),
      payoutScheduleRequired: t("contests.create.validation.payoutScheduleRequired", { defaultMessage: "请填写奖金分配表" }),
      payoutScheduleInvalid: t("contests.create.validation.payoutScheduleInvalid", { defaultMessage: "奖金分配表需为不超过 32 个的非负整数" }),
      metadataInvalid: t("contests.create.validation.metadataInvalid", { defaultMessage: "Metadata 必须是合法 JSON" })
    }),
    [t]
  );

  const formSchema = useMemo(() => buildFormSchema(messages), [messages]);

  const defaultContestId = useMemo(() => generateContestId(), []);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
    watch,
    setValue
  } = useForm<ContestFormInput>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      networkId: requiredChainId ? String(requiredChainId) : "",
      contestId: defaultContestId,
      entryAsset: "0x0000000000000000000000000000000000000000",
      swapPool: "0x0000000000000000000000000000000000000000",
      priceToleranceBps: "50",
      settlementWindow: "3600",
      maxParticipants: "1000",
      topK: "10",
      payoutSchedule: "6000,3000,1000"
    }
  });

  useEffect(() => {
    if (requiredChainId) {
      setValue("networkId", String(requiredChainId));
    }
  }, [requiredChainId, setValue]);

  const networkIdValue = watch("networkId");
  const normalizedNetworkId = useMemo(() => {
    const parsed = Number.parseInt(networkIdValue, 10);
    return Number.isInteger(parsed) ? parsed : undefined;
  }, [networkIdValue]);

  const vaultQueryInput = useMemo(
    () => ({
      type: "vault_implementation" as const,
      statuses: ["confirmed"] as const,
      networkId: normalizedNetworkId,
      pageSize: 50
    }),
    [normalizedNetworkId]
  );

  const priceSourceQueryInput = useMemo(
    () => ({
      type: "price_source" as const,
      statuses: ["confirmed"] as const,
      networkId: normalizedNetworkId,
      pageSize: 50
    }),
    [normalizedNetworkId]
  );

  const vaultComponents = useOrganizerComponents(vaultQueryInput);
  const priceSourceComponents = useOrganizerComponents(priceSourceQueryInput);

  const findComponent = useCallback(
    (collection: OrganizerComponentItem[] | undefined, id: string): OrganizerComponentItem | null => {
      if (!collection) {
        return null;
      }
      return collection.find((item) => item.id === id) ?? null;
    },
    []
  );

  const [lastSubmitted, setLastSubmitted] = useState<ContestCreationAggregate | null>(null);

  const mutation = useMutation<ContestCreationAggregate, unknown, { networkId: number; payload: Record<string, unknown> }>(
    {
      mutationFn: submitContestCreation,
      onSuccess: async (data) => {
        setLastSubmitted(data);
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["contests"] }),
          queryClient.invalidateQueries({ queryKey: ["creator-contests"] }),
          queryClient.invalidateQueries({ queryKey: ["contest-requests"] })
        ]);
      }
    }
  );

  const onSubmit = useCallback(
    async (values: ContestFormInput) => {
      const networkId = Number.parseInt(values.networkId, 10);
      if (!Number.isInteger(networkId)) {
        throw new Error("Invalid networkId");
      }

      const vault = findComponent(vaultComponents.data?.items, values.vaultComponentId);
      const priceSource = findComponent(priceSourceComponents.data?.items, values.priceSourceComponentId);

      if (!vault) {
        throw new Error(messages.vaultComponentRequired);
      }

      if (!priceSource) {
        throw new Error(messages.priceSourceComponentRequired);
      }

      const registeringEnds = toSeconds(values.registeringEnds);
      const liveEnds = toSeconds(values.liveEnds);
      const claimEnds = toSeconds(values.claimEnds);
      const entryAmount = BigInt(values.entryAmount);
      const entryFee = BigInt(values.entryFee);
      const initialPrizeAmount = BigInt(values.initialPrizeAmount);
      const payoutSchedule = parsePayoutSchedule(values.payoutSchedule);

      mutation.reset();

      await mutation.mutateAsync({
        networkId,
        payload: {
          contestId: values.contestId,
          vaultComponentId: values.vaultComponentId,
          priceSourceComponentId: values.priceSourceComponentId,
          vaultImplementation: vault.contractAddress,
          config: {
            entryAsset: values.entryAsset,
            entryAmount: entryAmount.toString(),
            entryFee: entryFee.toString(),
            priceSource: priceSource.contractAddress,
            swapPool: values.swapPool,
            priceToleranceBps: Number.parseInt(values.priceToleranceBps, 10),
            settlementWindow: Number.parseInt(values.settlementWindow, 10),
            maxParticipants: Number.parseInt(values.maxParticipants, 10),
            topK: Number.parseInt(values.topK, 10)
          },
          timeline: {
            registeringEnds: registeringEnds.toString(),
            liveEnds: liveEnds.toString(),
            claimEnds: claimEnds.toString()
          },
          initialPrizeAmount: initialPrizeAmount.toString(),
          payoutSchedule,
          metadata: parseMetadata(values.metadata)
        }
      });
    },
    [findComponent, messages, mutation, priceSourceComponents.data, vaultComponents.data]
  );

  const disabledReason = useMemo(() => {
    if (!isSessionActive) {
      return t("contests.create.disabled.requiresLogin", { defaultMessage: "请先登录" });
    }
    if (!isSupportedNetwork) {
      return t("contests.create.disabled.unsupportedNetwork", { defaultMessage: "当前网络不受支持" });
    }
    if (vaultComponents.isLoading || priceSourceComponents.isLoading) {
      return t("contests.create.disabled.loadingComponents", { defaultMessage: "正在加载可复用组件" });
    }
    if ((vaultComponents.data?.items?.length ?? 0) === 0) {
      return t("contests.create.disabled.noVaultComponents", { defaultMessage: "请先部署 Vault 组件" });
    }
    if ((priceSourceComponents.data?.items?.length ?? 0) === 0) {
      return t("contests.create.disabled.noPriceSourceComponents", { defaultMessage: "请先部署 Price Source 组件" });
    }
    return null;
  }, [
    isSessionActive,
    isSupportedNetwork,
    priceSourceComponents.data?.items?.length,
    priceSourceComponents.isLoading,
    t,
    vaultComponents.data?.items?.length,
    vaultComponents.isLoading
  ]);

  const isSubmitDisabled = Boolean(disabledReason) || mutation.isPending || isSubmitting;

  const submitLabel = mutation.isPending
    ? t("contests.create.actions.submitting", { defaultMessage: "部署中..." })
    : t("contests.create.actions.submit", { defaultMessage: "部署比赛" });

  const resetForm = useCallback(() => {
    const generatedId = generateContestId();
    reset((previous) => ({
      ...previous,
      contestId: generatedId
    }));
  }, [reset]);

  return (
    <div className="space-y-6">
      {mutation.isError ? (
        <ErrorBanner
          title={t("contests.create.error.title", { defaultMessage: "部署失败" })}
          description={t("contests.create.error.description", { defaultMessage: "请稍后重试或查看日志。" })}
        />
      ) : null}

      <form
        className="space-y-6 rounded-lg border border-slate-800 bg-slate-950/40 p-6"
        onSubmit={handleSubmit(onSubmit)}
      >
        <fieldset className="space-y-4">
          <legend className="text-sm font-semibold text-slate-200">
            {t("contests.create.sections.setup", { defaultMessage: "基础配置" })}
          </legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-2 text-sm text-slate-200">
              <span>{t("contests.create.labels.network", { defaultMessage: "网络" })}</span>
              <input
                className="rounded border border-slate-800 bg-slate-900 p-2 text-slate-100"
                {...register("networkId")}
                disabled
              />
              {errors.networkId ? (
                <span className="text-xs text-rose-400">{errors.networkId.message}</span>
              ) : null}
            </label>
            <label className="flex flex-col gap-2 text-sm text-slate-200">
              <span>{t("contests.create.labels.contestId", { defaultMessage: "Contest ID" })}</span>
              <div className="flex gap-2">
                <input
                  className="flex-1 rounded border border-slate-800 bg-slate-900 p-2 text-slate-100"
                  {...register("contestId")}
                  placeholder="0x..."
                />
                <button
                  type="button"
                  className="rounded border border-slate-700 px-3 py-2 text-xs text-slate-200 hover:bg-slate-800"
                  onClick={resetForm}
                >
                  {t("contests.create.actions.shuffleContestId", { defaultMessage: "重新生成" })}
                </button>
              </div>
              {errors.contestId ? (
                <span className="text-xs text-rose-400">{errors.contestId.message}</span>
              ) : null}
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-2 text-sm text-slate-200">
              <span>{t("contests.create.labels.vaultComponent", { defaultMessage: "Vault 组件" })}</span>
              <select
                className="rounded border border-slate-800 bg-slate-900 p-2 text-slate-100"
                {...register("vaultComponentId")}
              >
                <option value="">{t("contests.create.options.selectPlaceholder", { defaultMessage: "请选择" })}</option>
                {vaultComponents.data?.items.map((item) => (
                  <option key={item.id} value={item.id}>
                    {`${item.contractAddress} (${item.networkId})`}
                  </option>
                ))}
              </select>
              {errors.vaultComponentId ? (
                <span className="text-xs text-rose-400">{errors.vaultComponentId.message}</span>
              ) : null}
            </label>
            <label className="flex flex-col gap-2 text-sm text-slate-200">
              <span>{t("contests.create.labels.priceSourceComponent", { defaultMessage: "Price Source 组件" })}</span>
              <select
                className="rounded border border-slate-800 bg-slate-900 p-2 text-slate-100"
                {...register("priceSourceComponentId")}
              >
                <option value="">{t("contests.create.options.selectPlaceholder", { defaultMessage: "请选择" })}</option>
                {priceSourceComponents.data?.items.map((item) => (
                  <option key={item.id} value={item.id}>
                    {`${item.contractAddress} (${item.networkId})`}
                  </option>
                ))}
              </select>
              {errors.priceSourceComponentId ? (
                <span className="text-xs text-rose-400">{errors.priceSourceComponentId.message}</span>
              ) : null}
            </label>
          </div>
        </fieldset>

        <fieldset className="space-y-4">
          <legend className="text-sm font-semibold text-slate-200">
            {t("contests.create.sections.configuration", { defaultMessage: "比赛参数" })}
          </legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-2 text-sm text-slate-200">
              <span>{t("contests.create.labels.entryAsset", { defaultMessage: "参赛资产地址" })}</span>
              <input
                className="rounded border border-slate-800 bg-slate-900 p-2 text-slate-100"
                {...register("entryAsset")}
                placeholder="0x..."
              />
              {errors.entryAsset ? (
                <span className="text-xs text-rose-400">{errors.entryAsset.message}</span>
              ) : null}
            </label>
            <label className="flex flex-col gap-2 text-sm text-slate-200">
              <span>{t("contests.create.labels.swapPool", { defaultMessage: "Swap 池地址" })}</span>
              <input
                className="rounded border border-slate-800 bg-slate-900 p-2 text-slate-100"
                {...register("swapPool")}
                placeholder="0x..."
              />
              {errors.swapPool ? (
                <span className="text-xs text-rose-400">{errors.swapPool.message}</span>
              ) : null}
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <label className="flex flex-col gap-2 text-sm text-slate-200">
              <span>{t("contests.create.labels.entryAmount", { defaultMessage: "参赛金额 (Wei)" })}</span>
              <input
                className="rounded border border-slate-800 bg-slate-900 p-2 text-slate-100"
                {...register("entryAmount")}
                placeholder="100000000000000000"
              />
              {errors.entryAmount ? (
                <span className="text-xs text-rose-400">{errors.entryAmount.message}</span>
              ) : null}
            </label>
            <label className="flex flex-col gap-2 text-sm text-slate-200">
              <span>{t("contests.create.labels.entryFee", { defaultMessage: "报名手续费 (Wei)" })}</span>
              <input
                className="rounded border border-slate-800 bg-slate-900 p-2 text-slate-100"
                {...register("entryFee")}
                placeholder="1000000000000000"
              />
              {errors.entryFee ? (
                <span className="text-xs text-rose-400">{errors.entryFee.message}</span>
              ) : null}
            </label>
            <label className="flex flex-col gap-2 text-sm text-slate-200">
              <span>{t("contests.create.labels.priceToleranceBps", { defaultMessage: "价格容忍度 (bps)" })}</span>
              <input
                className="rounded border border-slate-800 bg-slate-900 p-2 text-slate-100"
                {...register("priceToleranceBps")}
                placeholder="50"
              />
              {errors.priceToleranceBps ? (
                <span className="text-xs text-rose-400">{errors.priceToleranceBps.message}</span>
              ) : null}
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <label className="flex flex-col gap-2 text-sm text-slate-200">
              <span>{t("contests.create.labels.settlementWindow", { defaultMessage: "结算窗口 (秒)" })}</span>
              <input
                className="rounded border border-slate-800 bg-slate-900 p-2 text-slate-100"
                {...register("settlementWindow")}
                placeholder="3600"
              />
              {errors.settlementWindow ? (
                <span className="text-xs text-rose-400">{errors.settlementWindow.message}</span>
              ) : null}
            </label>
            <label className="flex flex-col gap-2 text-sm text-slate-200">
              <span>{t("contests.create.labels.maxParticipants", { defaultMessage: "参赛人数上限" })}</span>
              <input
                className="rounded border border-slate-800 bg-slate-900 p-2 text-slate-100"
                {...register("maxParticipants")}
                placeholder="1000"
              />
              {errors.maxParticipants ? (
                <span className="text-xs text-rose-400">{errors.maxParticipants.message}</span>
              ) : null}
            </label>
            <label className="flex flex-col gap-2 text-sm text-slate-200">
              <span>{t("contests.create.labels.topK", { defaultMessage: "获胜名额" })}</span>
              <input
                className="rounded border border-slate-800 bg-slate-900 p-2 text-slate-100"
                {...register("topK")}
                placeholder="10"
              />
              {errors.topK ? (
                <span className="text-xs text-rose-400">{errors.topK.message}</span>
              ) : null}
            </label>
          </div>
        </fieldset>

        <fieldset className="space-y-4">
          <legend className="text-sm font-semibold text-slate-200">
            {t("contests.create.sections.timeline", { defaultMessage: "时间轴" })}
          </legend>
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="flex flex-col gap-2 text-sm text-slate-200">
              <span>{t("contests.create.labels.registeringEnds", { defaultMessage: "报名截止" })}</span>
              <input
                type="datetime-local"
                className="rounded border border-slate-800 bg-slate-900 p-2 text-slate-100"
                {...register("registeringEnds")}
              />
              {errors.registeringEnds ? (
                <span className="text-xs text-rose-400">{errors.registeringEnds.message}</span>
              ) : null}
            </label>
            <label className="flex flex-col gap-2 text-sm text-slate-200">
              <span>{t("contests.create.labels.liveEnds", { defaultMessage: "交易截止" })}</span>
              <input
                type="datetime-local"
                className="rounded border border-slate-800 bg-slate-900 p-2 text-slate-100"
                {...register("liveEnds")}
              />
              {errors.liveEnds ? (
                <span className="text-xs text-rose-400">{errors.liveEnds.message}</span>
              ) : null}
            </label>
            <label className="flex flex-col gap-2 text-sm text-slate-200">
              <span>{t("contests.create.labels.claimEnds", { defaultMessage: "奖励领取截止" })}</span>
              <input
                type="datetime-local"
                className="rounded border border-slate-800 bg-slate-900 p-2 text-slate-100"
                {...register("claimEnds")}
              />
              {errors.claimEnds ? (
                <span className="text-xs text-rose-400">{errors.claimEnds.message}</span>
              ) : null}
            </label>
          </div>
        </fieldset>

        <fieldset className="space-y-4">
          <legend className="text-sm font-semibold text-slate-200">
            {t("contests.create.sections.rewards", { defaultMessage: "奖励设置" })}
          </legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-2 text-sm text-slate-200">
              <span>{t("contests.create.labels.initialPrizeAmount", { defaultMessage: "初始奖池 (Wei)" })}</span>
              <input
                className="rounded border border-slate-800 bg-slate-900 p-2 text-slate-100"
                {...register("initialPrizeAmount")}
                placeholder="1000000000000000000"
              />
              {errors.initialPrizeAmount ? (
                <span className="text-xs text-rose-400">{errors.initialPrizeAmount.message}</span>
              ) : null}
            </label>
            <label className="flex flex-col gap-2 text-sm text-slate-200">
              <span>{t("contests.create.labels.payoutSchedule", { defaultMessage: "奖金分配 (bps)" })}</span>
              <input
                className="rounded border border-slate-800 bg-slate-900 p-2 text-slate-100"
                {...register("payoutSchedule")}
                placeholder="6000,3000,1000"
              />
              {errors.payoutSchedule ? (
                <span className="text-xs text-rose-400">{errors.payoutSchedule.message}</span>
              ) : null}
            </label>
          </div>

          <label className="flex flex-col gap-2 text-sm text-slate-200">
            <span>{t("contests.create.labels.metadata", { defaultMessage: "附加 Metadata" })}</span>
            <textarea
              rows={4}
              className="rounded border border-slate-800 bg-slate-900 p-2 text-sm text-slate-100"
              {...register("metadata")}
              placeholder='{ "notes": "optional" }'
            />
            {errors.metadata ? (
              <span className="text-xs text-rose-400">{errors.metadata.message}</span>
            ) : null}
          </label>
        </fieldset>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-slate-700"
            disabled={isSubmitDisabled}
          >
            {submitLabel}
          </button>
          {disabledReason ? <span className="text-xs text-slate-400">{disabledReason}</span> : null}
        </div>
      </form>

      {lastSubmitted ? (
        <div className="space-y-4">
          <SummarySection
            title={t("contests.create.summary.request", { defaultMessage: "请求详情" })}
            emptyLabel={t("contests.create.summary.empty", { defaultMessage: "暂无数据" })}
            items={[
              { label: t("contests.create.summary.status", { defaultMessage: "状态" }), value: lastSubmitted.status },
              { label: t("contests.create.summary.requestId", { defaultMessage: "请求 ID" }), value: lastSubmitted.request.requestId },
              { label: t("contests.create.summary.transactionHash", { defaultMessage: "交易哈希" }), value: lastSubmitted.request.transactionHash },
              { label: t("contests.create.summary.confirmedAt", { defaultMessage: "确认时间" }), value: lastSubmitted.request.confirmedAt ?? null }
            ]}
          />
          <SummarySection
            title={t("contests.create.summary.artifact", { defaultMessage: "部署产物" })}
            emptyLabel={t("contests.create.summary.empty", { defaultMessage: "暂无数据" })}
            items={lastSubmitted.artifact
              ? [
                  { label: t("contests.create.summary.contestAddress", { defaultMessage: "Contest 地址" }), value: lastSubmitted.artifact.contestAddress },
                  { label: t("contests.create.summary.vaultFactoryAddress", { defaultMessage: "VaultFactory 地址" }), value: lastSubmitted.artifact.vaultFactoryAddress },
                  { label: t("contests.create.summary.transactionHash", { defaultMessage: "交易哈希" }), value: lastSubmitted.artifact.transactionHash },
                  { label: t("contests.create.summary.confirmedAt", { defaultMessage: "确认时间" }), value: lastSubmitted.artifact.confirmedAt ?? null }
                ]
              : []}
          />
        </div>
      ) : null}
    </div>
  );
}
