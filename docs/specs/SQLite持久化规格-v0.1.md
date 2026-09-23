# SQLite 持久化规格

- 版本：0.1
- 日期：2026-09-23
- 状态：MVP 数据库持久化规格；表边界和事务规则已确定，具体 SQL 语法可在实现时调整。
- 依赖：[数据模型规格](./数据模型规格-v0.1.md)、[叙事运行时规格](./叙事运行时规格-v0.1.md)、[接口契约规格](./接口契约规格-v0.1.md)。
- 范围：SQLite 表分组、字段约定、主外键、索引、事务和迁移顺序。
- 非范围：多用户授权、插件 SDK 的全部细节和生产级密钥管理实现。MVP 默认向量引擎为 LanceDB，插件协议见《插件与扩展接口规格》。

本文把《数据模型规格》落到 SQLite 的持久化边界。它不是要求实现一开始就创建所有表；第 14 节给出 MVP 的迁移顺序。

## 1. SQLite 运行约束

数据库文件位于 `$APP_DATA_DIR/app.sqlite`。服务启动时必须执行：

```sql
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;
PRAGMA synchronous = NORMAL;
```

约束：

1. 只有后端主进程负责写数据库。
2. 不支持多个应用实例同时写同一个 SQLite 文件。
3. 数据库迁移必须由单个启动实例独占执行。
4. 正式 Turn 提交使用短事务；模型请求、网络工具、生图和流式输出不在事务内运行。
5. 大型媒体和完整二进制不写入 SQLite，数据库只保存引用、哈希和元数据。
6. 所有时间统一保存为 UTC ISO 8601 文本；故事内时间单独保存，不与系统时间混用。

## 2. 通用字段约定

### 2.1 ID 和时间

- 所有业务 ID 使用应用生成的不透明字符串，推荐 UUID/UUIDv7。
- `created_at`、`updated_at`、`started_at`、`ended_at`、`committed_at` 使用 UTC ISO 8601 文本。
- 不使用自增整数作为对外 ID；内部 SQLite 行号也不能作为 API 身份。
- 所有正式历史记录都必须能通过 ID 找到 Story、Branch 和来源。

### 2.2 JSON 字段

JSON 字段统一使用 SQLite `TEXT` 保存，并在 Repository 层完成序列化、schema 校验和版本检查。

适合 JSON 的内容：

- 原始导入资源和未知扩展字段。
- 角色卡、Worldbook 条目和 Preset 的可扩展 payload。
- 状态 mutation 的操作参数。
- 插件状态和插件配置。
- 模型参数、执行限制和工具输入输出。
- ContextItem 的渲染内容。

不应只放在 JSON 中的内容：

- `story_id`、`branch_id`、`turn_id`、`actor_id` 等关联字段。
- `sequence`、`state_version`、`control_version` 等并发和历史字段。
- `status`、`kind`、`subject_actor_id` 等权限和筛选字段。
- `source_event_ids` 等需要追踪的核心来源。

## 3. 表分组总览

```text
资源表：assets, asset_revisions, story_resource_bindings
配置表：model_connections, execution_profiles, auth_credentials, auth_sessions
故事表：stories, branches, scenes, actor_definitions, actor_instances
控制表：actor_control_assignments
事实表：turns, turn_attempts, plans, beats, narrative_segments
状态表：narrative_events, state_mutations, state_projections, checkpoints
认知表：actor_memories, summaries, context_snapshots, vector_documents
执行表：model_request_attempts, tool_invocations, artifacts, runtime_events
系统表：idempotency_keys, background_jobs, schema_migrations
```

表名使用复数 snake_case。核心表使用显式外键；跨插件的动态对象通过 `namespace` 和 JSON 保存，但仍必须绑定 Story/Branch。

## 4. 资源和配置表

### 4.1 `assets`

```text
id TEXT PRIMARY KEY
kind TEXT NOT NULL
owner_id TEXT NULL
name TEXT NOT NULL
status TEXT NOT NULL              -- active | archived
created_at TEXT NOT NULL
updated_at TEXT NOT NULL
```

`kind` 至少支持 `character`、`worldbook`、`preset`、`user_persona`、`other`。

### 4.2 `asset_revisions`

资源版本不可变。导入内容不能因为后续编辑而被覆盖。

