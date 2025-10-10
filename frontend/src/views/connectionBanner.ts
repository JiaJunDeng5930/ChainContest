export type ConnectionStatus = "unknown" | "connected" | "degraded" | "disconnected";

export interface ConnectionBannerState {
  rpcUrl: string;
  chainId: number;
  defaultAccount?: string;
  status: ConnectionStatus;
  message?: string;
}

export class ConnectionBanner {
  private readonly root: HTMLElement;
  private readonly rpcElement: HTMLSpanElement;
  private readonly chainElement: HTMLSpanElement;
  private readonly accountElement: HTMLSpanElement;
  private readonly statusElement: HTMLSpanElement;
  private readonly messageElement: HTMLParagraphElement;

  constructor(root: HTMLElement) {
    this.root = root;
    this.root.classList.add("connection-banner");

    const rpcLabel = document.createElement("span");
    rpcLabel.textContent = "RPC:";
    this.rpcElement = document.createElement("span");
    this.rpcElement.classList.add("connection-banner__rpc");

    const chainLabel = document.createElement("span");
    chainLabel.textContent = "Chain:";
    this.chainElement = document.createElement("span");
    this.chainElement.classList.add("connection-banner__chain");

    const accountLabel = document.createElement("span");
    accountLabel.textContent = "Account:";
    this.accountElement = document.createElement("span");
    this.accountElement.classList.add("connection-banner__account");

    this.statusElement = document.createElement("span");
    this.statusElement.classList.add("connection-banner__status");

    this.messageElement = document.createElement("p");
    this.messageElement.classList.add("connection-banner__message");

    const meta = document.createElement("div");
    meta.classList.add("connection-banner__meta");
    meta.append(rpcLabel, this.rpcElement, chainLabel, this.chainElement, accountLabel, this.accountElement);

    this.root.replaceChildren(meta, this.statusElement, this.messageElement);
    this.setState({ rpcUrl: "", chainId: 0, status: "unknown" });
  }

  setState(state: ConnectionBannerState): void {
    this.rpcElement.textContent = state.rpcUrl;
    this.chainElement.textContent = state.chainId.toString();
    this.accountElement.textContent = state.defaultAccount ?? "n/a";

    this.statusElement.dataset.state = state.status;
    this.statusElement.textContent = state.status;

    if (state.message) {
      this.messageElement.textContent = state.message;
      this.messageElement.hidden = false;
    } else {
      this.messageElement.textContent = "";
      this.messageElement.hidden = true;
    }
  }
}
