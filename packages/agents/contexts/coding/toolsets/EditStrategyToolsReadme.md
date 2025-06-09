# Editing Strategy Tools - Complete Diff-Driven Development System

A comprehensive suite of tools for diff-driven development that tracks every file operation, enabling complete change history, rollback capabilities, and snapshot-based development workflows.

## 🚀 Quick Start

```typescript
// Apply a targeted code change
await ApplyEditBlockTool.execute({
  path: "src/utils.js",
  searchBlock: "function oldFunction() { return 'old'; }",
  replaceBlock: "function newFunction() { return 'new'; }"
});

// Apply complex multi-file changes
await ApplyUnifiedDiffTool.execute({
  diffContent: multiFileDiffString,
  saveDiffPath: "snapshots/feature-update.patch"
});

// Rollback changes when needed
await ReverseDiffTool.execute({
  diffContent: originalDiffString,
  dryRun: true  // Test first
});
```

## 📋 Table of Contents

1. [System Overview](#system-overview)
2. [Tool Catalog](#tool-catalog)
3. [Workflow Examples](#workflow-examples)
4. [Best Practices](#best-practices)
5. [Architecture](#architecture)
6. [Error Handling](#error-handling)
7. [Integration Guide](#integration-guide)

## 🎯 System Overview

### Core Principles

1. **Diff-Driven**: Every operation generates a unified diff for complete change tracking
2. **Snapshot Capable**: All changes can be saved, restored, and rolled back
3. **Context Aware**: Tools automatically update the coding context
4. **Multi-Strategy**: Multiple editing approaches for different use cases
5. **Error Resilient**: Graceful failure handling with detailed diagnostics

### Key Features

- ✅ **Complete Change Tracking**: Every file operation generates diffs
- ✅ **Rollback Capability**: Reverse any change with ReverseDiffTool
- ✅ **Multi-File Operations**: Handle complex refactoring across multiple files
- ✅ **Dry Run Support**: Test changes before applying them
- ✅ **Context Integration**: Seamless integration with coding context
- ✅ **Flexible Editing**: Choose the right tool for each task

## 🛠️ Tool Catalog

### Core Editing Tools

| Tool | Use Case | Best For |
|------|----------|----------|
| `ApplyWholeFileEditTool` | **Primary file creation** and complete replacement | New files, complete rewrites, initial implementations |
| `ApplyEditBlockTool` | Search & replace exact code blocks | Targeted refactoring, function updates |
| `ApplyRangedEditTool` | Line-based precise editing | Known line numbers, configuration files |
| `ApplyUnifiedDiffTool` | Standard unified diff application | Complex multi-file operations |
| `ReverseDiffTool` | Rollback/undo changes | Error recovery, feature toggling |

### Utility Tools

| Tool | Use Case | Best For |
|------|----------|----------|
| `ReadFileTool` | File content reading | Context gathering, analysis |
| `CompareFilesTool` | Generate diffs between files | Change analysis, validation |
| `DeleteTool` | Tracked file/directory deletion | File cleanup, directory removal with change tracking |
| `CreateDirectoryTool` | Directory creation (no diff) | Project structure setup |

## 🔄 Workflow Examples

### 1. Feature Development Workflow

```typescript
// 1. Read current implementation
const currentCode = await ReadFileTool.execute({
  path: "src/api/users.js"
});

// 2. Apply targeted improvements
const editResult = await ApplyEditBlockTool.execute({
  path: "src/api/users.js",
  searchBlock: `async function getUser(id) {
    return await db.users.findById(id);
  }`,
  replaceBlock: `async function getUser(id) {
    const user = await db.users.findById(id);
    if (!user) {
      throw new UserNotFoundError(\`User \${id} not found\`);
    }
    return user;
  }`
});

// 3. Save the diff for potential rollback
if (editResult.diff) {
  await fs.writeFile('diffs/user-validation.patch', editResult.diff);
}
```

### 2. Multi-File Refactoring Workflow

```typescript
// 1. Apply complex multi-file changes
const refactorResult = await ApplyUnifiedDiffTool.execute({
  diffContent: `
--- a/src/config.js
+++ b/src/config.js
@@ -1,3 +1,5 @@
+import { validateEnv } from './utils/validation';
+
 export const config = {
-  apiUrl: process.env.API_URL || 'localhost:3000'
+  apiUrl: validateEnv('API_URL', 'localhost:3000')
 };
--- /dev/null
+++ b/src/utils/validation.js
@@ -0,0 +1,7 @@
+export function validateEnv(key, defaultValue) {
+  const value = process.env[key];
+  if (!value && !defaultValue) {
+    throw new Error(\`Environment variable \${key} is required\`);
+  }
+  return value || defaultValue;
+}
  `,
  saveDiffPath: 'diffs/env-validation-refactor.patch'
});

// 2. If something goes wrong, rollback
if (!refactorResult.success) {
  const rollbackResult = await ReverseDiffTool.execute({
    diffContent: refactorResult.diff,
    dryRun: false
  });
}
```

### 3. Configuration Management Workflow

```typescript
// 1. Update configuration with line precision
const configUpdate = await ApplyRangedEditTool.execute({
  path: "package.json",
  content: `  "version": "2.1.0",
  "description": "Updated with new features",`,
  startLine: 3,
  endLine: 4
});

// 2. Compare different environment configs
const configDiff = await CompareFilesTool.execute({
  oldFilePath: "config/production.json",
  newFilePath: "config/staging.json"
});

console.log("Environment differences:", configDiff.diff);
```

### 4. Emergency Rollback Workflow

```typescript
// 1. Test rollback first (dry run)
const rollbackTest = await ReverseDiffTool.execute({
  diffContent: problematicDiff,
  dryRun: true
});

if (rollbackTest.success) {
  // 2. Apply actual rollback
  const rollback = await ReverseDiffTool.execute({
    diffContent: problematicDiff,
    dryRun: false
  });
  
  console.log(`Rolled back ${rollback.changesApplied} changes`);
}
```

## 📚 Best Practices

### 1. Choose the Right Tool

- **ApplyWholeFileEditTool**: **PRIMARY choice for creating new files** and complete content replacement
- **ApplyEditBlockTool**: When you know the exact code to replace in existing files
- **ApplyRangedEditTool**: When you know specific line numbers in existing files
- **ApplyUnifiedDiffTool**: For complex multi-file operations or when you have existing diffs
- **ReverseDiffTool**: For any rollback needs

### 2. File Creation Guidelines

```typescript
// ✅ Preferred: Use ApplyWholeFileEditTool for new files
await ApplyWholeFileEditTool.execute({
  path: "src/components/NewComponent.tsx",
  content: `import React from 'react';

export const NewComponent: React.FC = () => {
  return <div>Hello World</div>;
};`
});

// ❌ Avoid: Using ApplyEditBlockTool with empty searchBlock for file creation
// This works but is less clear in intent
await ApplyEditBlockTool.execute({
  path: "src/components/NewComponent.tsx", 
  searchBlock: "",
  replaceBlock: "..."
});
```

### 3. Always Save Important Diffs

```typescript
// Save diffs for critical changes
await ApplyUnifiedDiffTool.execute({
  diffContent: criticalChanges,
  saveDiffPath: `snapshots/critical-${Date.now()}.patch`
});
```

### 4. Use Dry Run for Complex Operations

```typescript
// Test complex changes first
const testResult = await ApplyUnifiedDiffTool.execute({
  diffContent: complexDiff,
  dryRun: true
});

if (testResult.success) {
  // Apply for real
  await ApplyUnifiedDiffTool.execute({
    diffContent: complexDiff,
    dryRun: false
  });
}
```

### 5. Handle Multi-File Operations Properly

```typescript
const result = await ApplyUnifiedDiffTool.execute({
  diffContent: multiFileDiff
});

// Check individual file results
if (result.isMultiFile && result.multiFileResults) {
  for (const fileResult of result.multiFileResults) {
    if (!fileResult.success) {
      console.error(`Failed to update ${fileResult.filePath}: ${fileResult.message}`);
    }
  }
}
```

### 6. Maintain Change History

```typescript
// Keep a history of all changes
const changeHistory = {
  timestamp: Date.now(),
  operation: 'feature-implementation',
  diff: result.diff,
  affectedFiles: result.affectedFiles
};

// Store in your preferred format (JSON, database, etc.)
await saveChangeHistory(changeHistory);
```

## 🏗️ Architecture

### Component Overview

```
┌─────────────────────────────────────────────────────┐
│                 Editing Strategy Tools               │
├─────────────────────────────────────────────────────┤
│  ApplyEditBlock  │  ApplyRanged  │  ApplyWholeFile   │
│  ApplyUnifiedDiff │ ReverseDiff   │  ReadFile        │
│  CompareFiles    │  Delete       │  CreateDirectory  │
├─────────────────────────────────────────────────────┤
│                 Runtime Layer                       │
├─────────────────────────────────────────────────────┤
│              Diff Utilities (diff.ts)               │
│  generateDiff │ parseDiff │ validateDiff │ reverse  │
├─────────────────────────────────────────────────────┤
│                 Node.js Runtime                     │
│         File System │ Process │ Sandbox             │
└─────────────────────────────────────────────────────┘
```

### Data Flow

1. **Tool Invocation**: User calls tool with parameters
2. **Parameter Validation**: Input validation using Zod schemas
3. **Runtime Operation**: Tool delegates to runtime layer
4. **Diff Generation**: All operations generate unified diffs
5. **Context Update**: Coding context updated automatically
6. **Result Return**: Structured response with success/error info

### Integration Points

- **Coding Context**: Automatic context updates with file changes
- **Runtime Interface**: Abstracted file operations
- **Diff Utilities**: Centralized diff processing
- **Error Handling**: Consistent error reporting across all tools

## 🚨 Error Handling

### Error Categories

1. **Validation Errors**: Invalid input parameters
2. **File System Errors**: Permission, not found, etc.
3. **Diff Format Errors**: Malformed diff content
4. **Operation Errors**: Patch application failures

### Error Response Format

```typescript
{
  success: false,
  message: "Detailed error description",
  changesApplied: 0,
  affectedFiles: [],
  // Tool-specific error details
  error: "ENOENT: file not found"
}
```

### Recovery Strategies

1. **Automatic Rollback**: Use ReverseDiffTool for failed operations
2. **Partial Success**: Handle multi-file operations with some failures
3. **Dry Run Validation**: Test operations before applying
4. **Detailed Diagnostics**: Comprehensive error information

## 🔗 Integration Guide

### With Coding Context

```typescript
// Tools automatically update coding context
const result = await ApplyEditBlockTool.execute(params, agent);

// Context now includes:
// - active_diffs: Record of all applied diffs
// - open_files: Updated file content and hashes
```

### With Other Systems

```typescript
// Git integration example
async function applyWithGitTracking(diffContent) {
  const result = await ApplyUnifiedDiffTool.execute({
    diffContent,
    saveDiffPath: 'diffs/current.patch'
  });
  
  if (result.success) {
    // Commit to git
    await git.add(result.affectedFiles);
    await git.commit(`Applied diff: ${result.changesApplied} changes`);
  }
  
  return result;
}
```

### Custom Workflows

```typescript
// Build custom workflows combining multiple tools
async function smartRefactor(searchPattern, replacePattern, files) {
  const results = [];
  
  for (const file of files) {
    // Read file first
    const content = await ReadFileTool.execute({ path: file });
    
    if (content.content.includes(searchPattern)) {
      // Apply change
      const result = await ApplyEditBlockTool.execute({
        path: file,
        searchBlock: searchPattern,
        replaceBlock: replacePattern
      });
      results.push(result);
    }
  }
  
  return results;
}
```

## 📊 Performance Considerations

- **File Size**: Large files may take longer to process
- **Multi-File Operations**: Process files in parallel when possible
- **Diff Complexity**: Complex diffs with many hunks are slower
- **Context Updates**: Automatic context updates add overhead

## 🧪 Testing

The system includes comprehensive tests:

- **Unit Tests**: `diff.test.ts` - Test diff utilities
- **Integration Tests**: `runtime.test.ts` - Test complete workflows
- **Error Scenarios**: Comprehensive error condition testing

## 📝 Contributing

When adding new tools:

1. Follow the established pattern with Zod schemas
2. Generate appropriate diffs for change tracking
3. Update coding context properly
4. Add comprehensive tests
5. Update documentation

## 📄 License

This editing strategy tools system is part of the larger coding context framework. 

### DeleteTool Tool - File and Directory Deletion

Deletes files and directories with appropriate diff generation based on the type of deletion.

#### Example 1: Delete File
```
Tool: DeleteTool
Input: {
  "path": "temp/cache.tmp"
}
Result: Deletes file and generates diff showing all removed content
```

#### Example 2: Delete Empty Directory
```
Tool: DeleteTool
Input: {
  "path": "temp/empty-folder"
}
Result: Deletes directory without generating diff (empty directories don't contain content)
```

#### Example 3: Delete Non-Empty Directory
```
Tool: DeleteTool
Input: {
  "path": "old-module",
  "recursive": true
}
Result: Deletes directory and generates multi-file diff showing all deleted files
```

### CreateDirectory Tool - Structure Creation

Creates directories without generating diffs, as directory structure is considered metadata rather than content.

#### Example 1: Create Project Structure
```
Tool: CreateDirectory
Input: {
  "path": "src/components",
  "recursive": true
}
Result: Creates directory structure without diff generation
``` 