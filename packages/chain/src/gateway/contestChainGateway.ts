import {
  createRegistrationPlan,
  createRebalancePlan,
  createSettlementResult,
  createRewardClaimResult,
  createRedemptionResult,
  createRegistrationExecutionResult,
  createRebalanceExecutionResult,
  createContestEventBatch,
  createLifecycleSnapshot,
  type RegistrationPlan,
  type RebalancePlan,
  type SettlementResult,
  type RewardClaimResult,
  type RedemptionResult,
  type RegistrationExecutionResult,
  type RebalanceExecutionResult,
  type ContestEventBatch,
  type LifecycleSnapshot,
  type TokenApprovalRequestShape,
} from './domainModels.js';
import {
  createContestChainError,
  wrapContestChainError,
  type ContestChainError,
} from '../errors/contestChainError.js';
import type {
  ContestChainGateway,
  DescribeContestLifecycleInput,
  PlanParticipantRegistrationInput,
  PlanPortfolioRebalanceInput,
  ExecuteParticipantRegistrationInput,
  ExecutePortfolioRebalanceInput,
  ExecuteContestSettlementInput,
  ExecuteRewardClaimInput,
  ExecutePrincipalRedemptionInput,
  PullContestEventsInput,
  GatewayRuntime,
} from './contracts.js';
import type { ContestChainGateway as ContestChainGatewayContract } from './contracts.js';
import type { ContestDefinition, ContestParticipantProfile } from './types.js';
import { lowercaseAddress } from './types.js';
import { evaluateRegistrationRules } from '../policies/registrationRules.js';
import { evaluateRebalanceRules } from '../policies/rebalanceRules.js';
import { planTradeRoute } from '../adapters/tradeRoutePlanner.js';
import {
  evaluateSettlementGuards,
  evaluateRewardClaimGuards,
  evaluateRedemptionGuards,
} from '../policies/settlementGuards.js';
import { decodeContestEventBatch } from '../events/contestEventDecoder.js';

export type ContestChainGatewayInstance = ContestChainGatewayContract;

const asContestError = (error: unknown, fallbackSource: string): ContestChainError =>
  wrapContestChainError(error, { source: fallbackSource });

const findParticipantProfile = (
  definition: ContestDefinition,
  participant: string,
): ContestParticipantProfile | undefined =>
  definition.participants[lowercaseAddress(participant as never)];

const resolveParticipantProfile = (
  definition: ContestDefinition,
  participant: string,
): ContestParticipantProfile =>
  findParticipantProfile(definition, participant) ?? {
    address: participant as never,
    balances: {},
    allowances: {},
    registered: false,
  };

const buildRegistrationApprovals = (definition: ContestDefinition): TokenApprovalRequestShape[] => {
  const base: TokenApprovalRequestShape = {
    tokenAddress: definition.registration.requirement.tokenAddress,
    spender: definition.registration.requirement.spender,
    amount: definition.registration.requirement.amount,
    symbol: definition.registration.requirement.symbol,
    decimals: definition.registration.requirement.decimals,
    reason:
      definition.registration.requirement.reason ?? 'registration-entry-requirement',
  };

  const approvals: TokenApprovalRequestShape[] = [base, ...(definition.registration.approvals ?? [])];
  const unique: TokenApprovalRequestShape[] = [];
  const seen = new Set<string>();
  for (const approval of approvals) {
    const key = `${approval.tokenAddress?.toLowerCase() ?? ''}:${approval.spender?.toLowerCase() ?? ''}`;
    if (!seen.has(key)) {
      unique.push(approval);
      seen.add(key);
    }
  }

  return unique;
};

class ContestChainGatewayImpl implements ContestChainGateway {
  constructor(private readonly runtime: GatewayRuntime) {}

  private async loadDefinition(
    contest: DescribeContestLifecycleInput['contest'],
    options: { blockTag?: bigint | 'latest'; rpcUrl?: string } = {},
  ): Promise<ContestDefinition> {
    return this.runtime.dataProvider.loadContestDefinition(contest, options);
  }

