"use client";

import {
  CHAIN_METADATA,
  SUPPORTED_CHAIN_IDS,
  type SupportedChainId
} from "@chaincontest/shared-i18n";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import ErrorBanner from "../../../components/ErrorBanner";
import { useNetworkGateState } from "../../network/NetworkGate";
import {
  submitContestCreation,
  type ContestCreationAggregate,
  type ContestCreationPayload
} from "../api/createContest";

const DEFAULT_PAYLOAD_TEMPLATE = `{
  "name": "Velocity Cup",
  "symbol": "VEL",
  "registrationWindow": {
    "opensAt": "2025-11-01T00:00:00Z",
    "closesAt": "2025-11-07T00:00:00Z"
  },
  "entryFee": "100000000000000000",
  "rewardToken": {
    "address": "0x0000000000000000000000000000000000000000"
  }
}`;

type CreateContestFormMessages = {
  networkRequired: string;
  unsupportedNetwork: string;
  payloadRequired: string;
  payloadInvalidJson: string;
  payloadInvalidStructure: string;
};

function buildCreateContestFormSchema(messages: CreateContestFormMessages) {
  return z.object({
    networkId: z
      .string()
      .min(1, { message: messages.networkRequired })
      .refine((value) => {
        const parsed = Number.parseInt(value, 10);
        return Number.isInteger(parsed);
      }, { message: messages.networkRequired })
      .refine((value) => {
        const parsed = Number.parseInt(value, 10);
        return SUPPORTED_CHAIN_IDS.includes(parsed as SupportedChainId);
      }, { message: messages.unsupportedNetwork }),
    payload: z
      .string()
      .min(1, { message: messages.payloadRequired })
      .superRefine((value, ctx) => {
        try {
          const parsed = JSON.parse(value) as unknown;
          if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: messages.payloadInvalidStructure
            });
          }
        } catch {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: messages.payloadInvalidJson
          });
        }
      })
  });
}

type CreateContestFormSchema = ReturnType<typeof buildCreateContestFormSchema>;
type CreateContestFormInput = z.input<CreateContestFormSchema>;

function formatIsoDate(isoString: string): string {
  const timestamp = Number.isNaN(Date.parse(isoString)) ? null : new Date(isoString);
  return timestamp ? timestamp.toLocaleString() : isoString;
}

type SummarySectionProps = {
  title: string;
  items: Array<{ label: string; value: string | null }>;
  metadata?: Record<string, unknown> | null;
  payload?: Record<string, unknown> | null;
  emptyLabel?: string;
  payloadLabel: string;
  metadataLabel: string;
};

