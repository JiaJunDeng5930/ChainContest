const store = new Map<string, unknown>();

export function get<T>(key: string): Promise<T | undefined> {
  return Promise.resolve(store.get(key) as T | undefined);
}

export function set<T>(key: string, value: T): Promise<void> {
  store.set(key, value);
  return Promise.resolve();
}

export function del(key: string): Promise<void> {
  store.delete(key);
  return Promise.resolve();
}

export function update<T>(key: string, updater: (value: T | undefined) => T): Promise<void> {
  const currentValue = store.get(key) as T | undefined;
  const nextValue = updater(currentValue);
  store.set(key, nextValue);
  return Promise.resolve();
}

export function clear(): Promise<void> {
  store.clear();
  return Promise.resolve();
}

export function keys(): Promise<string[]> {
  return Promise.resolve(Array.from(store.keys()));
}

export function entries<T>(): Promise<Array<[string, T]>> {
  return Promise.resolve(Array.from(store.entries()) as Array<[string, T]>);
}

export function values<T>(): Promise<T[]> {
  return Promise.resolve(Array.from(store.values()) as T[]);
}

export function createStore() {
  return {
    get,
    set,
    del,
    update,
    clear,
    keys,
    entries,
    values
  };
}
