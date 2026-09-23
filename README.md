# Tavern Forge

**面向中文创作的 Harness 驱动叙事酒馆**

Tavern Forge 是一个面向自托管和社区扩展的现代叙事系统。它保留酒馆生态中的角色卡、世界书和预设兼容能力，同时使用 Director、Actor、Chronicler 和可插拔 Agent Harness 运行多角色、分支、记忆与上下文编排。

项目目前处于规格落地阶段。第一批共享契约位于 `packages/contracts/schemas/`，配套设计文档位于 `docs/specs/`。

## 项目结构

```text
apps/
  server/            Node.js + Fastify 后端
  web/               Vue 前端
packages/
  contracts/         JSON Schema 和共享契约
  runtime/           叙事运行时
  db/                SQLite 持久化
  model/             Vercel AI SDK 模型接入
  config/            配置和单用户鉴权
  plugin-sdk/        社区插件接口
docs/
  specs/             产品、运行时和数据规格
```

## 契约原则

- JSON Schema 使用 Draft 2020-12。
- Schema 是前端、后端和插件共享契约的唯一来源。
- `StateProjection` 是只读派生结果；所有写入都必须使用 `StateMutation`。
- ActorMemory 属于单个角色，不能通过 CoreState 变成共享记忆。
- Scene 的创建、结束和切换都必须通过 Runtime 校验后的 mutation 提交。
- 未知的酒馆字段保留在原始 payload 或扩展 payload 中，不静默丢弃。

## 文档

- [叙事运行时规格](docs/specs/叙事运行时规格-v0.1.md)
- [上下文编排规格](docs/specs/上下文编排规格-v0.1.md)
- [酒馆兼容矩阵](docs/specs/酒馆兼容矩阵-v0.1.md)
- [插件与扩展接口规格](docs/specs/插件与扩展接口规格-v0.1.md)
- [核心状态 JSON Schema 说明](docs/specs/核心状态JSON Schema-v0.1.md)
