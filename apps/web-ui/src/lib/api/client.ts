import { QueryClient } from "@tanstack/react-query";

type JsonValue = Record<string, unknown> | unknown[] | string | number | boolean | null;

export type ApiRequestInit = Omit<RequestInit, "body"> & {
  body?: JsonValue | FormData | URLSearchParams;
  baseUrl?: string;
  parseResponse?: boolean;
};

export type ApiRequestOptions = ApiRequestInit & {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
};

export type ApiClient = {
  request: <TResponse = unknown>(path: string, options?: ApiRequestOptions) => Promise<TResponse>;
  get: <TResponse = unknown>(path: string, options?: ApiRequestOptions) => Promise<TResponse>;
  post: <TResponse = unknown>(path: string, body?: JsonValue, options?: ApiRequestOptions) => Promise<TResponse>;
  patch: <TResponse = unknown>(path: string, body?: JsonValue, options?: ApiRequestOptions) => Promise<TResponse>;
  put: <TResponse = unknown>(path: string, body?: JsonValue, options?: ApiRequestOptions) => Promise<TResponse>;
  delete: <TResponse = unknown>(path: string, options?: ApiRequestOptions) => Promise<TResponse>;
};

export type ApiErrorPayload = {
  status: number;
  statusText: string;
  body: unknown;
};

export class ApiError extends Error {
  readonly status: number;

  readonly statusText: string;

  readonly body: unknown;

  constructor({ status, statusText, body }: ApiErrorPayload) {
    super(statusText || `Request failed with status ${status}`);
    this.name = "ApiError";
    this.status = status;
    this.statusText = statusText;
    this.body = body;
  }
}

const DEFAULT_HEADERS: HeadersInit = {
  Accept: "application/json"
};

const DEFAULT_OPTIONS: Pick<ApiRequestInit, "credentials" | "parseResponse"> = {
  credentials: "include",
  parseResponse: true
};

const resolveBrowserBaseUrl = (): string => {
  if (typeof window === "undefined") {
    return "";
  }

  const apiBaseUrl = (window as typeof window & { __CHAINCONTEST_API_BASE_URL?: string }).__CHAINCONTEST_API_BASE_URL;
  return typeof apiBaseUrl === "string" ? apiBaseUrl : "";
};

const getDefaultBaseUrl = (): string => {
  if (typeof window === "undefined") {
    return process.env.API_BASE_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL ?? "";
  }

  return resolveBrowserBaseUrl();
};

const JSON_CONTENT_TYPE = "application/json";

async function parseResponseBody(response: Response): Promise<unknown> {
  if (response.status === 204) {
    return null;
  }

  const contentType = response.headers.get("content-type");
  if (contentType?.includes(JSON_CONTENT_TYPE)) {
    return response.json();
  }

  return response.text();
}

async function executeRequest<TResponse>(
  path: string,
  { baseUrl, method = "GET", body, headers, parseResponse = true, ...init }: ApiRequestOptions = {}
): Promise<TResponse> {
  const resolvedBaseUrl = baseUrl ?? getDefaultBaseUrl();
  const resolvedUrl = resolvedBaseUrl ? new URL(path, resolvedBaseUrl).toString() : path;
  const finalHeaders = new Headers({ ...DEFAULT_HEADERS, ...(headers ?? {}) });

  let requestBody: BodyInit | undefined;
  if (body instanceof FormData || body instanceof URLSearchParams) {
    requestBody = body;
  } else if (body !== undefined) {
    finalHeaders.set("Content-Type", JSON_CONTENT_TYPE);
    requestBody = JSON.stringify(body);
  }

  const response = await fetch(resolvedUrl, {
    ...DEFAULT_OPTIONS,
    ...init,
    method,
    headers: finalHeaders,
    body: requestBody
  });

  if (!response.ok) {
    const errorBody = parseResponse ? await parseResponseBody(response) : null;
    throw new ApiError({
      status: response.status,
      statusText: response.statusText,
      body: errorBody
    });
  }

  if (!parseResponse) {
    return undefined as TResponse;
  }

  return (await parseResponseBody(response)) as TResponse;
}

export function createApiClient(config?: { baseUrl?: string }): ApiClient {
  const configuredBaseUrl = config?.baseUrl;

  return {
    request: (path, options = {}) =>
      executeRequest(path, {
        baseUrl: configuredBaseUrl,
        ...options
      }),
    get: (path, options) =>
      executeRequest(path, {
        baseUrl: configuredBaseUrl,
        method: "GET",
        ...options
      }),
    post: (path, body, options) =>
      executeRequest(path, {
        baseUrl: configuredBaseUrl,
        method: "POST",
        body,
        ...options
      }),
    put: (path, body, options) =>
      executeRequest(path, {
        baseUrl: configuredBaseUrl,
        method: "PUT",
        body,
        ...options
      }),
    patch: (path, body, options) =>
      executeRequest(path, {
        baseUrl: configuredBaseUrl,
        method: "PATCH",
        body,
        ...options
      }),
    delete: (path, options) =>
      executeRequest(path, {
        baseUrl: configuredBaseUrl,
        method: "DELETE",
        ...options
      })
  };
}

export const defaultQueryClientOptions = {
  defaultOptions: {
    queries: {
      retry: (failureCount: number, error: unknown) => {
        if (error instanceof ApiError) {
          return error.status >= 500 && failureCount < 2;
        }
        return failureCount < 2;
      },
      refetchOnWindowFocus: false,
      staleTime: 30_000
    },
    mutations: {
      retry: 0
    }
  }
} satisfies ConstructorParameters<typeof QueryClient>[0];

export function createQueryClient() {
  return new QueryClient(defaultQueryClientOptions);
}

export const apiClient = createApiClient();
