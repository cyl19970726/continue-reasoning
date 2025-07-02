#!/usr/bin/env node

/**
 * Test script for tool result formatters
 */

import { ToolFormatterRegistry } from '../utils/tool-result-formatters/index';
import { ToolCallParams, ToolExecutionResult } from '../core-types';

// Create formatter registry
const registry = new ToolFormatterRegistry(50); // Use smaller limit for testing

console.log('🧪 Testing Tool Result Formatters\n');

// Test 1: GrepTool
console.log('=== Test 1: GrepTool ===');
const grepCall: ToolCallParams = {
  type: "function",
  name: 'Grep',
  call_id: 'grep_123',
  parameters: {
    pattern: 'interface User',
    path: './src',
    include_patterns: ['*.ts', '*.js'],
    context_lines: 2
  }
};

const grepResult: ToolExecutionResult = {
  name: 'Grep',
  call_id: 'grep_123',
  params: grepCall.parameters,
  status: 'succeed',
  result: {
    success: true,
    file_count: 42,
    match_count: 15,
    matches: [
      {
        file: 'src/interfaces/user.ts',
        line_number: 12,
        content: 'export interface User {',
        context: [
          { line_number: 10, content: '// User model definition' },
          { line_number: 11, content: '' },
          { line_number: 12, content: 'export interface User {', is_match: true },
          { line_number: 13, content: '  id: string;' },
          { line_number: 14, content: '  name: string;' }
        ]
      },
      {
        file: 'src/models/user.model.ts',
        line_number: 5,
        content: 'interface UserData extends User {',
        context: []
      }
    ],
    suggested_read_ranges: [
      { file: 'src/interfaces/user.ts', start_line: 10, end_line: 20 }
    ]
  }
};

console.log(registry.formatToolCall(grepCall));
console.log(registry.formatToolResult(grepResult));

// Test 2: ReadFile
console.log('\n=== Test 2: ReadFile ===');
const readCall: ToolCallParams = {
  type: "function",
  name: 'ReadFile',
  call_id: 'read_456',
  parameters: {
    file_path: '/Users/project/src/index.ts',
    start_line: 1,
    end_line: 50
  }
};

const readResult: ToolExecutionResult = {
  name: 'ReadFile',
  call_id: 'read_456',
  params: readCall.parameters,
  status: 'succeed',
  result: {
    success: true,
    file_path: '/Users/project/src/index.ts',
    size: 2048,
    content: `import express from 'express';
import { UserController } from './controllers/user';
import { config } from './config';

const app = express();
const port = config.port || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.get('/', (req, res) => {
  res.json({ message: 'API is running' });
});

app.use('/api/users', UserController);

// Start server
app.listen(port, () => {
  console.log(\`Server running on port \${port}\`);
});

export default app;`
  }
};

console.log(registry.formatToolCall(readCall));
console.log(registry.formatToolResult(readResult));

// Test 3: BashCommand
console.log('\n=== Test 3: BashCommand ===');
const bashCall: ToolCallParams = {
  type: "function",
  name: 'BashCommand',
  call_id: 'bash_789',
  parameters: {
    command: 'npm test',
    description: 'Run project tests',
    timeout: 30000
  }
};

const bashResult: ToolExecutionResult = {
  name: 'BashCommand',
  call_id: 'bash_789',
  params: bashCall.parameters,
  status: 'succeed',
  executionTime: 15230,
  result: {
    success: true,
    exitCode: 0,
    stdout: `
> my-project@1.0.0 test
> jest

 PASS  src/utils/formatter.test.ts
  ✓ should format strings correctly (5 ms)
  ✓ should handle edge cases (3 ms)

 PASS  src/services/user.test.ts
  UserService
    ✓ should create user (12 ms)
    ✓ should update user (8 ms)
    ✓ should delete user (6 ms)

Test Suites: 2 passed, 2 total
Tests:       5 passed, 5 total
Snapshots:   0 total
Time:        2.456 s
Ran all test suites.`,
    stderr: ''
  }
};

console.log(registry.formatToolCall(bashCall));
console.log(registry.formatToolResult(bashResult));

// Test 4: TodosManager
console.log('\n=== Test 4: TodosManager ===');
const todosCall: ToolCallParams = {
  type: "function",
  name: 'TodosManagerTool',
  call_id: 'todos_999',
  parameters: {
    action: 'update',
    todos: `- [x] Analyze current implementation
- [x] Design formatter architecture
- [ ] Implement formatters
- [ ] Test integration
- [ ] Write documentation`
  }
};

const todosResult: ToolExecutionResult = {
  name: 'TodosManagerTool',
  call_id: 'todos_999',
  params: todosCall.parameters,
  status: 'succeed',
  result: {
    success: true,
    message: 'Updated todos list with 5 tasks',
    todos: todosCall.parameters.todos
  }
};

console.log(registry.formatToolCall(todosCall));
console.log(registry.formatToolResult(todosResult));

// Test 5: Snapshot Editing
console.log('\n=== Test 5: ApplyWholeFileEdit ===');
const editCall: ToolCallParams = {
  type: "function",
  name: 'ApplyWholeFileEditTool',
  call_id: 'edit_111',
  parameters: {
    file_path: 'src/components/NewFeature.tsx',
    goal: 'Create new React component',
    content: 'import React from "react";\n\nexport const NewFeature = () => {\n  return <div>New Feature</div>;\n};'
  }
};

const editResult: ToolExecutionResult = {
  name: 'ApplyWholeFileEditTool',
  call_id: 'edit_111',
  params: editCall.parameters,
  status: 'succeed',
  result: {
    success: true,
    file_path: 'src/components/NewFeature.tsx',
    snapshot_id: 'snapshot_23',
    diff_path: '.snapshots/snapshot_23.diff',
    line_count: 5,
    diff: `--- /dev/null
+++ b/src/components/NewFeature.tsx
@@ -0,0 +1,5 @@
+import React from "react";
+
+export const NewFeature = () => {
+  return <div>New Feature</div>;
+};`
  }
};

console.log(registry.formatToolCall(editCall));
console.log(registry.formatToolResult(editResult));

// Test 6: Error case
console.log('\n=== Test 6: Error Case ===');
const errorResult: ToolExecutionResult = {
  name: 'BashCommand',
  call_id: 'bash_error',
  params: { command: 'npm run build' },
  status: 'failed',
  message: 'Command failed with exit code 1',
  result: {
    success: false,
    exitCode: 1,
    stdout: '',
    stderr: 'Error: Cannot find module "typescript"'
  }
};

console.log(registry.formatToolResult(errorResult));

console.log('\n✅ All formatter tests completed!');