```text
id TEXT PRIMARY KEY
asset_id TEXT NOT NULL REFERENCES assets(id)
revision INTEGER NOT NULL
source_format TEXT NULL
source_payload TEXT NOT NULL
normalized_payload TEXT NULL
extension_payload TEXT NULL
created_at TEXT NOT NULL
UNIQUE(asset_id, revision)
```

### 4.3 `story_resource_bindings`

```text
id TEXT PRIMARY KEY
story_id TEXT NOT NULL REFERENCES stories(id)
asset_revision_id TEXT NOT NULL REFERENCES asset_revisions(id)
binding_kind TEXT NOT NULL
priority INTEGER NOT NULL DEFAULT 0
enabled INTEGER NOT NULL DEFAULT 1
activation_config TEXT NULL
created_at TEXT NOT NULL
UNIQUE(story_id, asset_revision_id, binding_kind)
```

Worldbook 绑定必须逐本保存，不能把多本书合并成一条资源。

### 4.4 `model_connections`

```text
id TEXT PRIMARY KEY
provider TEXT NOT NULL
display_name TEXT NOT NULL
model TEXT NOT NULL
endpoint TEXT NULL
secret_ref TEXT NOT NULL
config_json TEXT NOT NULL DEFAULT '{}'
status TEXT NOT NULL
created_at TEXT NOT NULL
updated_at TEXT NOT NULL
```

不保存 API Key 明文。`secret_ref` 指向后端 SecretStore。

### 4.5 `execution_profiles`

```text
id TEXT PRIMARY KEY
story_id TEXT NULL REFERENCES stories(id)
director_connection_id TEXT NOT NULL REFERENCES model_connections(id)
actor_connection_id TEXT NOT NULL REFERENCES model_connections(id)
chronicler_connection_id TEXT NOT NULL REFERENCES model_connections(id)
limits_json TEXT NOT NULL DEFAULT '{}'
context_policy_revision_id TEXT NULL REFERENCES asset_revisions(id)
plugin_config_json TEXT NOT NULL DEFAULT '{}'
created_at TEXT NOT NULL
updated_at TEXT NOT NULL
```

TurnAttempt 必须保存配置快照，不能只依赖运行时仍存在的 Profile。

## 5. 故事和角色表

### 5.1 `stories`

```text
id TEXT PRIMARY KEY
owner_id TEXT NULL
title TEXT NOT NULL
status TEXT NOT NULL
default_branch_id TEXT NULL
default_execution_profile_id TEXT NULL REFERENCES execution_profiles(id)
created_at TEXT NOT NULL
updated_at TEXT NOT NULL
```

`default_branch_id` 可在创建根 Branch 后补齐，因此迁移初期允许为空。

### 5.2 `branches`

```text
id TEXT PRIMARY KEY
story_id TEXT NOT NULL REFERENCES stories(id)
parent_branch_id TEXT NULL REFERENCES branches(id)
fork_checkpoint_id TEXT NULL REFERENCES checkpoints(id)
name TEXT NOT NULL
status TEXT NOT NULL
head_sequence INTEGER NOT NULL DEFAULT 0
active_scene_id TEXT NULL
state_version INTEGER NOT NULL DEFAULT 0
created_at TEXT NOT NULL
updated_at TEXT NOT NULL
```

约束：

- 根 Branch 的 `parent_branch_id` 和 `fork_checkpoint_id` 都为空。
- 子 Branch 两者必须同时存在，并且 Checkpoint 必须属于父 Branch 的可达历史。
- `head_sequence` 只能在 Turn 正式提交事务中前进。
- `state_version` 每次接受会影响当前投影的 mutation 时递增。

### 5.3 `scenes`

```text
id TEXT PRIMARY KEY
branch_id TEXT NOT NULL REFERENCES branches(id)
name TEXT NOT NULL
status TEXT NOT NULL
story_time TEXT NULL
location TEXT NULL
public_state_json TEXT NOT NULL DEFAULT '{}'
started_at_turn_id TEXT NULL
ended_at_turn_id TEXT NULL
created_at TEXT NOT NULL
updated_at TEXT NOT NULL
```

`public_state_json` 只保存当前公共场景状态。角色私有位置、物品和记忆不能放在这里。

### 5.4 `actor_definitions`

