import path from "node:path";
import createNextIntlPlugin from "next-intl/plugin";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    typedRoutes: true
  },
  webpack: (config) => {
    config.resolve = config.resolve ?? {};
    config.resolve.alias = config.resolve.alias ?? {};
    config.resolve.alias["@react-native-async-storage/async-storage"] =
      config.resolve.alias["@react-native-async-storage/async-storage"] ??
      path.resolve(process.cwd(), "src/lib/stubs/asyncStorage.ts");
    config.resolve.alias["idb-keyval"] =
      config.resolve.alias["idb-keyval"] ??
      path.resolve(process.cwd(), "src/lib/stubs/idbKeyval.ts");
    return config;
  }
};

const withNextIntl = createNextIntlPlugin("./i18n.ts");

export default withNextIntl(nextConfig);
