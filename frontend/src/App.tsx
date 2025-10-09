import { useMemo } from "react";
import type { Connector } from "wagmi";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { configuredChainName } from "./lib/config";
import RegisterCard from "./components/RegisterCard";
import VaultSwapPanel from "./components/VaultSwapPanel";

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

  const labelForConnector = (connector: Connector): string => {
    if (connector.id === "mock") {
      return "连接测试钱包";
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
    </main>
  );
}
