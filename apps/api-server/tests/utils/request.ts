import { NextRequest } from 'next/server';

export interface RouteTestInit {
  method?: string;
  body?: unknown;
  cookies?: Record<string, string>;
  headers?: Record<string, string>;
  url?: string;
}

const DEFAULT_BASE_URL = 'https://api.chaincontest.local';

export const createRouteRequest = (path: string, init: RouteTestInit = {}): NextRequest => {
  const { method = 'POST', body, cookies, headers = {}, url } = init;
  const targetUrl = url ? new URL(url) : new URL(path, DEFAULT_BASE_URL);
  const requestHeaders = new Headers(headers);

  if (body !== undefined) {
    requestHeaders.set('content-type', 'application/json');
  }

  if (cookies && Object.keys(cookies).length > 0) {
    const serialized = Object.entries(cookies)
      .map(([key, value]) => `${key}=${value}`)
      .join('; ');
    requestHeaders.set('cookie', serialized);
  }

  const requestInit: RequestInit = {
    method,
    headers: requestHeaders,
    body: body !== undefined ? JSON.stringify(body) : undefined
  };

  type NextRequestInit = Omit<RequestInit, 'signal'> & { signal?: AbortSignal };
  const nextInit: NextRequestInit = {
    method: requestInit.method,
    headers: requestInit.headers,
    body: requestInit.body
  };

  return new NextRequest(targetUrl, nextInit);
};

export const getCookieValue = (setCookieHeader: string | null, name: string): string | undefined => {
  if (!setCookieHeader) {
    return undefined;
  }

  const pattern = new RegExp(`${name}=([^;]+)`);
  const match = pattern.exec(setCookieHeader);
  return match?.[1];
};

export const mergeCookies = (...sources: Array<Record<string, string>>): Record<string, string> => {
  return Object.assign({}, ...sources);
};
