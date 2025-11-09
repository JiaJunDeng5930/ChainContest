import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession, SessionNotFoundError } from '@/lib/auth/session';
import { database, initDatabase } from '@/lib/db/client';
import { getContest } from '@/lib/contests/repository';
import {
  extractOrganizerWallet,
  resolveContestAddress,
  waitForTransactionConfirmation,
  readContestChainState
} from '@/lib/contests/adminPlanUtils';
import { buildSettlementMetadata } from '@/lib/contests/settlementMetadata';
import { resolveContestId } from '@/lib/http/routeParams';
import { httpErrors, toErrorResponse } from '@/lib/http/errors';
import { applyCorsHeaders, handleCorsPreflight } from '@/lib/http/cors';

const bodySchema = z.object({
  transactionHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/, 'transactionHash must be a valid hash')
});

const FREEZE_STATE = 3;

export const POST = async (
  request: NextRequest,
  context?: { params: { contestId: string } }
): Promise<Response> => {
  try {
    const contestId = resolveContestId(request, context);
    const payloadResult = bodySchema.safeParse(await request.json().catch(() => null));
    if (!payloadResult.success) {
      throw httpErrors.badRequest('Invalid confirmation payload', {
        detail: payloadResult.error.flatten().fieldErrors
      });
    }

    let session;
    try {
      session = await requireSession();
    } catch (error) {
      if (error instanceof SessionNotFoundError) {
        throw httpErrors.unauthorized('Authentication required');
      }
      throw error;
    }
    await initDatabase();

    const snapshot = await getContest(contestId);
    const organizerWallet = extractOrganizerWallet(snapshot.metadata as Record<string, unknown> | null);
    if (!organizerWallet) {
      throw httpErrors.conflict('Contest organizer is not recorded', {
        detail: { contestId }
      });
    }

    const actorWallet = session.user.walletAddress?.toLowerCase();
    if (!actorWallet || actorWallet !== organizerWallet) {
      throw httpErrors.forbidden('Only the contest organizer can confirm this action');
    }

    const contestAddress = resolveContestAddress(snapshot);
    if (!contestAddress) {
      throw httpErrors.internal('Contest contract address is unavailable', {
        detail: { contestId }
      });
    }

    const txHash = payloadResult.data.transactionHash as `0x${string}`;
    await waitForTransactionConfirmation(snapshot.chainId, txHash);

    const chainState = await readContestChainState(snapshot.chainId, contestAddress as `0x${string}`);
    if (chainState.state !== FREEZE_STATE) {
      throw httpErrors.conflict('Contest is not frozen on chain', {
        detail: {
          contestId,
          expectedState: FREEZE_STATE,
          actualState: chainState.state
        }
      });
    }

    const settlementMetadata = buildSettlementMetadata(snapshot, chainState, organizerWallet, false);

    await database.writeContestDomain({
      action: 'update_phase',
      payload: {
        contestId: snapshot.contestId,
        phase: 'frozen',
        settlement: settlementMetadata
      },
      actorContext: {
        source: 'api.contest.freezeConfirm',
        actorId: session.user.id,
        transactionHash: txHash
      }
    });

    const response = NextResponse.json({
      status: 'ok',
      phase: 'frozen'
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
