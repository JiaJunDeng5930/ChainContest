# bc Development Guidelines

Auto-generated from all feature plans. Last updated: 2025-10-08

## Active Technologies
- Solidity ^0.8.x（合约）、TypeScript 5.x（前端 SPA） + Hardhat（编译/测试/部署）、Ethers.js（前端 RPC 交互）、Uniswap v3 TWAP 接口、OpenZeppelin 库（待确认具体模块） (001-top-k)

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
- 001-top-k: Added Solidity ^0.8.x（合约）、TypeScript 5.x（前端 SPA） + Hardhat（编译/测试/部署）、Ethers.js（前端 RPC 交互）、Uniswap v3 TWAP 接口、OpenZeppelin 库（待确认具体模块）

<!-- MANUAL ADDITIONS START -->
## Git 提交流程
- 完成单项任务后必须立即执行一次原子化提交，提交内容仅包含该任务的变更。
- 提交前无需执行编译或测试，但提交信息仍需使用简洁且语义明确的前缀（如 `feat:`、`fix:` 等）。
- 严格禁止将多个任务或无关修改合并在同一提交中，格式化调整需与功能修改分离。
- 允许自行创建分支，但仍禁止在未获授权情况下执行 `git push` 或改写历史。
<!-- MANUAL ADDITIONS END -->