```text
id TEXT PRIMARY KEY
character_asset_revision_id TEXT NULL REFERENCES asset_revisions(id)
name TEXT NOT NULL
profile_json TEXT NOT NULL DEFAULT '{}'
created_at TEXT NOT NULL
updated_at TEXT NOT NULL
```

### 5.5 `actor_instances`

```text
id TEXT PRIMARY KEY
story_id TEXT NOT NULL REFERENCES stories(id)
actor_definition_id TEXT NOT NULL REFERENCES actor_definitions(id)
kind TEXT NOT NULL                  -- npc | user_persona | system
user_persona_revision_id TEXT NULL REFERENCES asset_revisions(id)
created_at TEXT NOT NULL
```

ActorInstance 是 Story 内的角色身份。角色的 Branch 状态不直接写入该表。

### 5.6 `actor_control_assignments`

```text
branch_id TEXT NOT NULL REFERENCES branches(id)
actor_id TEXT NOT NULL REFERENCES actor_instances(id)
controller TEXT NOT NULL             -- user | agent
control_version INTEGER NOT NULL DEFAULT 1
updated_at TEXT NOT NULL
PRIMARY KEY(branch_id, actor_id)
```

控制版本变化会使依赖旧版本的 Plan 失效。

## 6. Turn 和临时执行表

### 6.1 `turns`

```text
id TEXT PRIMARY KEY
story_id TEXT NOT NULL REFERENCES stories(id)
branch_id TEXT NOT NULL REFERENCES branches(id)
base_checkpoint_id TEXT NOT NULL REFERENCES checkpoints(id)
input_json TEXT NOT NULL
status TEXT NOT NULL
committed_sequence_start INTEGER NULL
committed_sequence_end INTEGER NULL
created_at TEXT NOT NULL
committed_at TEXT NULL
```

`input_json` 保存实际的角色归属、作者指令和执行选项快照。不要从前端当前选择重新推断历史输入。

Turn 达到 10 个 Beat 后使用 `needs_continue` 状态；这表示当前 Turn 暂停在可继续的位置，不表示已经提交或失败。

### 6.2 `turn_attempts`

```text
id TEXT PRIMARY KEY
turn_id TEXT NOT NULL REFERENCES turns(id)
attempt_number INTEGER NOT NULL
execution_profile_snapshot_json TEXT NOT NULL
plugin_version_snapshot_json TEXT NOT NULL
base_state_version INTEGER NOT NULL
status TEXT NOT NULL
failure_code TEXT NULL
started_at TEXT NULL
ended_at TEXT NULL
UNIQUE(turn_id, attempt_number)
```

### 6.3 `plans`

```text
id TEXT PRIMARY KEY
turn_attempt_id TEXT NOT NULL REFERENCES turn_attempts(id)
based_on_checkpoint_id TEXT NOT NULL REFERENCES checkpoints(id)
participant_ids_json TEXT NOT NULL
plan_json TEXT NOT NULL
status TEXT NOT NULL
created_at TEXT NOT NULL
```

Plan 只属于一次 Attempt，不能跨 Turn 复用。

### 6.4 `beats`

```text
id TEXT PRIMARY KEY
turn_attempt_id TEXT NOT NULL REFERENCES turn_attempts(id)
ordinal INTEGER NOT NULL
actor_id TEXT NOT NULL REFERENCES actor_instances(id)
plan_id TEXT NULL REFERENCES plans(id)
status TEXT NOT NULL
temporary_state_version INTEGER NULL
created_at TEXT NOT NULL
updated_at TEXT NOT NULL
UNIQUE(turn_attempt_id, ordinal)
```

### 6.5 `narrative_segments`

```text
id TEXT PRIMARY KEY
beat_id TEXT NOT NULL REFERENCES beats(id)
ordinal INTEGER NOT NULL
kind TEXT NOT NULL
performer_id TEXT NULL REFERENCES actor_instances(id)
text TEXT NOT NULL
observer_actor_ids_json TEXT NOT NULL DEFAULT '[]'
completeness TEXT NOT NULL
created_at TEXT NOT NULL
UNIQUE(beat_id, ordinal)
```

未完成 Segment 可以持久化为草稿，但不能被 `narrative_events` 引用为正式来源。

## 7. 正式事实和状态表

### 7.1 `narrative_events`

这是正式事实表，和 `state_mutations` 分开。

