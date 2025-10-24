type MessageDictionary = Record<string, string>;

export type SupportedLocale = "en" | "zh-CN";

const localeLoaders: Record<SupportedLocale, () => Promise<MessageDictionary>> = {
  en: async () =>
    (await import("../messages/en.json", { with: { type: "json" } })).default as MessageDictionary,
  "zh-CN": async () =>
    (await import("../messages/zh-CN.json", { with: { type: "json" } })).default as MessageDictionary
};

export const SUPPORTED_LOCALES: SupportedLocale[] = ["en", "zh-CN"];

export async function loadMessages(locale: SupportedLocale): Promise<MessageDictionary> {
  const loader = localeLoaders[locale] ?? localeLoaders.en;
  return loader();
}
