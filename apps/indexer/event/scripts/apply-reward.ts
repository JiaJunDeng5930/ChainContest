import { createRequire } from 'node:module';
import { init, shutdown, writeContestDomain } from '@chaincontest/db';

const require = createRequire(import.meta.url);
const registry = require('../../../../configs/validation/db-validation-registry.cjs');
const overrides = require('../../../../configs/validation/db-validation-overrides.cjs');

const contestId = process.env.CONTEST_ID;
const walletAddress = process.env.WALLET_ADDRESS;
const amountWei = process.env.AMOUNT_WEI ?? '0';
const claimedAt = process.env.CLAIMED_AT ?? new Date().toISOString();
const txHash = process.env.EVENT_TX_HASH;
const logIndex = Number.parseInt(process.env.EVENT_LOG_INDEX ?? '0', 10);
const chainId = Number.parseInt(process.env.CHAIN_ID ?? '31337', 10);
const vaultId = process.env.VAULT_ID ?? null;

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required');
}
if (!contestId) {
  throw new Error('CONTEST_ID is required');
}
if (!walletAddress) {
  throw new Error('WALLET_ADDRESS is required');
}
if (!txHash) {
  throw new Error('EVENT_TX_HASH is required');
}

const main = async (): Promise<void> => {
  await init({
    databaseUrl: process.env.DATABASE_URL!,
    validators: {
      registry,
      overrides,
      environmentId: process.env.DB_VALIDATION_ENV_ID,
    },
  });

  try {
    await writeContestDomain({
      action: 'append_reward_claim',
      payload: {
        contestId,
        walletAddress: walletAddress.toLowerCase(),
        amountWei,
        claimedAt,
        event: {
          chainId,
          txHash,
          logIndex,
        },
      },
    });

    const updates: Record<string, unknown> = {
      rewardStatus: 'claimed',
      rewardClaimedAt: claimedAt,
      rewardPayoutAmount: amountWei,
    };
    if (vaultId) {
      updates.rewardVaultReference = vaultId;
    }

    await writeContestDomain({
      action: 'update_participant',
      payload: {
        contestId,
        walletAddress: walletAddress.toLowerCase(),
        updates,
      },
    });
  } finally {
    await shutdown();
  }
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
