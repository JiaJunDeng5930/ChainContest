import { getRequestConfig } from "next-intl/server";

export const locales = ["en", "zh-CN"] as const;

export const defaultLocale = "en";

export default getRequestConfig(async ({ locale }) => {
  const activeLocale = locales.includes(locale as (typeof locales)[number]) ? locale : defaultLocale;
  const messages = (await import(`./messages/${activeLocale}.json`)).default;

  return {
    locale: activeLocale,
    messages
  };
});
