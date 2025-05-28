# Coding Agent Prompt 优化指南

## 概述

本文档总结了 HHH-AGI coding agent 的 prompt 优化策略，旨在减少 token 使用、提高响应速度，并避免 rate limit 问题。

## 当前问题分析

### Token 使用过多
- **原始大小**: ~9320 tokens (37280 chars)
- **主要问题**: 
  - 冗余的系统说明文本
  - 详细的工具描述和 schema
  - 累积的历史数据
  - 重复的上下文信息

## 优化策略

### 1. Prompt 模式分级

我们实现了三种 prompt 模式：

#### Minimal 模式 (推荐用于测试)
- **特点**: 最简化的 prompt，只包含核心信息
- **适用**: 基础测试、开发调试、token 限制严格的场景
- **预期减少**: 60-70% token 使用

#### Standard 模式 (推荐用于生产)
- **特点**: 平衡的 prompt，包含必要的指导信息
- **适用**: 日常使用、复杂任务处理
- **预期减少**: 30-40% token 使用

#### Detailed 模式 (原始模式)
- **特点**: 完整的 prompt，包含所有说明和指导
- **适用**: 复杂场景、需要详细指导的任务

### 2. Context 优化

#### Coding Context
```typescript
// 优化前: 详细的文件列表和 diff 内容
// 优化后: 只显示文件数量和最近文件名
Workspace: /path/to/workspace
Editing: whole_file
Sandbox: no-sandbox
Open files: 3
Recent: helpers.js, app.json, README.md
Active diffs: 1
```

#### Plan Context
```typescript
// 优化前: 完整的计划项目列表和详细状态
// 优化后: 简化的统计信息
Plans: 5 total, 2 active, 3 done
Active: Implement feature X, Fix bug Y
Priority pending: Add tests
```

#### Tool Context
```typescript
// 优化前: 详细的工具执行规则说明
// 优化后: 简化的规则列表
------ ToolCallContext ------
Tools: [tool definitions]
Calls: [recent calls]
Results: [results]

Rules:
- Sync tools (async:false): Execute immediately, wait for result
- Async tools (async:true): Queue in background, don't wait
- Check call_id to avoid duplicate calls
```

### 3. 使用方法

#### 在代码中启用优化
```typescript
const contextManager = new ContextManager(
  'cli-context-manager', 
  'CLI Context Manager', 
  'Manages contexts for CLI agent', 
  {},
  { mode: 'minimal', maxTokens: 8000 } // 启用 minimal 模式
);
```

#### 在测试中使用
```bash
# 使用优化的测试运行器
node run-optimized-test.js development level1-basic-operations
```

## 模型选择建议

### 开发和测试阶段

#### 1. GPT-4o-mini (强烈推荐)
- **优势**: 
  - 成本最低 (比 GPT-4 便宜 60 倍)
  - 速度快
  - Rate limit 相对宽松
  - 对基础编程任务表现良好
- **适用**: Level 1-2 测试，日常开发
- **配置**: 
  ```json
  {
    "model": "gpt-4o-mini",
    "rateLimitDelay": 1000,
    "maxTokens": 4000
  }
  ```

#### 2. Claude-3-Haiku (备选)
- **优势**:
  - 速度极快
  - 成本较低
  - 对代码理解能力强
- **劣势**: 
  - Anthropic API 的 rate limit 较严格
  - 需要不同的 API key
- **适用**: 需要快速响应的场景

#### 3. GPT-3.5-Turbo (预算选择)
- **优势**: 成本最低
- **劣势**: 能力有限，可能无法完成复杂任务
- **适用**: 非常基础的测试

### 生产阶段

#### 1. GPT-4o (复杂任务)
- **适用**: Level 3-4 测试，复杂功能开发
- **配置**: 更高的 rate limit delay

#### 2. Claude-3.5-Sonnet (高质量需求)
- **适用**: 需要高质量代码生成的场景

## Rate Limit 处理策略

### 1. 自动重试机制
```javascript
async function runTestWithRetry(testCommand, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await runTest(testCommand);
      if (result.success) return result;
      
      // 指数退避
      const delay = baseDelay * Math.pow(2, attempt - 1);
      await sleep(delay);
    } catch (error) {
      if (attempt === maxRetries) throw error;
    }
  }
}
```

### 2. 智能延迟
- **基础延迟**: 1-3 秒
- **Rate limit 检测**: 自动增加延迟
- **指数退避**: 2^n 倍数增长

### 3. 并发控制
- **最大并发**: 1 (避免 rate limit)
- **队列处理**: 顺序执行测试

## 测试配置

### 快速测试配置
```json
{
  "model": "gpt-4o-mini",
  "promptOptimization": "minimal",
  "rateLimitDelay": 1000,
  "maxRetries": 3,
  "timeoutPerTest": 60000
}
```

### 生产测试配置
```json
{
  "model": "gpt-4o",
  "promptOptimization": "standard", 
  "rateLimitDelay": 3000,
  "maxRetries": 5,
  "timeoutPerTest": 120000
}
```

## 性能对比

| 模式 | Token 减少 | 响应速度 | 成本节省 | 适用场景 |
|------|------------|----------|----------|----------|
| Minimal | 60-70% | +50% | 60-70% | 开发测试 |
| Standard | 30-40% | +25% | 30-40% | 日常使用 |
| Detailed | 0% | 基准 | 基准 | 复杂任务 |

## 使用建议

### 开发阶段
1. 使用 `minimal` prompt 模式
2. 选择 `gpt-4o-mini` 模型
3. 设置较短的 rate limit delay
4. 专注于基础功能测试

### 测试阶段  
1. 使用 `standard` prompt 模式
2. 选择 `claude-3-haiku` 或 `gpt-4o-mini`
3. 增加重试机制
4. 测试更复杂的场景

### 生产阶段
1. 根据任务复杂度选择 prompt 模式
2. 使用 `gpt-4o` 处理复杂任务
3. 设置保守的 rate limit 策略
4. 启用完整的错误处理和重试

## 监控和调优

### 关键指标
- Token 使用量
- 响应时间
- 成功率
- 成本

### 调优建议
1. 定期检查 prompt 大小
2. 监控 rate limit 触发频率
3. 根据任务类型调整模型选择
4. 优化 context 数据结构

通过这些优化策略，我们可以显著减少 token 使用、提高响应速度，并有效避免 rate limit 问题，同时保持 coding agent 的核心功能。 