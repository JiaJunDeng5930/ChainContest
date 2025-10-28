import path from "node:path";
import createNextIntlPlugin from "next-intl/plugin";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    typedRoutes: true
  },
  async rewrites() {
    const apiBase = process.env.API_BASE_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://api-server:4000';
    const normalizedBase = apiBase.endsWith('/') ? apiBase.slice(0, -1) : apiBase;
    return [
      {
        source: '/api/:path*',
        destination: `${normalizedBase}/api/:path*`
      }
    ];
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
