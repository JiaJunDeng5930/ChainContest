declare global {
  interface IntlMessages extends Record<string, string> {}
  type IntlFormats = Record<string, unknown>;
}

export {};
