# bc Development Guidelines

Auto-generated from all feature plans. Last updated: 2025-10-08

## Active Technologies
- Solidity ^0.8.x（合约）、TypeScript 5.x（前端 SPA） + Hardhat（编译/测试/部署）、Ethers.js（前端 RPC 交互）、Uniswap v3 TWAP 接口、OpenZeppelin 库（待确认具体模块） (001-top-k)
- Node.js 20 (server), TypeScript 5.x 构建脚本，HTML5 + htmx 1.9 (客户端) + Express 5 beta（服务器端路由与模板响应）、ethers 6.x（链上交互）、htmx 1.9.x（前端局部刷新）、lucide 图标集（可选，待评估） (002-html-css-htmx)
- N/A（所有状态实时来自链上或临时内存缓存） (002-html-css-htmx)

## Project Structure
```
src/
tests/
```

## Commands
npm test [ONLY COMMANDS FOR ACTIVE TECHNOLOGIES][ONLY COMMANDS FOR ACTIVE TECHNOLOGIES] npm run lint

## Code Style
Solidity ^0.8.x（合约）、TypeScript 5.x（前端 SPA）: Follow standard conventions

## Recent Changes
- 002-html-css-htmx: Added Node.js 20 (server), TypeScript 5.x 构建脚本，HTML5 + htmx 1.9 (客户端) + Express 5 beta（服务器端路由与模板响应）、ethers 6.x（链上交互）、htmx 1.9.x（前端局部刷新）、lucide 图标集（可选，待评估）
- 001-top-k: Added Solidity ^0.8.x（合约）、TypeScript 5.x（前端 SPA） + Hardhat（编译/测试/部署）、Ethers.js（前端 RPC 交互）、Uniswap v3 TWAP 接口、OpenZeppelin 库（待确认具体模块）

<!-- MANUAL ADDITIONS START -->
## Git 提交流程
- 完成单项任务后必须立即执行一次原子化提交，提交内容仅包含该任务的变更。
- 提交前无需执行编译或测试，但提交信息仍需使用简洁且语义明确的前缀（如 `feat:`、`fix:` 等）。
- 严格禁止将多个任务或无关修改合并在同一提交中，格式化调整需与功能修改分离。
- 允许自行创建分支，但仍禁止在未获授权情况下执行 `git push` 或改写历史。
- 每个任务在推进过程中必须进行不少于一次提交，提交可在任务执行中完成，禁止等全部完成后集中提交。
<!-- MANUAL ADDITIONS END -->
