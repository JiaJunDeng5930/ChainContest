import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession, SessionNotFoundError } from '@/lib/auth/session';
import { buildContestDefinition } from '@/lib/contests/definitionBuilder';
import { withContestGateway } from '@/lib/chain/gateway';
import { redemptionResponse } from '@/lib/http/responses';
import { resolveContestId } from '@/lib/http/routeParams';
import { httpErrors, HttpError, toErrorResponse } from '@/lib/http/errors';
import { enforceRateLimit } from '@/lib/middleware/rateLimit';
import { applyCorsHeaders, handleCorsPreflight } from '@/lib/http/cors';

const addressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Address must be a valid checksum address');

const blockTagSchema = z
  .union([
    z.literal('latest'),
    z
      .string()
      .regex(/^\d+$/)
      .transform((value) => Number(value)),
    z.number().int().min(0)
  ])
  .optional();

const requestSchema = z.object({
  participant: addressSchema,
  blockTag: blockTagSchema
});

const readJson = async (request: NextRequest): Promise<unknown> => {
  try {
    return await request.json();
  } catch {
    return null;
  }
};

const getClientIp = (request: NextRequest): string | null =>
  request.headers.get('x-forwarded-for') ?? request.ip ?? null;

export const POST = async (
  request: NextRequest,
  context?: { params: { contestId: string } }
): Promise<Response> => {
  try {
    const contestId = resolveContestId(request, context);

    const payload = await readJson(request);
    const parsed = requestSchema.safeParse(payload);
    if (!parsed.success) {
      throw new HttpError('validation_failed', {
        message: 'Invalid principal redemption payload',
        detail: parsed.error.flatten().fieldErrors,
        status: 400
      });
    }

    const session = await requireSession();
    enforceRateLimit({
      route: 'contests.execute.principal-redemption',
      ip: getClientIp(request),
      sessionToken: session.sessionToken ?? null
    });

    const participantAddress = parsed.data.participant as `0x${string}`;

    const definition = await buildContestDefinition(
      {
        contestId,
        participant: participantAddress,
        blockTag: parsed.data.blockTag
      },
      {
        session: {
          userId: session.user.id,
          walletAddress: session.user.walletAddress,
          addressChecksum: session.user.addressChecksum,
          sessionToken: session.sessionToken ?? undefined
        }
      }
    );

    const result = await withContestGateway(
      {
        definition,
        contestId,
        blockTag: parsed.data.blockTag,
        resource: 'contest-principal-redemption'
      },
      (gateway, blockTag) =>
        gateway.executePrincipalRedemption({
          contest: definition.contest,
          participant: participantAddress,
          blockTag: blockTag ?? (parsed.data.blockTag as unknown as bigint | 'latest' | undefined)
        })
    );

    const response = redemptionResponse(result);
    applyCorsHeaders(response, request);
    return response;
  } catch (error) {
    if (error instanceof SessionNotFoundError) {
      const normalized = toErrorResponse(httpErrors.unauthorized('No active session'));
      const response = NextResponse.json(normalized.body, { status: normalized.status });
      if (normalized.headers) {
        Object.entries(normalized.headers).forEach(([key, value]) => response.headers.set(key, value));
      }
      applyCorsHeaders(response, request);
      return response;
    }

    const normalized = toErrorResponse(error);
    const response = NextResponse.json(normalized.body, { status: normalized.status });
    if (normalized.headers) {
      Object.entries(normalized.headers).forEach(([key, value]) => response.headers.set(key, value));
    }
    applyCorsHeaders(response, request);
    return response;
  }
};

export const runtime = 'nodejs';

export const OPTIONS = (request: NextRequest): Response => handleCorsPreflight(request);
