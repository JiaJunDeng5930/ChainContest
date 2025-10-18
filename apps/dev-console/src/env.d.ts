/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CHAIN_ID?: string;
  readonly VITE_PRIMARY_RPC?: string;
  readonly VITE_FALLBACK_RPC?: string;
  readonly VITE_CONTEST_ADDRESS?: string;
  readonly VITE_PRICE_SOURCE_ADDRESS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