```text
id TEXT PRIMARY KEY
story_id TEXT NOT NULL REFERENCES stories(id)
branch_id TEXT NOT NULL REFERENCES branches(id)
turn_id TEXT NOT NULL REFERENCES turns(id)
sequence INTEGER NOT NULL
kind TEXT NOT NULL
actor_id TEXT NULL REFERENCES actor_instances(id)
payload_json TEXT NOT NULL
source_event_ids_json TEXT NOT NULL DEFAULT '[]'
source_segment_ids_json TEXT NOT NULL DEFAULT '[]'
created_at TEXT NOT NULL
UNIQUE(branch_id, sequence)
```

事件只能在正式提交事务中写入。`sequence` 是 Branch 正式历史顺序，不是数据库创建顺序。

### 7.2 `state_mutations`

```text
id TEXT PRIMARY KEY
story_id TEXT NOT NULL REFERENCES stories(id)
branch_id TEXT NOT NULL REFERENCES branches(id)
turn_id TEXT NULL REFERENCES turns(id)
namespace TEXT NOT NULL
target_type TEXT NOT NULL
target_id TEXT NOT NULL
operation TEXT NOT NULL
payload_json TEXT NOT NULL
intent TEXT NOT NULL
source_event_ids_json TEXT NOT NULL DEFAULT '[]'
expected_state_version INTEGER NOT NULL
status TEXT NOT NULL
created_at TEXT NOT NULL
```

Mutation 表达状态变化，不代替叙事事件。一个事件可以没有 mutation，一个 mutation 也必须引用足够的来源。

### 7.3 `state_projections`

```text
branch_id TEXT NOT NULL REFERENCES branches(id)
namespace TEXT NOT NULL
target_type TEXT NOT NULL
target_id TEXT NOT NULL
state_json TEXT NOT NULL
version INTEGER NOT NULL
processed_through_sequence INTEGER NOT NULL DEFAULT 0
updated_at TEXT NOT NULL
PRIMARY KEY(branch_id, namespace, target_type, target_id)
```

Projection 便于快速读取，但不是唯一事实来源。重建时按有效事件和 Mutation 回放。

### 7.4 `checkpoints`

```text
id TEXT PRIMARY KEY
story_id TEXT NOT NULL REFERENCES stories(id)
branch_id TEXT NOT NULL REFERENCES branches(id)
sequence INTEGER NOT NULL
kind TEXT NOT NULL                 -- bootstrap | turn
turn_id TEXT NULL REFERENCES turns(id)
scene_id TEXT NULL REFERENCES scenes(id)
state_version INTEGER NOT NULL
resource_snapshot_json TEXT NOT NULL
control_snapshot_json TEXT NOT NULL
plugin_state_snapshot_json TEXT NOT NULL
created_at TEXT NOT NULL
UNIQUE(branch_id, sequence)
```

Checkpoint 必须指向已提交历史，不能从临时 Beat 创建。每个根 Branch 创建一个 `bootstrap` Checkpoint，`sequence = 0` 且没有 `turn_id`；正式 Turn 提交后创建 `turn` Checkpoint。这样首个 Turn 有稳定的 `base_checkpoint_id`，同时避免 Turn 和 Checkpoint 的循环依赖。

## 8. 记忆、摘要和上下文表

### 8.1 `actor_memories`

```text
id TEXT PRIMARY KEY
story_id TEXT NOT NULL REFERENCES stories(id)
branch_id TEXT NOT NULL REFERENCES branches(id)
subject_actor_id TEXT NOT NULL REFERENCES actor_instances(id)
source_event_ids_json TEXT NOT NULL DEFAULT '[]'
source_turn_id TEXT NOT NULL REFERENCES turns(id)
kind TEXT NOT NULL
content TEXT NOT NULL
confidence REAL NULL
status TEXT NOT NULL
valid_from_sequence INTEGER NULL
valid_until_sequence INTEGER NULL
created_at TEXT NOT NULL
```

查询记忆时必须按 `branch_id` 和 `subject_actor_id` 过滤，再做相关性排序。

### 8.2 `summaries`

```text
id TEXT PRIMARY KEY
story_id TEXT NOT NULL REFERENCES stories(id)
branch_id TEXT NOT NULL REFERENCES branches(id)
level TEXT NOT NULL                 -- turn | scene | arc | story
covered_through_sequence INTEGER NOT NULL
source_turn_ids_json TEXT NOT NULL DEFAULT '[]'
content TEXT NOT NULL
status TEXT NOT NULL
generated_by TEXT NULL
created_at TEXT NOT NULL
```

