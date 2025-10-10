import type {
  ContractDescriptor,
  ContractFunction,
  ContractFunctionParam,
  CallStatus,
} from "../lib/types";

const addressPattern = /^0x[a-fA-F0-9]{40}$/;

export interface FunctionFormContext {
  contract: ContractDescriptor;
  fn: ContractFunction;
}

export interface FunctionFormSubmitPayload {
  contractId: string;
  functionSignature: string;
  arguments: Record<string, unknown>;
  orderedArguments: unknown[];
  value?: string;
}

export interface FunctionFormViewOptions {
  onSubmit?: (payload: FunctionFormSubmitPayload) => void;
  onValidationError?: (errors: string[]) => void;
}

type InputElement = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

export class FunctionFormView {
  private readonly root: HTMLElement;
  private readonly form: HTMLFormElement;
  private readonly fieldset: HTMLDivElement;
  private readonly options: FunctionFormViewOptions;
  private context: FunctionFormContext | null = null;
  private controls: Map<string, InputElement> = new Map();
  private valueControl: HTMLInputElement | null = null;
  private messageBox: HTMLDivElement;
  private statusBadge: HTMLSpanElement;

  constructor(root: HTMLElement, options: FunctionFormViewOptions = {}) {
    this.root = root;
    this.options = options;
    this.root.classList.add("function-form");

    this.form = document.createElement("form");
    this.form.classList.add("function-form__form");
    this.form.addEventListener("submit", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.handleSubmit();
    });

    this.fieldset = document.createElement("div");
    this.fieldset.classList.add("function-form__fields");

    this.messageBox = document.createElement("div");
    this.messageBox.classList.add("function-form__message");
    this.messageBox.setAttribute("role", "alert");
    this.messageBox.hidden = true;

    const actions = document.createElement("div");
    actions.classList.add("function-form__actions");

    const submitButton = document.createElement("button");
    submitButton.type = "submit";
    submitButton.textContent = "执行调用";
    submitButton.classList.add("function-form__submit");

    actions.appendChild(submitButton);

    this.statusBadge = document.createElement("span");
    this.statusBadge.classList.add("function-form__status");
    this.statusBadge.dataset.state = "idle";
    this.statusBadge.textContent = "未执行";

    this.form.append(this.fieldset, this.messageBox, actions);
    this.root.replaceChildren(this.form);

