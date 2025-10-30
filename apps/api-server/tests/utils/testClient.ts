import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import type { NormalizedHttpError } from '@/lib/http/errors';
import { toErrorResponse } from '@/lib/http/errors';

export interface TestRequestInit extends RequestInit {
  cookies?: Record<string, string>;
}

export interface TestResponse<T = unknown> {
  status: number;
  headers: Headers;
  body: T;
}

export type RouteHandler = (request: NextRequest) => Promise<Response> | Response;

const buildRequest = (input: RequestInfo, init: TestRequestInit = {}): Request => {
  const { cookies, ...rest } = init;
  const headers = new Headers(rest.headers);

  if (cookies && Object.keys(cookies).length > 0) {
    const serialized = Object.entries(cookies)
      .map(([key, value]) => `${key}=${value}`)
      .join('; ');
    headers.set('cookie', serialized);
  }

  return new Request(input, {
    ...rest,
    headers
  });
};

export const executeRoute = async <T>(
  handler: RouteHandler,
  input: RequestInfo,
  init?: TestRequestInit
): Promise<TestResponse<T | NormalizedHttpError>> => {
  try {
    const request = buildRequest(input, init);
    const response = await handler(request as NextRequest);
    const contentType = response.headers.get('content-type') ?? '';

    let body: unknown = null;
    if (contentType.includes('application/json')) {
      body = await response.json();
    } else {
      body = await response.text();
    }

    return {
      status: response.status,
      headers: response.headers,
      body: body as T
    };
  } catch (error) {
    const normalized = toErrorResponse(error);
    return {
      status: normalized.status,
      headers: new Headers(normalized.headers),
      body: normalized
    };
  }
};
