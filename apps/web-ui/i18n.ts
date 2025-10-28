import { getRequestConfig } from "next-intl/server";
import enMessages from "@chaincontest/shared-i18n/messages/en.json" assert { type: "json" };
import zhCnMessages from "@chaincontest/shared-i18n/messages/zh-CN.json" assert { type: "json" };

export const locales = ["en", "zh-CN"] as const;

export const defaultLocale = "en";

const messagesByLocale = {
  en: enMessages,
  "zh-CN": zhCnMessages
} satisfies Record<(typeof locales)[number], Record<string, unknown>>;

export default getRequestConfig(async ({ locale }) => {
  const activeLocale = locales.includes(locale as (typeof locales)[number]) ? locale : defaultLocale;
  const messages = messagesByLocale[activeLocale];

  return {
    locale: activeLocale,
    messages
  };
});
