# ToolSet 架构文档

## 概述
ToolSet 是工具的逻辑分组，帮助 Agent 组织和管理相关工具。它支持动态激活/停用，并允许 Context 定义专用工具集。

## 核心组件
- **ToolSet**: 工具集合接口，包含名称、描述和工具列表
- **ToolSetContext**: 管理工具集的激活状态
- **Context.toolSet()**: 上下文提供的工具集方法

## 架构图

```
┌─────────────────────────────────────────────┐
│                 ToolSet                      │
├─────────────────────────────────────────────┤
│ - name: string                              │
│ - description: string                       │
│ - tools: AnyTool[]                          │
│ - active: boolean                           │
│ - source: string                            │
└────────────┬────────────────────────────────┘
             │ 管理
             ▼
┌─────────────────────────────────────────────┐
│              ToolSetContext                  │
├─────────────────────────────────────────────┤
│ - ListToolSetTool                           │
│ - ActivateToolSetTool                       │
│ - DeactivateToolSetTool                     │
└────────────┬────────────────────────────────┘
             │ 使用
             ▼
┌─────────────────────────────────────────────┐
│                 Agent                        │
├─────────────────────────────────────────────┤
│ - toolSets: ToolSet[]                       │
│ - addToolSet()                              │
│ - listToolSets()                            │
│ - activateToolSets()                        │
│ - deactivateToolSets()                      │
│ - getActiveTools()                          │
└─────────────────────────────────────────────┘
```

## ToolSet 与 Context 关系图

```
┌─────────────────────┐      ┌─────────────────────┐
│      Context        │      │      Agent          │
├─────────────────────┤      ├─────────────────────┤
│                     │      │                     │
│  - toolSet() ───────┼─────►│  - toolSets[]       │
│                     │      │                     │
└─────────────────────┘      └─────────────────────┘
           ▲                           │
           │                           │
           │                           │
           │                           ▼
┌─────────────────────┐      ┌─────────────────────┐
│  IRAGEnabledContext │      │      ToolSet        │
├─────────────────────┤      ├─────────────────────┤
│                     │      │  - name             │
│                     │◄─────┤  - description      │
│                     │      │  - tools[]          │
└─────────────────────┘      │  - active           │
                             │  - source           │
                             └─────────────────────┘
```

## 增强的 Context-ToolSet 模型

```
┌─────────────────────┐      ┌─────────────────────┐
│      Context        │      │      Agent          │
├─────────────────────┤      ├─────────────────────┤
│                     │      │                     │
│  - toolSet() ───────┼─────►│  - toolSets[]       │
│                     │      │                     │
└─────────────────────┘      └─────────────────────┘
           │                           │
           │                           │
           │                           │
           ▼                           ▼
┌─────────────────────┐      ┌─────────────────────┐
│    单个 ToolSet     │      │    多个 ToolSet     │
├─────────────────────┤      ├─────────────────────┤
│  - name: "Primary"  │      │  - name: "Query"    │
│  - active: true     │      │  - active: true     │
│  - tools: [...]     │      │  - tools: [...]     │
└─────────────────────┘      ├─────────────────────┤
                             │  - name: "Admin"    │
                             │  - active: false    │
                             │  - tools: [...]     │
                             └─────────────────────┘
```

## 工具集管理流程图

```
┌──────────┐      ┌───────────────┐      ┌───────────────┐
│  Agent   │      │  Contexts     │      │   ToolSets    │
└────┬─────┘      └───────┬───────┘      └───────┬───────┘
     │                    │                      │
     │ 1. 初始化          │                      │
     ├───┐                │                      │
     │   │                │                      │
     │◄──┘                │                      │
     │                    │                      │
     │ 2. 注册Contexts    │                      │
     ├─────────────────►  │                      │
     │                    │                      │
     │ 3. 收集ToolSets    │                      │
     ├─────────────────►  │                      │
     │                    │ 4. 返回ToolSets      │
     │                    │◄─────────────────────┤
     │                    │                      │
     │ 5. 存储ToolSets    │                      │
     │◄────────────────── │                      │
     │                    │                      │
     │ 6. 处理用户请求    │                      │
     │    需要工具        │                      │
     ├───┐                │                      │
     │   │                │                      │
     │◄──┘                │                      │
     │                    │                      │
     │ 7. 获取激活工具集  │                      │
     ├────────────────────┼─────────────────────►│
     │                    │                      │
     │                    │ 8. 返回活动工具      │
     │                    │◄─────────────────────┤
     │                    │                      │
     │ 9. 使用工具        │                      │
     │◄────────────────── │                      │
     │                    │                      │
     │ 10.激活/停用工具集 │                      │
     │    (可选)          │                      │
     ├────────────────────┼─────────────────────►│
     │                    │                      │
     │                    │ 11.更新激活状态      │
     │                    │◄─────────────────────┤
     │                    │                      │
└─────┴────────────────┴──────────────────────┘
```

