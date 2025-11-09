import type { ContestRecord } from '@chaincontest/db';
import { database } from '@/lib/db/client';
import { getRequestLogger } from '@/lib/observability/logger';

const logger = getRequestLogger({ route: 'contest.phase-sync' });

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const parseTimestamp = (value: unknown): number | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
};

const TIMELINE_SOURCES: ReadonlyArray<readonly string[]> = [
  ['timeline'],
  ['chainGatewayDefinition', 'timeline'],
  ['gatewayDefinition', 'timeline'],
  ['definition', 'timeline']
];

const getTimelineNode = (metadata: Record<string, unknown>, path: readonly string[]): Record<string, unknown> | null => {
  let current: unknown = metadata;
  for (const segment of path) {
    if (!isRecord(current)) {
      return null;
    }
    current = current[segment];
  }
  return isRecord(current) ? (current as Record<string, unknown>) : null;
};

const getTimelineTimestamp = (contest: ContestRecord, key: string): number | null => {
  const metadata = contest.metadata;
  if (!isRecord(metadata)) {
    return null;
  }

  for (const source of TIMELINE_SOURCES) {
    const node = getTimelineNode(metadata, source);
    if (!node) {
      continue;
    }
    const timestamp = parseTimestamp(node[key]);
    if (timestamp) {
      return timestamp;
    }
  }

  return null;
};

const getFirstTimelineTimestamp = (contest: ContestRecord, keys: readonly string[]): number | null => {
  for (const key of keys) {
    const timestamp = getTimelineTimestamp(contest, key);
    if (timestamp !== null) {
      return timestamp;
    }
  }
  return null;
};

type ContestTransition = {
  status: 'registered' | 'active' | 'sealed' | 'settled';
  phase: string;
} | null;

const determineTransition = (contest: ContestRecord): ContestTransition => {
  const now = Date.now();

  if (contest.status === 'registered') {
    const registrationClosesAt = getFirstTimelineTimestamp(contest, ['registrationClosesAt']);
    if (registrationClosesAt && now >= registrationClosesAt) {
      return {
        status: 'active',
        phase: 'live'
      };
    }
    return null;
  }

  if (contest.status === 'active') {
    const tradingClosesAt = getFirstTimelineTimestamp(contest, ['tradingClosesAt', 'liveEnds']);
    if (tradingClosesAt && now >= tradingClosesAt) {
      return {
        status: 'sealed',
        phase: 'sealed'
      };
    }
    return null;
  }

  if (contest.status === 'sealed') {
    const redemptionAvailableAt = getFirstTimelineTimestamp(contest, [
      'redemptionAvailableAt',
      'rewardAvailableAt',
      'claimEnds'
    ]);
    if (redemptionAvailableAt && now >= redemptionAvailableAt) {
      return {
        status: 'settled',
        phase: 'settled'
      };
    }
    return null;
  }

  return null;
};

const applyLocalMetadataPhase = (contest: ContestRecord, phase: string): void => {
  if (!isRecord(contest.metadata)) {
    contest.metadata = { phase };
    return;
  }

  const metadata = { ...contest.metadata, phase };
  const gateway = isRecord(metadata.chainGatewayDefinition)
    ? { ...(metadata.chainGatewayDefinition as Record<string, unknown>), phase }
    : { phase };
  metadata.chainGatewayDefinition = gateway;
  contest.metadata = metadata;
};

export const synchronizeContestPhase = async (
  contest: ContestRecord,
  context: { reason?: string } = {}
): Promise<boolean> => {
  const transition = determineTransition(contest);
  if (!transition) {
    return false;
  }

  if (!contest.contestId) {
    logger.warn(
      {
        contest,
        reason: 'contest_id_missing'
      },
      'Unable to synchronize contest phase without contest id'
    );
    return false;
  }

  try {
    await database.writeContestDomain({
      action: 'update_phase',
      payload: {
        contestId: contest.contestId,
        phase: transition.phase,
        status: transition.status
      },
      actorContext: {
        actorId: 'api.contest.phaseSync',
        source: 'auto_inferred',
        reason: context.reason ?? 'timeline_auto_transition'
      }
    });
    contest.status = transition.status;
    applyLocalMetadataPhase(contest, transition.phase);
    logger.info(
      {
        contestId: contest.contestId,
        status: transition.status,
        deadline: getTimelineTimestamp(contest, 'registrationClosesAt')
      },
      'Contest phase synchronized'
    );
    return true;
  } catch (error) {
    logger.warn(
      {
        contestId: contest.contestId,
        error: error instanceof Error ? error.message : error,
        errorDetail: error && typeof error === 'object' && 'detail' in error ? (error as Record<string, unknown>).detail : undefined
      },
      'Failed to synchronize contest phase'
    );
    return false;
  }
};

export const synchronizeContestPhases = async (contests: ContestRecord[]): Promise<void> => {
  if (contests.length === 0) {
    return;
  }
  await Promise.allSettled(contests.map((contest) => synchronizeContestPhase(contest)));
};
