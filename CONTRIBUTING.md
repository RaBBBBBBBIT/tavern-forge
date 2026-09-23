# Tavern Forge 协作指南

感谢参与 Tavern Forge。项目以中文为主要协作语言，代码、Schema、文档和提交记录都应尽量让中文贡献者容易阅读和维护。

## 1. 协作语言

- Issue、Pull Request 描述、代码审查意见和设计讨论默认使用中文。
- Commit 的标题和正文默认使用中文。
- 代码中的变量名、函数名、类型名、文件名和 API 字段使用英文，除非领域名称必须保留中文原文。
- `Tavern Forge`、`Director`、`Actor`、`Chronicler`、`Turn`、`Beat`、`Branch`、`Scene`、`Schema` 等项目术语可以保留英文。
- 第三方库名、协议名、命令、错误码和模型名称保留原文。

已有历史提交不会为了改成中文而重写。此规则从本指南合入之后的新提交开始执行。

## 2. 项目结构

```text
apps/server/src/       后端内部模块
apps/web/src/          前端内部模块
packages/contracts/    前后端和插件共享契约
packages/plugin-sdk/   社区插件 SDK
docs/specs/            产品和技术规格
```

后端内部功能默认放在 `apps/server/src/`。只有确实被多个应用或社区插件共享的代码，才放进顶层 `packages/`。

## 3. 分支规则

`main` 是稳定主分支，不直接提交功能代码。开发使用短生命周期分支：

```text
feat/<english-kebab-name>
fix/<english-kebab-name>
docs/<english-kebab-name>
refactor/<english-kebab-name>
test/<english-kebab-name>
chore/<english-kebab-name>
```

分支名使用英文小写和短横线，方便命令行、脚本和不同系统使用；这不影响提交标题和正文必须使用中文。

示例：

```text
feat/turn-runtime-loop
fix/duplicate-turn-commit
docs/plugin-guide
```

## 4. Commit 规则

采用 Conventional Commits 的结构，但中文是提交说明的默认语言：

```text
<type>(<scope>): <中文说明>
```

常用 `type`：

| type | 用途 |
| --- | --- |
| `feat` | 新功能 |
| `fix` | 修复问题 |
| `docs` | 文档修改 |
| `test` | 测试修改 |
| `refactor` | 不改变行为的重构 |
| `perf` | 性能优化 |
| `chore` | 工程配置、目录或依赖维护 |
| `build` | 构建和打包相关修改 |
| `ci` | CI 工作流修改 |

`scope` 使用简短英文模块名，例如 `runtime`、`db`、`model`、`web`、`contracts`、`plugin`、`docs`、`repo`。

推荐示例：

```text
feat(runtime): 实现单角色 Turn 执行循环
fix(db): 防止同一个 Turn 重复提交
docs(plugin): 增加后端插件安装说明
test(contracts): 增加 StateMutation 非法路径测试
refactor(web): 拆分故事工作区输入组件
chore(repo): 调整项目目录结构
```

不推荐：

```text
feat: add runtime loop
update
修一下
各种修改
```

规则：

1. 一次提交只做一件相对完整的事情。
2. 标题使用中文，建议不超过 72 个字符。
3. 标题使用动词开头，例如“增加”“修复”“整理”“拆分”“更新”。
4. 不在提交中混入无关格式化、个人配置、数据库文件或生成产物。
5. 如果修改了行为，提交正文说明原因、影响范围和验证方式。
6. 不提交 API Key、密码、Cookie、Session、个人路径或本地运行数据。

## 5. 文档和 Schema 规则

- 产品和架构决策先更新 `docs/specs/`，再修改代码。
- 修改 JSON Schema 时，同时更新相关规格文档和测试样例。
- Schema 是共享契约的唯一来源，前端、后端和插件不得各自维护一份同名类型定义。
- 新增字段优先保持向后兼容；删除或改变字段含义需要升级 schema/API 版本。
- 不确定的业务语义不能通过放宽 `additionalProperties` 来掩盖，应在规格中明确。
- 修改契约后至少运行：

```bash
node packages/contracts/tests/schema-smoke.mjs
```

## 6. Pull Request 规则

Pull Request 标题也使用中文 Commit 格式：

```text
feat(runtime): 实现多 Beat Turn 循环
```

描述至少包含：

- 改了什么。
- 为什么要改。
- 是否改变数据结构、接口或运行时语义。
- 如何验证。
- 已知限制或后续工作。

提交前检查：

- [ ] 代码和文档没有提交密钥或本地数据。
- [ ] 相关测试已运行。
- [ ] JSON Schema 变更已经同步文档和测试。
- [ ] 没有把无关修改混入当前 PR。
- [ ] Commit 标题和 PR 标题符合中文规则。
- [ ] 破坏性变更已经明确说明。

## 7. 主分支和历史安全

- 不直接向 `main` 推送功能提交。
- 不使用 `git push --force` 修改共享分支历史。
- 已提交的故事事实、数据库迁移和公开契约不能通过删除历史来修复；应追加修正、迁移或新的版本。
- 发现提交中包含密钥时，先撤销密钥，再处理 Git 历史清理，不能只删除工作区文件。

## 8. 插件贡献

- 插件必须遵守《插件与扩展接口规格》中的 Manifest、权限、Host API 和状态命名空间规则。
- 插件不能直接访问宿主数据库、模型密钥或未过滤的角色记忆。
- 插件提交状态提案，不直接写入 `StateProjection` 或 `NarrativeEvent`。
- 插件相关变更需要说明权限范围、失败行为、迁移方式和卸载后的数据处理。
