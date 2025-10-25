const asyncStorage = {
  getItem: () => Promise.resolve<string | null>(null),
  setItem: () => Promise.resolve<void>(undefined),
  removeItem: () => Promise.resolve<void>(undefined),
  clear: () => Promise.resolve<void>(undefined)
} as const;

export default asyncStorage;