  private handleError(error: unknown, source: string): never {
    const contestError = asContestError(error, source);
    try {
      this.runtime.errorLogger?.(contestError);
    } catch {
      // ignore logger failures
    }
    throw contestError;
  }

  public async describeContestLifecycle(
    input: DescribeContestLifecycleInput,
  ): Promise<LifecycleSnapshot> {
    try {
      const definition = await this.loadDefinition(
        input.contest,
        { blockTag: input.blockTag },
      );

      let qualificationVerdict = definition.qualificationVerdict;

      if (input.includeQualification && input.participant) {
        const participant = resolveParticipantProfile(
          definition,
          input.participant,
        );

        const approvals = buildRegistrationApprovals(definition);

        const evaluation = evaluateRegistrationRules({
          contest: definition.contest,
          phase: definition.phase,
          window: definition.registration.window,
          capacity: definition.registrationCapacity,
          requirement: definition.registration.requirement,
          approvals,
          participant,
          blockTimestamp:
            definition.derivedAt.timestamp ?? new Date().toISOString(),
        });

        qualificationVerdict = Object.freeze({
          result: evaluation.verdict,
          reason: evaluation.rejectionReason?.message,
          ruleIds: evaluation.failedRuleIds,
        });
      }

      return createLifecycleSnapshot({
        phase: definition.phase,
        timeline: definition.timeline,
        prizePool: definition.prizePool,
        registrationCapacity: definition.registrationCapacity,
        qualificationVerdict,
        derivedAt: definition.derivedAt,
      });
    } catch (error) {
      return this.handleError(error, 'ContestChainGateway.describeContestLifecycle');
    }
  }

  public async planParticipantRegistration(
    input: PlanParticipantRegistrationInput,
  ): Promise<RegistrationPlan> {
    try {
      const definition = await this.loadDefinition(
        input.contest,
        { blockTag: input.blockTag },
      );

      const participant = resolveParticipantProfile(
        definition,
        input.participant,
      );

      const approvals = buildRegistrationApprovals(definition);

      const evaluation = evaluateRegistrationRules({
        contest: definition.contest,
        phase: definition.phase,
        window: definition.registration.window,
        capacity: definition.registrationCapacity,
        requirement: definition.registration.requirement,
        approvals,
        participant,
        blockTimestamp:
          definition.derivedAt.timestamp ?? new Date().toISOString(),
      });

      const status = evaluation.verdict === 'pass' ? 'ready' : 'blocked';

      const plan = createRegistrationPlan({
        status,
        qualifications: evaluation.checks,
        requiredApprovals: evaluation.allowanceInspection.missing,
        registrationCall:
          status === 'ready' ? definition.registration.template.call : undefined,
        estimatedFees: definition.registration.template.estimatedFees,
        rejectionReason: evaluation.rejectionReason,
        derivedAt: definition.derivedAt,
      });

      return plan;
    } catch (error) {
      return this.handleError(error, 'ContestChainGateway.planParticipantRegistration');
    }
  }

  public async executeParticipantRegistration(
    input: ExecuteParticipantRegistrationInput,
  ): Promise<RegistrationExecutionResult> {
    try {
      const plan = await this.planParticipantRegistration(input);

      if (plan.status !== 'ready' || !plan.registrationCall) {
        const reason =
          plan.rejectionReason ?? ({ code: 'registration_blocked', message: 'Registration not executable' } as const);

        return createRegistrationExecutionResult({
          status: 'noop',
          reason,
          requiredApprovals: plan.requiredApprovals,
          transaction: undefined,
          derivedAt: plan.derivedAt,
        });
      }

      return createRegistrationExecutionResult({
        status: 'executed',
        transaction: plan.registrationCall,
        requiredApprovals: plan.requiredApprovals,
        derivedAt: plan.derivedAt,
      });
    } catch (error) {
      return this.handleError(error, 'ContestChainGateway.executeParticipantRegistration');
    }
  }

