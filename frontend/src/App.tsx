import { useMemo } from "react";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { sepolia } from "wagmi/chains";

export default function App(): JSX.Element {
  const { address, isConnecting } = useAccount();
  const { connect, connectors: availableConnectors, isLoading, pendingConnector } =
    useConnect();
  const { disconnect } = useDisconnect();

  const chainName = useMemo(() => sepolia.name, []);

  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: "2rem" }}>
      <h1>链上托管交易比赛控制台</h1>
      <p>当前网络：{chainName}</p>
      {address ? (
        <section>
          <p>已连接钱包：{address}</p>
          <button type="button" onClick={() => disconnect()}>
            断开连接
          </button>
        </section>
      ) : (
        <section>
          <p>{isConnecting ? "正在连接..." : "请选择连接钱包"}</p>
          <ul>
            {availableConnectors.map((connector) => (
              <li key={connector.uid}>
                <button
                  type="button"
                  disabled={!connector.ready || isLoading}
                  onClick={() => connect({ connector })}
                >
                  连接 {connector.name}
                  {isLoading && pendingConnector?.uid === connector.uid
                    ? " (连接中)"
                    : ""}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
