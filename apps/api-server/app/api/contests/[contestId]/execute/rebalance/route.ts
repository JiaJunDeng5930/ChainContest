import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession, SessionNotFoundError } from '@/lib/auth/session';
import { buildContestDefinition } from '@/lib/contests/definitionBuilder';
import { withContestGateway } from '@/lib/chain/gateway';
import { rebalanceExecutionResponse } from '@/lib/http/responses';
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
  intent: z.object({
    sellAsset: addressSchema,
    buyAsset: addressSchema,
    amount: z.string().min(1),
    minimumReceived: z.string().optional(),
    quoteId: z.string().optional()
  }),
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
        message: 'Invalid rebalance execution payload',
        detail: parsed.error.flatten().fieldErrors,
        status: 400
      });
    }

    const session = await requireSession();
    enforceRateLimit({
      route: 'contests.execute.rebalance',
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
        resource: 'contest-rebalance-execute'
      },
      (gateway, blockTag) =>
        gateway.executePortfolioRebalance({
          contest: definition.contest,
          participant: parsed.data.participant,
          intent: parsed.data.intent,
          blockTag: blockTag ?? (parsed.data.blockTag as unknown as bigint | 'latest' | undefined)
        })
    );

    return rebalanceExecutionResponse(execution);
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
