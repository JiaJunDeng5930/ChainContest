import { getRequestConfig } from "next-intl/server";

export default getRequestConfig(() => ({
  locales: ["en", "zh-CN"],
  defaultLocale: "en"
}));
