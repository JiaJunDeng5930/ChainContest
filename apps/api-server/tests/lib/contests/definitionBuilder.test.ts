import { describe, expect, it, vi, beforeEach } from 'vitest';

const contestAddress = '0x5FC8D32690CC91D4C39D9D3ABCBD16989F875707';
const vaultFactoryAddress = '0xCf7ED3ACCa5A467E9E704c703e8D87F634Fb0fC9';
const vaultAddress = '0x5FbDB2315678AFECb367F032d93F642f64180aa3';
const registeredParticipant = '0x70997970C51812dC3A010C7d01b50e0D17dc79C8';
const requestParticipant = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';

const baseMetadata = {
  chainGatewayDefinition: {
    contest: {
      contestId: 'contest-internal-key',
      chainId: 31337,
      addresses: {
        contest: contestAddress,
        vaultFactory: vaultFactoryAddress,
        vault: vaultAddress
      }
    },
    phase: 'registering',
    timeline: {
      registrationOpensAt: '2025-11-02T07:00:00.000Z',
      registrationClosesAt: '2025-11-02T16:30:00.000Z'
    },
    prizePool: {
      currentBalance: '0',
      accumulatedInflow: '0'
    },
    registrationCapacity: {
      registered: 0,
      maximum: 1000,
      isFull: false
    },
    qualificationVerdict: {
      result: 'pass'
    },
    derivedAt: {
      blockHash: '0xabc',
      blockNumber: '8',
      timestamp: '2025-11-02T07:00:00.000Z'
    },
    registration: {
      window: {
        opensAt: '2025-11-02T07:00:00.000Z',
        closesAt: '2025-11-02T16:30:00.000Z'
      },
      requirement: {
        tokenAddress: vaultAddress,
        amount: '1050000',
        spender: contestAddress,
        symbol: 'USDC',
        decimals: 6,
        reason: 'contest-entry'
      },
      template: {
        call: {
          to: contestAddress,
          data: '0x0',
          value: '0'
        },
        estimatedFees: {
          currency: 'ETH',
          estimatedCost: '0'
        }
      },
      approvals: [
        {
          tokenAddress: vaultAddress,
          spender: contestAddress,
          amount: '1050000',
          symbol: 'USDC',
          decimals: 6,
          reason: 'contest-entry'
        }
      ]
    },
    participants: {},
    events: {
      events: []
    }
  },
  runtimeConfig: {
    rpcUrl: 'http://hardhat-node:8545',
    chainId: 31337,
    devPort: 43000,
    contracts: [
      {
        id: 'contest',
        name: 'Contest',
        address: contestAddress,
        abiPath: '/abi/Contest.json'
      }
    ]
  },
  prizePool: {
    currentBalance: '0',
    accumulatedInflow: '0'
  },
  registrationCapacity: {
    registered: 0,
    maximum: 1000,
    isFull: false
  },
  timeline: {
    registrationOpensAt: '2025-11-02T07:00:00.000Z',
    registrationClosesAt: '2025-11-02T16:30:00.000Z'
  },
  derivedAt: {
    blockHash: '0xabc',
    blockNumber: '8',
    timestamp: '2025-11-02T07:00:00.000Z'
  },
  qualificationVerdict: {
    result: 'pass'
  },
  registration: {
    window: {
      opensAt: '2025-11-02T07:00:00.000Z',
      closesAt: '2025-11-02T16:30:00.000Z'
    },
    requirement: {
      tokenAddress: vaultAddress,
      amount: '1050000',
      spender: contestAddress,
      symbol: 'USDC',
      decimals: 6,
      reason: 'contest-entry'
    },
    template: {
      call: {
        to: contestAddress,
        data: '0x0',
        value: '0'
      },
      estimatedFees: {
        currency: 'ETH',
        estimatedCost: '0'
      }
    },
    approvals: [
      {
        tokenAddress: vaultAddress,
        spender: contestAddress,
        amount: '1050000',
        symbol: 'USDC',
        decimals: 6,
        reason: 'contest-entry'
      }
    ]
  }
};

