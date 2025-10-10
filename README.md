# 团队本地测试文档索引

本文档为 Hardhat 测试网络交付的中文入口，概览角色导航、工作流与深入指南。

## 快速导航

- 新成员（US1）：依次完成“环境准备”“启动 Hardhat 节点”“部署脚本与前端同步”，并将健康检查输出与 runtime 配置归档，供后续角色复用。
- 前端同事（US2）：参考指南中的“前端运行时配置”“启动前端站点”“前端常见故障排查”，验证页面可读取本地链数据；验收时需提交成功截图及配置文件时间戳。
- 测试团队（US3）：按照《本地 Hardhat 测试网络搭建指南》的“测试矩阵”“失败判定与恢复”分章节依次执行合约单测、前端单测与端到端测试，记录日志后在 README “测试与维护”段落列出的巡检节奏内归档结果。

## 文档资产

- docs/development/local-testing.md — 本地链路搭建、前端联调与测试矩阵的详细流程指南。
- specs/004-hardhat/ — 设计、研究与契约文档
- frontend/public/api/runtime/config — 前端运行时配置示例

## 维护声明

- 文档负责人：后端技术负责人（或指定轮值），每个版本发布前需复核内容是否与 `specs/004-hardhat/` 最新结论一致。
- 更新频率：Hardhat 配置、合约接口或前端运行时代码变更后 24 小时内更新本索引与 `docs/development/local-testing.md`。
- 安全要求：仅记录隔离凭证与本地链账户，禁止将生产密钥写入示例；完成演练后需执行 `pnpm --filter @bc/contracts hardhat clean` 清理。
- 审计记录：将每次测试矩阵执行结果归档至 `docs/reports/`（命名 `YYYYMMDD-hardhat-local-testing.md`），确保可追溯。

## 测试与维护

- 全量测试矩阵：`pnpm --filter @bc/contracts test`、`pnpm --filter frontend test`、`pnpm --filter frontend test:e2e`，详细步骤见《本地 Hardhat 测试网络搭建指南》的“测试矩阵”章节。
- 失败处理：参考指南中的“失败判定与恢复”，在 2 次失败内完成修复并向文档维护者回报。
- 巡检节奏：每月例行执行至少合约单测 + 前端单测，生成报告并附在 `docs/reports/`。
- 配置更新：部署脚本或前端读取逻辑改变时，24 小时内同步 runtime 配置样例并在 README 快速导航中标明更新时间。

## 常见问题

> 后续根据实施内容，补充排查经验、日志定位建议等。
