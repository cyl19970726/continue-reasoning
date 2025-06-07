# 简化的Snapshot系统设计 (v2)

## 概述

基于对现有snapshot系统的分析，我们设计了一个更简洁、专注的快照系统。该系统专注于文件修改操作的跟踪，提供良好的用户体验和开发者友好的API。

## 设计原则

### 核心原则
1. **专注性** - 只跟踪会修改文件的操作，读取操作不纳入snapshot
2. **简洁性** - 避免过度设计，采用简单的文件存储
3. **用户体验** - 通过milestone提供高层次的任务完成总结
4. **开发者友好** - 提供dryRun支持和完整的历史查看

### 架构决策
- **存储位置**: `.continue-reasoning/snapshots/` 文件夹
- **存储格式**: JSON文件，每个操作一个文件
- **索引机制**: 简单的index.json文件
- **清理策略**: 基于时间和数量的自动清理

## 文件结构

```
.continue-reasoning/
├── snapshots/
│   ├── 2025/01/06/           # 按日期分组
│   │   ├── 143052_abc123.json  # 时间_短ID.json
│   │   ├── 143055_def456.json
│   │   └── ...
│   ├── milestones/            # milestone存储
│   │   ├── milestone_001.json
│   │   ├── milestone_002.json
│   │   └── ...
│   └── index.json            # 全局索引
```

## 数据格式

### Snapshot格式
```json
{
  "id": "abc123",
  "timestamp": "2025-01-06T14:30:52.123Z",
  "description": "Add user authentication function",
  "tool": "ApplyEditBlock",
  "affectedFiles": ["src/auth.ts"],
  "diff": "--- a/src/auth.ts\n+++ b/src/auth.ts\n@@ -10,0 +10,5 @@\n+export function authenticate(token: string) {\n+  // Implementation\n+  return validateToken(token);\n+}",
  "reverseDiff": "--- a/src/auth.ts\n+++ b/src/auth.ts\n@@ -10,5 +10,0 @@\n-export function authenticate(token: string) {\n-  // Implementation\n-  return validateToken(token);\n-}",
  "context": {
    "sessionId": "session_123",
    "workspacePath": "/Users/user/project",
    "toolParams": {
      "searchBlock": "// TODO: Add auth",
      "replaceBlock": "export function authenticate..."
    }
  },
  "metadata": {
    "filesSizeBytes": 1234,
    "linesChanged": 5,
    "executionTimeMs": 45
  }
}
```

### Milestone格式
```json
{
  "id": "milestone_001",
  "timestamp": "2025-01-06T15:00:00.123Z",
  "title": "完成用户认证功能",
  "description": "实现了用户登录、注册和权限验证功能",
  "snapshotIds": ["abc123", "def456", "ghi789"],
  "summary": {
    "totalOperations": 3,
    "affectedFiles": ["src/auth.ts", "src/login.tsx", "src/types.ts"],
    "linesAdded": 150,
    "linesRemoved": 20
  },
  "combinedDiff": "// 所有相关操作的合并diff",
  "tags": ["feature", "authentication", "user-management"]
}
```

## 工具集API

### 1. 编辑工具增强 (所有编辑工具都支持dryRun)

所有现有的编辑工具增加dryRun支持：

```typescript
// ApplyEditBlock, ApplyWholeFileEdit, ApplyRangedEdit, ApplyUnifiedDiff, Delete, CreateDirectory
const CommonParams = z.object({
  // ... 现有参数
  dryRun: z.boolean().optional().describe("如果为true，只生成预览不实际执行操作")
});

const CommonReturns = z.object({
  // ... 现有返回值
  snapshotId: z.string().optional().describe("创建的快照ID (dryRun时为null)"),
  previewDiff: z.string().optional().describe("预览的diff内容")
});
```

### 2. ReadSnapshotDiff - 读取快照diff

```typescript
const ReadSnapshotDiffParams = z.object({
  snapshotId: z.string().describe("快照ID"),
  format: z.enum(['unified', 'context', 'git']).optional().describe("diff格式，默认unified")
});

const ReadSnapshotDiffReturns = z.object({
  success: z.boolean(),
  diff: z.string().optional().describe("diff内容"),
  snapshot: z.object({
    id: z.string(),
    timestamp: z.string(),
    description: z.string(),
    tool: z.string(),
    affectedFiles: z.array(z.string())
  }).optional().describe("快照基本信息")
});
```

