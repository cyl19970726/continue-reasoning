import { IContext, ITool, IAgent, ToolCallResult, ToolSet as ToolSetInterface, IRAGEnabledContext, PromptCtx } from '../../../core/interfaces';
import { z } from 'zod';
import { logger } from '../../../core/utils/logger';
import { createTool } from '../../../core/utils';
import { EditingStrategyToolSet, BashToolSet, EditingStrategyToolExamples } from './toolsets';
import { ContextHelper } from '../../../core/utils';
import { IRuntime } from './runtime/interface';
import { NodeJsSandboxedRuntime } from './runtime/impl/node-runtime';
import { ISandbox } from './sandbox';
import { NoSandbox } from './sandbox/no-sandbox';
import { SeatbeltSandbox } from './sandbox/seatbelt-sandbox';
import * as os from 'os';

// Schema for CodingContext persistent data
export const CodingContextDataSchema = z.object({
  current_workspace: z.string().describe("The root path of the current coding project/workspace."),
  open_files: z.record(z.string(), z.object({ 
    content_hash: z.string().optional().describe("A hash of the file content for change detection."),
    last_read_content: z.string().optional().describe("The content of the file when it was last read (can be partial)."),
  })).optional().default({}).describe("A map of file paths to their metadata, representing files currently in focus or recently accessed."),
  active_diffs: z.record(z.string(), z.string()).optional().default({}).describe("A map of file paths to their active diff strings, typically after an edit operation."),
  selected_editing_strategy: z.enum(["edit_block", "whole_file", "ranged_edit", "unified_diff"])
    .optional()
    .default("whole_file")
    .describe("The currently selected default editing strategy for the LLM to use."),
});

export type CodingContextData = z.infer<typeof CodingContextDataSchema>;

// Extended interface that includes runtime and sandbox functionality
export interface ICodingContext extends IRAGEnabledContext<typeof CodingContextDataSchema> {
  getRuntime(): IRuntime;
  getSandbox(): ISandbox;
}

/**
 * Initialize the sandbox asynchronously
 * This allows the constructor to complete while sandbox initialization happens in the background
 */
async function initializeSandbox(sandbox: ISandbox): Promise<ISandbox> {
  try {
    const betterSandbox = await createPlatformSandbox();
    console.log(`Sandbox initialized with type: ${betterSandbox.type}`);
    return betterSandbox;
  } catch (error) {
    console.error('Failed to initialize platform sandbox, using NoSandbox as fallback:', error);
    // Keep the default NoSandbox
    return sandbox;
  }
}

/**
 * Create the appropriate sandbox instance based on the current platform
 */
async function createPlatformSandbox(): Promise<ISandbox> {
  const platform = os.platform();
  
  // For macOS, use Seatbelt if available
  if (platform === 'darwin') {
    try {
      // Check if Seatbelt is available
      if (await SeatbeltSandbox.isAvailable()) {
        console.log('Using macOS Seatbelt sandbox');
        return new SeatbeltSandbox();
      }
    } catch (error) {
      console.warn('Failed to initialize Seatbelt sandbox:', error);
    }
  }
  
  // For other platforms or if Seatbelt failed, use NoSandbox
  console.log('Using NoSandbox (no security isolation)');
  return new NoSandbox();
}

/**
 * Create a Gemini Coding Context using ContextHelper.createRAGContext
 */
