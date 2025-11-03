import { beforeEach, describe, expect, it, vi, type Mocked } from 'vitest';
import type { DeploymentRuntime } from '../src/runtime/deploymentRuntime';
import * as lifecycle from '../src/lifecycle/contestLifecycle.js';

vi.mock('viem', async () => {
  const actual = await vi.importActual<typeof import('viem')>('viem');
  return {
    ...actual,
    defineChain: vi.fn((config: Parameters<typeof actual.defineChain>[0]) => actual.defineChain(config)),
    createPublicClient: vi.fn(() => ({}))
  };
});

vi.mock('viem/actions', () => ({
  waitForTransactionReceipt: vi.fn().mockResolvedValue(undefined),
  readContract: vi.fn(),
  writeContract: vi.fn()
}));

const mockReadContract = vi.mocked(await import('viem/actions').then((module) => module.readContract));
const mockWriteContract = vi.mocked(await import('viem/actions').then((module) => module.writeContract));
const mockWaitForReceipt = vi.mocked(await import('viem/actions').then((module) => module.waitForTransactionReceipt));

const mockCreatePublicClient = vi.mocked(await import('viem').then((module) => module.createPublicClient));

const buildRuntime = (): Mocked<DeploymentRuntime> => ({
  account: {
    address: '0x0000000000000000000000000000000000000001',
    source: 'privateKey',
    type: 'local'
  } as unknown as DeploymentRuntime['account'],
  resolveRpcUrls: vi.fn().mockReturnValue(['http://127.0.0.1:8545']),
  createTransport: vi.fn().mockReturnValue({}),
  createWalletClient: vi.fn().mockReturnValue({
    writeContract: vi.fn()
  })
});

const resetMocks = (): void => {
  vi.clearAllMocks();
  lifecycle.resetContestLifecycleCache();
};

const buildTransactionRuntime = (): Mocked<DeploymentRuntime> => ({
  account: {
    address: '0x0000000000000000000000000000000000000001',
    source: 'privateKey',
    type: 'local'
  } as unknown as DeploymentRuntime['account'],
  resolveRpcUrls: vi.fn().mockReturnValue(['http://127.0.0.1:8545']),
  createTransport: vi.fn().mockReturnValue({}),
  createWalletClient: vi.fn().mockReturnValue({})
});

describe('readContestState', () => {
  beforeEach(() => {
    resetMocks();
  });

  it('maps on-chain values into snapshot', async () => {
    const runtime = buildRuntime();

    mockReadContract
      .mockResolvedValueOnce(3) // state -> frozen
      .mockResolvedValueOnce(5n) // participantCount
      .mockResolvedValueOnce(4n) // settledCount
      .mockResolvedValueOnce(2n); // leaderboardVersion

    const snapshot = await lifecycle.readContestState(runtime, {
      chainId: 31337,
      contestAddress: '0x0000000000000000000000000000000000000002'
    });

    expect(snapshot).toEqual({
      state: 'frozen',
      participantCount: 5,
      settledCount: 4,
      leaderboardVersion: 2
    });
    expect(runtime.resolveRpcUrls).toHaveBeenCalledWith(31337);
    expect(mockCreatePublicClient).toHaveBeenCalledTimes(1);
  });

  it('handles bigint encoded state values', async () => {
    const runtime = buildRuntime();

    mockReadContract
      .mockResolvedValueOnce(0n)
      .mockResolvedValueOnce(7)
      .mockResolvedValueOnce(3n)
      .mockResolvedValueOnce(0n);

    const snapshot = await lifecycle.readContestState(runtime, {
      chainId: 31337,
      contestAddress: '0x0000000000000000000000000000000000000002'
    });

    expect(snapshot).toEqual({
      state: 'uninitialized',
      participantCount: 7,
      settledCount: 3,
      leaderboardVersion: 0
    });
  });

  it('defaults missing counters to zero', async () => {
    const runtime = buildRuntime();

    mockReadContract
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined);

    const snapshot = await lifecycle.readContestState(runtime, {
      chainId: 31337,
      contestAddress: '0x0000000000000000000000000000000000000002'
    });

    expect(snapshot.participantCount).toBe(0);
    expect(snapshot.settledCount).toBe(0);
    expect(snapshot.leaderboardVersion).toBe(0);
  });
});

