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
const testAccountsEnv = import.meta.env.VITE_TEST_ACCOUNTS as string | undefined;
const parsedTestAccounts = (testAccountsEnv ?? "")
  .split(",")
  .map((value) => value.trim())
  .filter((value) => /^0x[a-fA-F0-9]{40}$/.test(value));

if (typeof testAccountAddress === "string" && /^0x[a-fA-F0-9]{40}$/.test(testAccountAddress)) {
  if (parsedTestAccounts.length === 0) {
    parsedTestAccounts.push(testAccountAddress);
  }
}

const mockConnectors = parsedTestAccounts.map((account, index) =>
  mock({
    id: `mock-${index}`,
    name: `测试账户 ${index + 1}`,
    accounts: [account as `0x${string}`],
    features: {
      defaultConnected: index === 0,
      reconnect: true,
    },
  }),
);

const connectors = [
  ...mockConnectors,
  injected({ shimDisconnect: true }),
  walletConnect({
    projectId: "demo",
    qrModalOptions: {
      themeMode: "dark",
    },
  }),
];

const targetChain = configuredChainId === hardhat.id ? hardhat : sepolia;

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
