import type {
  ContractDescriptor,
  ContractFunction,
} from "../lib/types";

export interface ContractListItem {
  descriptor: ContractDescriptor;
  functions: ContractFunction[];
}

export interface ContractListViewOptions {
  onSelect?: (item: {
    contract: ContractDescriptor;
    fn: ContractFunction;
  }) => void;
}

export class ContractListView {
  private readonly root: HTMLElement;
  private readonly options: ContractListViewOptions;
  private readonly searchInput: HTMLInputElement;
  private readonly listContainer: HTMLDivElement;

  private items: ContractListItem[] = [];
  private activeFilter = "";

  constructor(root: HTMLElement, options: ContractListViewOptions = {}) {
    this.root = root;
    this.options = options;
    this.root.classList.add("contract-list");

    this.searchInput = document.createElement("input");
    this.searchInput.type = "search";
    this.searchInput.placeholder = "搜索合约或函数";
    this.searchInput.classList.add("contract-list__search");
    this.searchInput.addEventListener("input", () => {
      this.activeFilter = this.searchInput.value.trim().toLowerCase();
      this.render();
    });

    this.listContainer = document.createElement("div");
    this.listContainer.classList.add("contract-list__groups");

    this.root.replaceChildren(this.searchInput, this.listContainer);
  }

  setItems(items: ContractListItem[]): void {
    this.items = items;
    this.render();
  }

  clear(): void {
    this.items = [];
    this.render();
  }

  private render(): void {
    this.listContainer.replaceChildren();

    if (!this.items.length) {
      const emptyState = document.createElement("p");
      emptyState.textContent = "尚未加载任何合约。";
      emptyState.classList.add("contract-list__empty");
      this.listContainer.appendChild(emptyState);
      return;
    }

    const filter = this.activeFilter;

    this.items
      .map((item) => ({
        item,
        matchingFunctions: this.filterFunctions(item.functions, filter),
        matchesContract: this.matchesContract(item.descriptor, filter),
      }))
      .filter(({ matchingFunctions, matchesContract }) => {
        if (!filter) {
          return true;
        }

        return matchesContract || matchingFunctions.length > 0;
      })
      .forEach(({ item, matchingFunctions, matchesContract }) => {
        const group = document.createElement("section");
        group.classList.add("contract-list__group");
        group.dataset.contractId = item.descriptor.id;

        const heading = document.createElement("header");
        heading.classList.add("contract-list__group-header");

        const title = document.createElement("h3");
        title.textContent = item.descriptor.name;
        title.classList.add("contract-list__group-title");

        const subtitle = document.createElement("span");
        subtitle.textContent = item.descriptor.address;
        subtitle.classList.add("contract-list__group-subtitle");

        heading.append(title, subtitle);
        group.appendChild(heading);

        const list = document.createElement("ul");
        list.classList.add("contract-list__items");

        const functionsToRender = matchesContract
          ? item.functions
          : matchingFunctions;

        if (!functionsToRender.length) {
          const placeholder = document.createElement("li");
          placeholder.textContent = "无匹配的函数";
          placeholder.classList.add("contract-list__item--empty");
          list.appendChild(placeholder);
        } else {
          functionsToRender.forEach((fn) => {
            list.appendChild(this.createFunctionEntry(item.descriptor, fn));
          });
        }

        group.appendChild(list);
        this.listContainer.appendChild(group);
      });
  }

  private filterFunctions(
    functions: ContractFunction[],
    filter: string,
  ): ContractFunction[] {
    if (!filter) {
      return functions;
    }

    return functions.filter((fn) => {
      return (
        fn.signature.toLowerCase().includes(filter) ||
        fn.inputs.some((input) =>
          input.name.toLowerCase().includes(filter),
        )
      );
    });
  }

  private matchesContract(
    descriptor: ContractDescriptor,
    filter: string,
  ): boolean {
    if (!filter) {
      return true;
    }

    return (
      descriptor.id.toLowerCase().includes(filter) ||
      descriptor.name.toLowerCase().includes(filter) ||
      descriptor.address.toLowerCase().includes(filter) ||
      (descriptor.tags ?? []).some((tag) =>
        tag.toLowerCase().includes(filter),
      )
    );
  }

  private createFunctionEntry(
    descriptor: ContractDescriptor,
    fn: ContractFunction,
  ): HTMLLIElement {
    const item = document.createElement("li");
    item.classList.add("contract-list__item");
    item.dataset.functionSignature = fn.signature;

    const button = document.createElement("button");
    button.type = "button";
    button.classList.add("contract-list__button");
    button.textContent = fn.signature;
    button.addEventListener("click", () => {
      this.options.onSelect?.({ contract: descriptor, fn });
    });

    item.appendChild(button);

    return item;
  }
}
