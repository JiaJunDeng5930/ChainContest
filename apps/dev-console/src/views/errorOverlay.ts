import type { ErrorDetail } from "../lib/types";

export class ErrorOverlay {
  private readonly root: HTMLElement;
  private readonly message: HTMLParagraphElement;
  private readonly hint: HTMLParagraphElement;
  private readonly raw: HTMLPreElement;

  constructor(root: HTMLElement) {
    this.root = root;
    this.root.classList.add("error-overlay");

    const title = document.createElement("h2");
    title.textContent = "发生错误";

    this.message = document.createElement("p");
    this.message.classList.add("error-overlay__message");

    this.hint = document.createElement("p");
    this.hint.classList.add("error-overlay__hint");

    this.raw = document.createElement("pre");
    this.raw.classList.add("error-overlay__raw");

    const dismiss = document.createElement("button");
    dismiss.type = "button";
    dismiss.textContent = "关闭";
    dismiss.classList.add("error-overlay__dismiss");
    dismiss.addEventListener("click", () => this.hide());

    this.root.replaceChildren(title, this.message, this.hint, this.raw, dismiss);
    this.hide();
  }

  show(detail: ErrorDetail): void {
    this.message.textContent = detail.message;
    this.hint.textContent = detail.hint ?? "请检查输入并重试";
    this.hint.hidden = !detail.hint;
    this.raw.textContent = detail.raw ? JSON.stringify(detail.raw, null, 2) : "{}";

    this.root.hidden = false;
    this.root.setAttribute("aria-hidden", "false");
  }

  hide(): void {
    this.root.hidden = true;
    this.root.setAttribute("aria-hidden", "true");
  }
}
