import { useMemo } from "react";
import type { Connector } from "wagmi";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { configuredChainName } from "./lib/config";
import RegisterCard from "./components/RegisterCard";
import VaultSwapPanel from "./components/VaultSwapPanel";
import AdminActions from "./components/AdminActions";
import Leaderboard from "./components/Leaderboard";
import PayoutPanel from "./components/PayoutPanel";

export default function App(): JSX.Element {
  const { address, isConnecting, isConnected } = useAccount();
  const {
    connect,
    connectors: availableConnectors,
    isLoading,
    pendingConnector,
  } = useConnect();
  const { disconnect } = useDisconnect();

  const chainName = useMemo(() => configuredChainName, []);
  const connectors = useMemo(() => {
    const byId = new Map<string, Connector>();
    availableConnectors.forEach((connector) => {
      if (!byId.has(connector.id)) {
        byId.set(connector.id, connector);
      }
    });
    return Array.from(byId.values());
  }, [availableConnectors]);

  const testAccounts = useMemo(() => {
    const envValue = import.meta.env.VITE_TEST_ACCOUNTS as string | undefined;
    if (envValue) {
      return envValue
        .split(",")
        .map((value) => value.trim())
        .filter((value) => /^0x[a-fA-F0-9]{40}$/.test(value));
    }
    const fallback = import.meta.env.VITE_TEST_ACCOUNT_ADDRESS;
    return fallback && /^0x[a-fA-F0-9]{40}$/.test(fallback) ? [fallback] : [];
  }, []);

  const mockConnectorMap = useMemo(() => {
    const map = new Map<string, Connector>();
    connectors.forEach((connector) => {
      if (connector.id.startsWith("mock")) {
        const index = connector.id.split("-")[1];
        map.set(index ?? "0", connector);
      }
    });
    return map;
  }, [connectors]);

  const labelForConnector = (connector: Connector): string => {
    if (connector.id.startsWith("mock")) {
      return connector.name ?? "连接测试钱包";
    }
    if (connector.id === "injected") {
      return "连接浏览器钱包";
    }
    return `连接 ${connector.name}`;
  };

  const connectedAddressLabel = useMemo(() => {
    if (!address) {
      return "";
    }
    return `${address.slice(0, 6)}...${address.slice(address.length - 4)}`;
  }, [address]);

  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: "2rem" }}>
      <h1>链上托管交易比赛控制台</h1>
      <p>当前网络：{chainName}</p>
      {isConnected && address ? (
        <section style={{ marginBottom: "1.5rem" }}>
          <p data-testid="connected-address">
            已连接钱包：<strong>{connectedAddressLabel}</strong>
          </p>
          <button type="button" data-testid="disconnect-button" onClick={() => disconnect()}>
            断开连接
          </button>
          {testAccounts.length > 0 && (
            <div style={{ marginTop: "0.75rem" }}>
              <p>快速切换测试账户：</p>
              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                {testAccounts.map((account, index) => (
                  <button
                    key={account}
                    type="button"
                    data-testid={`switch-account-${account.toLowerCase()}`}
                    onClick={async () => {
                      const connector = mockConnectorMap.get(String(index));
                      if (!connector) {
                        return;
                      }
                      await disconnect();
                      connect({ connector });
                    }}
                  >
                    {`${account.slice(0, 6)}...${account.slice(-4)}`}
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>
      ) : (
        <section style={{ marginBottom: "1.5rem" }}>
          <p>{isConnecting ? "正在连接..." : "请选择连接钱包"}</p>
          <ul>
            {connectors.map((connector) => (
              <li key={connector.uid} style={{ marginBottom: "0.5rem" }}>
                <button
                  type="button"
                  disabled={(connector.id !== "mock" && !connector.ready) || isLoading}
                  data-testid={`connector-${connector.id}`}
                  onClick={() => connect({ connector })}
                >
                  {labelForConnector(connector)}
                  {isLoading && pendingConnector?.uid === connector.uid
                    ? " (连接中)"
                    : ""}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      <RegisterCard />
      <div style={{ marginTop: "2rem" }}>
        <VaultSwapPanel />
      </div>
      <div style={{ marginTop: "2rem", display: "grid", gap: "1.5rem" }}>
        <AdminActions />
        <Leaderboard />
        <PayoutPanel />
      </div>
    </main>
  );
}
