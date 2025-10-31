import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { getEnv } from '@/lib/config/env';

const ALLOWED_METHODS = Object.freeze(['GET', 'POST', 'OPTIONS'] as const);
const DEFAULT_ALLOWED_HEADERS = Object.freeze(['content-type', 'authorization', 'accept'] as const);
const PREFLIGHT_MAX_AGE_SECONDS = 600;

const resolveAllowedOrigin = (origin: string | null): string | null => {
  if (!origin) {
    return null;
  }

  const allowedOrigins = getEnv().http.allowedOrigins;
  if (allowedOrigins.length === 0) {
    return null;
  }

  return allowedOrigins.includes(origin) ? origin : null;
};

const resolveAllowedHeaders = (request: NextRequest): string => {
  const requestedHeaders = request.headers.get('access-control-request-headers');
  if (requestedHeaders && requestedHeaders.length > 0) {
    return requestedHeaders;
  }

  return DEFAULT_ALLOWED_HEADERS.join(', ');
};

export const applyCorsHeaders = (response: NextResponse, request: NextRequest): void => {
  const origin = request.headers.get('origin');
  if (!origin) {
    return;
  }

  response.headers.append('Vary', 'Origin');

  const allowedOrigin = resolveAllowedOrigin(origin);
  if (!allowedOrigin) {
    return;
  }

  response.headers.set('Access-Control-Allow-Origin', allowedOrigin);
  response.headers.set('Access-Control-Allow-Credentials', 'true');
  response.headers.set('Access-Control-Allow-Methods', ALLOWED_METHODS.join(', '));
  response.headers.set('Access-Control-Allow-Headers', resolveAllowedHeaders(request));
};

export const handleCorsPreflight = (request: NextRequest): NextResponse => {
  if (request.method !== 'OPTIONS') {
    return new NextResponse(null, { status: 405 });
  }

  const origin = request.headers.get('origin');
  const allowedOrigin = resolveAllowedOrigin(origin ?? null);
  if (!origin || !allowedOrigin) {
    return new NextResponse(null, { status: 403 });
  }

  const response = new NextResponse(null, { status: 204 });
  response.headers.append('Vary', 'Origin');
  response.headers.set('Access-Control-Allow-Origin', allowedOrigin);
  response.headers.set('Access-Control-Allow-Credentials', 'true');
  response.headers.set('Access-Control-Allow-Methods', ALLOWED_METHODS.join(', '));
  response.headers.set('Access-Control-Allow-Headers', resolveAllowedHeaders(request));
  response.headers.set('Access-Control-Max-Age', PREFLIGHT_MAX_AGE_SECONDS.toString());
  return response;
};
