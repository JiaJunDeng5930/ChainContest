import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { requireSession, SessionNotFoundError } from '@/lib/auth/session';
import { listContests } from '@/lib/contests/repository';
import { httpErrors, toErrorResponse } from '@/lib/http/errors';

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

const parseFilters = (request: NextRequest) => {
  const params = request.nextUrl.searchParams;

  const chainIdRaw = params.get('chainId');
  let chainId: number | undefined;
  if (chainIdRaw !== null) {
    const normalized = chainIdRaw.trim();
    if (normalized.length === 0) {
      throw httpErrors.badRequest('chainId must be a positive integer');
    }
    const parsed = Number(normalized);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw httpErrors.badRequest('chainId must be a positive integer');
    }
    chainId = parsed;
  }

  const statusRaw = params.get('status');
  const status = statusRaw ? statusRaw.trim() : undefined;
  if (status !== undefined && status.length === 0) {
    throw httpErrors.badRequest('status must be a non-empty string');
  }

  const cursor = params.get('cursor');

  return {
    chainId,
    status,
    cursor: cursor ?? null
  };
};

export const GET = async (request: NextRequest): Promise<Response> => {
  try {
    await ensureSession();

    const filters = parseFilters(request);
    const result = await listContests(filters);

    const response = NextResponse.json(result, { status: 200 });
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
