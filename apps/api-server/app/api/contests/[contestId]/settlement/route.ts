import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/auth/session';
import { buildContestDefinition } from '@/lib/contests/definitionBuilder';
import { withContestGateway } from '@/lib/chain/gateway';
import { settlementResponse } from '@/lib/http/responses';
import { resolveContestId } from '@/lib/http/routeParams';
import { HttpError, toErrorResponse } from '@/lib/http/errors';
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
  caller: addressSchema,
  blockTag: blockTagSchema
});

const readJson = async (request: NextRequest): Promise<unknown> => {
  try {
    return await request.json();
  } catch {
    return null;
  }
};

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
        message: 'Invalid settlement payload',
        detail: parsed.error.flatten().fieldErrors,
        status: 400
      });
    }

    const session = await requireSession();

    const definition = await buildContestDefinition(
      {
        contestId,
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

    const callerAddress = parsed.data.caller as `0x${string}`;
    const fallbackBlockTag = parsed.data.blockTag;

    const result = await withContestGateway(
      {
        definition,
        contestId,
        blockTag: parsed.data.blockTag,
        resource: 'settlement'
      },
      (gateway, blockTag) =>
        gateway.executeContestSettlement({
          contest: definition.contest,
          caller: callerAddress,
          blockTag: blockTag ?? (fallbackBlockTag as unknown as bigint | 'latest' | undefined)
        })
    );

    const response = settlementResponse(result);
    applyCorsHeaders(response, request);
    return response;
  } catch (error) {
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
