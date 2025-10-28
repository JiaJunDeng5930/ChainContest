import { SUPPORTED_LOCALES, type SupportedLocale } from "@chaincontest/shared-i18n";
import { cookies, headers } from "next/headers";

const DEFAULT_LOCALE: SupportedLocale = "en";
const LOCALE_COOKIE_NAME = "NEXT_LOCALE";

export function toSupportedLocale(candidate: string | undefined | null): SupportedLocale | undefined {
  if (!candidate) {
    return undefined;
  }

  const value = candidate.trim().toLowerCase();
  if (!value) {
    return undefined;
  }

  const exact = SUPPORTED_LOCALES.find((locale) => locale.toLowerCase() === value);
  if (exact) {
    return exact;
  }

  const base = value.split("-")[0] ?? value;
  return SUPPORTED_LOCALES.find((locale) => locale.toLowerCase().startsWith(base));
}

export function resolveRequestLocale(): SupportedLocale {
  const localeFromCookie = toSupportedLocale(cookies().get(LOCALE_COOKIE_NAME)?.value);
  if (localeFromCookie) {
    return localeFromCookie;
  }

  const acceptLanguage = headers().get("accept-language");
  if (!acceptLanguage) {
    return DEFAULT_LOCALE;
  }

  const requested = acceptLanguage
    .split(",")
    .map((value) => value.split(";")[0]?.trim())
    .filter(Boolean) as string[];

  for (const candidate of requested) {
    const matched = toSupportedLocale(candidate);
    if (matched) {
      return matched;
    }
  }

  return DEFAULT_LOCALE;
}
