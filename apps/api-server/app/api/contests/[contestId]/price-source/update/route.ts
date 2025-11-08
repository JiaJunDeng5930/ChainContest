import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { encodeFunctionData } from 'viem';
import { requireSession } from '@/lib/auth/session';
import { buildContestDefinition } from '@/lib/contests/definitionBuilder';
import { resolveContestId } from '@/lib/http/routeParams';
import { applyCorsHeaders, handleCorsPreflight } from '@/lib/http/cors';
import { httpErrors, toErrorResponse } from '@/lib/http/errors';

const updateAbi = [{
  type: 'function',
  name: 'update',
  stateMutability: 'nonpayable',
  inputs: [],
  outputs: [
    {
      name: '',
      type: 'tuple',
      components: [
        { name: 'meanTick', type: 'int24' },
        { name: 'sqrtPriceX96', type: 'uint160' },
        { name: 'priceE18', type: 'uint256' },
        { name: 'updatedAt', type: 'uint64' }
      ]
    }
  ]
} as const];

export const POST = async (
  request: NextRequest,
  context?: { params: { contestId: string } }
): Promise<Response> => {
  try {
    const contestId = resolveContestId(request, context);
    const session = await requireSession();

    const definition = await buildContestDefinition(
      { contestId },
      {
        session: {
          userId: session.user.id,
          walletAddress: session.user.walletAddress,
          addressChecksum: session.user.addressChecksum,
          sessionToken: session.sessionToken ?? undefined
        }
      }
    );

    const priceSourceAddress = definition.rebalance?.priceSource;
    if (!priceSourceAddress) {
      throw httpErrors.conflict('Contest price source not configured', {
        detail: { contestId }
      });
    }

    const encodedCall = encodeFunctionData({
      abi: updateAbi,
      functionName: 'update'
    });

    const response = NextResponse.json(
      {
        transaction: {
          to: priceSourceAddress,
          data: encodedCall,
          value: '0'
        }
      },
      {
        status: 200,
        headers: { 'Cache-Control': 'no-store' }
      }
    );
    applyCorsHeaders(response, request);
    return response;
  } catch (error) {
    const normalized = toErrorResponse(error);
    const response = NextResponse.json(normalized.body, { status: normalized.status });
    if (normalized.headers) {
      Object.entries(normalized.headers).forEach(([key, value]) => response.headers.set(key, value));
    }
    response.headers.set('Cache-Control', 'no-store');
    applyCorsHeaders(response, request);
    return response;
  }
};

export const runtime = 'nodejs';

export const OPTIONS = (request: NextRequest): Response => handleCorsPreflight(request);
