import { describe, expect, it } from 'vitest';
import {
  createBlockAnchor,
  createContestEventBatch,
  createContestEventEnvelope,
  createContestIdentifier,
  createRebalancePlan,
  createRedemptionResult,
  createRegistrationPlan,
  createRewardClaimResult,
  createSettlementResult,
  type ContestIdentifier,
} from '../src/gateway/domainModels';

const anchor = createBlockAnchor({
  blockNumber: 1n,
  blockHash: '0x1',
});

describe('domain model builders', () => {
  it('creates frozen contest identifier', () => {
    const identifier = createContestIdentifier({
      contestId: 'contest-1',
      chainId: 1,
      addresses: {
        registrar: '0x0000000000000000000000000000000000000001',
      },
    });

    expect(Object.isFrozen(identifier)).toBe(true);
    expect(() => ((identifier as unknown as { contestId: string }).contestId = 'x')).toThrow();
  });

  it('creates immutable registration plan', () => {
    const plan = createRegistrationPlan({
      status: 'ready',
      qualifications: [
        { rule: 'balance', passed: true },
      ],
      requiredApprovals: [
        {
          tokenAddress: '0x0000000000000000000000000000000000000002',
          spender: '0x0000000000000000000000000000000000000003',
          amount: '100',
        },
      ],
      registrationCall: {
        to: '0x0000000000000000000000000000000000000004',
        data: '0x',
      },
      derivedAt: anchor,
    });

    expect(Object.isFrozen(plan)).toBe(true);
    expect(() => ((plan.requiredApprovals[0] as unknown as { amount: string }).amount = '0')).toThrow();
  });

  it('freezes contest event batch with nested events', () => {
    const batch = createContestEventBatch({
      events: [
        {
          type: 'registration',
          blockNumber: 1n,
          logIndex: 0,
          txHash: '0x2',
          cursor: { blockNumber: 1n, logIndex: 1 },
          payload: { participant: '0xabc' },
          reorgFlag: false,
          derivedAt: anchor,
        },
      ],
      nextCursor: { blockNumber: 2n, logIndex: 0 },
      latestBlock: anchor,
    });

    expect(Object.isFrozen(batch.events)).toBe(true);
    expect(Object.isFrozen(batch.events[0])).toBe(true);
  });

  it('builds additional domain objects', () => {
    const rebalance = createRebalancePlan({
      status: 'blocked',
      policyChecks: [{ rule: 'whitelist', status: 'fail', message: 'asset not allowed' }],
      rejectionReason: { code: 'RULE_VIOLATION', message: 'nope' },
      derivedAt: anchor,
    });
    expect(Object.isFrozen(rebalance.policyChecks)).toBe(true);

    const settlement = createSettlementResult({
      status: 'applied',
      frozenAt: anchor,
      settlementCall: { to: '0x1', data: '0x' },
      detail: { leaderboardVersion: 'v1' },
    });
    expect(Object.isFrozen(settlement.detail ?? {})).toBe(true);

    const reward = createRewardClaimResult({
      status: 'noop',
      derivedAt: anchor,
      reason: { code: 'QUALIFICATION_FAILED', message: 'already claimed' },
    });
    expect(Object.isFrozen(reward)).toBe(true);

    const redemption = createRedemptionResult({
      status: 'blocked',
      derivedAt: anchor,
      reason: { code: 'STATE_CONFLICT', message: 'not ready' },
    });
    expect(redemption.status).toBe('blocked');

    const envelope = createContestEventEnvelope({
      type: 'settlement',
      blockNumber: 10n,
      logIndex: 1,
      txHash: '0x3',
      cursor: { blockNumber: 11n, logIndex: 0 },
      payload: { event: 'settled' },
      reorgFlag: false,
      derivedAt: anchor,
    });
    expect(Object.isFrozen(envelope)).toBe(true);
  });
});
