import { lowercaseAddress as chainLowercaseAddress } from '@chaincontest/chain';

type Address = `0x${string}`;

export const lowercaseAddress = (value: string): string => {
  try {
    return chainLowercaseAddress(value as Address);
  } catch {
    return value.toLowerCase();
  }
};
