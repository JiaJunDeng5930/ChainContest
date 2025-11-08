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

const getTimelineTimestamp = (contest: ContestRecord, key: string): number | null => {
  const metadata = contest.metadata;
  if (!isRecord(metadata)) {
    return null;
  }
  const timeline = metadata.timeline;
  if (!isRecord(timeline)) {
    return null;
  }
  return parseTimestamp(timeline[key]);
};

type ContestTransition =
  | {
      status: 'active';
      phase: 'live';
    }
  | null;

const determineTransition = (contest: ContestRecord): ContestTransition => {
  if (contest.status !== 'registered') {
    return null;
  }
  const registrationClosesAt = getTimelineTimestamp(contest, 'registrationClosesAt');
  if (!registrationClosesAt) {
    return null;
  }
  if (Date.now() < registrationClosesAt) {
    return null;
  }
  return {
    status: 'active',
    phase: 'live'
  };
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
        source: 'api.contest.phaseSync',
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