  public async planPortfolioRebalance(
    input: PlanPortfolioRebalanceInput,
  ): Promise<RebalancePlan> {
    try {
      const definition = await this.loadDefinition(
        input.contest,
        { blockTag: input.blockTag },
      );

      const config = definition.rebalance;
      if (!config) {
        throw createContestChainError({
          code: 'NOT_IMPLEMENTED',
          message: 'Rebalance policies are not configured for this contest',
          details: { contest: definition.contest },
        });
      }

      const participant = resolveParticipantProfile(
        definition,
        input.participant,
      );

      const approvals = [
        {
          tokenAddress: input.intent.sellAsset,
          spender: config.spender,
          amount: input.intent.amount,
          reason: 'rebalance-sell-allowance',
        },
        ...(config.approvals ?? []),
      ];

      const evaluation = evaluateRebalanceRules({
        contest: definition.contest,
        config,
        participant,
        intent: input.intent,
        approvals,
        blockTimestamp:
          definition.derivedAt.timestamp ?? new Date().toISOString(),
        phase: definition.phase,
      });

      if (evaluation.status === 'blocked') {
        return createRebalancePlan({
          status: 'blocked',
          policyChecks: evaluation.checks,
          rollbackAdvice: config.rollbackAdvice,
          rejectionReason: evaluation.rejectionReason,
          derivedAt: definition.derivedAt,
        });
      }

      const routePlan = planTradeRoute({
        contest: definition,
        config,
        intent: input.intent,
        blockTimestamp:
          definition.derivedAt.timestamp ?? new Date().toISOString(),
        participant,
      });

      return createRebalancePlan({
        status: 'ready',
        policyChecks: evaluation.checks,
        transaction: routePlan.transaction,
        rollbackAdvice: config.rollbackAdvice,
        derivedAt: definition.derivedAt,
      });
    } catch (error) {
      return this.handleError(error, 'ContestChainGateway.planPortfolioRebalance');
    }
  }

  public async executePortfolioRebalance(
    input: ExecutePortfolioRebalanceInput,
  ): Promise<RebalanceExecutionResult> {
    try {
      const plan = await this.planPortfolioRebalance(input);

      if (plan.status !== 'ready' || !plan.transaction) {
        const reason =
          plan.rejectionReason ?? ({ code: 'rebalance_blocked', message: 'Rebalance not executable' } as const);

        return createRebalanceExecutionResult({
          status: 'noop',
          reason,
          rollbackAdvice: plan.rollbackAdvice,
          transaction: undefined,
          derivedAt: plan.derivedAt,
        });
      }

      return createRebalanceExecutionResult({
        status: 'executed',
        transaction: plan.transaction,
        rollbackAdvice: plan.rollbackAdvice,
        derivedAt: plan.derivedAt,
      });
    } catch (error) {
      return this.handleError(error, 'ContestChainGateway.executePortfolioRebalance');
    }
  }

  public async executeContestSettlement(
    input: ExecuteContestSettlementInput,
  ): Promise<SettlementResult> {
    try {
      const definition = await this.loadDefinition(
        input.contest,
        { blockTag: input.blockTag },
      );

      const config = definition.settlement;
      if (!config) {
        throw createContestChainError({
          code: 'NOT_IMPLEMENTED',
          message: 'Settlement is not configured for this contest',
          details: { contest: definition.contest },
        });
      }

      const evaluation = evaluateSettlementGuards({
        caller: input.caller,
        config,
        blockTimestamp:
          definition.derivedAt.timestamp ?? new Date().toISOString(),
      });

      const detail = {
        leaderboardVersion: config.leaderboardVersion,
        snapshotHash: config.snapshotHash,
        operator: config.operator ?? input.caller,
        metadata: config.detail,
      } as const;

      if (evaluation.status === 'ready') {
        if (!config.settlementCall) {
          throw createContestChainError({
            code: 'INTERNAL_ERROR',
            message: 'Settlement call missing from configuration',
            details: { contest: definition.contest },
          });
        }

        return createSettlementResult({
          status: 'applied',
          settlementCall: config.settlementCall,
          detail,
          frozenAt: config.frozenAt,
        });
      }

      if (evaluation.status === 'noop') {
        return createSettlementResult({
          status: 'noop',
          detail,
          frozenAt: config.frozenAt,
          rejectionReason: evaluation.reason,
        });
      }

      return createSettlementResult({
        status: 'blocked',
        frozenAt: config.frozenAt,
        rejectionReason: evaluation.reason,
      });
    } catch (error) {
      return this.handleError(error, 'ContestChainGateway.executeContestSettlement');
    }
  }