摘要不能覆盖分叉点之后的父 Branch 内容。生成新版本时旧摘要标记为 `superseded` 或 `invalid`，不直接删除。

### 8.3 `context_snapshots`

MVP 默认保存完整渲染上下文：

```text
id TEXT PRIMARY KEY
story_id TEXT NOT NULL REFERENCES stories(id)
branch_id TEXT NOT NULL REFERENCES branches(id)
turn_id TEXT NOT NULL REFERENCES turns(id)
attempt_id TEXT NOT NULL REFERENCES turn_attempts(id)
role TEXT NOT NULL
actor_id TEXT NULL REFERENCES actor_instances(id)
checkpoint_id TEXT NOT NULL REFERENCES checkpoints(id)
source_versions_json TEXT NOT NULL
items_json TEXT NOT NULL
rendered_messages_json TEXT NOT NULL
estimated_tokens INTEGER NOT NULL
omitted_item_ids_json TEXT NOT NULL DEFAULT '[]'
leakage_check TEXT NOT NULL
created_at TEXT NOT NULL
```

如果上下文很大，可以将两个 JSON 字段压缩后保存，但必须能还原完整内容。所有 `context_snapshots` 默认共用 300 MB 配额，不设置自动过期；用户可以手动清理。达到配额后不自动删除旧快照，新的快照保存应返回可见的存储空间错误。清理策略不得影响正在运行或可重试的 Attempt。

### 8.4 `vector_documents`

向量索引属于 MVP 的检索能力，但不是事实来源。MVP 使用 LanceDB 本地模式，数据目录为 `$APP_DATA_DIR/vector`。SQLite 保存索引元数据和来源边界；LanceDB 只保存可重建的检索记录：

```text
id TEXT PRIMARY KEY
story_id TEXT NOT NULL REFERENCES stories(id)
branch_id TEXT NOT NULL REFERENCES branches(id)
source_type TEXT NOT NULL
source_id TEXT NOT NULL
subject_actor_id TEXT NULL REFERENCES actor_instances(id)
content_hash TEXT NOT NULL
embedding_provider TEXT NOT NULL
embedding_model TEXT NOT NULL
index_ref TEXT NOT NULL
status TEXT NOT NULL
created_at TEXT NOT NULL
updated_at TEXT NOT NULL
```

LanceDB 表至少保存 `id`、`content`、`vector`、`story_id`、`branch_id`、`source_type`、`source_id`、`subject_actor_id`、`content_hash` 和 `embedding_model`。SQLite 的 `vector_documents.status`、来源事件有效性、Branch 可达范围和角色权限是最终判断依据。

向量查询必须先按 Story、Branch、来源有效性、角色权限和时间范围在 SQLite 中过滤，再调用 LanceDB 做向量、全文或混合检索。`index_ref` 不能代替 `source_id` 和权限校验。启动时校验 SQLite 元数据和 LanceDB 表的内容哈希；发现缺失、过期或损坏时，将记录标记为 `stale` 并从 SQLite 重建。

## 9. 模型、工具、媒体和运行事件表

### 9.1 `model_request_attempts`

```text
id TEXT PRIMARY KEY
turn_attempt_id TEXT NOT NULL REFERENCES turn_attempts(id)
role TEXT NOT NULL
actor_id TEXT NULL REFERENCES actor_instances(id)
context_snapshot_id TEXT NOT NULL REFERENCES context_snapshots(id)
provider TEXT NOT NULL
model TEXT NOT NULL
status TEXT NOT NULL
finish_reason TEXT NULL
usage_json TEXT NULL
error_code TEXT NULL
started_at TEXT NULL
ended_at TEXT NULL
```

模型请求失败或重试不会修改已提交事实。

### 9.2 `tool_invocations`

```text
id TEXT PRIMARY KEY
turn_attempt_id TEXT NULL REFERENCES turn_attempts(id)
tool_id TEXT NOT NULL
input_json TEXT NOT NULL
output_json TEXT NULL
status TEXT NOT NULL
source_actor_id TEXT NULL REFERENCES actor_instances(id)
created_at TEXT NOT NULL
ended_at TEXT NULL
```

### 9.3 `artifacts`

