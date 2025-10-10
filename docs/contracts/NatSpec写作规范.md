# NatSpec 写作规范

本文档定义 `contracts/src` 下公共接口、事件、错误的中文 NatSpec 编写要求。所有代码合并前必须遵循此规范，并通过 `pnpm --filter contracts docs:check` 自检。

## 适用范围
- `public` / `external` 函数
- `event`
- `error`
- 公开的 `struct` / `enum` 说明（如用于文档补充）

## 必填标签
| 标签 | 说明 | 写作要点 |
| --- | --- | --- |
| `@notice` | 面向使用者的概要描述 | **必须使用中文**，首句描述主要行为，可包含关键信息，但避免技术细节。 |
| `@dev` | 开发者补充说明 | 描述边界条件、算法细节或与其他模块的关系；若确无补充，可保留空行并写入“无额外说明”。 |
| `@param` | 参数表 | 覆盖每个入参，描述语气为“参数含义 + 单位/约束”。泛型参数写法为 `@param data 数据内容（32 字节）`。 |
| `@return` | 返回值表 | 对所有返回值逐一说明；单返回值可写“返回 xx”。无返回值不填写。 |
| `@custom:error` | 相关错误 | 枚举可能抛出的自定义错误，格式：`@custom:error ContestUnauthorized 未授权调用者`。 |
| `@custom:example` | 调用示例 | 至少给出一个交互示例，使用中文叙述或伪代码，帮助审核者理解流程。 |

> **提示**：事件与错误无返回值时可省略 `@return`，但需补充 `@dev` 说明字段。

## 语气要求
- 使用敬体或陈述句，保持专业、简洁。
- 避免机翻痕迹与英文夹杂；需引用英文术语时使用全角括号补充解释。
- 数字与单位之间保留空格，例如 `10 秒`、`1e18 wei`。

## 结构约定
1. NatSpec 块紧贴符号声明，使用 `///` 单行注释。
2. 标签顺序建议：`@notice` → `@dev` → `@param` → `@return` → `@custom:error` → `@custom:example`。
3. 多行内容使用 Markdown 列表或段落，遵循 80 列软限制。
4. 自定义标签前缀统一为 `@custom:`，必要时新增术语需在文档末尾“术语表”章节补充。

## 常见错误与修正
- **缺失标签**：`docs:check` 会报错 `missingUserDoc` 或 `missingDevDoc`，请补全对应段落。
- **参数不匹配**：确保 `@param` 名称与函数签名一致，包括大小写。
- **中英文混排**：使用全角中文标点；保留 Solidity 关键字与地址原文。

## 提交流程
1. 修改或新增 NatSpec 时同步更新对应合约文档。
2. 运行 `pnpm --filter contracts docs:generate` 生成 Markdown。
3. 确认 `git status` 干净后再提交。
4. 提交前执行 `pnpm --filter contracts docs:check`，确保脚本返回码为 0。

> 若遇到特例无法添加完整标签，请在合约顶部添加说明并于代码评审中讨论。

## 提交前自检

执行 `pnpm --filter contracts docs:check` 会串联以下步骤，任意环节失败都会以非零退出码结束：

1. **Hardhat Compile + 输出校验**：调用 `hardhat validateOutput`，若缺失 `@notice` / `@dev`、`@param` / `@return` 对应条目，将直接列出合约名与具体符号。
2. **文档对比**：在内存中重新生成 Markdown，与 `docs/contracts` 目录现有文件比对正文内容。如出现差异，将提示运行 `docs:generate` 后重新提交。
3. **文档目录清洁度**：检查 `docs/contracts` 是否存在未提交的变更，若有，请先整理工作区再提交。

成功示例输出：

```
<<< Validating Output for Natspec >>>
✅ All Contracts have been checked for missing Natspec comments
✅ NatSpec 检查通过，文档与源码保持同步，工作区干净
```

常见失败场景：

- `Missing Natspec Comments - Found Errors.` → 对应功能或事件缺少必填标签；补齐后重新运行。
- `文档 <file> 与源码不一致` → 说明源码与 Markdown 未同步，运行 `docs:generate` 再次执行自检。
- `docs/contracts 下存在未提交的变更` → 手动清理或提交文档文件，确保仓库状态干净。
