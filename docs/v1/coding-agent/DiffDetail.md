# Diff Detail Documentation for Editing Strategy Tools

This document provides comprehensive information about how each tool in the editing-strategy-tools.ts generates and handles diffs.

## Table of Contents
1. [Overview](#overview)
2. [ApplyWholeFileEditTool](#applywholefileedittool)
3. [ApplyEditBlockTool](#applyeditblocktool)
4. [ApplyRangedEditTool](#applyrangededittool)
5. [DeleteTool](#deletetool)
6. [CreateDirectoryTool](#createdirectorytool)
7. [CompareFilesTool](#comparefilestool)
8. [ApplyUnifiedDiffTool](#applyunifieddifftool)
9. [ReverseDiffTool](#reversedifftool)

## Overview

All tools in the editing-strategy-tools.ts follow a diff-driven development approach where every file operation generates a corresponding diff for complete change tracking and rollback capabilities.

## ApplyWholeFileEditTool

**Primary tool for file creation and complete content replacement.** This tool replaces the entire content of a file and generates a unified diff showing the changes. It automatically handles directory creation when needed.

### Scenarios and Examples

#### 1. Creating a New File (Primary Use Case)
When the file doesn't exist, this is the recommended tool for file creation:
```diff
--- /dev/null
+++ b/new-file.js
@@ -0,0 +1,3 @@
+function hello() {
+  return "world";
+}
```

#### 2. Complete File Replacement
When you need to completely replace an existing file's content:
```diff
--- a/existing-file.js
+++ b/existing-file.js
@@ -1,3 +1,4 @@
 function hello() {
-  return "world";
+  console.log("Hello");
+  return "universe";
 }
```

**Note**: This tool is preferred over ApplyEditBlockTool with empty searchBlock for file creation, as it provides clearer intent and better error handling.

## ApplyEditBlockTool

This tool searches for an exact code block and replaces it, generating a diff for the specific change.

### Scenarios and Examples

#### 1. Replacing a Code Block
```diff
--- a/utils.js
+++ b/utils.js
@@ -5,7 +5,9 @@
 }
 
 function calculateTotal(items) {
-  return items.reduce((sum, item) => sum + item.price, 0);
+  const total = items.reduce((sum, item) => sum + item.price, 0);
+  // Round to 2 decimal places
+  return Math.round(total * 100) / 100;
 }
 
 export { formatDate, calculateTotal };
```

#### 2. Creating a New File (Empty Search Block)
When searchBlock is empty:
```diff
--- /dev/null
+++ b/config.js
@@ -0,0 +1,5 @@
+const config = {
+  apiUrl: 'https://api.example.com',
+  timeout: 5000
+};
+module.exports = config;
```

## ApplyRangedEditTool

This tool applies content to specific line ranges, useful for precise line-based modifications.

### Scenarios and Examples

#### 1. Replacing Lines 2-4
Original file has 6 lines, replacing lines 2-4:
```diff
--- a/data.txt
+++ b/data.txt
@@ -1,6 +1,5 @@
 Line 1
-Line 2 old
-Line 3 old
-Line 4 old
+New line 2
+New line 3
 Line 5
 Line 6
```

#### 2. Appending to File (startLine=-1, endLine=-1)
```diff
--- a/log.txt
+++ b/log.txt
@@ -3,0 +3,2 @@
 Existing line 3
+New appended line 1
+New appended line 2
```

#### 3. Inserting at Beginning (startLine=1, endLine=0)
```diff
--- a/header.txt
+++ b/header.txt
@@ -0,0 +1,2 @@
+#!/usr/bin/env python3
+# -*- coding: utf-8 -*-
@@ -1,3 +3,3 @@
 Original first line
```

## DeleteTool

This tool deletes files or directories and generates appropriate diffs based on what is being deleted.

### Scenarios and Examples

#### 1. File Deletion
When deleting a file, a diff showing the complete file content removal is generated:
```diff
--- a/obsolete.js
+++ /dev/null
@@ -1,10 +0,0 @@
-// This file is being deleted
-function oldFunction() {
-  console.log("This will be removed");
-}
-
-const deprecatedConfig = {
-  oldKey: "oldValue"
-};
-
-module.exports = { oldFunction, deprecatedConfig };
```

#### 2. Empty Directory Deletion
When deleting an empty directory, no diff is generated:
```
Tool: DeleteTool
Input: { "path": "empty-folder", "recursive": false }
Result: Directory deleted successfully, no diff generated
```

#### 3. Non-Empty Directory Deletion (with recursive=true)
When deleting a non-empty directory, a multi-file diff is generated showing all deleted files:
```diff
--- a/old-module/index.js
+++ /dev/null
@@ -1,5 +0,0 @@
-const helper = require('./helper');
-
-module.exports = {
-  helper
-};
--- a/old-module/helper.js
+++ /dev/null
@@ -1,3 +0,0 @@
-function help() {
-  return "This module will be deleted";
-}
```

#### 4. Non-Empty Directory Deletion (without recursive flag)
```
Tool: DeleteTool
Input: { "path": "non-empty-folder", "recursive": false }
Result: Error - Directory is not empty. Use recursive=true to delete non-empty directories.
```

## CreateDirectoryTool

This tool creates directories but does **not** generate diffs, as directory creation is considered a structural operation rather than a content change.

### Scenarios and Examples

#### 1. Creating a New Directory
```
Tool: CreateDirectoryTool
Input: { "path": "src/components", "recursive": true }
Result: Directory created successfully, no diff generated
```

#### 2. Creating Nested Directories
```
Tool: CreateDirectoryTool  
Input: { "path": "src/utils/helpers/api", "recursive": true }
Result: All parent directories created, no diff generated
```

**Note**: Unlike file operations, directory creation does not generate diffs because:
- Empty directories don't contain content to track
- Directory structure is considered metadata rather than content
- Only file content changes need to be tracked for rollback purposes

## CompareFilesTool

This tool generates a unified diff between two different files.

### Examples

#### 1. Comparing Two Different Files
```diff
--- a/config.prod.json
+++ b/config.dev.json
@@ -1,5 +1,5 @@
 {
-  "apiUrl": "https://api.production.com",
-  "debug": false,
+  "apiUrl": "http://localhost:3000",
+  "debug": true,
   "timeout": 5000
 }
```

#### 2. Comparing with Non-existent File
```diff
--- a/existing.txt
+++ /dev/null
@@ -1,3 +0,0 @@
-Content line 1
-Content line 2
-Content line 3
```

## ApplyUnifiedDiffTool

This is the most complex tool that can apply unified diff content to files. It supports various diff formats and scenarios.

### Single File Diff Rules

#### 1. File Creation
When the diff shows creation from `/dev/null`:
```diff
--- /dev/null
+++ b/new-file.js
@@ -0,0 +1,5 @@
+export function newFunction() {
+  return {
+    message: "Hello from new file"
+  };
+}
```
**Rule**: Creates the file with the content after the `+` markers.

#### 2. File Modification
Standard modification diff:
```diff
--- a/existing.js
+++ b/existing.js
@@ -10,7 +10,8 @@ export class UserService {
   }
   
   addUser(user) {
-    this.users.push(user);
+    const newUser = { ...user, id: Date.now() };
+    this.users.push(newUser);
     console.log('User added');
   }
```
**Rule**: Applies changes line by line according to the hunk headers.

#### 3. File Deletion
When the diff shows deletion to `/dev/null`:
```diff
--- a/deprecated.js
+++ /dev/null
@@ -1,15 +0,0 @@
-// This entire file is being removed
-function deprecatedFunction() {
-  // Old implementation
-}
-// ... rest of file content
```
**Rule**: Deletes the entire file.

### Multi-File Diff Rules

Multi-file diffs contain multiple file changes in a single diff:

```diff
--- a/src/api.js
+++ b/src/api.js
@@ -1,5 +1,6 @@
 import axios from 'axios';
+import { config } from './config';
 
-const API_URL = 'https://api.example.com';
+const API_URL = config.apiUrl;
 
 export async function fetchData() {
--- /dev/null
+++ b/src/config.js
@@ -0,0 +1,5 @@
+export const config = {
+  apiUrl: process.env.API_URL || 'https://api.example.com',
+  timeout: 5000,
+  retries: 3
+};
--- a/src/index.js
+++ b/src/index.js
@@ -1,3 +1,4 @@
 import { fetchData } from './api';
+import { config } from './config';
 
 async function main() {
```

**Rules for Multi-File Diffs**:
1. Each file section starts with `--- a/path` and `+++ b/path` headers
2. Files are processed in order of appearance
3. Each file operation is independent - failure of one doesn't stop others
4. Results are aggregated with detailed per-file status

### Single File Multiple Hunks Rules

A single file can have multiple change hunks:

```diff
--- a/large-file.js
+++ b/large-file.js
@@ -10,5 +10,6 @@
 import { utils } from './utils';
+import { logger } from './logger';
 
 export class Service {
   constructor() {
     this.data = [];
@@ -25,7 +26,7 @@ export class Service {
   
   processData(input) {
     // Processing logic
-    console.log('Processing:', input);
+    logger.info('Processing:', input);
     return this.transform(input);
   }
   
@@ -45,6 +46,10 @@ export class Service {
     const result = this.validate(data);
     return result;
   }
+  
+  cleanup() {
+    logger.info('Cleaning up resources');
+    this.data = [];
+  }
 }
```

**Rules for Multiple Hunks**:
1. Each hunk is marked by `@@ -oldStart,oldCount +newStart,newCount @@`
2. Hunks are applied sequentially from top to bottom
3. Line numbers in later hunks account for changes from earlier hunks
4. Context lines (starting with space) help locate the exact position

### Important Format Requirements

1. **Line Endings**: Each diff must end with a newline character (`\n`)
2. **Hunk Headers**: Must match the format `@@ -oldLine,oldCount +newLine,newCount @@`
3. **File Headers**: Must start with `--- ` and `+++ `
4. **Content Lines**: Must start with ` ` (context), `-` (removed), or `+` (added)
5. **No Newline Marker**: `\ No newline at end of file` is used when the file doesn't end with a newline

### Error Handling

The tool provides detailed error messages for common issues:
- Malformed patch format
- File not found
- Hunk application failures
- Directory creation failures
- Permission errors

Each error includes:
- Specific line numbers where errors occur
- Type of error
- Suggestions for fixes
- Original stdout/stderr for debugging

## ReverseDiffTool

This tool reverses (undoes) a previously applied diff, effectively rolling back changes. It's the complement to ApplyUnifiedDiffTool and enables complete diff-driven development workflows.

### How Reverse Diff Works

The reverse diff tool takes a unified diff and creates an inverse diff that undoes the original changes:
- Lines marked with `+` become `-` (additions become removals)
- Lines marked with `-` become `+` (removals become additions)
- Context lines remain unchanged
- File creation diffs become file deletion diffs
- File deletion diffs become file creation diffs

### Scenarios and Examples

#### 1. Reversing a Simple File Modification

**Original diff** (applied earlier):
```diff
--- a/config.js
+++ b/config.js
@@ -1,5 +1,5 @@
 const config = {
-  apiUrl: 'http://localhost:3000',
-  debug: true,
+  apiUrl: 'https://api.production.com',
+  debug: false,
   timeout: 5000
 };
```

**Reversed diff** (generated by ReverseDiffTool):
```diff
--- a/config.js
+++ b/config.js
@@ -1,5 +1,5 @@
 const config = {
-  apiUrl: 'https://api.production.com',
-  debug: false,
+  apiUrl: 'http://localhost:3000',
+  debug: true,
   timeout: 5000
 };
```

#### 2. Reversing File Creation

**Original diff** (created a new file):
```diff
--- /dev/null
+++ b/utils/helper.js
@@ -0,0 +1,5 @@
+export function helper() {
+  return {
+    timestamp: Date.now()
+  };
+}
```

**Reversed diff** (deletes the file):
```diff
--- a/utils/helper.js
+++ /dev/null
@@ -1,5 +0,0 @@
-export function helper() {
-  return {
-    timestamp: Date.now()
-  };
-}
```

#### 3. Reversing File Deletion

**Original diff** (deleted a file):
```diff
--- a/deprecated.js
+++ /dev/null
@@ -1,3 +0,0 @@
-function oldFunction() {
-  return "deprecated";
-}
```

**Reversed diff** (recreates the file):
```diff
--- /dev/null
+++ b/deprecated.js
@@ -0,0 +1,3 @@
+function oldFunction() {
+  return "deprecated";
+}
```

#### 4. Reversing Multi-File Diff

**Original multi-file diff**:
```diff
--- a/src/api.js
+++ b/src/api.js
@@ -1,3 +1,4 @@
 import axios from 'axios';
+import { config } from './config';
 
-const API_URL = 'https://api.example.com';
+const API_URL = config.apiUrl;
--- /dev/null
+++ b/src/config.js
@@ -0,0 +1,3 @@
+export const config = {
+  apiUrl: 'https://api.example.com'
+};
```

**Reversed multi-file diff**:
```diff
--- a/src/api.js
+++ b/src/api.js
@@ -1,4 +1,3 @@
 import axios from 'axios';
-import { config } from './config';
 
-const API_URL = config.apiUrl;
+const API_URL = 'https://api.example.com';
--- a/src/config.js
+++ /dev/null
@@ -1,3 +0,0 @@
-export const config = {
-  apiUrl: 'https://api.example.com'
-};
```

### Use Cases

1. **Rollback Changes**: Quickly undo a set of changes when something goes wrong
2. **Feature Toggle**: Temporarily disable a feature by reversing its implementation
3. **A/B Testing**: Switch between different implementations
4. **Emergency Fixes**: Rapidly revert problematic changes in production
5. **Development Workflow**: Experiment with changes and easily revert them

### Integration with Other Tools

The ReverseDiffTool works seamlessly with other tools in the diff-driven system:

1. **With ApplyUnifiedDiffTool**: Apply changes, then reverse them if needed
2. **With Context Tracking**: Automatically tracks both forward and reverse diffs
3. **With Snapshot System**: Enables complete bidirectional change history
4. **With Error Recovery**: Provides automatic rollback on failed operations

### Advanced Features

#### 1. Selective Reversal
Can reverse only specific files from a multi-file diff:
```typescript
// Reverse only changes to api.js, ignore config.js changes
reverseDiff(originalDiff, { 
  includeFiles: ['src/api.js'] 
})
```

#### 2. Dry Run Support
Test reversal without actually applying changes:
```typescript
reverseDiff(originalDiff, { 
  dryRun: true 
})
```

#### 3. Conflict Detection
Identifies when current file state conflicts with expected reverse state:
```typescript
// Returns warnings if files have been modified since original diff
reverseDiff(originalDiff, { 
  checkConflicts: true 
})
``` 