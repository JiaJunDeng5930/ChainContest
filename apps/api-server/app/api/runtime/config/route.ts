import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { requireSession, SessionNotFoundError } from '@/lib/auth/session';
import { loadRuntimeConfig } from '@/lib/runtime/runtimeConfig';
import { toErrorResponse } from '@/lib/http/errors';

const applyCorsHeaders = (response: NextResponse, request: NextRequest): void => {
  const origin = request.headers.get('origin');
  if (origin) {
    response.headers.set('Access-Control-Allow-Origin', origin);
    response.headers.set('Access-Control-Allow-Credentials', 'true');
    response.headers.append('Vary', 'Origin');
  } else {
    response.headers.set('Access-Control-Allow-Origin', '*');
  }
};

export const GET = async (request: NextRequest): Promise<Response> => {
  try {
    await requireSession().catch((error) => {
      if (error instanceof SessionNotFoundError) {
        return null;
      }
      throw error;
    });

    const runtimeConfig = await loadRuntimeConfig();
    if (!runtimeConfig) {
      const response = new NextResponse(null, { status: 204 });
      response.headers.set('Cache-Control', 'no-store');
      return response;
    }

    const response = NextResponse.json(runtimeConfig, { status: 200 });
    response.headers.set('Cache-Control', 'no-store');
    applyCorsHeaders(response, request);
    return response;
  } catch (error) {
    const normalized = toErrorResponse(error);
    const response = NextResponse.json(normalized.body, { status: normalized.status });
    normalized.headers &&
      Object.entries(normalized.headers).forEach(([key, value]) => response.headers.set(key, value));
    response.headers.set('Cache-Control', 'no-store');
    applyCorsHeaders(response, request);
    return response;
  }
};

export const config = {
  runtime: 'nodejs'
};
