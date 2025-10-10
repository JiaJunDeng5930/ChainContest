import type { CallRequest, CallStatus } from "../lib/types";

export interface CallHistoryRecord {
  request: CallRequest;
  response?: unknown;
}

export interface CallHistoryViewOptions {
  onCopy?: (record: CallHistoryRecord) => void;
}

export class CallHistoryView {
  private readonly root: HTMLElement;
  private readonly filterInput: HTMLInputElement;
  private readonly statusSelect: HTMLSelectElement;
  private readonly list: HTMLUListElement;
  private readonly options: CallHistoryViewOptions;
  private records: CallHistoryRecord[] = [];
  private filterText = "";
  private filterStatus: CallStatus | "all" = "all";
  private readonly itemRefs = new Map<string, HTMLLIElement>();

  constructor(root: HTMLElement, options: CallHistoryViewOptions = {}) {
    this.root = root;
    this.options = options;
    this.root.classList.add("call-history");

    const filters = document.createElement("div");
    filters.classList.add("call-history__filters");

    this.filterInput = document.createElement("input");
    this.filterInput.type = "search";
    this.filterInput.placeholder = "按合约、函数或哈希搜索";
    this.filterInput.classList.add("call-history__search");
    this.filterInput.addEventListener("input", () => {
      this.filterText = this.filterInput.value.trim().toLowerCase();
      this.render();
    });

    this.statusSelect = document.createElement("select");
    this.statusSelect.classList.add("call-history__status-filter");
    this.statusSelect.addEventListener("change", () => {
      const value = this.statusSelect.value as CallStatus | "all";
      this.filterStatus = value;
      this.render();
    });

    this.populateStatusOptions();

    filters.append(this.filterInput, this.statusSelect);

    this.list = document.createElement("ul");
    this.list.classList.add("call-history__list");

    this.root.replaceChildren(filters, this.list);
    this.render();
  }

  setRecords(records: CallHistoryRecord[]): void {
    this.records = [...records].sort(
      (a, b) => b.request.createdAt.getTime() - a.request.createdAt.getTime(),
    );
    this.render();
  }

  upsertRecord(record: CallHistoryRecord): void {
    const index = this.records.findIndex(
      (item) => item.request.id === record.request.id,
    );

    if (index >= 0) {
      this.records[index] = record;
    } else {
      this.records.unshift(record);
    }

    this.render();
  }

  clear(): void {
    this.records = [];
    this.render();
  }

  private populateStatusOptions(): void {
    const statuses: Array<CallStatus | "all"> = [
      "all",
      "draft",
      "validated",
      "queued",
      "submitted",
      "confirmed",
      "failed",
      "rejected",
      "stalled",
    ];

    statuses.forEach((status) => {
      const option = document.createElement("option");
      option.value = status;
      option.textContent = status === "all" ? "全部状态" : status;

      this.statusSelect.appendChild(option);
    });
  }

  private render(): void {
    this.list.replaceChildren();
    this.itemRefs.clear();

    const filtered = this.records.filter((record) => {
      const statusMatches =
        this.filterStatus === "all" || record.request.status === this.filterStatus;

      if (!statusMatches) {
        return false;
      }

      if (!this.filterText) {
        return true;
      }

      const haystack = [
        record.request.contractId,
        record.request.functionSignature,
        record.request.txHash ?? "",
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(this.filterText);
    });

    if (filtered.length === 0) {
      const empty = document.createElement("li");
      empty.classList.add("call-history__empty");
      empty.textContent = "暂无调用记录";
      this.list.appendChild(empty);
      return;
    }

    filtered.forEach((record) => {
      const item = this.createItem(record);
      this.list.appendChild(item);
      this.itemRefs.set(record.request.id, item);
    });
  }

  private createItem(record: CallHistoryRecord): HTMLLIElement {
    const item = document.createElement("li");
    item.classList.add("call-history__item");
    item.dataset.requestId = record.request.id;

    const header = document.createElement("div");
    header.classList.add("call-history__item-header");

    const title = document.createElement("strong");
    title.textContent = record.request.functionSignature;
    header.appendChild(title);

    const status = document.createElement("span");
    status.classList.add("call-history__status");
    status.dataset.status = record.request.status;
    status.textContent = record.request.status;
    header.appendChild(status);

    const meta = document.createElement("div");
    meta.classList.add("call-history__meta");
    meta.textContent = `${record.request.contractId} · ${formatTimestamp(
      record.request.createdAt,
    )}`;

    const details = document.createElement("pre");
    details.classList.add("call-history__details");
    details.textContent = JSON.stringify(
      {
        arguments: record.request.arguments,
        txHash: record.request.txHash ?? null,
        response: record.response ?? null,
        error: record.request.error ?? null,
      },
      null,
      2,
    );

    const actions = document.createElement("div");
    actions.classList.add("call-history__actions");

    const copyButton = document.createElement("button");
    copyButton.type = "button";
    copyButton.textContent = "复制";
    copyButton.classList.add("call-history__copy");
    copyButton.addEventListener("click", async () => {
      const payload = details.textContent ?? "";
      try {
        await navigator.clipboard.writeText(payload);
        this.options.onCopy?.(record);
      } catch {
        // ignore clipboard failures silently
      }
    });

    actions.appendChild(copyButton);

    item.append(header, meta, details, actions);

    return item;
  }

  updateStatus(requestId: string, status: CallStatus): void {
    const item = this.itemRefs.get(requestId);

    if (!item) {
      return;
    }

    const statusElement = item.querySelector<HTMLSpanElement>(
      ".call-history__status",
    );

    if (!statusElement) {
      return;
    }

    statusElement.textContent = status;
    statusElement.dataset.status = status;
  }
}

function formatTimestamp(date: Date): string {
  return date.toLocaleString();
}
