# Quickstart: packages/chain 接口层

## 前置条件
- Node.js 20.x + pnpm 9.x
- 本地已运行或可访问的比赛合约网络（建议 Hardhat fork）
- `.env.local` 提供链上 RPC 端点与测试账户私钥（仅本地使用）

## 安装与构建
```bash
pnpm install
pnpm --filter @chaincontest/chain build
```

## 初始化 Gateway
```ts
import { createContestChainGateway } from '@chaincontest/chain';
import { loadValidationContext } from '@chaincontest/shared-schemas';
import { createInMemoryContestDataProvider } from '@chaincontest/chain/runtime/inMemoryContestDataProvider';
import { createPublicClient, http } from 'viem';

const validators = loadValidationContext({ registry: /* shared registry */ });

const dataProvider = createInMemoryContestDataProvider([
  /* contest definitions loaded from db or config service */
]);

const gateway = createContestChainGateway({
  validators,
  rpcClientFactory: ({ chainId }) => createPublicClient({
    chain: { id: chainId, name: 'local', nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: ['http://127.0.0.1:8545'] } } },
    transport: http(),
  }),
  signerLocator: async ({ participant }) => /* return viem wallet client for participant */,
  errorLogger: (error) => console.error('[gateway]', error.code, error.message),
  dataProvider,
});
```

## 核心用例
1. **报名计划**
   ```ts
   const plan = await gateway.planParticipantRegistration({
     contest: contestIdentifier,
     participant: '0xabc...123',
   });
   if (plan.status === 'ready') {
     await walletClient.sendTransaction(plan.registrationCall);
   }
   ```
2. **换仓计划**
   ```ts
const rebalance = await gateway.planPortfolioRebalance({
  contest: contestIdentifier,
  participant: '0xabc...123',
  intent: { sellAsset: tokenIn, buyAsset: tokenOut, amount: '1000000000000000000' },
});
if (rebalance.status === 'ready') {
  await walletClient.sendTransaction(rebalance.transaction!);
}
```
3. **结算 / 领奖 / 赎回**
```ts
const settlement = await gateway.executeContestSettlement({ contest: contestIdentifier, caller: '0xoperator' });
   const reward = await gateway.executeRewardClaim({ contest: contestIdentifier, participant: '0xwinner' });
   const redemption = await gateway.executePrincipalRedemption({ contest: contestIdentifier, participant: '0xplayer' });
   ```
4. **事件抓取**
   ```ts
const batch = await gateway.pullContestEvents({ contest: contestIdentifier, cursor: lastCursor });
batch.events.forEach((event) => ingest(event));
lastCursor = batch.nextCursor;
```

## 测试
```bash
pnpm --filter @chaincontest/chain test
```
Vitest 契约用例覆盖报名、换仓、结算、事件抓取等场景，运行结束会生成覆盖率报告（阈值：语句/函数≥90%，分支≥80%）。

## 调试建议
- 设置 `CHAIN_GATEWAY_LOG_LEVEL=debug` 启用额外日志（待实现的可选开关）。
- 使用 `viem` 的内存链工具快速构造报名与换仓场景。
- 利用 `createInMemoryContestDataProvider` 注入静态 contest 定义，便于在单元测试或离线脚本中重放事件、模拟资格状态。