## ToolSet 接口详解

ToolSet 接口定义了如何组织和管理工具集合：

```typescript
export interface ToolSet {
    name: string;              // 工具集唯一标识符，通常与Context ID对应
    description: string;       // 工具集描述，用于帮助LLM理解工具集用途
    tools: AnyTool[];          // 包含的工具列表
    active: boolean;           // 当前是否激活
    source?: string;           // 工具集来源，如'local'、'mcp'等
}
```

### 各字段说明：

- **name**: 工具集的唯一标识符，通常与相关Context的ID对应，如`WebSearchContext`对应`WebSearchTools`
- **description**: 详细描述工具集的用途和能力，帮助LLM正确选择工具集
- **tools**: 包含的工具列表，所有工具必须符合ITool接口规范
- **active**: 标识该工具集是否当前激活，只有激活的工具集中的工具才能被使用
- **source**: 指示工具集的来源，如本地定义('local')、MCP服务器('mcp')等

## 工具集管理

### Agent中的工具集管理

Agent提供以下方法来管理工具集：

```typescript
// 添加工具集
addToolSet(toolSet: ToolSet): void

// 列出所有工具集
listToolSets(): ToolSet[]

// 激活指定的工具集
activateToolSets(names: string[]): void

// 停用指定的工具集
deactivateToolSets(names: string[]): void

// 获取所有激活工具集中的工具
getActiveTools(): AnyTool[]
```

### 工具集上下文(ToolSetContext)

ToolSetContext提供了三个工具，允许LLM直接管理工具集：

1. **list_toolset**: 列出所有可用的工具集及其激活状态
2. **activate_toolset**: 激活指定的工具集
3. **deactivate_toolset**: 停用指定的工具集

这使LLM能够根据当前任务需求动态调整可用工具。

## 工具集设计最佳实践

1. **逻辑分组**：将相关功能的工具组织在同一工具集中
2. **清晰描述**：提供详细的工具集描述，包括使用场景
3. **默认激活状态**：设置合理的默认激活状态，避免过多工具干扰LLM
4. **Context关联**：工具集名称与相关Context ID保持一致，实现自动关联
5. **动态管理**：根据任务需求动态激活/停用工具集，提高效率

## 多工具集支持

Context现在增强了工具集提供能力，可以返回单个或多个工具集：

### 1. 返回单个工具集

最简单的实现方式是返回单个工具集：

```typescript
toolSetFn: () => {
    // 返回单个工具集
    return {
        name: "PrimaryTools",
        description: "Primary tools for this context",
        tools: [/* ... */],
        active: true,
        source: "my-context"
    };
}
```

### 2. 返回多个工具集

增强的功能允许Context返回多个工具集，实现更细粒度的工具管理：

```typescript
toolSetFn: () => {
    return [
        {
            name: "QueryTools",
            description: "Tools for querying data",
            tools: [/* ... */],
            active: true,
            source: "my-context"
        },
        {
            name: "AdminTools",
            description: "Tools for administrative tasks",
            tools: [/* ... */],
            active: false,  // 默认不激活
            source: "my-context"
        }
    ];
}
```

### 3. 条件性返回工具集

Context 还可以根据其内部状态有条件地返回工具集：

```typescript
toolSetFn: function() {
    const toolSets = [];
    
    // 基本工具集始终提供
    toolSets.push({
        name: "BasicTools",
        description: "Essential tools for this context",
        tools: [/* ... */],
        active: true,
        source: "my-context"
    });
    
    // 根据条件提供额外工具集
    if (this.data.adminMode) {
        toolSets.push({
            name: "AdminTools",
            description: "Administrative tools (restricted)",
            tools: [/* ... */],
            active: true,
            source: "my-context"
        });
    }
    
    return toolSets;
}
```

## 工具集激活状态管理

Agent 负责管理所有工具集的激活状态，确保只有激活的工具集被使用：

1. **初始状态**：Context 可以设置工具集的初始激活状态
2. **显式管理**：Agent 提供 `activateToolSets` 和 `deactivateToolSets` 方法管理状态
3. **LLM控制**：LLM 可以通过 ToolSetContext 提供的工具管理激活状态
4. **隔离机制**：多个工具集可以独立激活或停用，提供更细粒度的控制

## 工具集来源管理

ToolSet 通过 `source` 字段标识工具集的来源，常见来源包括：

1. **local**: 由系统本地定义的工具集
2. **mcp**: 通过 MCP 服务器动态提供的工具集
3. **context-id**: 由特定 Context 提供的专用工具集

该字段帮助 Agent 和 LLM 理解工具集的来源，方便管理和使用。

这种设计允许上下文提供多套不同用途的工具，并由LLM根据需要激活相应的工具集。 