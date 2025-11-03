import { useCallback } from "react";
import { usePublicClient, useWalletClient } from "wagmi";
import type { ExecutionCall, RequiredApproval } from "../api/types";
import { erc20Abi } from "viem";

const normalizeAddress = (value: string | undefined, context: string): `0x${string}` => {
  if (!value) {
    throw new Error(`${context} address is required`);
  }
  const trimmed = value.trim();
  if (!/^0x[0-9a-fA-F]{40}$/.test(trimmed)) {
    throw new Error(`${context} must be a 20-byte hex address`);
  }
  return trimmed.toLowerCase() as `0x${string}`;
};

const normalizeData = (value: string | undefined, context: string): `0x${string}` => {
  if (!value) {
    throw new Error(`${context} is required`);
  }
  const trimmed = value.trim();
  if (!/^0x[0-9a-fA-F]*$/.test(trimmed)) {
    throw new Error(`${context} must be hex-encoded data`);
  }
  return trimmed as `0x${string}`;
};

const parseOptionalBigInt = (value: string | undefined | null): bigint | undefined => {
  if (!value) {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  try {
    return BigInt(trimmed);
  } catch (error) {
    throw new Error(`Invalid numeric value "${value}"`);
  }
};

const parseRequiredBigInt = (value: string | undefined, context: string): bigint => {
  const result = parseOptionalBigInt(value);
  if (result === undefined) {
    throw new Error(`${context} numeric value is required`);
  }
  return result;
};

export interface ExecutedTransaction {
  readonly hash: `0x${string}`;
}

export const useWalletTransactions = () => {
  const walletClientQuery = useWalletClient();
  const publicClient = usePublicClient();

  const requireWallet = useCallback(() => {
    const wallet = walletClientQuery.data;
    if (!wallet) {
      throw new Error("Wallet connection is required to submit transactions");
    }
    if (!wallet.account) {
      throw new Error("Wallet account is unavailable");
    }
    return wallet;
  }, [walletClientQuery.data]);

  const waitForReceipt = useCallback(
    async (hash: `0x${string}`) => {
      if (!publicClient) {
        return;
      }
      await publicClient.waitForTransactionReceipt({ hash });
    },
    [publicClient]
  );

  const approveToken = useCallback(
    async (approval: RequiredApproval): Promise<ExecutedTransaction> => {
      const wallet = requireWallet();

      const hash = await wallet.writeContract({
        abi: erc20Abi,
        address: normalizeAddress(approval.tokenAddress, "Token"),
        functionName: "approve",
        args: [
          normalizeAddress(approval.spender, "Spender"),
          parseRequiredBigInt(approval.amount, "Approval amount")
        ]
      });

      await waitForReceipt(hash);
      return { hash };
    },
    [requireWallet, waitForReceipt]
  );

  const sendExecutionCall = useCallback(
    async (call: ExecutionCall): Promise<ExecutedTransaction> => {
      const wallet = requireWallet();
      const request = {
        account: wallet.account,
        to: normalizeAddress(call.to, "Transaction target"),
        data: normalizeData(call.data, "Transaction data")
      } satisfies Parameters<typeof wallet.sendTransaction>[0];

      const gasLimit = parseOptionalBigInt(call.gasLimit);
      if (gasLimit !== undefined) {
        request.gas = gasLimit;
      }

      const value = parseOptionalBigInt(call.value);
      if (value !== undefined) {
        request.value = value;
      }

      const gasPrice = parseOptionalBigInt(call.gasPrice);
      if (gasPrice !== undefined) {
        request.gasPrice = gasPrice;
      }

      const maxFeePerGas = parseOptionalBigInt(call.maxFeePerGas);
      if (maxFeePerGas !== undefined) {
        request.maxFeePerGas = maxFeePerGas;
      }

      const maxPriorityFeePerGas = parseOptionalBigInt(call.maxPriorityFeePerGas);
      if (maxPriorityFeePerGas !== undefined) {
        request.maxPriorityFeePerGas = maxPriorityFeePerGas;
      }

      const hash = await wallet.sendTransaction(request);
      await waitForReceipt(hash);
      return { hash };
    },
    [requireWallet, waitForReceipt]
  );

  return {
    approveToken,
    sendExecutionCall,
    walletReady: Boolean(walletClientQuery.data)
  };
};
