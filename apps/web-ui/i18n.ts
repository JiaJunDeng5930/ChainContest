import { getRequestConfig, setRequestLocale } from "next-intl/server";
import enMessages from "@chaincontest/shared-i18n/messages/en.json" assert { type: "json" };
import zhCnMessages from "@chaincontest/shared-i18n/messages/zh-CN.json" assert { type: "json" };
import { resolveRequestLocale, toSupportedLocale } from "./src/lib/i18n/requestLocale";
import type { SupportedLocale } from "@chaincontest/shared-i18n";

export const locales = ["en", "zh-CN"] as const;

export const defaultLocale = "en";

export const localePrefix = "never";

function nestMessages(flatMessages: Record<string, unknown>): Record<string, unknown> {
  const nested: Record<string, unknown> = {};

  for (const [rawKey, value] of Object.entries(flatMessages)) {
    const segments = rawKey.split(".");
    let current: Record<string, unknown> = nested;

    segments.forEach((segment, index) => {
      if (index === segments.length - 1) {
        current[segment] = value;
        return;
      }

      if (typeof current[segment] !== "object" || current[segment] === null) {
        current[segment] = {};
      }

      current = current[segment] as Record<string, unknown>;
    });
  }

  return nested;
}

const messagesByLocale = {
  en: nestMessages(enMessages as Record<string, unknown>),
  "zh-CN": nestMessages(zhCnMessages as Record<string, unknown>)
} satisfies Record<SupportedLocale, Record<string, unknown>>;

export default getRequestConfig(async ({ requestLocale }) => {
  const candidate = await requestLocale;
  const activeLocale = toSupportedLocale(candidate) ?? resolveRequestLocale();
  setRequestLocale(activeLocale);
  const messages = messagesByLocale[activeLocale];

  return {
    locale: activeLocale,
    messages
  };
});
