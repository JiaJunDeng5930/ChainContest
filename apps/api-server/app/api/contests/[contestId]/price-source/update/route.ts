import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { createPublicClient, defineChain, encodeFunctionData, http } from 'viem';
import { requireSession } from '@/lib/auth/session';
import { buildContestDefinition } from '@/lib/contests/definitionBuilder';
import { resolveContestId } from '@/lib/http/routeParams';
import { applyCorsHeaders, handleCorsPreflight } from '@/lib/http/cors';
import { httpErrors, toErrorResponse } from '@/lib/http/errors';
import { getEnv } from '@/lib/config/env';
import { contestArtifact, type ContestDefinition } from '@chaincontest/chain';

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

const ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;

const normalizeAddress = (value: unknown): `0x${string}` | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (!ADDRESS_PATTERN.test(trimmed)) {
    return null;
  }
  return trimmed.toLowerCase() as `0x${string}`;
};

const resolvePriceSourceAddress = async (definition: ContestDefinition): Promise<`0x${string}` | null> => {
  if (definition.rebalance?.priceSource) {
    return definition.rebalance.priceSource;
  }

  const contestAddress = definition.contest.addresses?.registrar;
  if (!contestAddress) {
    return null;
  }

  try {
    const env = getEnv();
    const rpcCandidates = [env.chain.primaryRpc, env.chain.publicRpc, env.chain.fallbackRpc].filter(
      (value): value is string => Boolean(value)
    );
    if (!rpcCandidates.length) {
      return null;
    }

    const chain = defineChain({
      id: definition.contest.chainId,
      name: `runtime-chain-${definition.contest.chainId}`,
      network: `runtime-chain-${definition.contest.chainId}`,
      nativeCurrency: {
        name: 'Ether',
        symbol: 'ETH',
        decimals: 18
      },
      rpcUrls: {
        default: { http: rpcCandidates },
        public: { http: rpcCandidates }
      }
    });

    const client = createPublicClient({
      chain,
      transport: http(rpcCandidates[0]!)
    });

    const config = await client.readContract({
      address: contestAddress as `0x${string}`,
      abi: contestArtifact.abi,
      functionName: 'getConfig'
    });

    const candidate =
      normalizeAddress(
        typeof config === 'object' && config !== null && 'priceSource' in config
          ? (config as Record<string, unknown>).priceSource
          : Array.isArray(config)
            ? config[3]
            : undefined
      );

    if (candidate) {
      return candidate;
    }
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

    const priceSourceAddress = await resolvePriceSourceAddress(definition);
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
