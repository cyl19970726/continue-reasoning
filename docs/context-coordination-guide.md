# Context Coordination Guide

## Overview

The HHH-AGI system uses multiple contexts to handle different aspects of agent functionality. This guide explains how to coordinate between the `interaction` and `coding` contexts to create seamless workflows.

## Architecture

### Context Hierarchy

```
Agent
├── Interaction Contexts
│   ├── InteractiveContext (user approval, execution modes)
│   ├── UserInputContext (user communication)
│   ├── PlanContext (task planning and tracking)
│   └── CoordinationContext (cross-context integration)
└── Coding Contexts
    ├── CodingContext (main coding capabilities)
    ├── FileSystemToolSet (file operations)
    ├── RuntimeToolSet (code execution)
    └── EditingStrategyToolSet (code editing)
```

### Integration Points

1. **Plan-Code Sync**: Coding tasks automatically create and update plan items
2. **Approval Workflow**: File operations can require user approval
3. **Prompt Consolidation**: Multiple context prompts are intelligently merged
4. **Progress Tracking**: Coding progress is reflected in planning status

## Configuration

### Integration Settings

The `CoordinationContext` provides these configuration options:

```typescript
integrationSettings: {
  autoCreatePlansForCoding: boolean,     // Auto-create plan items for coding tasks
  requireApprovalForFileOps: boolean,    // Require approval for file operations
  syncCodingProgress: boolean,           // Sync coding progress with plan status
  consolidatePrompts: boolean            // Consolidate prompts from multiple contexts
}
```

### Recommended Configurations

#### Development Mode (Safe)
```typescript
{
  autoCreatePlansForCoding: true,
  requireApprovalForFileOps: true,
  syncCodingProgress: true,
  consolidatePrompts: true
}
```

#### Production Mode (Efficient)
```typescript
{
  autoCreatePlansForCoding: true,
  requireApprovalForFileOps: false,
  syncCodingProgress: true,
  consolidatePrompts: true
}
```

#### Debugging Mode (Detailed)
```typescript
{
  autoCreatePlansForCoding: true,
  requireApprovalForFileOps: true,
  syncCodingProgress: true,
  consolidatePrompts: false  // Keep all prompts for debugging
}
```

## Workflow Patterns

### Pattern 1: Planned Coding Task

```typescript
// 1. Create plan item
create_plan({
  title: "Implement user authentication",
  description: "Add JWT-based authentication system",
  priority: "high",
  estimatedDuration: 120,
  tags: ["backend", "security"]
})

// 2. Start coding with sync
sync_coding_progress({
  planItemId: "plan-item-id",
  status: "started",
  filePath: "src/auth/auth.service.ts",
  operation: "create"
})

// 3. Request approval for risky operations
request_file_op_approval({
  operation: "delete",
  filePath: "src/legacy/old-auth.ts",
  reason: "Removing deprecated authentication",
  riskLevel: "medium"
})

// 4. Complete coding task
sync_coding_progress({
  planItemId: "plan-item-id",
  status: "completed",
  filePath: "src/auth/auth.service.ts"
})
```

### Pattern 2: Auto-Generated Coding Task

```typescript
// 1. Start coding (auto-creates plan item)
sync_coding_progress({
  status: "started",
  filePath: "src/components/Button.tsx",
  operation: "create",
  codingTaskId: "button_component"
})
// → Automatically creates plan item if autoCreatePlansForCoding is enabled

// 2. Continue with coding operations
// 3. Complete task
sync_coding_progress({
  codingTaskId: "button_component",
  status: "completed"
})
```

### Pattern 3: Multi-Context Workflow

```typescript
// 1. Consolidate prompts for focused work
consolidate_prompts({
  contextIds: ["coding_gemini", "plan-context", "interactive-context"],
  priority: "coding"
})

// 2. Work with consolidated context
// 3. Switch priority when needed
consolidate_prompts({
  contextIds: ["coding_gemini", "plan-context", "interactive-context"],
  priority: "interaction"
})
```

## Tool Reference

### Coordination Tools

#### `sync_coding_progress`
- **Purpose**: Sync coding task progress with plan management
- **When to use**: Start/end of coding tasks, progress updates
- **Auto-behavior**: Creates plan items if `autoCreatePlansForCoding` is enabled

#### `request_file_op_approval`
- **Purpose**: Request user approval for file operations
- **When to use**: Before delete, execute, or high-risk operations
- **Auto-behavior**: Auto-approves if `requireApprovalForFileOps` is disabled

#### `consolidate_prompts`
- **Purpose**: Create focused prompts from multiple contexts
- **When to use**: When multiple contexts are active and causing information overload
- **Options**: Priority-based consolidation (coding, interaction, balanced)

## Best Practices

### 1. Context Lifecycle Management

```typescript
// Start of session: Add all needed contexts
agent.addContext(CodingContext);
agent.addContext(PlanContext);
agent.addContext(CoordinationContext);

// During work: Use coordination tools
sync_coding_progress({ status: "started", ... });

// End of session: Clean up
agent_stop({ reason: "All tasks completed" });
```

### 2. Prompt Management

- Use `consolidate_prompts` when working with 3+ contexts
- Set priority based on current task focus
- Monitor prompt length to avoid token limits

### 3. Approval Workflow

- Enable approval for production environments
- Set appropriate risk levels for operations
- Use batch approvals for similar operations

### 4. Progress Tracking

- Always sync progress at task boundaries
- Use meaningful task IDs and descriptions
- Tag plan items for better organization

## Troubleshooting

### Common Issues

#### 1. Information Overload
**Problem**: Too many context prompts causing confusion
**Solution**: Use `consolidate_prompts` with appropriate priority

#### 2. Missing Plan Updates
**Problem**: Coding progress not reflected in plans
**Solution**: Ensure `syncCodingProgress` is enabled and use `sync_coding_progress`

#### 3. Blocked File Operations
**Problem**: File operations waiting for approval
**Solution**: Check `requireApprovalForFileOps` setting or handle approval requests

#### 4. Context Conflicts
**Problem**: Multiple contexts providing conflicting guidance
**Solution**: Use context priorities and consolidation

### Debug Commands

```typescript
// Check coordination settings
list_plans({ includeCompleted: false })

// View active workflows
// (Check coordination context data)

// Test prompt consolidation
consolidate_prompts({
  contextIds: ["all-active-contexts"],
  priority: "balanced"
})
```

## Integration Examples

### With CLI Agent

```typescript
// cli-with-agent.ts
import { 
  CoordinationContext, 
  PlanContext, 
  InteractiveContext 
} from './src/core/contexts/interaction';
import { CodingContext } from './src/core/contexts/coding';

// Add contexts to agent
agent.addContext(CodingContext);
agent.addContext(PlanContext);
agent.addContext(InteractiveContext);
agent.addContext(CoordinationContext);

// Configure coordination
const coordinationData = agent.contextManager
  .findContextById('coordination-context')
  .getData();

coordinationData.integrationSettings = {
  autoCreatePlansForCoding: true,
  requireApprovalForFileOps: false,
  syncCodingProgress: true,
  consolidatePrompts: true
};
```

### With Web Interface

```typescript
// Configure for web-based interaction
coordinationData.integrationSettings = {
  autoCreatePlansForCoding: true,
  requireApprovalForFileOps: true,  // Enable for web UI
  syncCodingProgress: true,
  consolidatePrompts: true
};
```

## Conclusion

The coordination system provides a flexible way to manage complex workflows involving both coding and interaction capabilities. By properly configuring the integration settings and following the recommended patterns, you can create smooth, efficient agent workflows that handle both technical tasks and user interaction seamlessly. 