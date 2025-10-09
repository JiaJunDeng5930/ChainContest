import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiConfig, createConfig, http } from "wagmi";
import { hardhat, sepolia } from "wagmi/chains";
import { injected, mock, walletConnect } from "wagmi/connectors";
import { fallback } from "viem";
import { configuredChainId, getRpcCandidates } from "./lib/config";
import App from "./App";

const queryClient = new QueryClient();

const rpcTransports = fallback(
  getRpcCandidates().map((url) =>
    http(url, {
      timeout: 500,
    }),
  ),
);

const testAccountAddress = import.meta.env.VITE_TEST_ACCOUNT_ADDRESS;

const connectors = [
  injected({ shimDisconnect: true }),
  walletConnect({
    projectId: "demo",
    qrModalOptions: {
      themeMode: "dark",
    },
  }),
];

const targetChain = configuredChainId === hardhat.id ? hardhat : sepolia;

if (typeof testAccountAddress === "string" && /^0x[a-fA-F0-9]{40}$/.test(testAccountAddress)) {
  connectors.unshift(
    mock({
      accounts: [testAccountAddress as `0x${string}`],
      features: {
        defaultConnected: false,
        reconnect: true,
      },
    }),
  );
}

const wagmiConfig = createConfig({
  chains: [targetChain],
  transports: {
    [targetChain.id]: rpcTransports,
  },
  connectors,
  autoConnect: true,
  ssr: false,
});

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