describe('buildContestDefinition', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('hydrates participants from database and runtime state', async () => {
    const queryContests = vi.fn().mockResolvedValue({
      items: [
        {
          contest: {
            contestId: 'contest-db-id',
            chainId: 31337,
            metadata: baseMetadata
          },
          participants: [
            {
              contestId: 'contest-db-id',
              walletAddress: registeredParticipant.toLowerCase(),
              vaultReference: null,
              amount: '1050000',
              occurredAt: new Date('2025-11-02T07:05:00.000Z')
            }
          ]
        }
      ]
    });

    const readContract = vi.fn().mockImplementation(({ functionName, args }) => {
      const [wallet] = args as [string];
      const normalized = wallet.toLowerCase();
      if (functionName === 'balanceOf') {
        if (normalized === registeredParticipant.toLowerCase()) {
          return 0n;
        }
        if (normalized === requestParticipant.toLowerCase()) {
          return 5_000_000n;
        }
        return 0n;
      }
      if (functionName === 'allowance') {
        if (normalized === registeredParticipant.toLowerCase()) {
          return 1_050_000n;
        }
        if (normalized === requestParticipant.toLowerCase()) {
          return 2_000_000n;
        }
        return 0n;
      }
      return 0n;
    });

    const createPublicClient = vi.fn().mockReturnValue({
      readContract
    });

    vi.doMock('@/lib/db/client', () => ({
      initDatabase: vi.fn(),
      database: {
        queryContests
      }
    }));

    vi.doMock('@/lib/config/env', () => ({
      getEnv: () => ({
        chain: {
          publicRpc: null,
          primaryRpc: null
        }
      })
    }));

    vi.doMock('viem', async () => {
      const actual = await vi.importActual<typeof import('viem')>('viem');
      return {
        ...actual,
        createPublicClient,
        http: vi.fn(() => ({})),
        erc20Abi: actual.erc20Abi
      };
    });

    const { buildContestDefinition } = await import('@/lib/contests/definitionBuilder');

    const definition = await buildContestDefinition(
      {
        contestId: 'contest-db-id',
        participant: requestParticipant
      },
      {
        session: {
          userId: 'user-1',
          walletAddress: requestParticipant,
          addressChecksum: requestParticipant,
          sessionToken: 'session-token'
        }
      }
    );

    expect(queryContests).toHaveBeenCalledTimes(1);
    expect(createPublicClient).toHaveBeenCalledWith({
      chain: expect.objectContaining({ id: 31337 }),
      transport: expect.anything()
    });

    const registeredKey = registeredParticipant.toLowerCase();
    const requestKey = requestParticipant.toLowerCase();

    expect(definition.registrationCapacity.registered).toBe(1);
    expect(definition.participants[registeredKey]).toBeDefined();
    expect(definition.participants[registeredKey]?.registered).toBe(true);
    expect(definition.participants[registeredKey]?.allowances[vaultAddress.toLowerCase()]?.[contestAddress.toLowerCase()]).toBe(
      '1050000'
    );

    expect(definition.participants[requestKey]).toBeDefined();
    expect(definition.participants[requestKey]?.registered).toBe(false);
    expect(definition.participants[requestKey]?.balances[vaultAddress.toLowerCase()]).toBe('5000000');
    expect(definition.participants[requestKey]?.allowances[vaultAddress.toLowerCase()]?.[contestAddress.toLowerCase()]).toBe(
      '2000000'
    );
  });

  it('hydrates runtime balances for requested participant using live rpc', async () => {
    vi.resetModules();
    const queryContests = vi.fn().mockResolvedValue({
      items: [
        {
          contest: {
            contestId: 'contest-db-id',
            chainId: 31337,
            metadata: {
              ...baseMetadata,
              runtimeConfig: {
                ...baseMetadata.runtimeConfig,
                rpcUrl: 'http://localhost:8545'
              }
            }
          },
          participants: []
        }
      ]
    });

    vi.doMock('@/lib/db/client', () => ({
      initDatabase: vi.fn(),
      database: {
        queryContests
      }
    }));

    vi.doMock('@/lib/config/env', () => ({
      getEnv: () => ({
        chain: {
          publicRpc: 'http://localhost:8545',
          primaryRpc: null
        }
      })
    }));

    const { buildContestDefinition } = await import('@/lib/contests/definitionBuilder');

    const definition = await buildContestDefinition(
      {
        contestId: 'contest-db-id',
        participant: requestParticipant
      },
      {
        session: {
          userId: 'user-1',
          walletAddress: requestParticipant,
          addressChecksum: requestParticipant,
          sessionToken: 'session-token'
        }
      }
    );

    const requestKey = requestParticipant.toLowerCase();
    const tokenKey = vaultAddress.toLowerCase();

    expect(definition.participants[requestKey]).toBeDefined();
    expect(BigInt(definition.participants[requestKey]?.balances[tokenKey] ?? '0')).toBeGreaterThan(0n);
  });
});
