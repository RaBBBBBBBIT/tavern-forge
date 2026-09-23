# 核心状态 JSON Schema

- 版本：0.1
- 日期：2026-09-23
- 状态：v0.1 核心状态规格
- 用途：定义 Runtime、Chronicler、插件和前端状态编辑器共同使用的核心结构化状态。
- 原则：只结构化需要查询、过滤、校验或稳定注入上下文的信息；伤势不作为 MVP 专用字段。

## 1. 范围

核心状态包括：故事时间、地点、在场角色、角色位置和目标、物品位置与归属、角色关系、活动 Scene 和少量公开标记。角色秘密、信念、怀疑和个人经历仍然属于 `ActorMemory`，不能塞进共享状态。

状态由 `StateMutation` 提出，由 Runtime 校验后生成 `StateProjection`。模型不能直接替换整个 `CoreState`。

## 2. 顶层 Schema

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "narrative/core-state/0.1",
  "title": "CoreState",
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "storyTime": { "type": ["string", "null"] },
    "location": { "type": ["string", "null"] },
    "presentActorIds": {
      "type": "array",
      "items": { "type": "string" },
      "uniqueItems": true
    },
    "actorStates": {
      "type": "object",
      "additionalProperties": { "$ref": "#/$defs/ActorState" }
    },
    "items": {
      "type": "object",
      "additionalProperties": { "$ref": "#/$defs/ItemState" }
    },
    "relationships": {
      "type": "array",
      "items": { "$ref": "#/$defs/RelationshipState" }
    },
    "scene": { "$ref": "#/$defs/SceneState" }
  },
  "required": ["presentActorIds", "actorStates", "items", "relationships", "scene"],
  "$defs": {
    "Scalar": { "type": ["boolean", "number", "string", "null"] },
    "Flags": {
      "type": "object",
      "additionalProperties": { "$ref": "#/$defs/Scalar" }
    },
    "ActorState": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "actorId": { "type": "string" },
        "locationId": { "type": ["string", "null"] },
        "carriedItemIds": { "type": "array", "items": { "type": "string" }, "uniqueItems": true },
        "relationshipRefs": { "type": "array", "items": { "type": "string" }, "uniqueItems": true },
        "currentGoals": { "type": "array", "items": { "type": "string" } },
        "flags": { "$ref": "#/$defs/Flags" }
      },
      "required": ["actorId", "carriedItemIds", "relationshipRefs", "currentGoals", "flags"]
    },
    "ItemState": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "itemId": { "type": "string" },
        "locationId": { "type": ["string", "null"] },
        "ownerActorId": { "type": ["string", "null"] },
        "visibility": { "enum": ["public", "private", "hidden"] },
        "flags": { "$ref": "#/$defs/Flags" }
      },
      "required": ["itemId", "visibility", "flags"]
    },
    "RelationshipState": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "sourceActorId": { "type": "string" },
        "targetActorId": { "type": "string" },
        "type": { "type": "string" },
        "strength": { "type": ["number", "null"], "minimum": -1, "maximum": 1 },
        "flags": { "$ref": "#/$defs/Flags" }
      },
      "required": ["sourceActorId", "targetActorId", "type"]
    },
    "SceneState": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "sceneId": { "type": "string" },
        "status": { "enum": ["active", "completed"] },
        "location": { "type": ["string", "null"] },
        "participantActorIds": { "type": "array", "items": { "type": "string" }, "uniqueItems": true },
        "publicFlags": { "$ref": "#/$defs/Flags" }
      },
      "required": ["sceneId", "status", "participantActorIds", "publicFlags"]
    }
  }
}
```

## 3. 使用规则

- `presentActorIds` 表示当前公共场景中可参与观察的角色，不代表这些角色一定在下一 Beat 发言。
- `location` 和 `storyTime` 是公共场景摘要；角色的精确位置可以放在 `actorStates`。
- `visibility` 只表达物品的公共可见等级；角色是否知道物品仍由事件、观察规则和 ActorMemory 决定。
- `currentGoals` 是可供运行时查询的公开或半公开目标。角色秘密目标应进入该角色记忆或私有状态，不放入公共 CoreState。
- `strength` 是可选的粗粒度关系值，不要求每种关系都能量化；无法稳定量化时使用 `flags` 或事件表达。
- 伤势、情绪、怀疑等容易被模型误判或需要复杂语义的内容，MVP 使用 NarrativeEvent、ActorMemory 或摘要表达，不新增专用核心字段。

## 4. StateMutation 约束

```ts
interface StateMutation {
  id: string;
  namespace: "core" | `plugin:${string}`;
  operation: "set" | "replace" | "add" | "remove";
  path: string;
  value?: unknown;
  sourceEventIds: string[];
  expectedStateVersion: number;
}
```

Runtime 必须检查：路径属于允许的 namespace、值通过对应 Schema、来源事件存在、状态版本未过期、Branch 与 Turn 匹配。Scene 创建、结束和切换也必须作为核心状态 mutation 走同一提交闸门。

## 5. 插件状态

插件不得向 `core` namespace 写入未声明的字段。插件使用自己的 `plugin:<id>` namespace，并遵守《插件与扩展接口规格》中的版本化 JSON 约定。插件状态可以引用核心 Actor、Item、Scene ID，但不能通过引用关系获得核心数据读取权限。

## 6. MVP 验收

- Chronicler 可以生成通过 Schema 校验的 CoreState mutation。
- 用户可以查看和修改全部核心状态，修改有来源、有版本并可审计。
- SceneMutation 通过 Runtime 提交，模型不能绕过提交闸门。
- Actor 上下文只接收对该角色可见的 CoreState 子集。
- 从事件重建 StateProjection 后，得到的核心状态与正式提交版本一致。