    this.renderPlaceholder();
  }

  setContext(context: FunctionFormContext | null): void {
    this.context = context;
    this.controls.clear();
    this.valueControl = null;

    if (!context) {
      this.renderPlaceholder();
      return;
    }

    this.renderInputs(context);
    this.setStatus("validated", "待执行");
  }

  reset(): void {
    this.controls.forEach((control) => {
      control.value = "";
    });
    this.valueControl = null;
    this.messageBox.hidden = true;
    this.setStatus("validated", "待执行");
  }

  private renderPlaceholder(): void {
    this.fieldset.replaceChildren();
    const placeholder = document.createElement("p");
    placeholder.textContent = "请选择要调用的合约函数。";
    placeholder.classList.add("function-form__placeholder");
    this.fieldset.appendChild(placeholder);
    this.statusBadge.dataset.state = "idle";
    this.statusBadge.textContent = "未执行";
    this.messageBox.hidden = true;
  }

  private renderInputs(context: FunctionFormContext): void {
    this.fieldset.replaceChildren();

    const header = document.createElement("header");
    header.classList.add("function-form__header");

    const title = document.createElement("h2");
    title.textContent = `${context.contract.name} · ${context.fn.signature}`;
    title.classList.add("function-form__title");

    header.append(title, this.statusBadge);
    this.fieldset.appendChild(header);

    if (context.fn.inputs.length === 0) {
      const empty = document.createElement("p");
      empty.classList.add("function-form__hint");
      empty.textContent = "该函数不需要输入参数。";
      this.fieldset.appendChild(empty);
    } else {
      context.fn.inputs.forEach((param, index) => {
        const field = this.createInputField(param, index);
        this.fieldset.appendChild(field);
      });
    }

    if (context.fn.payable) {
      const valueField = this.createValueField();
      this.fieldset.appendChild(valueField);
    }
  }

  private createInputField(
    param: ContractFunctionParam,
    index: number,
  ): HTMLElement {
    const wrapper = document.createElement("label");
    wrapper.classList.add("function-form__field");
    const key = this.resolveArgumentKey(param, index);

    const name = document.createElement("span");
    name.classList.add("function-form__label");
    name.textContent = param.name || `(参数 ${index + 1})`;

    const hint = document.createElement("span");
    hint.classList.add("function-form__type");
    hint.textContent = param.type;

    const control = this.createControlForParam(param);
    control.name = key;
    control.dataset.type = param.type;

    this.controls.set(key, control);

    wrapper.append(name, hint, control);

    return wrapper;
  }

  private createValueField(): HTMLElement {
    const wrapper = document.createElement("label");
    wrapper.classList.add("function-form__field");

    const name = document.createElement("span");
    name.classList.add("function-form__label");
    name.textContent = "支付的 ETH 数额";

    const hint = document.createElement("span");
    hint.classList.add("function-form__type");
    hint.textContent = "value (wei)";

    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = "请输入发送的 wei 数值";
    input.classList.add("function-form__input");
    input.name = "__value";

    this.valueControl = input;

    wrapper.append(name, hint, input);

    return wrapper;
  }

  private createControlForParam(
    param: ContractFunctionParam,
  ): InputElement {
    if (param.type === "bool") {
      const select = document.createElement("select");
      select.classList.add("function-form__input");

      const trueOption = document.createElement("option");
      trueOption.value = "true";
      trueOption.text = "true";

      const falseOption = document.createElement("option");
      falseOption.value = "false";
      falseOption.text = "false";

      select.append(falseOption, trueOption);
      return select;
    }

    if (param.type.endsWith("[]") || param.type.includes("tuple")) {
      const textarea = document.createElement("textarea");
      textarea.placeholder = "请输入 JSON 数组/对象";
      textarea.classList.add("function-form__textarea");
      return textarea;
    }

    const input = document.createElement("input");
    input.type = this.inputTypeForParam(param);
    input.placeholder = param.type;
    input.classList.add("function-form__input");

    return input;
  }

  private inputTypeForParam(param: ContractFunctionParam): string {
    if (param.type.startsWith("uint") || param.type.startsWith("int")) {
      return "text";
    }

    if (param.type === "address" || param.type.startsWith("bytes")) {
      return "text";
    }

    if (param.type === "string") {
      return "text";
    }

    return "text";
  }

  private handleSubmit(): void {
    if (!this.context) {
      return;
    }

    const errors: string[] = [];
    const orderedArguments: unknown[] = [];
    const argumentRecord: Record<string, unknown> = {};

    this.controls.forEach((control, key) => {
      control.classList.remove("function-form__input--error");
      const rawValue = control.value.trim();
      const type = control.dataset.type ?? "string";
      const parsed = this.parseValue(rawValue, type);

      if (parsed.valid) {
        orderedArguments.push(parsed.value);
        argumentRecord[key] = parsed.value;
      } else {
        errors.push(parsed.error);
        control.classList.add("function-form__input--error");
      }
    });

    if (errors.length > 0) {
      this.displayErrors(errors);
      this.options.onValidationError?.(errors);
      return;
    }

    this.messageBox.hidden = true;

    const payload: FunctionFormSubmitPayload = {
      contractId: this.context.contract.id,
      functionSignature: this.context.fn.signature,
      arguments: argumentRecord,
      orderedArguments,
    };

    if (this.context.fn.payable && this.valueControl) {
      this.valueControl.classList.remove("function-form__input--error");
      const valueRaw = this.valueControl.value.trim();
      if (valueRaw.length === 0) {
        errors.push("Payable 函数必须指定发送的 wei 数值。");
        this.valueControl.classList.add("function-form__input--error");
      } else if (!/^[0-9]+$/.test(valueRaw)) {
        errors.push("Payable 数值必须为正整数。");
        this.valueControl.classList.add("function-form__input--error");
      } else {
        payload.value = valueRaw;
      }
    }

    if (errors.length > 0) {
      this.displayErrors(errors);
      this.options.onValidationError?.(errors);
      return;
    }

    this.options.onSubmit?.(payload);
  }

  setStatus(status: CallStatus, detail?: string): void {
    this.statusBadge.dataset.state = status;
    this.statusBadge.textContent = status;

    if (detail) {
      this.messageBox.hidden = false;
      this.messageBox.textContent = detail;
    }
  }

  private parseValue(
    raw: string,
    type: string,
  ): { valid: true; value: unknown } | { valid: false; error: string } {
    if (raw.length === 0) {
      return { valid: false, error: `输入 ${type} 不能为空` };
    }

    if (type === "bool") {
      if (raw !== "true" && raw !== "false") {
        return { valid: false, error: "布尔值必须为 true 或 false" };
      }
      return { valid: true, value: raw === "true" };
    }

    if (type === "address") {
      if (!addressPattern.test(raw)) {
        return { valid: false, error: "请输入合法的以太坊地址" };
      }
      return { valid: true, value: raw };
    }

    if (type.startsWith("uint") || type.startsWith("int")) {
      if (!/^-?[0-9]+$/.test(raw)) {
        return { valid: false, error: "整数类型必须为十进制表示" };
      }
      return { valid: true, value: raw };
    }

    if (type === "string") {
      return { valid: true, value: raw };
    }

    if (type.startsWith("bytes")) {
      if (!/^0x[a-fA-F0-9]*$/.test(raw)) {
        return { valid: false, error: "字节类型必须为 0x 前缀的十六进制字符串" };
      }
      return { valid: true, value: raw };
    }

    if (type.endsWith("[]") || type.includes("tuple")) {
      try {
        const value = JSON.parse(raw);
        return { valid: true, value };
      } catch {
        return { valid: false, error: "数组或结构体类型必须提供合法 JSON" };
      }
    }

    return { valid: true, value: raw };
  }

  private displayErrors(errors: string[]): void {
    this.messageBox.hidden = false;
    this.messageBox.textContent = errors.join("；");
    this.statusBadge.dataset.state = "rejected";
    this.statusBadge.textContent = "rejected";
  }

  private resolveArgumentKey(
    param: ContractFunctionParam,
    index: number,
  ): string {
    return param.name && param.name.length > 0
      ? param.name
      : `arg${index.toString()}`;
  }
}
