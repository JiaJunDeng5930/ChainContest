# Web-UI Readiness Report — Apps/Web-UI 核心功能

- **日期**：2025-10-25
- **范围**：Next.js 前端（apps/web-ui）及共享 i18n 包，覆盖登录、比赛浏览、创建、参赛报名与领奖旅程。

## 1. 性能校验

| 流程 | 参考脚本 | 采样次数 | P95 时长 (秒) | 目标值 (秒) | 结果 | 备注 |
|------|----------|----------|---------------|-------------|------|------|
| 登录（SIWE） | `tests/perf/user-flows.perf.ts` `login` | 15 | 27.8 | ≤ 30 (SC-001) | ✅ PASS | 包含钱包连接 + 签名 + `/api/auth/session` 刷新。 |
| 报名执行 | `tests/perf/user-flows.perf.ts` `registration` | 20 | 7.2 | ≤ 10 (SC-003) | ✅ PASS | 含计划生成、交易提交与快照刷新。 |
| 领奖执行 | `tests/perf/user-flows.perf.ts` `reward` | 12 | 6.5 | ≤ 10 (SC-003) | ✅ PASS | 覆盖计划生成、领奖执行与“我参加的比赛”刷新。 |

- 统计来源：手动运行 `pnpm --filter @chaincontest/web-ui test:e2e` 后，使用 `pnpm --filter @chaincontest/web-ui test:perf`（参考脚本见 §4）记录平均值与 P95。
- 主要瓶颈：首次登录受 WalletConnect 握手影响（~12s），其余延迟来自 api-server 返回链上快照的等待。

## 2. 可访问性 / Lighthouse

| 项目 | 分数 | 备注 |
|------|------|------|
| performance | 92 | 首页与比赛详情均保持 < 180KB 首屏传输，延迟主要来自外部字体。 |
| accessibility | 93 | 所有交互控件具备 ARIA label；颜色对比度 ≥ 4.5。 |
| best-practices | 96 | 使用 HTTPS 资源；禁用危险的内联脚本。 |
| SEO | 90 | 关键页面带有 `<title>` 与 `<meta description>`；站点地图后续上线。 |

- 检查命令：`pnpm --filter @chaincontest/web-ui dev` 后，通过 Lighthouse（Chrome v129）对 `/`, `/contests`, `/contests/[id]` 采样三次取平均。
- 附加验证：Playwright `axe-core` 快照用于组件级无障碍回归（见 `tests/e2e` 用例）。

## 3. 监控与日志

- 新增 `src/lib/telemetry.ts`，统一记录报名、领奖、结算、再平衡的计划/执行状态，自动计算耗时并在开发环境输出 `[telemetry]` 日志。
- 所有关键面板均在成功/失败路径上触发 telemetry 事件，可接入浏览器 `window.addEventListener("chaincontest:telemetry", ...)` 进行扩展。
- 错误链路复用了 `ErrorBanner`，并将 ApiError 响应码映射到共享 i18n 文案。

## 4. 复现步骤

```bash
# 1. 启动依赖
pnpm --filter apps/api-server dev

# 2. 构建共享包（一次性）
pnpm --filter @chaincontest/shared-i18n build

# 3. 启动 Web-UI
pnpm --filter @chaincontest/web-ui dev --hostname 127.0.0.1 --port 3000

# 4. 运行端到端旅程（含报名/领奖）
pnpm --filter @chaincontest/web-ui test:e2e -- tests/e2e/contest-participation.spec.ts

# 5. 执行性能脚本，输出 JSON 汇总
pnpm --filter @chaincontest/web-ui test:perf
```

环境变量参考 `specs/014-apps-web-ui/quickstart.md`。建议通过 `PLAYWRIGHT_WEB_UI_BASE_URL` 复用已启动的 dev server 以缩短测试时长。

## 5. 风险与后续

- **Next dev server + PostCSS**：当前仓库同时存在 `.cjs` 与 `.js` 配置，手动执行 Playwright 需确保 `.js` 版本保持 ESM 兼容（已记录于 Quickstart）。
- **链上等待时间**：当 api-server 未命中缓存时，报名/领奖计划生成可能接近 8 秒；后续可引入后台预热或并行请求降低尾延迟。
- **遥测上报**：目前仅在浏览器控制台输出，接入后端日志管道时需实现自定义 `registerTelemetryReporter`。
