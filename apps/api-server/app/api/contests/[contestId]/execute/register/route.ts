import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession, SessionNotFoundError } from '@/lib/auth/session';
import { buildContestDefinition } from '@/lib/contests/definitionBuilder';
import { withContestGateway } from '@/lib/chain/gateway';
import { registrationExecutionResponse } from '@/lib/http/responses';
import { resolveContestId } from '@/lib/http/routeParams';
import { httpErrors, HttpError, toErrorResponse } from '@/lib/http/errors';
import { enforceRateLimit } from '@/lib/middleware/rateLimit';

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
  referrer: addressSchema.optional(),
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
        message: 'Invalid registration execution payload',
        detail: parsed.error.flatten().fieldErrors,
        status: 400
      });
    }

    const session = await requireSession();
    enforceRateLimit({
      route: 'contests.execute.register',
      ip: getClientIp(request),
      sessionToken: session.sessionToken ?? null
    });

    const definition = await buildContestDefinition(
      {
        contestId,
        participant: parsed.data.participant,
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

    const execution = await withContestGateway(
      {
        definition,
        contestId,
        blockTag: parsed.data.blockTag,
        resource: 'contest-registration-execute'
      },
      (gateway, blockTag) =>
        gateway.executeParticipantRegistration({
          contest: definition.contest,
          participant: parsed.data.participant,
          referrer: parsed.data.referrer,
          blockTag: blockTag ?? (parsed.data.blockTag as unknown as bigint | 'latest' | undefined)
        })
    );

    return registrationExecutionResponse(execution);
  } catch (error) {
    if (error instanceof SessionNotFoundError) {
      const normalized = toErrorResponse(httpErrors.unauthorized('No active session'));
      const response = NextResponse.json(normalized.body, { status: normalized.status });
      Object.entries(normalized.headers).forEach(([key, value]) => response.headers.set(key, value));
      return response;
    }

    const normalized = toErrorResponse(error);
    const response = NextResponse.json(normalized.body, { status: normalized.status });
    Object.entries(normalized.headers).forEach(([key, value]) => response.headers.set(key, value));
    return response;
  }
};

export const config = {
  runtime: 'nodejs'
};
