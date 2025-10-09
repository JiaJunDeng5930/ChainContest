import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiConfig, createConfig, http, reconnect } from "wagmi";
import { sepolia } from "wagmi/chains";
import { injected, walletConnect } from "wagmi/connectors";
import { fallback } from "viem";
import { getRpcCandidates } from "./lib/config";
import App from "./App";

const queryClient = new QueryClient();

const rpcTransports = fallback(
  getRpcCandidates().map((url) =>
    http(url, {
      timeout: 500,
    }),
  ),
);

const wagmiConfig = createConfig({
  chains: [sepolia],
  transports: {
    [sepolia.id]: rpcTransports,
  },
  connectors: [
    injected({ shimDisconnect: true }),
    walletConnect({
      projectId: "demo",
      qrModalOptions: {
        themeMode: "dark",
      },
    }),
  ],
  ssr: false,
});

reconnect(wagmiConfig);

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("#root 容器未找到，无法挂载应用");
}

const root = createRoot(rootElement);

root.render(
  <StrictMode>
    <WagmiConfig config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </WagmiConfig>
  </StrictMode>,
);