### 3. GetEditHistory - 获取编辑历史

```typescript
const GetEditHistoryParams = z.object({
  limit: z.number().int().min(1).max(100).optional().describe("返回的历史记录数量限制，默认20"),
  includeDiffs: z.boolean().optional().describe("是否包含diff内容，默认false"),
  since: z.string().optional().describe("从指定时间开始的历史 (ISO格式)"),
  until: z.string().optional().describe("到指定时间的历史 (ISO格式)"),
  toolFilter: z.array(z.string()).optional().describe("按工具类型过滤"),
  fileFilter: z.string().optional().describe("按文件路径过滤 (支持glob pattern)")
});

const GetEditHistoryReturns = z.object({
  success: z.boolean(),
  history: z.array(z.object({
    id: z.string(),
    timestamp: z.string(),
    description: z.string(),
    tool: z.string(),
    affectedFiles: z.array(z.string()),
    diff: z.string().optional(), // 仅在includeDiffs=true时包含
    metadata: z.object({
      linesChanged: z.number(),
      executionTimeMs: z.number()
    })
  })),
  pagination: z.object({
    total: z.number(),
    hasMore: z.boolean(),
    nextCursor: z.string().optional()
  })
});
```

### 4. ReverseOp - 回滚操作

```typescript
const ReverseOpParams = z.object({
  snapshotId: z.string().describe("要回滚的快照ID"),
  dryRun: z.boolean().optional().describe("是否只是预览不实际执行，默认false"),
  targetSnapshot: z.string().optional().describe("回滚到指定快照状态 (回滚多个操作)"),
  force: z.boolean().optional().describe("是否强制回滚，忽略冲突检测，默认false")
});

const ReverseOpReturns = z.object({
  success: z.boolean(),
  message: z.string().optional(),
  reversedDiff: z.string().optional().describe("实际应用的回滚diff"),
  affectedFiles: z.array(z.string()).optional(),
  conflicts: z.array(z.string()).optional().describe("检测到的冲突"),
  newSnapshotId: z.string().optional().describe("回滚操作本身的快照ID")
});
```

### 5. CreateMilestone - 创建里程碑

```typescript
const CreateMilestoneParams = z.object({
  title: z.string().describe("里程碑标题"),
  description: z.string().describe("里程碑描述"),
  snapshotIds: z.array(z.string()).describe("包含的快照ID列表"),
  tags: z.array(z.string()).optional().describe("标签")
});

const CreateMilestoneReturns = z.object({
  success: z.boolean(),
  milestoneId: z.string().optional(),
  summary: z.object({
    totalOperations: z.number(),
    affectedFiles: z.array(z.string()),
    linesAdded: z.number(),
    linesRemoved: z.number()
  }).optional()
});
```

### 6. GetMilestones - 获取里程碑列表

```typescript
const GetMilestonesParams = z.object({
  includeDiffs: z.boolean().optional().describe("是否包含合并的diff，默认false"),
  tags: z.array(z.string()).optional().describe("按标签过滤")
});

const GetMilestonesReturns = z.object({
  success: z.boolean(),
  milestones: z.array(z.object({
    id: z.string(),
    title: z.string(),
    description: z.string(),
    timestamp: z.string(),
    summary: z.object({
      totalOperations: z.number(),
      affectedFiles: z.array(z.string()),
      linesAdded: z.number(),
      linesRemoved: z.number()
    }),
    combinedDiff: z.string().optional(), // 仅在includeDiffs=true时包含
    tags: z.array(z.string())
  }))
});
```

## Milestone系统设计

### 用户体验流程

1. **任务完成总结**
   ```
   🎉 任务完成！我为您实现了用户认证功能，创建了以下里程碑：
   
   📍 里程碑1: 完成用户认证功能
   - 3个操作，修改了3个文件
   - 添加了150行代码，删除了20行
   - [查看详细diff]
   
   📍 里程碑2: 添加权限验证
   - 2个操作，修改了2个文件  
   - 添加了80行代码
   - [查看详细diff]
   ```

2. **里程碑查看**
   - 用户可以选择查看每个里程碑的合并diff
   - 可以看到该里程碑包含的所有操作
   - 可以选择性回滚整个里程碑

### 自动里程碑创建

智能检测自然的里程碑边界：
- 功能完成后的测试通过
- 用户明确表示某个阶段完成
- 长时间间隔后的新操作
- 不同模块/文件的操作切换

