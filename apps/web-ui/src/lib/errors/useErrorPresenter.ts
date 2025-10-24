"use client";

import { ERROR_MESSAGE_KEYS } from "@chaincontest/shared-i18n";
import { useTranslations } from "next-intl";
import { useCallback } from "react";

import { ApiError } from "../api/client";

export type PresentedError = {
  headline: string;
  description?: string;
  detailItems?: string[];
  status?: number;
  code?: string;
  retryable: boolean;
};

type ApiErrorBody = {
  code?: string;
  message?: string;
  detail?: unknown;
};

const STATUS_TO_KEY: Partial<Record<number, keyof typeof ERROR_MESSAGE_KEYS>> = {
  400: "validation",
  401: "unauthorized",
  403: "forbidden",
  404: "notFound",
  408: "timeout",
  409: "validation",
  422: "validation",
  429: "timeout"
};

const ERROR_CODE_TO_KEY: Record<string, keyof typeof ERROR_MESSAGE_KEYS> = {
  CHAIN_MISMATCH: "chainMismatch",
  CHAIN_UNSUPPORTED: "chainMismatch",
  SESSION_EXPIRED: "unauthorized"
};

function normalizeDetail(detail: unknown): { description?: string; detailItems?: string[] } {
  if (!detail) {
    return {};
  }

  if (Array.isArray(detail)) {
    return {
      detailItems: detail.map((entry) => (typeof entry === "string" ? entry : JSON.stringify(entry)))
    };
  }

  if (typeof detail === "string") {
    return { description: detail };
  }

  if (typeof detail === "object") {
    return { description: JSON.stringify(detail) };
  }

  return {};
}

export function useErrorPresenter() {
  const t = useTranslations();

  return useCallback(
    (error: unknown): PresentedError => {
      if (!error) {
        return {
          headline: t(ERROR_MESSAGE_KEYS.generic),
          retryable: false
        };
      }

      if (error instanceof ApiError) {
        const payload = (error.body ?? {}) as ApiErrorBody;
        const statusMessageKey = STATUS_TO_KEY[error.status];
        const codeMessageKey = payload.code ? ERROR_CODE_TO_KEY[payload.code] : undefined;
        const resolvedKey = codeMessageKey ?? statusMessageKey ?? (error.status >= 500 ? "network" : "generic");
        const headline = t(ERROR_MESSAGE_KEYS[resolvedKey]);

        const { description: detailDescription, detailItems } = normalizeDetail(payload.detail);
        const description = payload.message ?? detailDescription;

        const retryable = error.status >= 500 || error.status === 429;

        return {
          headline,
          description,
          detailItems,
          status: error.status,
          code: payload.code,
          retryable
        };
      }

      if (error instanceof Error) {
        const message = error.message || t(ERROR_MESSAGE_KEYS.generic);
        const isNetworkError = error.name === "TypeError";

        return {
          headline: isNetworkError ? t(ERROR_MESSAGE_KEYS.network) : message,
          description: !isNetworkError ? undefined : message,
          retryable: isNetworkError
        };
      }

      if (typeof error === "string") {
        return {
          headline: error,
          retryable: false
        };
      }

      return {
        headline: t(ERROR_MESSAGE_KEYS.generic),
        retryable: false
      };
    },
    [t]
  );
}

export default useErrorPresenter;
