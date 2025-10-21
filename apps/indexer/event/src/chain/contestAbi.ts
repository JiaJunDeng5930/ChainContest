export const contestEventAbi = [
  {
    type: 'event',
    name: 'ContestRegistered',
    inputs: [
      { indexed: true, internalType: 'bytes32', name: 'contestId', type: 'bytes32' },
      { indexed: true, internalType: 'address', name: 'participant', type: 'address' },
      { indexed: false, internalType: 'address', name: 'vault', type: 'address' },
      { indexed: false, internalType: 'uint256', name: 'entryAmount', type: 'uint256' },
      { indexed: false, internalType: 'uint256', name: 'entryFee', type: 'uint256' },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'ContestFrozen',
    inputs: [
      { indexed: true, internalType: 'bytes32', name: 'contestId', type: 'bytes32' },
      { indexed: false, internalType: 'uint64', name: 'frozenAt', type: 'uint64' },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'ContestSealed',
    inputs: [
      { indexed: true, internalType: 'bytes32', name: 'contestId', type: 'bytes32' },
      { indexed: false, internalType: 'uint64', name: 'sealedAt', type: 'uint64' },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'VaultSettled',
    inputs: [
      { indexed: true, internalType: 'bytes32', name: 'vaultId', type: 'bytes32' },
      { indexed: false, internalType: 'uint256', name: 'nav', type: 'uint256' },
      { indexed: false, internalType: 'int32', name: 'roiBps', type: 'int32' },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'RewardClaimed',
    inputs: [
      { indexed: true, internalType: 'bytes32', name: 'contestId', type: 'bytes32' },
      { indexed: true, internalType: 'bytes32', name: 'vaultId', type: 'bytes32' },
      { indexed: false, internalType: 'uint256', name: 'amount', type: 'uint256' },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'VaultExited',
    inputs: [
      { indexed: true, internalType: 'bytes32', name: 'contestId', type: 'bytes32' },
      { indexed: true, internalType: 'bytes32', name: 'vaultId', type: 'bytes32' },
      { indexed: false, internalType: 'uint256', name: 'baseReturned', type: 'uint256' },
      { indexed: false, internalType: 'uint256', name: 'quoteReturned', type: 'uint256' },
    ],
    anonymous: false,
  },
] as const;

export type ContestEventAbi = typeof contestEventAbi;
