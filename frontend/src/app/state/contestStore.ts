import { create } from "zustand";
import type { Config } from "wagmi";
import { getPublicClient, watchContractEvent } from "@wagmi/core";
import type { Address, Hex } from "viem";
import { parseAbiItem } from "viem";
import { contestAbi } from "../../lib/abi/contest";
import { contestAddresses, configuredChainId } from "../../lib/config";

export type RegistrationRecord = {
  participant: Address;
  vault: Address;
  amount: bigint;
  txHash?: Hex;
  blockNumber?: bigint;
};

type ContestStoreState = {
  registrations: RegistrationRecord[];
  initialized: boolean;
  hydrate: (records: RegistrationRecord[]) => void;
  upsert: (record: RegistrationRecord) => void;
};

const sortRegistrations = (records: RegistrationRecord[]): RegistrationRecord[] => {
  return [...records].sort((a, b) => {
    if (a.blockNumber && b.blockNumber) {
      if (a.blockNumber === b.blockNumber) {
        return a.participant.localeCompare(b.participant);
      }
      return a.blockNumber < b.blockNumber ? -1 : 1;
    }
    return a.participant.localeCompare(b.participant);
  });
};

const useContestStore = create<ContestStoreState>((set, get) => ({
  registrations: [],
  initialized: false,
  hydrate: (records) =>
    set({
      registrations: sortRegistrations(records),
      initialized: true,
    }),
  upsert: (record) =>
    set((state) => {
      const existingIndex = state.registrations.findIndex(
        (item) => item.participant.toLowerCase() === record.participant.toLowerCase(),
      );
      if (existingIndex >= 0) {
        const updated = [...state.registrations];
        updated[existingIndex] = {
          ...updated[existingIndex],
          ...record,
        };
        return { registrations: sortRegistrations(updated) };
      }
      return { registrations: sortRegistrations([...state.registrations, record]) };
    }),
}));

export default useContestStore;

export async function hydrateRegistrations(config: Config): Promise<void> {
  const store = useContestStore.getState();
  if (store.initialized) {
    return;
  }

  const publicClient = getPublicClient(config, { chainId: configuredChainId });
  const contestRegisteredEvent = parseAbiItem(
    "event ContestRegistered(bytes32 contestId, address participant, address vault, uint256 amount)",
  );

  const logs = await publicClient.getLogs({
    address: contestAddresses.contest as Address,
    event: contestRegisteredEvent,
    fromBlock: 0n,
  });

  const records: RegistrationRecord[] = logs.map((log) => {
    const args = log.args as unknown as {
      participant: Address;
      vault: Address;
      amount: bigint;
    };
    return {
      participant: args.participant,
      vault: args.vault,
      amount: args.amount,
      txHash: log.transactionHash ?? undefined,
      blockNumber: log.blockNumber ?? undefined,
    };
  });

  store.hydrate(records);
}

export function subscribeRegistrations(config: Config): () => void {
  return watchContractEvent(
    config,
    {
      abi: contestAbi,
      address: contestAddresses.contest as Address,
      eventName: "ContestRegistered",
    },
    (logs) => {
      const append = useContestStore.getState().upsert;
      for (const log of logs) {
        const args = log.args as unknown as {
          participant: Address;
          vault: Address;
          amount: bigint;
        };
        append({
          participant: args.participant,
          vault: args.vault,
          amount: args.amount,
          txHash: log.transactionHash ?? undefined,
          blockNumber: log.blockNumber ?? undefined,
        });
      }
    },
  );
}