function SummarySection({
  title,
  items,
  metadata,
  payload,
  emptyLabel,
  payloadLabel,
  metadataLabel
}: SummarySectionProps) {
  const hasContent = items.length > 0 || (metadata && Object.keys(metadata).length > 0) || payload;

  if (!hasContent) {
    return (
      <section className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
        <h3 className="text-sm font-semibold text-slate-100">{title}</h3>
        <p className="mt-2 text-sm text-slate-400">{emptyLabel}</p>
      </section>
    );
  }

  return (
    <section className="space-y-3 rounded-lg border border-slate-800 bg-slate-900/60 p-4">
      <h3 className="text-sm font-semibold text-slate-100">{title}</h3>
      {items.length ? (
        <dl className="grid gap-3 sm:grid-cols-2">
          {items.map((item) => (
            <div key={item.label} className="rounded border border-slate-800/60 bg-slate-950/40 p-3">
              <dt className="text-xs uppercase tracking-wide text-slate-400">{item.label}</dt>
              <dd className="mt-1 break-all text-sm text-slate-100">{item.value ?? "—"}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {payload ? (
        <div>
          <h4 className="text-xs uppercase tracking-wide text-slate-400">{payloadLabel}</h4>
          <pre className="mt-2 overflow-x-auto rounded border border-slate-800/60 bg-slate-950/60 p-3 text-xs text-slate-200">
            {JSON.stringify(payload, null, 2)}
          </pre>
        </div>
      ) : null}
      {metadata && Object.keys(metadata).length ? (
        <div>
          <h4 className="text-xs uppercase tracking-wide text-slate-400">{metadataLabel}</h4>
          <pre className="mt-2 overflow-x-auto rounded border border-slate-800/60 bg-slate-950/60 p-3 text-xs text-slate-200">
            {JSON.stringify(metadata, null, 2)}
          </pre>
        </div>
      ) : null}
    </section>
  );
}

export default function CreateContestForm() {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const { requiredChainId, isSupportedNetwork, isSessionActive } = useNetworkGateState();

  const validationMessages = useMemo<CreateContestFormMessages>(
    () => ({
      networkRequired: t("contests.create.validation.networkRequired"),
      unsupportedNetwork: t("contests.create.validation.networkUnsupported"),
      payloadRequired: t("contests.create.validation.payloadRequired"),
      payloadInvalidJson: t("contests.create.validation.payloadInvalidJson"),
      payloadInvalidStructure: t("contests.create.validation.payloadInvalidStructure")
    }),
    [t]
  );

  const schema = useMemo(() => buildCreateContestFormSchema(validationMessages), [validationMessages]);

  const defaultNetworkValue = requiredChainId ? String(requiredChainId) : "";

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset
  } = useForm<CreateContestFormInput>({
    resolver: zodResolver(schema),
    defaultValues: {
      networkId: defaultNetworkValue,
      payload: DEFAULT_PAYLOAD_TEMPLATE
    },
    mode: "onChange",
    reValidateMode: "onChange"
  });

  useEffect(() => {
    reset((previous) => ({
      ...previous,
      networkId: defaultNetworkValue || previous?.networkId || ""
    }));
  }, [defaultNetworkValue, reset]);

  const mutation = useMutation<ContestCreationAggregate, unknown, { networkId: number; payload: ContestCreationPayload }>({
    mutationFn: submitContestCreation,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          predicate: (query) => Array.isArray(query.queryKey) && query.queryKey[0] === "contests"
        }),
        queryClient.invalidateQueries({
          predicate: (query) => Array.isArray(query.queryKey) && query.queryKey[0] === "creator-contests"
        })
      ]);
    }
  });

  const onSubmit = useCallback(
    async (values: CreateContestFormInput) => {
      const networkId = Number.parseInt(values.networkId, 10);
      let payload: ContestCreationPayload;

      try {
        payload = JSON.parse(values.payload) as ContestCreationPayload;
      } catch (error) {
        // Validation should prevent this, but bail out gracefully if parsing fails.
        throw error instanceof Error ? error : new Error("Unable to parse contest payload");
      }

      mutation.reset();
      await mutation.mutateAsync({ networkId, payload });
    },
    [mutation]
  );

  const chainOptions = useMemo(
    () =>
      SUPPORTED_CHAIN_IDS.map((chainId) => ({
        value: String(chainId),
        label: t(CHAIN_METADATA[chainId].nameKey)
      })),
    [t]
  );

  const disabledReason = !isSessionActive
    ? t("contests.create.disabled.requiresLogin")
    : !isSupportedNetwork
      ? t("contests.create.disabled.unsupportedNetwork")
      : null;

  const isSubmitDisabled = Boolean(disabledReason) || mutation.isPending || isSubmitting;

  const latestResult = mutation.data ?? null;
  const sectionLabels = useMemo(
    () => ({
      payload: t("contests.create.result.payloadLabel"),
      metadata: t("contests.create.result.metadataLabel")
    }),
    [t]
  );

  return (
    <section className="space-y-6">
      <header className="space-y-2">
        <h2 className="text-xl font-semibold text-slate-50">{t("contests.create.title")}</h2>
        <p className="text-sm text-slate-300">{t("contests.create.description")}</p>
      </header>

      <form
        className="space-y-5 rounded-lg border border-slate-800 bg-slate-950/40 p-6"
        onSubmit={handleSubmit(onSubmit)}
        noValidate
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <label className="flex flex-col gap-2">
            <span className="text-xs uppercase tracking-wide text-slate-400">
              {t("contests.create.fields.network")}
            </span>
            <select
              {...register("networkId")}
              className={`rounded-lg border px-3 py-2 text-sm outline-none transition ${
                errors.networkId
                  ? "border-rose-500 bg-rose-950/40 text-rose-100 focus:border-rose-400 focus:ring-rose-400/40"
                  : "border-slate-700 bg-slate-900/60 text-slate-100 focus:border-slate-400 focus:ring-slate-400/40"
              }`}
              disabled={mutation.isPending}
            >
              <option value="">{t("contests.create.fields.networkPlaceholder")}</option>
              {chainOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            {errors.networkId ? (
              <span className="text-xs text-rose-300">{errors.networkId.message}</span>
            ) : null}
          </label>

          <div className="flex flex-col gap-2">
            <span className="text-xs uppercase tracking-wide text-slate-400">
              {t("contests.create.fields.payload")}
            </span>
            <textarea
              {...register("payload")}
              rows={12}
              className={`min-h-[240px] rounded-lg border px-3 py-2 text-sm font-mono outline-none transition ${
                errors.payload
                  ? "border-rose-500 bg-rose-950/40 text-rose-100 focus:border-rose-400 focus:ring-rose-400/40"
                  : "border-slate-700 bg-slate-900/60 text-slate-100 focus:border-slate-400 focus:ring-slate-400/40"
              }`}
              spellCheck={false}
              disabled={mutation.isPending}
            />
            <p className="text-xs text-slate-400">
              {t("contests.create.fields.payloadHelp")}
            </p>
            {errors.payload ? (
              <span className="text-xs text-rose-300">{errors.payload.message}</span>
            ) : null}
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <button
            type="submit"
            className="w-full rounded-lg bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-300 sm:w-auto"
            disabled={isSubmitDisabled}
          >
            {mutation.isPending ? t("contests.create.actions.submitting") : t("contests.create.actions.submit")}
          </button>
          <button
            type="button"
            className="w-full rounded-lg border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-slate-500 hover:text-slate-50 sm:w-auto"
            onClick={() =>
              reset({
                networkId: defaultNetworkValue,
                payload: DEFAULT_PAYLOAD_TEMPLATE
              })
            }
            disabled={mutation.isPending}
          >
            {t("contests.create.actions.reset")}
          </button>
          {disabledReason ? <p className="text-xs text-amber-300 sm:ml-4">{disabledReason}</p> : null}
        </div>
      </form>

      {mutation.isError ? (
        <ErrorBanner error={mutation.error} />
      ) : mutation.isSuccess ? (
        <div className="space-y-4 rounded-lg border border-slate-800 bg-slate-950/50 p-6">
          <header className="space-y-1">
            <h3 className="text-lg font-semibold text-slate-50">{t("contests.create.result.title")}</h3>
            <p className="text-sm text-slate-300">
              {t("contests.create.result.subtitle", { status: latestResult?.status ?? "unknown" })}
            </p>
          </header>
          {latestResult ? (
            <div className="space-y-4">
              <SummarySection
                title={t("contests.create.result.requestHeading")}
                items={[
                  {
                    label: t("contests.create.result.requestId"),
                    value: latestResult.request.requestId
                  },
                  {
                    label: t("contests.create.result.userId"),
                    value: latestResult.request.userId
                  },
                  {
                    label: t("contests.create.result.networkId"),
                    value: String(latestResult.request.networkId)
                  },
                  {
                    label: t("contests.create.result.createdAt"),
                    value: formatIsoDate(latestResult.request.createdAt)
                  },
                  {
                    label: t("contests.create.result.updatedAt"),
                    value: formatIsoDate(latestResult.request.updatedAt)
                  }
                ]}
                payload={latestResult.request.payload}
                metadata={null}
                payloadLabel={sectionLabels.payload}
                metadataLabel={sectionLabels.metadata}
              />
              <SummarySection
                title={t("contests.create.result.artifactHeading")}
                items={
                  latestResult.artifact
                    ? [
                        {
                          label: t("contests.create.result.artifactId"),
                          value: latestResult.artifact.artifactId
                        },
                        {
                          label: t("contests.create.result.requestId"),
                          value: latestResult.artifact.requestId
                        },
                        {
                          label: t("contests.create.result.contestId"),
                          value: latestResult.artifact.contestId
                        },
                        {
                          label: t("contests.create.result.networkId"),
                          value: String(latestResult.artifact.networkId)
                        },
                        {
                          label: t("contests.create.result.registrarAddress"),
                          value: latestResult.artifact.registrarAddress
                        },
                        {
                          label: t("contests.create.result.treasuryAddress"),
                          value: latestResult.artifact.treasuryAddress
                        },
                        {
                          label: t("contests.create.result.settlementAddress"),
                          value: latestResult.artifact.settlementAddress
                        },
                        {
                          label: t("contests.create.result.rewardsAddress"),
                          value: latestResult.artifact.rewardsAddress
                        },
                        {
                          label: t("contests.create.result.createdAt"),
                          value: formatIsoDate(latestResult.artifact.createdAt)
                        },
                        {
                          label: t("contests.create.result.updatedAt"),
                          value: formatIsoDate(latestResult.artifact.updatedAt)
                        }
                      ]
                    : []
                }
                metadata={latestResult.artifact?.metadata ?? null}
                emptyLabel={t("contests.create.result.artifactPending")}
                payloadLabel={sectionLabels.payload}
                metadataLabel={sectionLabels.metadata}
              />
              <SummarySection
                title={t("contests.create.result.receiptHeading")}
                items={[
                  {
                    label: t("contests.create.result.receiptStatus"),
                    value: latestResult.receipt.status
                  },
                  {
                    label: t("contests.create.result.requestId"),
                    value: latestResult.receipt.requestId
                  },
                  {
                    label: t("contests.create.result.organizer"),
                    value: latestResult.receipt.organizer
                  },
                  {
                    label: t("contests.create.result.networkId"),
                    value: String(latestResult.receipt.networkId)
                  },
                  {
                    label: t("contests.create.result.acceptedAt"),
                    value: formatIsoDate(latestResult.receipt.acceptedAt)
                  }
                ]}
                metadata={latestResult.receipt.metadata}
                payloadLabel={sectionLabels.payload}
                metadataLabel={sectionLabels.metadata}
              />
            </div>
          ) : null}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-slate-800 bg-slate-950/30 p-6">
          <p className="text-sm text-slate-400">{t("contests.create.result.placeholder")}</p>
        </div>
      )}
    </section>
  );
}
