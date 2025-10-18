# @chaincontest/shared-schemas

批量校验引擎的内核实现，提供注册表加载、依赖拓扑排序、批处理校验与结果格式化。

## 核心接口

### `loadValidationContext(options: ValidationContextOptions)`
- **registry**：一个 `ValidationRegistry` 数组；每个元素描述一个类型的校验规则。
- **environmentOverrides**（可选）：按环境 ID 分组的增量修改，系统会合并入基础注册表；同一环境的多条覆盖按 `activatedAt` 时间排序，采用最新版本。
- **environmentId**（可选）：指定要激活的环境覆盖；缺省值为 `"default"`。
- 返回的 `ValidationContext` 包含：
  - `registry`：合并后的注册表；
  - `plan`：基于依赖关系生成的执行计划（拓扑有序列表与分层信息）；
  - `atomicSchemas` / `compositeEvaluators`：预编译好的原子 Zod schema 与复合回调。

### `validateBatch(request: ValidationRequest, context: ValidationContext)`
- `request.entries` 是待校验的条目列表；类型顺序可以任意，执行顺序由 `context.plan` 决定。
- 函数会逐条记录成功的类型，并在遇到首个错误时立即返回；错误之前的成功条目会保留在 `validatedTypes` 中。
- 支持以下错误场景：
  - 未在注册表中声明的类型 -> `unknown-type`；
  - 依赖不存在或后续仍未通过 -> `missing-dependencies`；
  - 原子 Zod 校验失败 -> `atomic-validation-failed`，附带逐项 issue；
  - 复合校验回调通过 `addIssue` 报错 -> `composite-validation-failed`。
- 返回的 `ValidationResult` 始终包含 `metrics`：
  - `evaluatedAtomic` / `evaluatedComposite`：实际执行过的原子与复合条目数量；
  - `durationMs`：整个批次的耗时；
  - `environmentId`：来自 `ValidationContext`。

### `listRegisteredTypes(context: ValidationContext)`
- 将当前上下文中的所有条目（含依赖和说明）打平成适合对外展示的列表。

## 注册表写作要点

### 原子条目（`kind: 'atomic'`）
- `dependencies` 必须为空数组。
- `rule.schema` 需要提供完整的 Zod 校验器；`description` 与 `failureMessage` 用于人类可读的描述与错误提示。
- 可按需补充 `rule.parameters`、`metadata` 等辅助信息，这些字段会被原样携带到上下文。

```ts
const registry: ValidationRegistry = [
  {
    typeKey: 'payment-amount',
    kind: 'atomic',
    dependencies: [],
    rule: {
      description: '支付金额需为 1..=665 的整数',
      failureMessage: '支付金额不合法',
      schema: z.number().int().min(1).max(665),
    },
  },
];
```

### 复合条目（`kind: 'composite'`）
- `dependencies` 至少包含一个已注册的类型；不要自引用。
- `rule.composite` 是同步函数 `(ctx) => void`，参数包含：
  - `value`：复合条目本身的输入值；
  - `dependencies`：已解析的依赖值字典（键为 typeKey）；
  - `addIssue(issue)`：记录首个错误；可设置 `message` 与 `detail`。
- 如果 `addIssue` 未被调用，则复合条目视为通过；失败时会生成 `composite-validation-failed` 错误，并自动补全缺失的 `dependencyTypes` / `violation` 字段。

```ts
const registry: ValidationRegistry = [
  // ...原子条目...
  {
    typeKey: 'event-window',
    kind: 'composite',
    dependencies: ['start-time', 'end-time'],
    rule: {
      description: '结束时间必须不早于开始时间',
      failureMessage: '事件窗口无效',
      composite: ({ dependencies, addIssue }) => {
        const start = dependencies['start-time'] as Date;
        const end = dependencies['end-time'] as Date;
        if (end.getTime() < start.getTime()) {
          addIssue({
            detail: {
              violation: 'end-before-start',
              references: [{ type: 'start-time' }, { type: 'end-time' }],
            },
          });
        }
      },
    },
  },
];
```

### 环境覆盖（可选）
- 结构：`{ environmentId, activatedAt, overrides }`。
- `overrides` 的键是已存在的 `typeKey`，值可修改 `rule`、`dependencies`、`metadata` 等字段。
- 同一环境多个覆盖按 `activatedAt` 升序应用，最终 `mergeRegistryWithOverrides` 会返回最新生效时间，`loadValidationContext` 会将其带入 `ValidationContext.activatedAt`。

```ts
const overrides = [
  {
    environmentId: 'prod',
    activatedAt: '2025-10-18T12:00:00.000Z',
    overrides: {
      'payment-amount': {
        rule: {
          description: '生产环境付款上限 500',
          failureMessage: '付款金额超出生产限制',
          schema: z.number().int().min(1).max(500),
        },
      },
    },
  },
];
const context = loadValidationContext({ registry, environmentOverrides: overrides, environmentId: 'prod' });
```

## 执行模型
- 上下文会根据依赖图生成拓扑顺序；即便请求里的条目顺序错乱，也能按依赖顺序自动执行。
- 对某个条目执行前，缺失的依赖会被递归拉起并校验；若依赖失败或不存在，会直接返回错误并终止整个批次。
- `validatedTypes` 始终保持请求原序：只包含在首个错误前成功的条目。

## 常见结果形态

```ts
const result = validateBatch({ entries }, context);

if (result.status === 'success') {
  // result.validatedTypes -> string[]
  // result.metrics -> 计数与耗时
} else {
  // result.firstError -> { type, message, detail? }
  // detail.reason 可能是:
  // - 'atomic-validation-failed'
  // - 'composite-validation-failed'
  // - 'missing-dependencies'
  // - 'unknown-type'
}
```

## 调试与自检建议
- 通过 `validateBatch` 的返回指标快速确认哪一类规则执行次数异常。
- 在测试中构造乱序批次，验证依赖解析是否符合预期（参见 `tests/composite/composite-invariants.spec.ts`）。
- 使用 `listRegisteredTypes` 对外暴露当前激活的规则清单，便于集成端自检。