## Git集成

### Diff格式兼容性

我们的diff格式已经与Git高度兼容，现有实现优势：

1. **路径格式 ✅ 已实现**
   ```typescript
   // diff.ts 已经使用正确的 a/b 前缀
   const oldPath = options?.oldPath || 'a/file';
   const newPath = options?.newPath || 'b/file';
   ```

2. **文件哈希 📝 待增强**
   ```typescript
   // 可以在diff生成时计算文件哈希
   import crypto from 'crypto';
   
   function calculateFileHash(content: string): string {
     return crypto.createHash('sha1').update(content).digest('hex').substring(0, 7);
   }
   ```

3. **时间戳格式 📝 Git兼容**
   ```typescript
   // 可选择使用Git格式时间戳
   function getGitTimestamp(): string {
     const now = new Date();
     const timestamp = Math.floor(now.getTime() / 1000);
     const offset = -now.getTimezoneOffset();
     const sign = offset >= 0 ? '+' : '-';
     const hours = Math.floor(Math.abs(offset) / 60);
     const minutes = Math.abs(offset) % 60;
     return `${timestamp} ${sign}${hours.toString().padStart(2, '0')}${minutes.toString().padStart(2, '0')}`;
   }
   ```

### 现有优势

我们的diff.ts已经实现了：
- ✅ **标准unified diff格式** (--- +++ @@ 语法)
- ✅ **正确的路径前缀** (a/path, b/path)
- ✅ **文件创建/删除处理** (/dev/null 支持)
- ✅ **多文件diff解析** (parseMultiFileDiff)
- ✅ **diff验证和错误分析** (validateDiffFormat, analyzePatchResult)
- ✅ **diff反转功能** (reverseDiff)
- ✅ **时间戳清理** (cleanDiffTimestamps)

### 测试策略

基于现有的diff.test.ts，我们已经有了完善的测试覆盖：

```typescript
// 现有的测试已经覆盖Git兼容性
describe('Git Integration Tests', () => {
  describe('Path Format Compatibility', () => {
    it('should generate git-compatible paths', async () => {
      // 测试 a/path, b/path 格式
      const diff = await generateUnifiedDiff('old', 'new', {
        oldPath: 'a/file.js',
        newPath: 'b/file.js'
      });
      expect(diff).toContain('--- a/file.js');
      expect(diff).toContain('+++ b/file.js');
    });
  });

  describe('File Hash Integration', () => {
    it('should add file hashes to diff headers', () => {
      // 增强：添加文件哈希测试
      const diffWithHash = addFileHashesToDiff(originalDiff);
      expect(diffWithHash).toMatch(/index [a-f0-9]{7}\.\.[a-f0-9]{7}/);
    });
  });

  describe('Multi-file Diff Parsing', () => {
    it('should parse git multi-file diffs correctly', () => {
      // 现有测试已覆盖
      const gitDiff = `diff --git a/file.txt b/file.txt
index 1234567..abcdefg 100644
--- a/file.txt
+++ b/file.txt
@@ -1 +1 @@
-Old
+New`;
      
      const results = parseMultiFileDiff(gitDiff);
      expect(results).toHaveLength(1);
      expect(results[0].oldPath).toBe('a/file.txt');
    });
  });

  describe('Timestamp Handling', () => {
    it('should clean git timestamps from diffs', () => {
      // 现有测试已覆盖
      const diffWithTimestamps = `--- a/file.txt\t2025-01-29 12:34:56
+++ b/file.txt\t2025-01-29 12:35:00`;
      
      const cleaned = cleanDiffTimestamps(diffWithTimestamps);
      expect(cleaned).not.toContain('2025-01-29');
    });
  });
});
```

## 实施计划

### Phase 1: 核心功能
1. 实现简化的SnapshotManager
2. 为所有编辑工具添加dryRun和snapshot创建
3. 实现ReadSnapshotDiff和GetEditHistory

### Phase 2: 高级功能  
1. 实现ReverseOp工具
2. 实现Milestone系统
3. 添加Git集成和格式转换

### Phase 3: 优化
1. 性能优化和测试
2. 自动清理和存储管理
3. 用户体验优化

## 总结

这个简化的snapshot系统专注于核心需求：
- 跟踪文件修改操作
- 提供回滚能力
- 良好的用户体验
- 与Git生态的兼容性

通过里程碑系统，用户可以更好地理解任务的完成进度和代码变更的逻辑分组。