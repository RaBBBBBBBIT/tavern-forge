# Tavern Forge

**面向中文创作的 Harness 驱动叙事酒馆**

Tavern Forge 是一个面向自托管和社区扩展的现代叙事系统。它保留酒馆生态中的角色卡、世界书和预设兼容能力，同时使用 Director、Actor、Chronicler 和可插拔 Agent Harness 运行多角色、分支、记忆与上下文编排。

项目目前处于规格落地阶段。第一批共享契约位于 `packages/contracts/schemas/`，配套设计文档位于 `docs/specs/`。

## 项目结构

```text
apps/
  server/            Node.js + Fastify 后端
    src/
      runtime/       Director、Actor、Chronicler 和 Turn 循环
      db/             SQLite、迁移和 Repository
      model/          Vercel AI SDK 和模型 Provider
      config/         配置和单用户鉴权
      plugins/        后端 PluginHost
  web/               Vue 前端
packages/
  contracts/         JSON Schema 和共享契约
  plugin-sdk/        社区插件接口
docs/
  specs/             产品、运行时和数据规格
```

`apps/` 放实际运行的应用；`packages/` 只放多个应用或社区插件需要共享的代码。

## 本地配置

复制 `.env.example` 为 `.env`，再填写本机配置。`.env` 已被 Git 忽略，模型 Key、单用户密码和应用密钥都不能提交到仓库。服务端只从 `apps/server/src/config/` 读取配置，前端不接触模型 Key。

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

## 参与开发

请先阅读 [协作指南](CONTRIBUTING.md)，了解中文 Commit 规则、分支命名、Pull Request 流程、Schema 修改要求和插件贡献边界。
