import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { requireSession, SessionNotFoundError } from '@/lib/auth/session';
import { httpErrors, toErrorResponse } from '@/lib/http/errors';
import { listOrganizerComponents } from '@/lib/organizer/components/list';

const parseQuery = (request: NextRequest) => {
  const params = request.nextUrl.searchParams;
  const networkIdRaw = params.get('networkId');
  const componentType = params.get('type') ?? undefined;
  const statusesRaw = params.getAll('status');
  const pageSizeRaw = params.get('pageSize');
  const cursor = params.get('cursor');

  const networkId = networkIdRaw ? Number(networkIdRaw) : undefined;
  const pageSize = pageSizeRaw ? Number(pageSizeRaw) : undefined;

  return {
    networkId: Number.isFinite(networkId) ? networkId : undefined,
    componentType: componentType === null ? undefined : componentType,
    statuses: statusesRaw.length > 0 ? statusesRaw : undefined,
    pageSize: Number.isFinite(pageSize) ? pageSize : undefined,
    cursor: cursor ?? undefined
  };
};

export const GET = async (request: NextRequest): Promise<Response> => {
  try {
    const session = await requireSession();
    const filters = parseQuery(request);

    const result = await listOrganizerComponents({
      userId: session.user.id,
      networkId: filters.networkId,
      componentType: filters.componentType as 'vault_implementation' | 'price_source' | undefined,
      statuses: filters.statuses as ('pending' | 'confirmed' | 'failed')[] | undefined,
      pageSize: filters.pageSize,
      cursor: filters.cursor ?? null
    });

    const response = NextResponse.json(result, { status: 200 });
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch (error) {
    if (error instanceof SessionNotFoundError) {
      const normalized = toErrorResponse(httpErrors.unauthorized('No active session'));
      const response = NextResponse.json(normalized.body, { status: normalized.status });
      response.headers.set('Cache-Control', 'no-store');
      return response;
    }

    const normalized = toErrorResponse(error);
    const response = NextResponse.json(normalized.body, { status: normalized.status });
    response.headers.set('Cache-Control', 'no-store');
    return response;
  }
};

export const config = {
  runtime: 'nodejs'
};
