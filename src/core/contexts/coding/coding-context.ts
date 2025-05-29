import { z } from 'zod';
import { IContext, ITool, IAgent, ToolCallResult, ToolSet as ToolSetInterface, IRAGEnabledContext } from '../../interfaces';
import { EditingStrategyToolSet, BashToolSet, EditingStrategyToolExamples } from './toolsets';
import { IRuntime } from './runtime/interface';
import { NodeJsSandboxedRuntime } from './runtime/impl/node-runtime';
import { ISandbox } from './sandbox';
import { NoSandbox } from './sandbox/no-sandbox';
import { SeatbeltSandbox } from './sandbox/seatbelt-sandbox';
import { ContextHelper } from '../../utils';
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
    renderPromptFn: (data: CodingContextData) => {
      let prompt = `You are operating in the workspace: ${data.current_workspace}.\n`;
      prompt += `Current default editing strategy: ${data.selected_editing_strategy}.\n`;
      prompt += `Sandbox type: ${sandbox.type}.\n\n`;

      // Core guidance for code development
      prompt += `## 🔧 CODE DEVELOPMENT APPROACH\n\n`;
      prompt += `For code development and modification, use the specialized editing strategy tools below.\n`;
      prompt += `For simple file reading or system information, you can use bash commands directly.\n\n`;

      prompt += `## 📝 PRIMARY EDITING TOOLS (Choose the right tool for each task)\n\n`;
      
      prompt += `### 🥇 ApplyWholeFileEditTool - PRIMARY FILE CREATION\n`;
      prompt += `• **Use for**: Creating new files, complete file replacement\n`;
      prompt += `• **Best for**: New components, modules, config files, initial implementations\n`;
      prompt += `• **Auto-features**: Directory creation, comprehensive diff generation\n\n`;
      
      prompt += `### 🎯 ApplyEditBlockTool - TARGETED CODE MODIFICATION\n`;
      prompt += `• **Use for**: Replacing exact code blocks in existing files\n`;
      prompt += `• **Best for**: Function updates, refactoring specific methods, targeted fixes\n`;
      prompt += `• **Requirement**: Know the exact code to replace\n\n`;
      
      prompt += `### 📍 ApplyRangedEditTool - PRECISE LINE EDITING\n`;
      prompt += `• **Use for**: Line-based modifications with known line numbers\n`;
      prompt += `• **Best for**: Configuration files, known-position edits, appending content\n`;
      prompt += `• **Requirement**: Know specific line numbers or use -1 for append\n\n`;
      
      prompt += `### ⚙️ ApplyUnifiedDiffTool - COMPLEX OPERATIONS\n`;
      prompt += `• **Use for**: Multi-file changes, applying existing diffs\n`;
      prompt += `• **Best for**: Large refactoring, coordinated multi-file updates\n`;
      prompt += `• **Features**: Supports both single and multi-file diffs\n\n`;
      
      prompt += `### 🔄 ReverseDiffTool - ROLLBACK & RECOVERY\n`;
      prompt += `• **Use for**: Undoing changes, error recovery, A/B testing\n`;
      prompt += `• **Best for**: Emergency rollbacks, feature toggling\n`;
      prompt += `• **Features**: Selective file filtering, dry-run support\n\n`;

      prompt += `### 🗑️ DeleteTool - FILE & DIRECTORY REMOVAL\n`;
      prompt += `• **Files**: Always generates deletion diff\n`;
      prompt += `• **Empty directories**: No diff generated\n`;
      prompt += `• **Non-empty directories**: Multi-file diff for all contained files (requires recursive=true)\n\n`;

      prompt += `### 📁 CreateDirectoryTool - STRUCTURE SETUP\n`;
      prompt += `• **Use for**: Creating project structure\n`;
      prompt += `• **Note**: No diff generated (directories are metadata, not content)\n\n`;

      // Current workspace state
      if (data.open_files && Object.keys(data.open_files).length > 0) {
        prompt += `## 📂 CURRENT WORKSPACE STATE\n\n`;
        prompt += `**Files in focus:**\n`;
        for (const [filePath, meta] of Object.entries(data.open_files)) {
          prompt += `• ${filePath}`;
          if (meta.last_read_content) {
            const lineCount = meta.last_read_content.split('\n').length;
            prompt += ` (${lineCount} lines available for context)\n`;
          } else {
            prompt += ` (metadata only)\n`;
          }
        }
        prompt += `\n`;
      }

      if (data.active_diffs && Object.keys(data.active_diffs).length > 0) {
        prompt += `**Recent changes (active diffs):**\n`;
        for (const [filePath, diff] of Object.entries(data.active_diffs)) {
          const changeCount = (diff.match(/^[+-]/gm) || []).length;
          prompt += `• ${filePath}: ${changeCount} line changes\n`;
          // Only show diff details for small changes to avoid overwhelming the prompt
          if (changeCount <= 10) {
            prompt += `\`\`\`diff\n${diff}\n\`\`\`\n`;
          } else {
            prompt += `  (Large diff - ${changeCount} lines changed)\n`;
          }
        }
        prompt += `\n`;
      }

      // Best practices reminder
      prompt += `## 🎯 DEVELOPMENT BEST PRACTICES\n\n`;
      prompt += `1. **File Creation**: Always use ApplyWholeFileEditTool for new files\n`;
      prompt += `2. **Code Changes**: Use ApplyEditBlockTool for targeted modifications\n`;
      prompt += `3. **Configuration**: Use ApplyRangedEditTool for config file updates\n`;
      prompt += `4. **Complex Refactoring**: Use ApplyUnifiedDiffTool for multi-file operations\n`;
      prompt += `5. **Safety First**: Use dry-run mode for complex operations\n`;
      prompt += `6. **Change Tracking**: All edit operations automatically generate diffs\n`;
      prompt += `7. **Reading Files**: Use bash commands (cat, head, tail) for simple file reading\n`;
      prompt += `8. **System Info**: Use bash commands for directory listing, file stats, etc.\n\n`;

      prompt += `## 💡 QUICK DECISION GUIDE\n\n`;
      prompt += `**Creating a new file?** → ApplyWholeFileEditTool\n`;
      prompt += `**Modifying existing code?** → ApplyEditBlockTool (if you know exact code) or ApplyRangedEditTool (if you know lines)\n`;
      prompt += `**Multiple files at once?** → ApplyUnifiedDiffTool\n`;
      prompt += `**Need to undo changes?** → ReverseDiffTool\n`;
      prompt += `**Just reading/checking files?** → Use bash commands (cat, ls, grep, etc.)\n\n`;
      
      return prompt;
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