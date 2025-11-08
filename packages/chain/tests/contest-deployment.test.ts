import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { privateKeyToAccount } from 'viem/accounts';
import type { DeploymentRuntime } from '../src/runtime/deploymentRuntime';
import { ContestChainError } from '../src/errors/contestChainError';

const waitForTransactionReceiptMock = vi.fn();
const getBlockMock = vi.fn();
const writeContractMock = vi.fn();

vi.mock('viem/actions', () => ({
  waitForTransactionReceipt: waitForTransactionReceiptMock,
  getBlock: getBlockMock,
  writeContract: writeContractMock
}));

const { deployContestBundle } = await import('../src/gateway/contestDeployment');
const { deployVaultImplementation, deployPriceSource } = await import('../src/gateway/componentDeployment');
const { getComponentArtifact } = await import('../src/gateway/artifacts');

const hardhatAccount = privateKeyToAccount(
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
);

const createRuntime = () => {
  const client = {
    deployContract: vi.fn()
  };

  const runtime = {
    account: hardhatAccount,
    resolveRpcUrls: () => ['http://127.0.0.1:8545'],
    createTransport: () => ({}),
    createWalletClient: () => client
  } as unknown as DeploymentRuntime;

  return { runtime, client };
};

const resetActionMocks = () => {
  waitForTransactionReceiptMock.mockReset();
  getBlockMock.mockReset();
  writeContractMock.mockReset();
};

