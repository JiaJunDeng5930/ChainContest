import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { requireSession, SessionNotFoundError } from '@/lib/auth/session';
import { initDatabase, database } from '@/lib/db/client';
import { httpErrors, toErrorResponse } from '@/lib/http/errors';
import { applyCorsHeaders, handleCorsPreflight } from '@/lib/http/cors';

const parseInteger = (value: string | null, context: string): number | undefined => {
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw httpErrors.badRequest(`${context} must be a positive integer`);
  }
  return parsed;
};

const serializeCreationItem = (
  item: import('@chaincontest/db').CreatorContestRecord
) => ({
  status: item.status,
  request: {
    requestId: item.request.requestId,
    userId: item.request.userId,
    networkId: item.request.networkId,
    payload: item.request.payload,
    createdAt: item.request.createdAt.toISOString(),
    updatedAt: item.request.updatedAt.toISOString()
  },
  artifact: item.artifact
    ? {
        artifactId: item.artifact.artifactId,
        requestId: item.artifact.requestId,
        contestId: item.artifact.contestId,
        networkId: item.artifact.networkId,
        registrarAddress: item.artifact.registrarAddress,
        treasuryAddress: item.artifact.treasuryAddress,
        settlementAddress: item.artifact.settlementAddress,
        rewardsAddress: item.artifact.rewardsAddress,
        metadata: item.artifact.metadata,
        createdAt: item.artifact.createdAt.toISOString(),
        updatedAt: item.artifact.updatedAt.toISOString()
      }
    : null,
  contest: item.contest
    ? {
        contestId: item.contest.contestId,
        chainId: item.contest.chainId,
        contractAddress: item.contest.contractAddress,
        status: item.contest.status,
        originTag: item.contest.originTag,
        timeWindowStart: item.contest.timeWindowStart.toISOString(),
        timeWindowEnd: item.contest.timeWindowEnd.toISOString(),
        metadata: item.contest.metadata,
        createdAt: item.contest.createdAt.toISOString(),
        updatedAt: item.contest.updatedAt.toISOString()
      }
    : null
});

const serializeParticipationItem = (
  item: import('@chaincontest/db').QueryUserContestsResponse['items'][number]
) => ({
  contest: {
    contestId: item.contest.contestId,
    chainId: item.contest.chainId,
    contractAddress: item.contest.contractAddress,
    status: item.contest.status,
    originTag: item.contest.originTag,
    timeWindowStart: item.contest.timeWindowStart.toISOString(),
    timeWindowEnd: item.contest.timeWindowEnd.toISOString(),
    metadata: item.contest.metadata,
    createdAt: item.contest.createdAt.toISOString(),
    updatedAt: item.contest.updatedAt.toISOString()
  },
  participations: item.participations.map((entry) => ({
    contestId: entry.contestId,
    walletAddress: entry.walletAddress,
    vaultReference: entry.vaultReference,
    amount: entry.amount,
    occurredAt: entry.occurredAt.toISOString()
  })),
  rewardClaims: item.rewardClaims.map((entry) => ({
    contestId: entry.contestId,
    walletAddress: entry.walletAddress,
    amount: entry.amount,
    claimedAt: entry.claimedAt.toISOString()
  })),
  lastActivity: item.lastActivity ? item.lastActivity.toISOString() : null
});

export const GET = async (request: NextRequest): Promise<Response> => {
  try {
    const params = request.nextUrl.searchParams;
    const kind = params.get('kind') ?? 'created';
    if (!['created', 'participated'].includes(kind)) {
      throw httpErrors.badRequest('kind must be "created" or "participated"');
    }

    const networkId = parseInteger(params.get('networkId'), 'networkId');
    const pageSize = parseInteger(params.get('pageSize'), 'pageSize');
    const cursor = params.get('cursor') ?? null;

    const session = await requireSession();
    await initDatabase();

    if (kind === 'created') {
      const { items, nextCursor } = (await database.queryCreatorContests({
        userId: session.user.id,
        filters: networkId ? { networkIds: [networkId] } : undefined,
        pagination: { cursor, pageSize }
      })) as {
        items: import('@chaincontest/db').QueryCreatorContestsResponse['items'];
        nextCursor: string | null;
      };

      const response = NextResponse.json(
        {
          kind: 'created',
          items: items.map(serializeCreationItem),
          nextCursor
        },
        { status: 200 }
      );
      response.headers.set('Cache-Control', 'no-store');
      applyCorsHeaders(response, request);
      return response;
    }

    const { items, nextCursor } = (await database.queryUserContests({
      userId: session.user.id,
      filters: networkId ? { chainIds: [networkId] } : undefined,
      pagination: { cursor, pageSize }
    })) as {
      items: import('@chaincontest/db').QueryUserContestsResponse['items'];
      nextCursor: string | null;
    };

    const response = NextResponse.json(
      {
        kind: 'participated',
        items: items.map(serializeParticipationItem),
        nextCursor
      },
      { status: 200 }
    );
    response.headers.set('Cache-Control', 'no-store');
    applyCorsHeaders(response, request);
    return response;
  } catch (error) {
    if (error instanceof SessionNotFoundError) {
      const normalized = toErrorResponse(httpErrors.unauthorized('No active session'));
      const response = NextResponse.json(normalized.body, { status: normalized.status });
      if (normalized.headers) {
        Object.entries(normalized.headers).forEach(([key, value]) => response.headers.set(key, value));
      }
      applyCorsHeaders(response, request);
      return response;
    }

    const normalized = toErrorResponse(error);
    const response = NextResponse.json(normalized.body, { status: normalized.status });
    if (normalized.headers) {
      Object.entries(normalized.headers).forEach(([key, value]) => response.headers.set(key, value));
    }
    applyCorsHeaders(response, request);
    return response;
  }
};

export const runtime = 'nodejs';

export const OPTIONS = (request: NextRequest): Response => handleCorsPreflight(request);
