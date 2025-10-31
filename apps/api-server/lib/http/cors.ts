import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { getEnv } from '@/lib/config/env';

export const applyCorsHeaders = (response: NextResponse, request: NextRequest): void => {
  const origin = request.headers.get('origin');
  if (!origin) {
    return;
  }

  response.headers.append('Vary', 'Origin');

  const allowedOrigins = getEnv().http.allowedOrigins;
  if (allowedOrigins.length === 0) {
    return;
  }

  if (allowedOrigins.includes(origin)) {
    response.headers.set('Access-Control-Allow-Origin', origin);
    response.headers.set('Access-Control-Allow-Credentials', 'true');
  }
};
