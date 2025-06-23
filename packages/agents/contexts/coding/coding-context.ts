import { IContext, ITool, IAgent, ToolCallResult, ToolSet as ToolSetInterface, IRAGEnabledContext, PromptCtx } from '@continue-reasoning/core';
import { z } from 'zod';
import { logger } from '@continue-reasoning/core';
import { createTool } from '@continue-reasoning/core';
import { EditingStrategyToolSet, BashToolSet, EditingStrategyToolExamples } from './toolsets';
import { ContextHelper } from '@continue-reasoning/core';
import { IRuntime } from './runtime/interface';
import { NodeJsSandboxedRuntime } from './runtime/impl/node-runtime';
import { ISandbox } from './sandbox';
import { NoSandbox } from './sandbox/no-sandbox';
import { SeatbeltSandbox } from './sandbox/seatbelt-sandbox';
import * as os from 'os';
import { SnapshotManager } from './snapshot/snapshot-manager';
import { SnapshotEditingToolSet } from './snapshot/snapshot-enhanced-tools';
import { snapshotManagerTools } from './snapshot/snapshot-manager-tools';
import { ReadToolSet } from './toolsets/editing-strategy-tools';
import { WebSearchTool } from '@continue-reasoning/core';

// Schema for CodingContext persistent data
export const CodingContextDataSchema = z.object({
  current_workspace: z.string().describe("The root path of the current coding project/workspace."),
});

export type CodingContextData = z.infer<typeof CodingContextDataSchema>;

// Extended interface that includes runtime, sandbox, and snapshot functionality
export interface ICodingContext extends IRAGEnabledContext<typeof CodingContextDataSchema> {
  getRuntime(): IRuntime;
  getSandbox(): ISandbox;
  getSnapshotManager(): SnapshotManager;
}

/**
 * Initialize the sandbox asynchronously
 * This allows the constructor to complete while sandbox initialization happens in the background
 */
async function initializeSandbox(sandbox: ISandbox): Promise<ISandbox> {
  try {
    const betterSandbox = await createPlatformSandbox();
    logger.info(`Sandbox initialized with type: ${betterSandbox.type}`);
    return betterSandbox;
  } catch (error) {
    logger.error('Failed to initialize platform sandbox, using NoSandbox as fallback:', error);
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
  };

  // Initialize the runtime
  const runtime = new NodeJsSandboxedRuntime();
  
  // Initialize the sandbox with NoSandbox as a default
  // Will be replaced with platform-specific sandbox once initialized
  let sandbox: ISandbox = new NoSandbox();
  
  // Initialize the snapshot manager
  const snapshotManager = new SnapshotManager(workspacePath);
  
  // Start the async initialization of the sandbox
  initializeSandbox(sandbox).then(newSandbox => {
    sandbox = newSandbox;
  });

  const allTools: ITool<any, any, IAgent>[] = [
    ...SnapshotEditingToolSet,
    ...snapshotManagerTools,
    ...ReadToolSet,
    ...BashToolSet,
    WebSearchTool,
  ];
  
  // Create the base RAG context
  const baseContext = ContextHelper.createRAGContext({
    id: 'coding-context',
    description: 'Manages file operations and code modifications using diff-driven development workflow with comprehensive editing tools.',
    dataSchema: CodingContextDataSchema,
    initialData: parsedInitialData,
    renderPromptFn: (data: CodingContextData): PromptCtx => {
      // Workflow: Detailed but concise programming process
      const workflow = `**Programming Workflow**:
1. **Analyze Requirements** → Based on development requirements, add files that need to be ignored to .snapshotignore file, these files will not generate diffs and will not be managed by snapshot tools
2. **Read Existing Code** → Use ReadFile or BashCommand to run Grep command to understand current state
3. **Choose Editing Strategy** → Select appropriate editing tools based on modification scope
4. **Implement Changes** → Apply code changes and automatically generate snapshots
5. **Merge Snapshots** → Organize related snapshots into logical units with ConsolidateSnapshots
6. **Test Validation** → Run code to ensure functionality is correct
7. **Rollback Handling** → Use RevertSnapshot for issues if problems occur`;

      // Status information: Contains more context
      let status = `**Working Directory**: ${data.current_workspace}`;

      // Guidelines: Specific best practices
      const guideline = `**Programming Best Practices**:

**📝 Code Editing Tools** (automatically create snapshots):
• ${SnapshotEditingToolSet.map(tool => tool.name).join(', ')} - All editing operations generate corresponding snapshots, all require 'goal' parameter to describe purpose.
• Prefer ApplyWholeFileEdit for complete file operations
• Use ApplyEditBlock or ApplyRangedEdit for small-scope modifications
• Use Delete tool for file removal
• Use ApplyUnifiedDiff for applying existing diffs

**📊 Snapshot Management Tools**:
• ReadSnapshot - View snapshot content and differences
• ListSnapshots - View snapshot history (supports limit parameter)
• RevertSnapshot - Rollback individual snapshots
• ConsolidateSnapshots - Merge multiple snapshots for optimization

**🔄 Workflow Recommendations**:
• Before modification, use ReadFile or run Grep with BashCommand to understand code structure
• Each edit automatically creates snapshots, recording all changes
• After completing a feature module, use ConsolidateSnapshots to create milestones
• When testing reveals issues, prioritize using RevertSnapshot to rollback recent modifications
• For major feature rollbacks, use ConsolidateSnapshots with rollback strategy
`;

      // Examples: Common working patterns
      const examples = `**Common Working Patterns**:

**New Feature Development**:
ReadFile → ApplyWholeFileEdit(goal="Implement XX feature") → BashCommand(test) → ConsolidateSnapshots(title="XX feature completed")

**Code Fixing**:
ListSnapshots(limit=5) → ReadSnapshot(check issues) → ApplyEditBlock(goal="Fix XX problem") → BashCommand(verify)

**Code Refactoring**:
ReadFile → ApplyWholeFileEdit(goal="Refactor XX module") → CompareFiles → BashCommand → ConsolidateSnapshots

**Error Rollback**:
ListSnapshots(limit=3) → RevertSnapshot(problematic snapshot ID) → or ConsolidateSnapshots(with rollback strategy)
`;

      return {
        workflow: workflow,
        status: status,
        guideline: guideline,
        examples: examples
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

  // Extend the base context with runtime, sandbox, and snapshot functionality
  const extendedContext = baseContext as ICodingContext;
  
  extendedContext.getRuntime = () => runtime;
  extendedContext.getSandbox = () => sandbox;
  extendedContext.getSnapshotManager = () => snapshotManager;
  
  return extendedContext;
}

// Export a default instance factory function for backward compatibility
export const CodingContext = createCodingContext; 