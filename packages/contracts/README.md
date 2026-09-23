# Tavern Forge Contracts

这里保存前端、后端和插件共享的 JSON Schema。当前先建立基础对象；HTTP、WebSocket、Runtime Event 与插件 RPC Schema 会在基础对象稳定后继续加入。

```text
schemas/
  common/   ID、时间、来源、作用域和可见性
  domain/   Story、Branch、Scene、Actor、Turn、Beat
  state/    CoreState 和 StateMutation
```

所有 Schema 都是 Draft 2020-12。加载跨文件 `$ref` 时，需要将 `schemas` 目录下的全部 JSON 文件加入校验器的 schema registry。

Schema 只校验结构和基础约束。事件来源是否存在、Branch 是否可达、状态版本是否匹配，仍由 Runtime 负责。

## 后续扩展顺序

1. NarrativeEvent、ActorMemory、Summary 和 Checkpoint。
2. ScenePlan、ActorBrief、ActorResult 和 ChroniclerResult。
3. ContextSnapshot、ModelRequestAttempt、Artifact 和 RuntimeEvent。
4. HTTP、WebSocket、插件 RPC、酒馆导入资产和兼容报告。
