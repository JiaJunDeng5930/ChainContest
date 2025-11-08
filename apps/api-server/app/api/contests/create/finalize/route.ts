import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { requireSession } from '@/lib/auth/session';
import { handleCorsPreflight, applyCorsHeaders } from '@/lib/http/cors';
import { toErrorResponse } from '@/lib/http/errors';
import { finalizeContestDeployment } from '@/lib/contests/deploymentService';
import { serializeContestCreation, serializeReceipt } from '../shared';

const requestSchema = z.object({
  requestId: z.string().uuid(),
  transactionHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/u, { message: 'Invalid transaction hash' })
});

const readJson = async (request: NextRequest): Promise<unknown> => {
  try {
    return await request.json();
  } catch {
    return null;
  }
};

export const runtime = 'nodejs';

export const OPTIONS = (request: NextRequest): Response => handleCorsPreflight(request);

export const POST = async (request: NextRequest): Promise<Response> => {
  try {
    const rawPayload = await readJson(request);
    const parsed = requestSchema.safeParse(rawPayload);
    if (!parsed.success) {
      throw toErrorResponse({
        status: 400,
        body: {
          code: 'validation_failed',
          message: 'Invalid contest finalization payload',
          detail: parsed.error.flatten().fieldErrors
        }
      }).body;
    }

    const session = await requireSession();

    const result = await finalizeContestDeployment({
      requestId: parsed.data.requestId,
      transactionHash: parsed.data.transactionHash as `0x${string}`,
      userId: session.user.id,
      organizerAddress: session.user.walletAddress
    });

    const body = {
      ...serializeContestCreation(result.request),
      receipt: serializeReceipt(result.receipt)
    };

    const response = NextResponse.json(body, { status: 200 });
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