```text
id TEXT PRIMARY KEY
story_id TEXT NOT NULL REFERENCES stories(id)
branch_id TEXT NOT NULL REFERENCES branches(id)
turn_id TEXT NULL REFERENCES turns(id)
source_event_ids_json TEXT NOT NULL DEFAULT '[]'
source_segment_id TEXT NULL REFERENCES narrative_segments(id)
kind TEXT NOT NULL
storage_ref TEXT NULL
content_hash TEXT NULL
metadata_json TEXT NOT NULL DEFAULT '{}'
status TEXT NOT NULL
created_at TEXT NOT NULL
```

媒体文件存放在 `$APP_DATA_DIR/media`，`storage_ref` 保存逻辑引用而不是任意可执行路径。

### 9.4 `runtime_events`

```text
id TEXT PRIMARY KEY
story_id TEXT NULL REFERENCES stories(id)
branch_id TEXT NULL REFERENCES branches(id)
turn_id TEXT NULL REFERENCES turns(id)
attempt_id TEXT NULL REFERENCES turn_attempts(id)
type TEXT NOT NULL
schema_version TEXT NOT NULL
sequence INTEGER NULL
payload_json TEXT NOT NULL
occurred_at TEXT NOT NULL
```

RuntimeEvent 供 WebSocket 推送、断线恢复和执行审计使用。流式 delta 可以压缩；正式事实仍以事实表和投影提交为准。

## 10. 系统表

### 10.1 `idempotency_keys`

```text
key TEXT PRIMARY KEY
operation TEXT NOT NULL
request_hash TEXT NOT NULL
response_json TEXT NULL
resource_id TEXT NULL
created_at TEXT NOT NULL
expires_at TEXT NULL
```

同一 key 配合不同请求内容必须返回 `idempotency_conflict`，不能执行第二次。

### 10.2 `background_jobs`

用于 FTS 更新、LanceDB 索引、媒体整理和非提交必需的投影重建。TurnSummary、StorySummary、正式事件、状态和角色记忆不通过后台任务生成，它们必须在 Turn 提交前同步完成：

```text
id TEXT PRIMARY KEY
kind TEXT NOT NULL
story_id TEXT NULL REFERENCES stories(id)
branch_id TEXT NULL REFERENCES branches(id)
payload_json TEXT NOT NULL
status TEXT NOT NULL
attempt_count INTEGER NOT NULL DEFAULT 0
available_at TEXT NOT NULL
locked_at TEXT NULL
last_error TEXT NULL
created_at TEXT NOT NULL
updated_at TEXT NOT NULL
```

后台索引或媒体任务失败不能回滚已经提交的 Turn；它必须保持可重试并对用户可见。提交必需的 Chronicler 或摘要失败时，Turn 根本不会进入已提交状态，不适用本规则。

### 10.3 `schema_migrations`

```text
version TEXT PRIMARY KEY
applied_at TEXT NOT NULL
checksum TEXT NOT NULL
```

迁移脚本必须幂等执行并记录校验值。迁移失败时服务不得接受新的 Turn。

### 10.4 单用户账号和会话

MVP 不做多用户，但仍要求账号密码鉴权。账号名和密码哈希写在应用配置文件中；密码不得以明文写入配置，推荐使用 Argon2id 哈希。运行时启动后将配置映射为唯一一条 `auth_credentials` 记录；修改配置并重启后替换该记录并使旧 Session 失效：

```text
auth_credentials
id TEXT PRIMARY KEY
username TEXT NOT NULL UNIQUE
password_hash TEXT NOT NULL
created_at TEXT NOT NULL
updated_at TEXT NOT NULL

auth_sessions
id TEXT PRIMARY KEY
credential_id TEXT NOT NULL REFERENCES auth_credentials(id)
session_hash TEXT NOT NULL UNIQUE
created_at TEXT NOT NULL
expires_at TEXT NOT NULL
revoked_at TEXT NULL
```

数据库不保存明文密码或可直接使用的长期 Session Token。WebSocket 握手使用同一会话。

## 11. 必要索引

首版至少创建：

```text
narrative_events(branch_id, sequence)
narrative_events(turn_id)
state_mutations(branch_id, target_type, target_id)
state_projections(branch_id, namespace, target_type, target_id)
actor_memories(branch_id, subject_actor_id, status)
summaries(branch_id, level, covered_through_sequence)
turns(branch_id, created_at)
turn_attempts(turn_id, attempt_number)
beats(turn_attempt_id, ordinal)
runtime_events(branch_id, sequence)
background_jobs(status, available_at)
```

