import type { NextRequest } from 'next/server';
import { HttpError } from '@/lib/http/errors';

export interface ContestRouteContext {
  params?: {
    contestId?: string;
  };
}

export const resolveContestId = (
  request: NextRequest,
  context?: ContestRouteContext
): string => {
  const paramId = context?.params?.contestId;
  if (paramId && paramId.trim().length > 0) {
    return paramId;
  }

  const pathname = request.nextUrl?.pathname ?? '';
  const segments = pathname.split('/').filter(Boolean);
  const contestIndex = segments.findIndex((segment) => segment === 'contests');
  if (contestIndex >= 0 && segments.length > contestIndex + 1) {
    const candidate = decodeURIComponent(segments[contestIndex + 1] ?? '');
    if (candidate) {
      return candidate;
    }
  }

  throw new HttpError('bad_request', {
    message: 'Contest id is required',
    status: 400
  });
};

