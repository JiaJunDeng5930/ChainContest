import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/auth/session';
import { buildContestDefinition } from '@/lib/contests/definitionBuilder';
import { withContestGateway } from '@/lib/chain/gateway';
import { rewardClaimResponse } from '@/lib/http/responses';
import { resolveContestId } from '@/lib/http/routeParams';
import { HttpError, toErrorResponse } from '@/lib/http/errors';

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
        message: 'Invalid reward claim payload',
        detail: parsed.error.flatten().fieldErrors,
        status: 400
      });
    }

    const session = await requireSession();

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

    const fallbackBlockTag = parsed.data.blockTag;

    const result = await withContestGateway(
      {
        definition,
        contestId,
        blockTag: parsed.data.blockTag,
        resource: 'reward-claim'
      },
      (gateway, blockTag) =>
        gateway.executeRewardClaim({
          contest: definition.contest,
          participant: participantAddress,
          blockTag: blockTag ?? (fallbackBlockTag as unknown as bigint | 'latest' | undefined)
        })
    );

    return rewardClaimResponse(result);
  } catch (error) {
    const normalized = toErrorResponse(error);
    const response = NextResponse.json(normalized.body, { status: normalized.status });
    Object.entries(normalized.headers).forEach(([key, value]) => response.headers.set(key, value));
    return response;
  }
};

export const runtime = 'nodejs';
