import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createContestCreationGateway } from '../src/gateway/creationGateway';
import * as componentDeployment from '../src/gateway/componentDeployment';
import * as contestDeployment from '../src/gateway/contestDeployment';
import type { ContestComponentReference, ContestDeploymentPayload } from '../src/gateway/contracts';

const ORGANIZER = '0x000000000000000000000000000000000000dead' as const;
const BASE_ASSET = '0x00000000000000000000000000000000000000aa' as const;
const QUOTE_ASSET = '0x00000000000000000000000000000000000000bb' as const;
const PRICE_SOURCE = '0x00000000000000000000000000000000000000cc' as const;
const SWAP_POOL = '0x00000000000000000000000000000000000000dd' as const;
const VAULT_IMPLEMENTATION = '0x0000000000000000000000000000000000000101' as const;
const CONTEST_ID = ('0x' + '12'.repeat(32)) as const;
const NETWORK_ID = 31337;
const INITIALIZATION_CONFIRMED_AT = '2025-10-24T00:00:03.000Z' as const;

const CLOCK_INSTANT = new Date('2025-10-24T00:00:00.000Z');

const buildComponentReference = (
  contractAddress: string,
  componentId: string
): ContestComponentReference => ({
  componentId,
  owner: ORGANIZER,
  walletAddress: ORGANIZER,
  contractAddress: contractAddress as `0x${string}`,
  configHash: 'f'.repeat(64)
});

const buildPayload = (overrides: Partial<ContestDeploymentPayload> = {}): ContestDeploymentPayload => ({
  contestId: CONTEST_ID,
  owner: ORGANIZER,
  vaultImplementation: VAULT_IMPLEMENTATION,
  vaultComponent: buildComponentReference(VAULT_IMPLEMENTATION, 'vault-component-1'),
  priceSourceComponent: buildComponentReference(PRICE_SOURCE, 'price-source-component-1'),
  config: {
    entryAsset: BASE_ASSET,
    entryAmount: 1_000_000_000_000_000_000n,
    entryFee: 100_000_000_000_000_000n,
    priceSource: PRICE_SOURCE,
    swapPool: SWAP_POOL,
    priceToleranceBps: 100,
    settlementWindow: 3600,
    maxParticipants: 128,
    topK: 16
  },
  timeline: {
    registeringEnds: 1_700_000_001n,
    liveEnds: 1_700_000_002n,
    claimEnds: 1_700_000_003n
  },
  initialPrizeAmount: 5_000_000_000_000_000_000n,
  payoutSchedule: [5000, 3000, 2000],
  metadata: { label: 'test-contest' },
  ...overrides
});

describe('contest creation gateway', () => {
  let gateway: ReturnType<typeof createContestCreationGateway>;

  beforeAll(() => {
    vi.spyOn(componentDeployment, 'deployVaultImplementation').mockImplementation(async () => ({
      transactionHash: '0x010203' as const,
      contractAddress: '0x0000000000000000000000000000000000000201' as const,
      blockNumber: 1n,
      confirmedAt: CLOCK_INSTANT
    }));

    vi.spyOn(componentDeployment, 'deployPriceSource').mockImplementation(async () => ({
      transactionHash: '0x030405' as const,
      contractAddress: '0x0000000000000000000000000000000000000301' as const,
      blockNumber: 2n,
      confirmedAt: CLOCK_INSTANT
    }));

    vi.spyOn(contestDeployment, 'deployContestBundle').mockImplementation(async () => ({
      contestAddress: '0x0000000000000000000000000000000000000401' as const,
      vaultFactoryAddress: '0x0000000000000000000000000000000000000501' as const,
      contestDeployment: {
        transactionHash: '0x040506' as const,
        blockNumber: 3n,
        blockHash: '0x0101',
        confirmedAt: '2025-10-24T00:00:01.000Z'
      },
      vaultFactoryDeployment: {
        transactionHash: '0x050607' as const,
        blockNumber: 4n,
        blockHash: '0x0202',
        confirmedAt: '2025-10-24T00:00:02.000Z'
      },
      initialization: {
        transactionHash: '0x060708' as const,
        blockNumber: 5n,
        blockHash: '0x0303',
        confirmedAt: INITIALIZATION_CONFIRMED_AT
      }
    }));

    gateway = createContestCreationGateway({
      clock: () => new Date(CLOCK_INSTANT)
    });
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  it('registers organizer components deterministically', async () => {
    const result = await gateway.registerOrganizerComponent({
      organizer: ORGANIZER,
      walletAddress: ORGANIZER,
      networkId: NETWORK_ID,
      component: {
        componentType: 'vault_implementation',
        baseAsset: BASE_ASSET,
        quoteAsset: QUOTE_ASSET
      }
    });

    expect(result.status).toBe('confirmed');
    expect(result.contractAddress).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(result.metadata.configHash).toHaveLength(64);
    expect(result.metadata.config).toMatchObject({
      baseAsset: BASE_ASSET,
      quoteAsset: QUOTE_ASSET
    });
  });

  it('accepts contest deployment and emits artifact summary', async () => {
    const receipt = await gateway.executeContestDeployment({
      organizer: ORGANIZER,
      networkId: NETWORK_ID,
      payload: buildPayload()
    });

    expect(receipt.status).toBe('confirmed');
    expect(receipt.requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
    expect(receipt.artifact?.contestAddress).toMatch(/^0x[0-9a-f]{40}$/);
    expect(receipt.artifact?.vaultFactoryAddress).toMatch(/^0x[0-9a-f]{40}$/);
    expect(receipt.artifact?.metadata?.config.entryAsset).toBe(BASE_ASSET);
    expect(receipt.acceptedAt).toBe(INITIALIZATION_CONFIRMED_AT);
  });

  it('uses system clock when none provided', async () => {
    const gw = createContestCreationGateway();

    const receipt = await gw.executeContestDeployment({
      organizer: ORGANIZER,
      networkId: NETWORK_ID,
      payload: buildPayload({
        vaultComponent: buildComponentReference(VAULT_IMPLEMENTATION, 'vault-component-2'),
        priceSourceComponent: buildComponentReference(PRICE_SOURCE, 'price-source-component-2')
      })
    });

    expect(receipt.acceptedAt).toMatch(/Z$/);
    expect(receipt.artifact?.contestAddress).toMatch(/^0x[0-9a-f]{40}$/);
  });
});
