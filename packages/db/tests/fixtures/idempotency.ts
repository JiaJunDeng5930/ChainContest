import { expect } from 'vitest';

export interface IdempotencyOptions<T> {
  runs?: number;
  comparator?: (initial: T, iteration: number, value: T) => void;
}

export const assertIdempotent = async <T>(
  action: () => Promise<T>,
  options: IdempotencyOptions<T> = {}
): Promise<T> => {
  const runs = options.runs ?? 3;
  if (runs < 1) {
    throw new Error('Idempotency runs must be at least 1');
  }

  let baseline: T | undefined;

  for (let index = 0; index < runs; index += 1) {
    const value = await action();
    if (index === 0) {
      baseline = value;
      continue;
    }

    if (options.comparator) {
      options.comparator(baseline as T, index, value);
    } else {
      expect(value).toEqual(baseline);
    }
  }

  return baseline as T;
};
