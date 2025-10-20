import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { requireSession, SessionNotFoundError } from '@/lib/auth/session';
import { getContest } from '@/lib/contests/repository';
import { httpErrors, toErrorResponse } from '@/lib/http/errors';
import { resolveContestId } from '@/lib/http/routeParams';

const ensureSession = async (): Promise<void> => {
  try {
    await requireSession();
  } catch (error) {
    if (error instanceof SessionNotFoundError) {
      throw httpErrors.unauthorized('No active session');
    }
    throw error;
  }
};

export const GET = async (
  request: NextRequest,
  context?: { params: { contestId: string } }
): Promise<Response> => {
  try {
    await ensureSession();
    const contestId = resolveContestId(request, context);

    const snapshot = await getContest(contestId);
    const response = NextResponse.json(snapshot, { status: 200 });
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch (error) {
    const normalized = toErrorResponse(error);
    const response = NextResponse.json(normalized.body, { status: normalized.status });
    if (normalized.headers) {
      Object.entries(normalized.headers).forEach(([key, value]) => response.headers.set(key, value));
    }
    response.headers.set('Cache-Control', 'no-store');
    return response;
  }
};

export const config = {
  runtime: 'nodejs'
};
