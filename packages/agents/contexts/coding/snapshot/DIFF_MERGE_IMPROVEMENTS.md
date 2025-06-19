# Diff Merge Improvements for createMilestone

## 🎯 问题描述

之前的 `createMilestone` 方法使用简单的字符串拼接来合并多个快照的 diff：

```typescript
// ❌ 错误的方式 - 简单字符串拼接
const combinedDiff = snapshots.map(s => s.diff).join('\n');
```

这种方式存在以下问题：
1. **不符合 diff 格式规范** - 直接拼接可能产生无效的 diff
2. **无法处理同一文件的多次修改** - 同一文件的多个 diff 会产生冲突
3. **缺少正确的文件头部** - 合并后的 diff 可能缺少必要的头部信息
4. **无法应用** - 生成的 diff 可能无法被 patch 工具正确应用

## 🔧 解决方案

### 1. **依赖 diff.ts 的专业功能**

使用 `diff.ts` 中的 `parseMultiFileDiff` 和相关工具函数：

```typescript
// ✅ 正确的方式 - 使用专业的 diff 解析和合并
const { parseMultiFileDiff, ensureDiffLineEnding } = await import('../runtime/diff');
```

### 2. **智能 Diff 合并算法**

实现了三层合并策略：

#### **第一层：按文件分组**
```typescript
// 按文件路径分组，处理同一文件的多次修改
const fileChanges = new Map<string, {
  oldPath: string;
  newPath: string;
  diffParts: string[];
}>();
```

#### **第二层：解析每个 Diff**
```typescript
for (const diff of diffs) {
  const fileDiffs = parseMultiFileDiff(diff);
  // 将每个文件的 diff 部分收集到对应的组中
}
```

#### **第三层：合并同文件的多个修改**
```typescript
// 对于同一文件的多个 diff 部分，智能合并所有 hunks
const mergedDiff = await this.mergeFileDiffs(
  filePath, oldPath, newPath, diffParts
);
```

### 3. **核心改进功能**

#### **`mergeDiffs()` 方法**
- **多文件支持**：正确处理涉及多个文件的 diff
- **同文件合并**：智能合并同一文件的多次修改
- **格式验证**：确保生成的 diff 符合标准格式
- **错误处理**：优雅处理格式错误的 diff

#### **`extractCleanFilePath()` 方法**
- **路径标准化**：去除 `a/` 和 `b/` 前缀
- **特殊情况处理**：正确处理文件创建 (`/dev/null`) 和删除

#### **`mergeFileDiffs()` 方法**
- **Hunk 合并**：将同一文件的多个 hunk 合并为一个连贯的 diff
- **头部处理**：确保正确的文件头部信息
- **格式保证**：维护 diff 的正确格式

## 🧪 测试覆盖

创建了全面的测试套件 `diff-merge.test.ts`：

### **单元测试**
- ✅ 空 diff 数组处理
- ✅ 单个 diff 保持不变
- ✅ 不同文件的 diff 合并
- ✅ 同一文件的多次修改合并
- ✅ 文件创建和删除处理
- ✅ 格式错误的 diff 优雅处理

### **集成测试**
- ✅ 与 `createMilestone` 的完整集成
- ✅ 多文件里程碑创建
- ✅ 同文件多次修改的里程碑

### **边界情况测试**
- ✅ 路径提取的各种情况
- ✅ 文件头部处理
- ✅ 错误恢复机制

## 📊 测试结果

```
✓ packages/agents/contexts/coding/snapshot/diff-merge.test.ts (14 tests) 71ms
✓ 所有快照相关测试：60 passed | 1 skipped
```

## 🎯 使用示例

### **之前的问题**
```typescript
// 创建里程碑时，多个快照的 diff 被简单拼接
const milestone = await createMilestone({
  title: "Feature Implementation",
  snapshotIds: ["snap1", "snap2", "snap3"]
});

// 生成的 combinedDiff 可能是：
// --- a/file.js\n+++ b/file.js\n@@ -1 +1 @@\n-old\n+new\n--- a/file.js\n+++ b/file.js\n@@ -2 +2 @@\n-old2\n+new2
// ❌ 这不是有效的 diff 格式！
```

### **现在的解决方案**
```typescript
// 创建里程碑时，diff 被正确合并
const milestone = await createMilestone({
  title: "Feature Implementation", 
  snapshotIds: ["snap1", "snap2", "snap3"]
});

// 生成的 combinedDiff 是：
// --- a/file.js
// +++ b/file.js
// @@ -1,2 +1,2 @@
// -old
// -old2
// +new
// +new2
// ✅ 这是有效的、可应用的 diff 格式！
```

## 🚀 优势

1. **正确性**：生成符合标准的 diff 格式
2. **可应用性**：合并后的 diff 可以被 patch 工具正确应用
3. **智能性**：自动处理同文件的多次修改
4. **健壮性**：优雅处理各种边界情况和错误
5. **性能**：高效的解析和合并算法
6. **可维护性**：清晰的代码结构和全面的测试

## 🔄 向后兼容性

- ✅ **完全向后兼容**：现有的 API 保持不变
- ✅ **渐进式改进**：内部实现改进，外部接口不变
- ✅ **错误恢复**：如果新算法失败，会回退到安全的拼接方式

## 📝 技术细节

### **依赖的 diff.ts 功能**
- `parseMultiFileDiff()` - 解析多文件 diff
- `ensureDiffLineEnding()` - 确保正确的行结束符
- `extractFilePathFromDiff()` - 提取文件路径（通过自实现的 `extractCleanFilePath`）

### **错误处理策略**
1. **解析失败**：将无法解析的 diff 作为单独块处理
2. **合并失败**：回退到简单拼接但确保格式正确
3. **格式错误**：记录警告但不中断处理流程

这个改进确保了 `createMilestone` 生成的合并 diff 是正确的、可应用的，并且符合 Git 和其他版本控制工具的标准格式。 