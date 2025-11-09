import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { encodeFunctionData } from 'viem';
import { contestArtifact } from '@chaincontest/chain';
import { requireSession, SessionNotFoundError } from '@/lib/auth/session';
import { getContest } from '@/lib/contests/repository';
import { extractOrganizerWallet, resolveContestAddress, buildDerivedAnchor } from '@/lib/contests/adminPlanUtils';
import { resolveContestId } from '@/lib/http/routeParams';
import { adminPlanResponse } from '@/lib/http/responses';
import { httpErrors, toErrorResponse } from '@/lib/http/errors';
import { applyCorsHeaders, handleCorsPreflight } from '@/lib/http/cors';

const SEAL_CALL_DATA = encodeFunctionData({
  abi: contestArtifact.abi,
  functionName: 'seal'
});

export const POST = async (
  request: NextRequest,
  context?: { params: { contestId: string } }
): Promise<Response> => {
  try {
    const contestId = resolveContestId(request, context);
    let session;
    try {
      session = await requireSession();
    } catch (error) {
      if (error instanceof SessionNotFoundError) {
        throw httpErrors.unauthorized('Authentication required');
      }
      throw error;
    }
    const snapshot = await getContest(contestId);

    const organizerWallet = extractOrganizerWallet(snapshot.metadata as Record<string, unknown> | null);
    if (!organizerWallet) {
      throw httpErrors.conflict('Contest organizer is not recorded', {
        detail: { contestId }
      });
    }

    const actorWallet = session.user.walletAddress?.toLowerCase();
    if (!actorWallet || actorWallet !== organizerWallet) {
      throw httpErrors.forbidden('Only the contest organizer can seal the contest');
    }

    const contestAddress = resolveContestAddress(snapshot);
    if (!contestAddress) {
      throw httpErrors.internal('Contest contract address is unavailable', {
        detail: { contestId }
      });
    }

    const response = adminPlanResponse({
      status: 'ready',
      transaction: {
        to: contestAddress,
        data: SEAL_CALL_DATA,
        value: '0'
      },
      derivedAt: buildDerivedAnchor(snapshot)
    });
    applyCorsHeaders(response, request);
    return response;
  } catch (error) {
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
