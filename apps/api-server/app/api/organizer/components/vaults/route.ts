import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession, SessionNotFoundError } from '@/lib/auth/session';
import { httpErrors, HttpError, toErrorResponse } from '@/lib/http/errors';
import { deployOrganizerComponent } from '@/lib/organizer/components/deploy';
import { applyCorsHeaders } from '@/lib/http/cors';

const requestSchema = z.object({
  networkId: z.union([
    z.number().int().positive(),
    z
      .string()
      .regex(/^\d+$/)
      .transform((value) => Number(value))
  ]),
  baseAsset: z
    .string()
    .regex(/^0x[0-9a-fA-F]{40}$/u, { message: 'baseAsset must be a valid address' }),
  quoteAsset: z
    .string()
    .regex(/^0x[0-9a-fA-F]{40}$/u, { message: 'quoteAsset must be a valid address' }),
  metadata: z.record(z.string(), z.unknown()).optional()
});

const readRequestBody = async (request: NextRequest): Promise<unknown> => {
  try {
    return await request.json();
  } catch {
    return null;
  }
};

export const POST = async (request: NextRequest): Promise<Response> => {
  try {
    const body = await readRequestBody(request);
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      throw new HttpError('validation_failed', {
        status: 400,
        message: 'Invalid vault deployment payload',
        detail: parsed.error.flatten().fieldErrors
      });
    }

    const session = await requireSession();
    const payload = parsed.data;

    const result = await deployOrganizerComponent({
      userId: session.user.id,
      organizerAddress: session.user.walletAddress,
      walletAddress: session.user.walletAddress,
      networkId: payload.networkId,
      component: {
        componentType: 'vault_implementation',
        baseAsset: payload.baseAsset,
        quoteAsset: payload.quoteAsset,
        metadata: payload.metadata
      }
    });

    const responseBody = {
      status: result.registration.status,
      component: result.component,
      transactionHash: result.registration.metadata?.transactionHash ?? null,
      confirmedAt: result.registration.metadata?.confirmedAt ?? null,
      configHash: result.registration.metadata?.configHash,
      config: result.registration.metadata?.config ?? {}
    };

    const response = NextResponse.json(responseBody, { status: 202 });
    response.headers.set('Cache-Control', 'no-store');
    applyCorsHeaders(response, request);
    return response;
  } catch (error) {
    if (error instanceof SessionNotFoundError) {
      const normalized = toErrorResponse(httpErrors.unauthorized('No active session'));
      const response = NextResponse.json(normalized.body, { status: normalized.status });
      response.headers.set('Cache-Control', 'no-store');
      applyCorsHeaders(response, request);
      return response;
    }

    const normalized = toErrorResponse(error);
    const response = NextResponse.json(normalized.body, { status: normalized.status });
    response.headers.set('Cache-Control', 'no-store');
    applyCorsHeaders(response, request);
    return response;
  }
};

export const runtime = 'nodejs';
