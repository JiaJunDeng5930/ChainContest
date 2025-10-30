import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/auth/session';
import { buildContestDefinition } from '@/lib/contests/definitionBuilder';
import { withContestGateway } from '@/lib/chain/gateway';
import { rebalancePlanResponse } from '@/lib/http/responses';
import { resolveContestId } from '@/lib/http/routeParams';
import { HttpError, toErrorResponse } from '@/lib/http/errors';

const addressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Address must be a valid checksum address');

const intentSchema = z.object({
  sellAsset: addressSchema,
  buyAsset: addressSchema,
  amount: z.string().min(1, 'amount is required'),
  minimumReceived: z.string().optional(),
  quoteId: z.string().optional()
});

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
  intent: intentSchema,
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
        message: 'Invalid rebalance plan payload',
        detail: parsed.error.flatten().fieldErrors,
        status: 400
      });
    }

    const session = await requireSession();

    const participantAddress = parsed.data.participant as `0x${string}`;
    const intent = {
      sellAsset: parsed.data.intent.sellAsset as `0x${string}`,
      buyAsset: parsed.data.intent.buyAsset as `0x${string}`,
      amount: parsed.data.intent.amount,
      minimumReceived: parsed.data.intent.minimumReceived,
      quoteId: parsed.data.intent.quoteId
    };

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

    const plan = await withContestGateway(
      {
        definition,
        contestId,
        blockTag: parsed.data.blockTag,
        resource: 'rebalance-plan'
      },
      (gateway, blockTag) =>
        gateway.planPortfolioRebalance({
          contest: definition.contest,
          participant: participantAddress,
          intent,
          blockTag: blockTag ?? (fallbackBlockTag as unknown as bigint | 'latest' | undefined)
        })
    );

    return rebalancePlanResponse(plan);
  } catch (error) {
    const normalized = toErrorResponse(error);
    const response = NextResponse.json(normalized.body, { status: normalized.status });
    Object.entries(normalized.headers).forEach(([key, value]) => response.headers.set(key, value));
    return response;
  }
};

export const runtime = 'nodejs';
