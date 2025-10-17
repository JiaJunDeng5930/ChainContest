import type { LogEntry, LogLevel } from "../lib/types";

export interface LogPanelViewOptions {
  onFilterChange?: (level: LogLevel | "all") => void;
}

export class LogPanelView {
  private readonly root: HTMLElement;
  private readonly filter: HTMLSelectElement;
  private readonly list: HTMLUListElement;
  private readonly options: LogPanelViewOptions;
  private entries: LogEntry[] = [];
  private level: LogLevel | "all" = "all";

  constructor(root: HTMLElement, options: LogPanelViewOptions = {}) {
    this.root = root;
    this.options = options;
    this.root.classList.add("log-panel");

    const controls = document.createElement("div");
    controls.classList.add("log-panel__controls");

    this.filter = document.createElement("select");
    this.filter.classList.add("log-panel__filter");
    ["all", "debug", "info", "warn", "error"].forEach((option) => {
      const element = document.createElement("option");
      element.value = option;
      element.textContent = option === "all" ? "全部级别" : option;
      this.filter.appendChild(element);
    });

    this.filter.addEventListener("change", () => {
      this.level = this.filter.value as LogLevel | "all";
      this.render();
      this.options.onFilterChange?.(this.level);
    });

    controls.appendChild(this.filter);

    this.list = document.createElement("ul");
    this.list.classList.add("log-panel__list");

    this.root.replaceChildren(controls, this.list);
    this.render();
  }

  setEntries(entries: LogEntry[]): void {
    this.entries = [...entries].sort(
      (a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
    );
    this.render();
  }

  append(entry: LogEntry): void {
    this.entries.push(entry);
    this.entries.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    this.render();
  }

  clear(): void {
    this.entries = [];
    this.render();
  }

  private render(): void {
    this.list.replaceChildren();

    const filtered = this.entries.filter((entry) => {
      return this.level === "all" || entry.level === this.level;
    });

    if (filtered.length === 0) {
      const empty = document.createElement("li");
      empty.classList.add("log-panel__empty");
      empty.textContent = "暂无日志";
      this.list.appendChild(empty);
      return;
    }

    filtered.forEach((entry) => {
      this.list.appendChild(this.createItem(entry));
    });
  }

  private createItem(entry: LogEntry): HTMLLIElement {
    const item = document.createElement("li");
    item.classList.add("log-panel__item");
    item.dataset.level = entry.level;

    const header = document.createElement("div");
    header.classList.add("log-panel__item-header");

    const level = document.createElement("span");
    level.classList.add("log-panel__level");
    level.textContent = entry.level;

    const timestamp = document.createElement("time");
    timestamp.classList.add("log-panel__timestamp");
    timestamp.dateTime = entry.timestamp.toISOString();
    timestamp.textContent = entry.timestamp.toLocaleString();

    header.append(level, timestamp);

    const message = document.createElement("p");
    message.classList.add("log-panel__message");
    message.textContent = entry.message;

    const context = document.createElement("pre");
    context.classList.add("log-panel__context");
    context.textContent = entry.context ? JSON.stringify(entry.context, null, 2) : "{}";

    item.append(header, message, context);

    return item;
  }
}
