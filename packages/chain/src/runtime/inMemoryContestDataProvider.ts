import { createContestChainError } from '@chain/errors/contestChainError';
import type {
  ContestChainDataProvider,
  ContestDefinition,
} from '@chain/gateway/types';
import type { ContestIdentifier } from '@chain/gateway/domainModels';

const makeKey = (contest: ContestIdentifier): string =>
  `${contest.contestId}:${contest.chainId}`;

class InMemoryContestDataProvider implements ContestChainDataProvider {
  private readonly definitions: Map<string, ContestDefinition>;

  constructor(definitions: readonly ContestDefinition[]) {
    this.definitions = new Map(
      definitions.map((definition) => [makeKey(definition.contest), definition]),
    );
  }

  public register(definition: ContestDefinition): void {
    this.definitions.set(makeKey(definition.contest), definition);
  }

  public loadContestDefinition(
    contest: ContestIdentifier,
    _options?: { readonly blockTag?: bigint | 'latest'; readonly rpcUrl?: string },
  ): Promise<ContestDefinition> {
    const definition = this.definitions.get(makeKey(contest));
    if (!definition) {
      throw createContestChainError({
        code: 'STATE_CONFLICT',
        message: `Contest "${contest.contestId}" not configured for chain ${contest.chainId}`,
        details: { contest },
      });
    }

    void _options;
    return Promise.resolve(definition);
  }
}

export const createInMemoryContestDataProvider = (
  definitions: readonly ContestDefinition[],
): ContestChainDataProvider => new InMemoryContestDataProvider(definitions);
