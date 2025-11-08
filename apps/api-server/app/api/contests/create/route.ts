import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession, SessionNotFoundError } from '@/lib/auth/session';
import { initDatabase } from '@/lib/db/client';
import { httpErrors, HttpError, toErrorResponse } from '@/lib/http/errors';
import { enforceRateLimit } from '@/lib/middleware/rateLimit';
import { deployContest } from '@/lib/contests/deploymentService';
import { applyCorsHeaders, handleCorsPreflight } from '@/lib/http/cors';
import { serializeContestCreation, serializeReceipt } from './shared';

const getClientIp = (request: NextRequest): string | null => {
  return request.headers.get('x-forwarded-for') ?? request.ip ?? null;
};

const requestSchema = z.object({
  networkId: z
    .union([
      z.number().int().positive(),
      z
        .string()
        .regex(/^[0-9]+$/)
        .transform((value) => Number(value))
    ])
    .transform((value) => (typeof value === 'number' ? value : Number(value)))
    .refine((value) => Number.isInteger(value) && value > 0, {
      message: 'networkId must be a positive integer'
    }),
  payload: z.unknown()
});

const readJson = async (request: NextRequest): Promise<unknown> => {
  try {
    return await request.json();
  } catch {
    return null;
  }
};


export const POST = async (request: NextRequest): Promise<Response> => {
  try {
    const rawPayload = await readJson(request);
    const parsed = requestSchema.safeParse(rawPayload);
    if (!parsed.success) {
      throw new HttpError('validation_failed', {
        status: 400,
        message: 'Invalid contest creation payload',
        detail: parsed.error.flatten().fieldErrors
      });
    }

    const { networkId, payload } = parsed.data;

    const session = await requireSession();
    enforceRateLimit({
      route: 'contests.create',
      ip: getClientIp(request),
      sessionToken: session.sessionToken ?? null
    });

    await initDatabase();

    const result = await deployContest({
      userId: session.user.id,
      organizerAddress: session.user.walletAddress,
      networkId,
      payload
    });

    const body = {
      ...serializeContestCreation(result.request),
      receipt: serializeReceipt(result.receipt)
    };

    const response = NextResponse.json(body, { status: 201 });
    response.headers.set('Cache-Control', 'no-store');
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
