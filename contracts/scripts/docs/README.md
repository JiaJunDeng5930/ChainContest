# contracts/scripts/docs

该目录容纳与合约文档流程相关的 TypeScript 脚本，负责串联 Hardhat、`solidity-docgen` 及校验逻辑。使用原则如下：

- **核心内聚**：脚本直接调用现有工具链，禁止额外封装层或兜底逻辑，避免偏离 fail-closed 策略。
- **双模式支持**：每个脚本在生成模式与校验模式下都应保持确定性输出，必要时通过参数区分。
- **依赖管理**：所有运行时依赖须在 `contracts/package.json` 中声明，不允许隐式引用根包依赖。
- **执行入口**：配合 `pnpm --filter contracts docs:*` 脚本使用，确保在本地与 CI 中一致运行。
- **可读性**：保持严格的 TypeScript 编码规范，对关键流程（如元数据注入、Git 状态检查）提供简短注释。