describe('readContestTimeline', () => {
  beforeEach(() => {
    resetMocks();
  });

  it('converts timeline seconds to dates', async () => {
    const runtime = buildRuntime();
    const nowSeconds = Math.floor(Date.now() / 1000);

    mockReadContract.mockResolvedValueOnce({
      registeringEnds: BigInt(nowSeconds),
      liveEnds: BigInt(nowSeconds + 600),
      claimEnds: BigInt(nowSeconds + 1200)
    });

    const timeline = await lifecycle.readContestTimeline(runtime, {
      chainId: 31337,
      contestAddress: '0x0000000000000000000000000000000000000002'
    });

    expect(timeline.registeringEnds.getTime()).toBe(nowSeconds * 1000);
    expect(timeline.liveEnds.getTime()).toBe((nowSeconds + 600) * 1000);
    expect(timeline.claimEnds.getTime()).toBe((nowSeconds + 1200) * 1000);
  });
});

describe('computeLeaderboardUpdates', () => {
  beforeEach(() => {
    resetMocks();
  });

  it('sorts entries by nav and truncates to topK', async () => {
    mockReadContract
      // Vault 1
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(2000n)
      .mockResolvedValueOnce(500n)
      // Vault 2
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(3000n)
      .mockResolvedValueOnce(200n)
      // Vault 3
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(1500n)
      .mockResolvedValueOnce(600n)
      // Vault 4 (unsettled)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(900n)
      .mockResolvedValueOnce((-100n));

    const updates = await lifecycle.computeLeaderboardUpdates({
      runtime: buildRuntime(),
      reference: {
        chainId: 31337,
        contestAddress: '0x0000000000000000000000000000000000000002'
      },
      vaultIds: [
        '0x1111111111111111111111111111111111111111111111111111111111111111',
        '0x2222222222222222222222222222222222222222222222222222222222222222',
        '0x3333333333333333333333333333333333333333333333333333333333333333',
        '0x4444444444444444444444444444444444444444444444444444444444444444'
      ],
      topK: 2
    });

    expect(updates).toEqual([
      {
        vaultId: '0x2222222222222222222222222222222222222222222222222222222222222222',
        nav: 3000n,
        roiBps: 200
      },
      {
        vaultId: '0x1111111111111111111111111111111111111111111111111111111111111111',
        nav: 2000n,
        roiBps: 500
      }
    ]);
  });

  it('breaks ties using roi values', async () => {
    mockReadContract
      // Vault 1
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(1000n)
      .mockResolvedValueOnce(300n)
      // Vault 2
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(1000n)
      .mockResolvedValueOnce(250n);

    const updates = await lifecycle.computeLeaderboardUpdates({
      runtime: buildRuntime(),
      reference: {
        chainId: 31337,
        contestAddress: '0x0000000000000000000000000000000000000002'
      },
      vaultIds: [
        '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
      ],
      topK: 5
    });

    expect(updates).toEqual([
      {
        vaultId: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        nav: 1000n,
        roiBps: 300
      },
      {
        vaultId: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        nav: 1000n,
        roiBps: 250
      }
    ]);
  });
});

