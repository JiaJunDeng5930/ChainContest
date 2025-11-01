import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession, SessionNotFoundError } from '@/lib/auth/session';
import { initDatabase } from '@/lib/db/client';
import { httpErrors, HttpError, toErrorResponse } from '@/lib/http/errors';
import { enforceRateLimit } from '@/lib/middleware/rateLimit';
import { deployContest } from '@/lib/contests/deploymentService';
import type { ContestCreationRequestRecord, ContestDeploymentArtifactRecord } from '@chaincontest/db';
import { applyCorsHeaders, handleCorsPreflight } from '@/lib/http/cors';

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

const serializeArtifact = (artifact: ContestDeploymentArtifactRecord | null) => {
  if (!artifact) {
    return null;
  }

  return {
    artifactId: artifact.artifactId,
    requestId: artifact.requestId,
    contestId: artifact.contestId,
    networkId: artifact.networkId,
    contestAddress: artifact.contestAddress,
    vaultFactoryAddress: artifact.vaultFactoryAddress,
    registrarAddress: artifact.registrarAddress,
    treasuryAddress: artifact.treasuryAddress,
    settlementAddress: artifact.settlementAddress,
    rewardsAddress: artifact.rewardsAddress,
    transactionHash: artifact.transactionHash,
    confirmedAt: artifact.confirmedAt ? artifact.confirmedAt.toISOString() : null,
    metadata: artifact.metadata,
    createdAt: artifact.createdAt.toISOString(),
    updatedAt: artifact.updatedAt.toISOString()
  };
};

const serializeContestCreation = (record: ContestCreationRequestRecord) => ({
  status: record.status,
  request: {
    requestId: record.request.requestId,
    userId: record.request.userId,
    networkId: record.request.networkId,
    payload: record.request.payload,
    vaultComponentId: record.request.vaultComponentId,
    priceSourceComponentId: record.request.priceSourceComponentId,
    failureReason: record.request.failureReason,
    transactionHash: record.request.transactionHash,
    confirmedAt: record.request.confirmedAt ? record.request.confirmedAt.toISOString() : null,
    createdAt: record.request.createdAt.toISOString(),
    updatedAt: record.request.updatedAt.toISOString()
  },
  artifact: serializeArtifact(record.artifact)
});

const serializeReceipt = (receipt: import('@chaincontest/chain').ContestCreationReceipt) => ({
  status: receipt.status,
  requestId: receipt.requestId,
  organizer: receipt.organizer,
  networkId: receipt.networkId,
  acceptedAt: receipt.acceptedAt,
  metadata: receipt.metadata ?? {},
  artifact: receipt.artifact
    ? {
        networkId: receipt.artifact.networkId,
        contestAddress: receipt.artifact.contestAddress,
        vaultFactoryAddress: receipt.artifact.vaultFactoryAddress,
        registrarAddress: receipt.artifact.registrarAddress ?? null,
        treasuryAddress: receipt.artifact.treasuryAddress ?? null,
        settlementAddress: receipt.artifact.settlementAddress ?? null,
        rewardsAddress: receipt.artifact.rewardsAddress ?? null,
        transactionHash: receipt.artifact.transactionHash ?? null,
        confirmedAt: receipt.artifact.confirmedAt ?? null,
        metadata: receipt.artifact.metadata ?? {}
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