describe('deployContestBundle', () => {
  beforeEach(() => {
    resetActionMocks();
  });

  afterAll(() => {
    vi.resetAllMocks();
  });

  it('deploys contest, vault factory and initialization with derived receipts', async () => {
    const { runtime, client } = createRuntime();
    client.deployContract
      .mockResolvedValueOnce('0xcontest-tx')
      .mockResolvedValueOnce('0xvaultfactory-tx');

    waitForTransactionReceiptMock
      .mockResolvedValueOnce({
        blockHash: '0xaaa1',
        blockNumber: 1n,
        contractAddress: '0x0000000000000000000000000000000000001000'
      })
      .mockResolvedValueOnce({
        blockHash: '0xaaa2',
        blockNumber: 2n,
        contractAddress: '0x0000000000000000000000000000000000002000'
      })
      .mockResolvedValueOnce({
        blockHash: '0xaaa3',
        blockNumber: 3n,
        contractAddress: null
      });

    getBlockMock
      .mockResolvedValueOnce({ timestamp: 1700000000n })
      .mockResolvedValueOnce({ timestamp: 1700000010n })
      .mockResolvedValueOnce({ timestamp: 1700000020n });

    writeContractMock.mockResolvedValue('0xinitialization-tx');

    const result = await deployContestBundle({
      runtime,
      chain: { id: 31337 } as never,
      organizer: '0x000000000000000000000000000000000000dead',
      contestId: ('0x' + '12'.repeat(32)) as `0x${string}`,
      vaultImplementation: '0x0000000000000000000000000000000000009000',
      config: {
        entryAsset: '0x0000000000000000000000000000000000000100',
        entryAmount: 1n,
        entryFee: 0n,
        priceSource: '0x0000000000000000000000000000000000000200',
        swapPool: '0x0000000000000000000000000000000000000300',
        priceToleranceBps: 100,
        settlementWindow: 3600,
        maxParticipants: 16,
        topK: 4
      },
      timeline: {
        registeringEnds: 100n,
        liveEnds: 200n,
        claimEnds: 300n
      },
      initialPrizeAmount: 0n,
      payoutSchedule: [1000, 900, 800],
      metadata: { tag: 'unit-test' }
    });

    expect(client.deployContract).toHaveBeenCalledTimes(2);
    expect(writeContractMock).toHaveBeenCalledTimes(1);
    const [, initializeArgs] = writeContractMock.mock.calls[0] ?? [];
    expect(initializeArgs).toMatchObject({
      address: '0x0000000000000000000000000000000000001000',
      functionName: 'initialize',
      account: hardhatAccount,
      chain: { id: 31337 }
    });
    expect(result.contestAddress).toBe('0x0000000000000000000000000000000000001000');
    expect(result.vaultFactoryAddress).toBe('0x0000000000000000000000000000000000002000');
    expect(result.initialization?.transactionHash).toBe('0xinitialization-tx');
    expect(result.initializer.calldata).toMatch(/^0x/);
    expect(result.initializer.args.owner).toBe('0x000000000000000000000000000000000000dead');
  });

  it('skips initialization when requested and exposes call data', async () => {
    const { runtime, client } = createRuntime();
    client.deployContract
      .mockResolvedValueOnce('0xcontest-tx')
      .mockResolvedValueOnce('0xvaultfactory-tx');

    waitForTransactionReceiptMock
      .mockResolvedValueOnce({
        blockHash: '0xaaa1',
        blockNumber: 1n,
        contractAddress: '0x0000000000000000000000000000000000001000'
      })
      .mockResolvedValueOnce({
        blockHash: '0xaaa2',
        blockNumber: 2n,
        contractAddress: '0x0000000000000000000000000000000000002000'
      });

    getBlockMock
      .mockResolvedValueOnce({ timestamp: 1700000000n })
      .mockResolvedValueOnce({ timestamp: 1700000010n });

    const result = await deployContestBundle({
      runtime,
      chain: { id: 31337 } as never,
      organizer: '0x000000000000000000000000000000000000dead',
      contestId: ('0x' + '99'.repeat(32)) as `0x${string}`,
      vaultImplementation: '0x0000000000000000000000000000000000009000',
      config: {
        entryAsset: '0x0000000000000000000000000000000000000100',
        entryAmount: 1n,
        entryFee: 1n,
        priceSource: '0x0000000000000000000000000000000000000200',
        swapPool: '0x0000000000000000000000000000000000000300',
        priceToleranceBps: 100,
        settlementWindow: 3600,
        maxParticipants: 16,
        topK: 4
      },
      timeline: {
        registeringEnds: 100n,
        liveEnds: 200n,
        claimEnds: 300n
      },
      initialPrizeAmount: 500n,
      payoutSchedule: [1000, 900, 800],
      skipInitialization: true
    });

    expect(writeContractMock).not.toHaveBeenCalled();
    expect(result.initialization).toBeNull();
    expect(result.initializer.calldata).toMatch(/^0x70cc65c3/);
    expect(result.initializer.args.initialPrizeAmount).toBe(500n);
  });

  it('wraps deployment failures with ContestChainError', async () => {
    const { runtime, client } = createRuntime();
    client.deployContract.mockResolvedValue('0xfailing-tx');

    waitForTransactionReceiptMock.mockResolvedValue({
      blockHash: '0xdead',
      blockNumber: 9n,
      contractAddress: null
    });

    getBlockMock.mockResolvedValue({ timestamp: 1700001000n });
    writeContractMock.mockResolvedValue('0xnoop');

    await expect(
      deployContestBundle({
        runtime,
        chain: { id: 31337 } as never,
        organizer: '0x000000000000000000000000000000000000dead',
        contestId: ('0x' + '21'.repeat(32)) as `0x${string}`,
        vaultImplementation: '0x000000000000000000000000000000000000f00d',
        config: {
          entryAsset: '0x0000000000000000000000000000000000000100',
          entryAmount: 1n,
          entryFee: 0n,
          priceSource: '0x0000000000000000000000000000000000000200',
          swapPool: '0x0000000000000000000000000000000000000300',
          priceToleranceBps: 100,
          settlementWindow: 3600,
          maxParticipants: 16,
          topK: 4
        },
        timeline: {
          registeringEnds: 10n,
          liveEnds: 20n,
          claimEnds: 30n
        },
        initialPrizeAmount: 0n,
        payoutSchedule: []
      })
    ).rejects.toBeInstanceOf(ContestChainError);
  });

  it('deploys vault implementation component and derives confirmation metadata', async () => {
    const { runtime, client } = createRuntime();
    client.deployContract.mockResolvedValue('0xcomponent-tx');

    waitForTransactionReceiptMock.mockResolvedValue({
      blockHash: '0xbbb1',
      blockNumber: 11n,
      contractAddress: '0x000000000000000000000000000000000000beef'
    });

    getBlockMock.mockResolvedValue({ timestamp: 1700003000n });

    const result = await deployVaultImplementation({
      runtime,
      chain: { id: 31337 } as never,
      baseAsset: '0x0000000000000000000000000000000000000a01',
      quoteAsset: '0x0000000000000000000000000000000000000b01'
    });

    expect(client.deployContract).toHaveBeenCalledWith(
      expect.objectContaining({
        abi: expect.any(Array),
        bytecode: expect.any(String),
        args: [
          '0x0000000000000000000000000000000000000a01',
          '0x0000000000000000000000000000000000000b01'
        ]
      })
    );
    expect(result.contractAddress).toBe('0x000000000000000000000000000000000000beef');
    expect(result.blockNumber).toBe(11n);
    expect(result.confirmedAt).toBeInstanceOf(Date);
  });

  it('fails component deployment when receipt lacks contract address', async () => {
    const { runtime, client } = createRuntime();
    client.deployContract.mockResolvedValue('0xmissing-address');

    waitForTransactionReceiptMock.mockResolvedValue({
      blockHash: '0xccc2',
      blockNumber: 12n,
      contractAddress: null
    });

    getBlockMock.mockResolvedValue({ timestamp: 1700004000n });

    await expect(
      deployPriceSource({
        runtime,
        chain: { id: 31337 } as never,
        poolAddress: '0x0000000000000000000000000000000000000c01',
        twapSeconds: 30
      })
    ).rejects.toBeInstanceOf(ContestChainError);
  });

  it('returns component artifacts and rejects unsupported keys', () => {
    const vaultComponent = getComponentArtifact('vault_implementation');
    const priceSourceComponent = getComponentArtifact('price_source');

    expect(vaultComponent.abi).toBeInstanceOf(Array);
    expect(priceSourceComponent.bytecode).toMatch(/^0x[0-9a-f]+$/i);
    expect(() => getComponentArtifact('oracle' as never)).toThrowError(/Unsupported component artifact key/);
  });
});
