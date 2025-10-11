# 配置文件

## 根目录 `.env.local`（给 Hardhat/ 脚本）

```
RPC_URL=http://127.0.0.1:8545
CHAIN_ID=31337
DEFAULT_ACCOUNT=< 用部署输出的 deployer.address 替换>
```

## `frontend/.env.local`（给 Vite/ 前端）

```
VITE_RPC_URL=http://127.0.0.1:8545
VITE_CHAIN_ID=31337
VITE_DEV_PORT=4100
VITE_CONTRACTS_PATH=./public/api/runtime/config
VITE_DEFAULT_ACCOUNT=< 同上，用 deployer.address>
```

## `frontend/public/api/runtime/config`（前端运行时配置，JSON）

# 命令

> 用部署脚本 `register-setup.ts` 输出填写地址；`abiPath` 指向 `frontend/public/abi/` 下对应 ABI。

```
{
  "rpcUrl": "http://127.0.0.1:8545",
  "chainId": 31337,
  "devPort": 4100,
  "defaultAccount": "<deployer.address>",
  "contracts": [
    {
      "id": "contest",
      "name": "Contest",
      "address": "< 输出中的 contest>",
      "abiPath": "/abi/Contest.json",
      "tags": ["core","entry"]
    },
    {
      "id": "priceSource",
      "name": "PriceSource",
      "address": "< 输出中的 priceSource>",
      "abiPath": "/abi/PriceSource.json"
    },
    {
      "id": "vaultFactory",
      "name": "VaultFactory",
      "address": "< 输出中的 vaultFactory>",
      "abiPath": "/abi/VaultFactory.json"
    },
    {
      "id": "entryAsset",
      "name": "ERC20",
      "address": "< 输出中的 entryAsset>",
      "abiPath": "/abi/ERC20.json"
    },
    {
      "id": "quoteAsset",
      "name": "ERC20",
      "address": "< 输出中的 quoteAsset>",
      "abiPath": "/abi/ERC20.json"
    }
  ]
}
```

## 安装

```bash
node -v
pnpm -v
pnpm install
```

## 起本地 Hardhat 节点

注意这个终端不要关

```bash
pnpm --filter @chaincontest/contracts node
```

## 新终端：部署并保存输出

```bash
pnpm --filter @chaincontest/contracts hardhat run scripts/e2e/register-setup.ts --network localhost | tee register-output.json
```

## 生成前端运行时配置

```bash
mkdir -p frontend/public/api/runtime
pnpm exec jq --arg rpc "http://127.0.0.1:8545" --argjson chain 31337 --argjson port 4100 \
  '. + {rpcUrl: $rpc, chainId: $chain, devPort: $port}' \
  register-output.json > frontend/public/api/runtime/config
```

## 配置前端环境变量

```bash
cat > frontend/.env.local <<'EOF'
VITE_RPC_URL=http://127.0.0.1:8545
VITE_CHAIN_ID=31337
VITE_DEV_PORT=4100
VITE_CONTRACTS_PATH=./public/api/runtime/config
VITE_DEFAULT_ACCOUNT=0x...
EOF
```

## 起前端

```bash
pnpm --filter @chaincontest/frontend dev
```

## 健康检查

```bash
curl -s -X POST http://127.0.0.1:8545 -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"eth_blockNumber","params":[]}'
curl -s http://localhost:4100/api/runtime/config | jq '.contracts | length'
```

## 测试

```bash
pnpm --filter @chaincontest/contracts test
pnpm --filter @chaincontest/contracts typecheck
pnpm --filter @chaincontest/frontend test
pnpm --filter @chaincontest/frontend test:e2e
```

## 清理 / 重置

```bash
pnpm --filter @chaincontest/contracts hardhat clean
rm -f frontend/public/api/runtime/config register-output.json
```