  public async executeRewardClaim(
    input: ExecuteRewardClaimInput,
  ): Promise<RewardClaimResult> {
    try {
      const definition = await this.loadDefinition(
        input.contest,
        { blockTag: input.blockTag },
      );

      const rewards = definition.rewards ?? {};
      const entry = rewards[lowercaseAddress(input.participant)];

      const evaluation = evaluateRewardClaimGuards({
        participant: input.participant,
        entry,
      });

      const derivedAt = entry?.derivedAt ?? definition.derivedAt;

      if (evaluation.status === 'applied' && entry) {
        return createRewardClaimResult({
          status: 'applied',
          payout: entry.payout,
          claimCall: entry.claimCall,
          derivedAt,
        });
      }

      if (evaluation.status === 'noop') {
        return createRewardClaimResult({
          status: 'noop',
          payout: entry?.payout,
          claimCall: entry?.claimCall,
          reason: evaluation.reason,
          derivedAt,
        });
      }

      return createRewardClaimResult({
        status: 'blocked',
        reason: evaluation.reason,
        derivedAt,
      });
    } catch (error) {
      return this.handleError(error, 'ContestChainGateway.executeRewardClaim');
    }
  }

  public async executePrincipalRedemption(
    input: ExecutePrincipalRedemptionInput,
  ): Promise<RedemptionResult> {
    try {
      const definition = await this.loadDefinition(
        input.contest,
        { blockTag: input.blockTag },
      );

      const redemption = definition.redemption ?? {};
      const entry = redemption[lowercaseAddress(input.participant)];

      const evaluation = evaluateRedemptionGuards({
        participant: input.participant,
        entry,
      });

      const derivedAt = entry?.derivedAt ?? definition.derivedAt;

      if (evaluation.status === 'applied' && entry) {
        return createRedemptionResult({
          status: 'applied',
          payout: entry.payout,
          claimCall: entry.redemptionCall,
          derivedAt,
        });
      }

      if (evaluation.status === 'noop') {
        return createRedemptionResult({
          status: 'noop',
          payout: entry?.payout,
          reason: evaluation.reason,
          derivedAt,
        });
      }

      return createRedemptionResult({
        status: 'blocked',
        reason: evaluation.reason,
        derivedAt,
      });
    } catch (error) {
      return this.handleError(error, 'ContestChainGateway.executePrincipalRedemption');
    }
  }

  public async pullContestEvents(
    input: PullContestEventsInput,
  ): Promise<ContestEventBatch> {
    try {
      const definition = await this.loadDefinition(input.contest, {
        blockTag: input.toBlock,
        rpcUrl: input.rpcUrl,
      });

      const eventsConfig = definition.events;
      const fallbackCursor = input.cursor ?? {
        blockNumber: definition.derivedAt.blockNumber,
        logIndex: 0,
      };

      const decoded = decodeContestEventBatch(eventsConfig?.events ?? [], {
        cursor: input.cursor,
        fromBlock: input.fromBlock,
        toBlock: input.toBlock,
        limit: input.limit,
        fallbackCursor,
        fallbackBlock: definition.derivedAt,
      });

      return createContestEventBatch({
        events: decoded.events.map((event) => ({ ...event })),
        nextCursor: decoded.nextCursor,
        latestBlock: decoded.latestBlock,
      });
    } catch (error) {
      return this.handleError(error, 'ContestChainGateway.pullContestEvents');
    }
  }
}

export const createContestChainGatewayInstance = (
  runtime: GatewayRuntime,
): ContestChainGatewayInstance => new ContestChainGatewayImpl(runtime);