describe('transactional lifecycle helpers', () => {
  beforeEach(() => {
    resetMocks();
  });

  it('executes freeze transaction and waits for confirmation', async () => {
    const runtime = buildTransactionRuntime();
    mockWriteContract.mockResolvedValueOnce('0xtxhash').mockResolvedValueOnce('0xtxhash2');

    const hash = await lifecycle.freezeContest(runtime, {
      chainId: 31337,
      contestAddress: '0x0000000000000000000000000000000000000002'
    });

    expect(hash).toBe('0xtxhash');
    expect(mockWriteContract).toHaveBeenCalledWith(expect.any(Object), expect.objectContaining({ functionName: 'freeze' }));
    expect(mockWaitForReceipt).toHaveBeenCalledWith(expect.any(Object), { hash: '0xtxhash' });

    const secondHash = await lifecycle.freezeContest(runtime, {
      chainId: 31337,
      contestAddress: '0x0000000000000000000000000000000000000002'
    });

    expect(secondHash).toBe('0xtxhash2');
    expect(mockCreatePublicClient).toHaveBeenCalledTimes(1);
  });

  it('reads contest topK from config struct', async () => {
    const runtime = buildRuntime();
    mockReadContract.mockResolvedValueOnce({ topK: 8n });

    const topK = await lifecycle.readContestTopK(runtime, {
      chainId: 31337,
      contestAddress: '0x0000000000000000000000000000000000000002'
    });

    expect(topK).toBe(8);
  });

  it('falls back to numeric topK values', async () => {
    const runtime = buildRuntime();
    mockReadContract.mockResolvedValueOnce({ topK: 4 });

    const topK = await lifecycle.readContestTopK(runtime, {
      chainId: 31337,
      contestAddress: '0x0000000000000000000000000000000000000002'
    });

    expect(topK).toBe(4);
  });

  it('fetches vault score and normalises fields', async () => {
    mockReadContract
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(1234n)
      .mockResolvedValueOnce(-50n);

    const score = await lifecycle.readVaultScore(buildRuntime(), {
      chainId: 31337,
      contestAddress: '0x0000000000000000000000000000000000000002'
    }, '0x00000000000000000000000000000000000000000000000000000000000000ab');

    expect(score).toEqual({ settled: true, nav: 1234n, roiBps: -50 });
  });

  it('returns unsettled vault scores when mark absent', async () => {
    mockReadContract
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(0n)
      .mockResolvedValueOnce(0n);

    const score = await lifecycle.readVaultScore(buildRuntime(), {
      chainId: 31337,
      contestAddress: '0x0000000000000000000000000000000000000002'
    }, '0x0000000000000000000000000000000000000000000000000000000000000001');

    expect(score.settled).toBe(false);
  });

  it('falls back to zero scores when contract omits values', async () => {
    mockReadContract
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined);

    const score = await lifecycle.readVaultScore(buildRuntime(), {
      chainId: 31337,
      contestAddress: '0x0000000000000000000000000000000000000002'
    }, '0x0000000000000000000000000000000000000000000000000000000000000002');

    expect(score.nav).toBe(0n);
    expect(score.roiBps).toBe(0);
  });

  it('updates contest leaders with provided payload', async () => {
    const runtime = buildTransactionRuntime();
    mockWriteContract.mockResolvedValueOnce('0xtxhash');

    const hash = await lifecycle.updateContestLeaders(runtime, {
      chainId: 31337,
      contestAddress: '0x0000000000000000000000000000000000000002',
      updates: [
        {
          vaultId: '0x00000000000000000000000000000000000000000000000000000000000000ab',
          nav: 1000n,
          roiBps: 250
        }
      ]
    });

    expect(hash).toBe('0xtxhash');
    expect(mockWriteContract).toHaveBeenCalledWith(expect.any(Object), expect.objectContaining({ functionName: 'updateLeaders' }));
  });

  it('settles participant through execution helper', async () => {
    const runtime = buildTransactionRuntime();
    mockWriteContract.mockResolvedValueOnce('0xsettle');

    const txHash = await lifecycle.settleContestParticipant(runtime, {
      chainId: 31337,
      contestAddress: '0x0000000000000000000000000000000000000002',
      participantAddress: '0x000000000000000000000000000000000000000b'
    });

    expect(txHash).toBe('0xsettle');
    expect(mockWriteContract).toHaveBeenCalledWith(expect.any(Object), expect.objectContaining({ functionName: 'settle' }));
  });

  it('seals contest via execution helper', async () => {
    const runtime = buildTransactionRuntime();
    mockWriteContract.mockResolvedValueOnce('0xseal');

    const txHash = await lifecycle.sealContest(runtime, {
      chainId: 31337,
      contestAddress: '0x0000000000000000000000000000000000000002'
    });

    expect(txHash).toBe('0xseal');
    expect(mockWriteContract).toHaveBeenCalledWith(expect.any(Object), expect.objectContaining({ functionName: 'seal' }));
  });
});
