# @chaincontest/chain

Contest chain gateway for ChainContest monorepo. Provides a single high-level interface to build contest lifecycle snapshots, participant registration plans, rebalance routes, settlement execution, reward claims, principal redemptions, and event ingestion batches without leaking contract details.

## Installation

```bash
pnpm install
pnpm --filter @chaincontest/chain build
```

## Usage

```ts
import {
  createContestChainGateway,
  createInMemoryContestDataProvider,
  type ContestDefinition,
} from '@chaincontest/chain';
import { loadValidationContext } from '@chaincontest/shared-schemas';

const validators = loadValidationContext({ registry: /* shared schema registry */ });
const dataProvider = createInMemoryContestDataProvider([
  /* load contest definitions from db/config */
]);

const gateway = createContestChainGateway({
  validators,
  rpcClientFactory: /* viem public client factory */, 
  signerLocator: /* viem wallet client resolver */, 
  dataProvider,
  errorLogger: (error) => console.error('[gateway]', error.code, error.message),
});

const registration = await gateway.planParticipantRegistration({
  contest: contestIdentifier,
  participant: '0xabc...123',
});

if (registration.status === 'ready') {
  await walletClient.sendTransaction(registration.registrationCall!);
}
```

### Additional Methods

- `planPortfolioRebalance` – applies whitelist, cooldown, price freshness, and allowance checks before returning a ready-to-submit transaction with route metadata.
- `executeContestSettlement`, `executeRewardClaim`, `executePrincipalRedemption` – enforce guards and return applied/noop/blocked outcomes with structured rejection reasons.
- `pullContestEvents` – emits ordered contest events with a deterministic cursor for ingestion pipelines.

## Testing

The package ships with Vitest contract tests that cover the full gateway surface. Run `pnpm --filter @chaincontest/chain test` to execute the suite (coverage gates: statements/functions ≥ 90%, branches ≥ 80%).

## Debugging Tips

- Inject a custom `errorLogger` or run with `NODE_OPTIONS=--trace-warnings` to capture wrapped `ContestChainError` instances.
- Use the in-memory data provider for deterministic local simulations and to replay recorded contest events.
- When integrating with viem, configure `rpcClientFactory.clear()` between tests to avoid cached transports leaking state.