export function createCodingContext(workspacePath: string, initialData?: Partial<CodingContextData>): ICodingContext {
  if (!workspacePath) {
    throw new Error("Workspace path is required to create a CodingContext.");
  }
  
  const parsedInitialData = {
    current_workspace: workspacePath,
    open_files: initialData?.open_files || {},
    active_diffs: initialData?.active_diffs || {},
    selected_editing_strategy: initialData?.selected_editing_strategy || "whole_file",
  };

  // Initialize the runtime
  const runtime = new NodeJsSandboxedRuntime();
  
  // Initialize the sandbox with NoSandbox as a default
  // Will be replaced with platform-specific sandbox once initialized
  let sandbox: ISandbox = new NoSandbox();
  
  // Start the async initialization of the sandbox
  initializeSandbox(sandbox).then(newSandbox => {
    sandbox = newSandbox;
  });

  const allTools: ITool<any, any, IAgent>[] = [
    ...EditingStrategyToolSet,
    ...BashToolSet,
  ];
  
  // Create the base RAG context
  const baseContext = ContextHelper.createRAGContext({
    id: 'coding-context',
    description: 'Manages state and tools for coding tasks, powered by Gemini models.',
    dataSchema: CodingContextDataSchema,
    initialData: parsedInitialData,
    promptCtx: {
      workflow: `
## 🔧 DIFF-DRIVEN DEVELOPMENT WORKFLOW

### CRITICAL RULES:
1. **File Modifications**: ONLY use EditingStrategyToolSet
   - Creating files → ApplyWholeFileEditTool
   - Modifying code → ApplyEditBlockTool or ApplyRangedEditTool
   - Deleting files → DeleteTool

2. **File Reading**: Use bash_command Tool
   - Simple reading → \`cat filename.txt\`
   - Partial reading → \`head -20 file.txt\` or \`tail -10 file.txt\`
   - Search content → \`grep pattern file.txt\`

3. **NEVER use bash for**:
   - Creating files (no \`echo > file.txt\`)
   - Modifying files (no \`sed -i\`)
   - Deleting files (no \`rm\`)

### WHY THIS MATTERS:
- Every edit operation generates a diff for tracking
- All changes can be rolled back with ReverseDiffTool
- Complete audit trail of all modifications

### PRIMARY EDITING TOOLS (Choose the right tool for each task)

🥇 **ApplyWholeFileEditTool** - PRIMARY FILE CREATION
• Use for: Creating new files, complete file replacement
• Best for: New components, modules, config files, initial implementations
• Auto-features: Directory creation, comprehensive diff generation

🎯 **ApplyEditBlockTool** - TARGETED CODE MODIFICATION
• Use for: Replacing exact code blocks in existing files
• Best for: Function updates, refactoring specific methods, targeted fixes
• Requirement: Know the exact code to replace

📍 **ApplyRangedEditTool** - PRECISE LINE EDITING
• Use for: Line-based modifications with known line numbers
• Best for: Configuration files, known-position edits, appending content
• Requirement: Know specific line numbers or use -1 for append

⚙️ **ApplyUnifiedDiffTool** - COMPLEX OPERATIONS
• Use for: Multi-file changes, applying existing diffs
• Best for: Large refactoring, coordinated multi-file updates
• Features: Supports both single and multi-file diffs

🔄 **ReverseDiffTool** - ROLLBACK & RECOVERY
• Use for: Undoing changes, error recovery, A/B testing
• Best for: Emergency rollbacks, feature toggling
• Features: Selective file filtering, dry-run support

🗑️ **DeleteTool** - FILE & DIRECTORY REMOVAL
• Files: Always generates deletion diff
• Empty directories: No diff generated
• Non-empty directories: Multi-file diff for all contained files (requires recursive=true)

📁 **CreateDirectoryTool** - STRUCTURE SETUP
• Use for: Creating project structure
• Note: No diff generated (directories are metadata, not content)
`,
      status: `Operating in workspace: ${parsedInitialData.current_workspace}
Current default editing strategy: ${parsedInitialData.selected_editing_strategy}
Sandbox type: ${sandbox.type}`,
      guideline: `
## 🎯 DEVELOPMENT BEST PRACTICES

1. **Always Read First**: Use \`cat\` to understand current file content
2. **File Creation**: ONLY use ApplyWholeFileEditTool for new files
3. **Code Changes**: Use ApplyEditBlockTool for targeted modifications
4. **Never Mix Tools**: DON'T use bash for file creation/modification/deletion
5. **Track Changes**: Every edit generates a diff automatically
6. **Test After Changes**: Use bash to run tests and verify changes
7. **Rollback When Needed**: Use ReverseDiffTool to undo any changes

## 💡 QUICK DECISION GUIDE

**Creating a new file?** → ApplyWholeFileEditTool
**Modifying existing code?** → ApplyEditBlockTool (exact code) or ApplyRangedEditTool (line numbers)
**Multiple files at once?** → ApplyUnifiedDiffTool
**Need to undo changes?** → ReverseDiffTool
**Just reading files?** → bash: cat, head, tail, grep
**Running tests/commands?** → bash: npm test, node script.js, etc.
`,
      examples: `
## 📚 COMPLETE DIFF-DRIVEN EXAMPLE

### Initial State:
\`\`\`typescript
// File: src/calculator.ts
function add(a: number, b: number): number {
  return a + b;
}
\`\`\`

### Step 1: Read Current File
\`\`\`bash
Tool: BashCommandTool
Input: { command: "cat src/calculator.ts" }
Output: {
  stdout: "function add(a: number, b: number): number {\\n  return a + b;\\n}\\n",
  exit_code: 0,
  success: true
}
\`\`\`

### Step 2: Add Error Handling
\`\`\`typescript
Tool: ApplyEditBlockTool
Input: {
  path: "src/calculator.ts",
  searchBlock: "function add(a: number, b: number): number {\\n  return a + b;\\n}",
  replaceBlock: "function add(a: number, b: number): number {\\n  if (typeof a !== 'number' || typeof b !== 'number') {\\n    throw new Error('Parameters must be numbers');\\n  }\\n  return a + b;\\n}"
}
Output: {
  success: true,
  message: "Edit block successfully applied",
  diff: "--- a/src/calculator.ts\\n+++ b/src/calculator.ts\\n@@ -1,3 +1,6 @@\\n function add(a: number, b: number): number {\\n+  if (typeof a !== 'number' || typeof b !== 'number') {\\n+    throw new Error('Parameters must be numbers');\\n+  }\\n   return a + b;\\n }",
  changesApplied: 1
}
\`\`\`

### Step 3: Create Test File
\`\`\`typescript
Tool: ApplyWholeFileEditTool
Input: {
  path: "src/calculator.test.ts",
  content: "import { add } from './calculator';\\n\\ntest('add numbers', () => {\\n  expect(add(2, 3)).toBe(5);\\n});\\n\\ntest('throw error for non-numbers', () => {\\n  expect(() => add('2' as any, 3)).toThrow('Parameters must be numbers');\\n});"
}
Output: {
  success: true,
  message: "File src/calculator.test.ts created successfully",
  diff: "--- /dev/null\\n+++ b/src/calculator.test.ts\\n@@ -0,0 +1,9 @@\\n+import { add } from './calculator';\\n+\\n+test('add numbers', () => {\\n+  expect(add(2, 3)).toBe(5);\\n+});\\n+\\n+test('throw error for non-numbers', () => {\\n+  expect(() => add('2' as any, 3)).toThrow('Parameters must be numbers');\\n+});"
}
\`\`\`
`
    },
    renderPromptFn: (data: CodingContextData): PromptCtx => {
      // 动态构建 status 信息
      let dynamicStatus = `Operating in workspace: ${data.current_workspace}
Current default editing strategy: ${data.selected_editing_strategy}
Sandbox type: ${sandbox.type}`;

      // 添加当前工作区状态
      if (data.open_files && Object.keys(data.open_files).length > 0) {
        dynamicStatus += `\n\n## 📂 CURRENT WORKSPACE STATE\n\nFiles in focus:\n`;
        for (const [filePath, meta] of Object.entries(data.open_files)) {
          dynamicStatus += `• ${filePath}`;
          if (meta.last_read_content) {
            const lineCount = meta.last_read_content.split('\n').length;
            dynamicStatus += ` (${lineCount} lines available for context)\n`;
          } else {
            dynamicStatus += ` (metadata only)\n`;
          }
        }
      }

      if (data.active_diffs && Object.keys(data.active_diffs).length > 0) {
        dynamicStatus += `\nRecent changes (active diffs):\n`;
        for (const [filePath, diff] of Object.entries(data.active_diffs)) {
          const changeCount = (diff.match(/^[+-]/gm) || []).length;
          dynamicStatus += `• ${filePath}: ${changeCount} line changes\n`;
          // Only show diff details for small changes to avoid overwhelming the prompt
          if (changeCount <= 10) {
            dynamicStatus += `\`\`\`diff\n${diff}\n\`\`\`\n`;
          } else {
            dynamicStatus += `  (Large diff - ${changeCount} lines changed)\n`;
          }
        }
      }

      return {
        workflow: `
## 🔧 DIFF-DRIVEN DEVELOPMENT WORKFLOW

### CRITICAL RULES:
1. **File Modifications**: ONLY use EditingStrategyToolSet
   - Creating files → ApplyWholeFileEditTool
   - Modifying code → ApplyEditBlockTool or ApplyRangedEditTool
   - Deleting files → DeleteTool

2. **File Reading**: Use bash_command Tool
   - Simple reading → \`cat filename.txt\`
   - Partial reading → \`head -20 file.txt\` or \`tail -10 file.txt\`
   - Search content → \`grep pattern file.txt\`

3. **NEVER use bash for**:
   - Creating files (no \`echo > file.txt\`)
   - Modifying files (no \`sed -i\`)
   - Deleting files (no \`rm\`)

### WHY THIS MATTERS:
- Every edit operation generates a diff for tracking
- All changes can be rolled back with ReverseDiffTool
- Complete audit trail of all modifications

### PRIMARY EDITING TOOLS (Choose the right tool for each task)

🥇 **ApplyWholeFileEditTool** - PRIMARY FILE CREATION
• Use for: Creating new files, complete file replacement
• Best for: New components, modules, config files, initial implementations
• Auto-features: Directory creation, comprehensive diff generation

🎯 **ApplyEditBlockTool** - TARGETED CODE MODIFICATION
• Use for: Replacing exact code blocks in existing files
• Best for: Function updates, refactoring specific methods, targeted fixes
• Requirement: Know the exact code to replace

📍 **ApplyRangedEditTool** - PRECISE LINE EDITING
• Use for: Line-based modifications with known line numbers
• Best for: Configuration files, known-position edits, appending content
• Requirement: Know specific line numbers or use -1 for append

⚙️ **ApplyUnifiedDiffTool** - COMPLEX OPERATIONS
• Use for: Multi-file changes, applying existing diffs
• Best for: Large refactoring, coordinated multi-file updates
• Features: Supports both single and multi-file diffs

🔄 **ReverseDiffTool** - ROLLBACK & RECOVERY
• Use for: Undoing changes, error recovery, A/B testing
• Best for: Emergency rollbacks, feature toggling
• Features: Selective file filtering, dry-run support

🗑️ **DeleteTool** - FILE & DIRECTORY REMOVAL
• Files: Always generates deletion diff
• Empty directories: No diff generated
• Non-empty directories: Multi-file diff for all contained files (requires recursive=true)

📁 **CreateDirectoryTool** - STRUCTURE SETUP
• Use for: Creating project structure
• Note: No diff generated (directories are metadata, not content)
`,
        status: dynamicStatus,
        guideline: `
## 🎯 DEVELOPMENT BEST PRACTICES

1. **Always Read First**: Use \`cat\` to understand current file content
2. **File Creation**: ONLY use ApplyWholeFileEditTool for new files
3. **Code Changes**: Use ApplyEditBlockTool for targeted modifications
4. **Never Mix Tools**: DON'T use bash for file creation/modification/deletion
5. **Track Changes**: Every edit generates a diff automatically
6. **Test After Changes**: Use bash to run tests and verify changes
7. **Rollback When Needed**: Use ReverseDiffTool to undo any changes

## 💡 QUICK DECISION GUIDE

**Creating a new file?** → ApplyWholeFileEditTool
**Modifying existing code?** → ApplyEditBlockTool (exact code) or ApplyRangedEditTool (line numbers)
**Multiple files at once?** → ApplyUnifiedDiffTool
**Need to undo changes?** → ReverseDiffTool
**Just reading files?** → bash: cat, head, tail, grep
**Running tests/commands?** → bash: npm test, node script.js, etc.
`,
        examples: `
## 📚 COMPLETE DIFF-DRIVEN EXAMPLE

### Initial State:
\`\`\`typescript
// File: src/calculator.ts
function add(a: number, b: number): number {
  return a + b;
}
\`\`\`

### Step 1: Read Current File
\`\`\`bash
Tool: BashCommandTool
Input: { command: "cat src/calculator.ts" }
Output: {
  stdout: "function add(a: number, b: number): number {\\n  return a + b;\\n}\\n",
  exit_code: 0,
  success: true
}
\`\`\`

### Step 2: Add Error Handling
\`\`\`typescript
Tool: ApplyEditBlockTool
Input: {
  path: "src/calculator.ts",
  searchBlock: "function add(a: number, b: number): number {\\n  return a + b;\\n}",
  replaceBlock: "function add(a: number, b: number): number {\\n  if (typeof a !== 'number' || typeof b !== 'number') {\\n    throw new Error('Parameters must be numbers');\\n  }\\n  return a + b;\\n}"
}
Output: {
  success: true,
  message: "Edit block successfully applied",
  diff: "--- a/src/calculator.ts\\n+++ b/src/calculator.ts\\n@@ -1,3 +1,6 @@\\n function add(a: number, b: number): number {\\n+  if (typeof a !== 'number' || typeof b !== 'number') {\\n+    throw new Error('Parameters must be numbers');\\n+  }\\n   return a + b;\\n }",
  changesApplied: 1
}
\`\`\`

### Step 3: Create Test File
\`\`\`typescript
Tool: ApplyWholeFileEditTool
Input: {
  path: "src/calculator.test.ts",
  content: "import { add } from './calculator';\\n\\ntest('add numbers', () => {\\n  expect(add(2, 3)).toBe(5);\\n});\\n\\ntest('throw error for non-numbers', () => {\\n  expect(() => add('2' as any, 3)).toThrow('Parameters must be numbers');\\n});"
}
Output: {
  success: true,
  message: "File src/calculator.test.ts created successfully",
  diff: "--- /dev/null\\n+++ b/src/calculator.test.ts\\n@@ -0,0 +1,9 @@\\n+import { add } from './calculator';\\n+\\n+test('add numbers', () => {\\n+  expect(add(2, 3)).toBe(5);\\n+});\\n+\\n+test('throw error for non-numbers', () => {\\n+  expect(() => add('2' as any, 3)).toThrow('Parameters must be numbers');\\n+});"
}
\`\`\`
`
      };
    },
    toolSetFn: () => ({
      name: 'CodingAgentTools',
      description: 'Core tools for the Coding Agent, including file system, runtime, and editing tools.',
      tools: allTools,
      active: true,
      source: 'local',
    }),
    handleToolCall: (toolCallResult: ToolCallResult) => {
      console.log(`CodingContext.onToolCall: Tool ${toolCallResult.name} (ID: ${toolCallResult.call_id}) executed.`);
      
      const toolName = toolCallResult.name;
      const resultData = toolCallResult.result as any;

      if (toolName === 'ApplyWholeFileEditTool' && resultData?.success && resultData?.diff) {
        console.log(`ApplyWholeFileEditTool succeeded. Diff generated. Path info needed for full context update.`);
      }

      if (toolName === 'ReadFileTool' && resultData?.content) {
        console.log(`ReadFileTool succeeded. Content read. Path info needed for full context update.`);
      }
    }
  });

  // Extend the base context with runtime and sandbox functionality
  const extendedContext = baseContext as ICodingContext;
  
  extendedContext.getRuntime = () => runtime;
  extendedContext.getSandbox = () => sandbox;
  
  return extendedContext;
}

// Export a default instance factory function for backward compatibility
export const CodingContext = createCodingContext; 