唯一约束必须保证：

- 同一 Branch 的正式 sequence 不重复。
- 同一 Turn 的 Attempt number 不重复。
- 同一 Attempt 的 Beat ordinal 不重复。
- 同一 Beat 的 Segment ordinal 不重复。
- 同一 Branch/Actor 只有一份控制状态。

## 12. Turn 正式提交事务

提交闸门执行一个 SQLite 事务：

1. 锁定并检查 Branch 的 `head_sequence`、`state_version` 和执行租约。
2. 检查 TurnAttempt、控制版本、资源快照和幂等键。
3. 将完整 Segment 映射为 NarrativeEvent。
4. 写入并校验 StateMutation。
5. 更新 StateProjection 和分支状态版本。
6. 写入 ActorMemory。
7. 写入 Turn 的正式 sequence 范围。
8. 创建 Checkpoint。
9. 更新 Branch head 和活动 Scene。
10. 写入本 Turn 已同步生成的 TurnSummary 和 StorySummary。
11. 在同一事务中写入待建立 FTS/向量索引的来源记录；LanceDB 的实际写入由提交后的可恢复索引任务完成。
12. 写入媒体处理任务。
13. 提交事务后再发送 `turn.committed`。

任何必需步骤失败，整个事务回滚。模型响应、工具结果和临时 Beat 仍保留在执行表中，供恢复或排查。

## 13. 分支查询和重建

查询 Branch 时不能简单使用 `branch_id = ?`：

```text
当前 Branch 自身数据
+ 父 Branch 在 fork_checkpoint.sequence 之前的数据
+ 更早祖先在各自分叉点之前的数据
```

实现可以维护可达历史缓存或物化祖先范围，但缓存必须绑定 Branch、Checkpoint、资源版本和状态版本。发现 projection 水位落后时，先按有效事件补齐，再向模型提供上下文。

## 14. 迁移顺序

建议按以下迁移拆分，保证每一步都能启动服务：

1. `schema_migrations`、`assets`、`asset_revisions`、`model_connections`。
2. `stories`、`execution_profiles`、`story_resource_bindings`。
3. `branches`、`scenes`、`actor_definitions`、`actor_instances`。
4. `actor_control_assignments`、`checkpoints`。
5. `turns`、`turn_attempts`、`plans`、`beats`、`narrative_segments`。
6. `narrative_events`、`state_mutations`、`state_projections`。
7. `actor_memories`、`summaries`、`context_snapshots`、`vector_documents`。
8. `model_request_attempts`、`tool_invocations`、`artifacts`、`runtime_events`。
9. `auth_credentials`、`auth_sessions`、`idempotency_keys`、`background_jobs` 和 FTS 相关表。

每次迁移都必须有：

- 新旧 schema 的启动检查。
- 最小插入和查询测试。
- 外键、唯一约束和索引检查。
- 失败时不接受 Turn 的行为。

## 15. 验收场景

| ID | 场景 | 必须满足的结果 |
| --- | --- | --- |
| S01 | 重启服务 | 已提交事件、Branch head、记忆和媒体引用仍存在 |
| S02 | 正常提交 Turn | 事件、mutation、projection、记忆和 Checkpoint 同事务成功 |
| S03 | 提交中途约束失败 | 所有正式写入回滚，临时 Attempt 仍可查询 |
| S04 | 重复提交幂等键 | 返回原结果，不产生重复事件或记忆 |
| S05 | 同一 Branch 并发提交 | 只有一个提交成功，另一个收到版本冲突或排队 |
| S06 | 从 Checkpoint 建立子 Branch | 子 Branch 查询不到父 Branch 分叉点之后的记录 |
| S07 | 上下文重试 | 可以读取同一 ContextSnapshot 的完整消息和来源 |
| S08 | 角色记忆查询 | 只能查询目标角色在当前 Branch 可达的记忆 |
| S09 | Chronicler 或摘要生成失败 | Turn 不提交；临时 Attempt 保留并可重试，Branch head 不前进 |
| S10 | 未知资源扩展字段 | 原始 payload 和 extension payload 均保留 |
