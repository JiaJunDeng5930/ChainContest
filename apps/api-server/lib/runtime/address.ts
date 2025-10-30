import type { Address } from 'viem';
import { lowercaseAddress as chainLowercaseAddress } from '@chaincontest/chain';

export const lowercaseAddress = (value: string): string => {
  try {
    return chainLowercaseAddress(value as Address);
  } catch {
    return value.toLowerCase();
  }
};
