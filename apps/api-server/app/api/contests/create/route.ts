import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession, SessionNotFoundError } from '@/lib/auth/session';
import { initDatabase, database } from '@/lib/db/client';
import { getCreationGateway } from '@/lib/chain/creationGateway';
import { httpErrors, HttpError, toErrorResponse } from '@/lib/http/errors';
import { enforceRateLimit } from '@/lib/middleware/rateLimit';

const getClientIp = (request: NextRequest): string | null => {
  return request.headers.get('x-forwarded-for') ?? request.ip ?? null;
};

const requestSchema = z.object({
  networkId: z.union([
    z.number().int().positive(),
    z
      .string()
      .regex(/^\d+$/)
      .transform((value) => Number(value))
  ]),
  payload: z.record(z.string(), z.unknown()).default({})
});

const readJson = async (request: NextRequest): Promise<unknown> => {
  try {
    return await request.json();
  } catch {
    return null;
  }
};

const serializeContestCreation = (record: import('@chaincontest/db').ContestCreationRequestRecord) => ({
  status: record.status,
  request: {
    requestId: record.request.requestId,
    userId: record.request.userId,
    networkId: record.request.networkId,
    payload: record.request.payload,
    createdAt: record.request.createdAt.toISOString(),
    updatedAt: record.request.updatedAt.toISOString()
  },
  artifact: record.artifact
    ? {
        artifactId: record.artifact.artifactId,
        requestId: record.artifact.requestId,
        contestId: record.artifact.contestId,
        networkId: record.artifact.networkId,
        registrarAddress: record.artifact.registrarAddress,
        treasuryAddress: record.artifact.treasuryAddress,
        settlementAddress: record.artifact.settlementAddress,
        rewardsAddress: record.artifact.rewardsAddress,
        metadata: record.artifact.metadata,
        createdAt: record.artifact.createdAt.toISOString(),
        updatedAt: record.artifact.updatedAt.toISOString()
      }
    : null
});

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

    const creation = await database.createContestCreationRequest({
      userId: session.user.id,
      networkId,
      payload
    });

    const gateway = getCreationGateway();
    const receipt = await gateway.executeContestDeployment({
      organizer: session.user.walletAddress,
      networkId,
      payload
    });

    if (receipt.status === 'accepted' && receipt.artifact) {
      await database.recordContestDeploymentArtifact({
        requestId: creation.request.requestId,
        contestId: null,
        networkId: receipt.artifact.networkId,
        registrarAddress: receipt.artifact.registrarAddress,
        treasuryAddress: receipt.artifact.treasuryAddress,
        settlementAddress: receipt.artifact.settlementAddress,
        rewardsAddress: receipt.artifact.rewardsAddress,
        metadata: receipt.artifact.metadata ?? {}
      });
    }

    const aggregate =
      (await database.getContestCreationRequest(creation.request.requestId)) ?? creation;

    const body = {
      ...serializeContestCreation(aggregate),
      receipt: {
        status: receipt.status,
        requestId: receipt.requestId,
        organizer: receipt.organizer,
        networkId: receipt.networkId,
        acceptedAt: receipt.acceptedAt,
        metadata: receipt.metadata ?? {}
      }
    };

    const response = NextResponse.json(body, { status: 201 });
    response.headers.set('Cache-Control', 'no-store');
    return response;
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
