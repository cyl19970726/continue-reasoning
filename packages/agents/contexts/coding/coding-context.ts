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
import * as path from 'path';
import * as fs from 'fs';
import { SnapshotManager } from './snapshot/snapshot-manager';
import { SnapshotEditingToolSet } from './snapshot/snapshot-enhanced-tools';
import { snapshotManagerTools } from './snapshot/snapshot-manager-tools';
import { ReadToolSet } from './toolsets/editing-strategy-tools';
import { WebSearchTool } from '@continue-reasoning/core';

// Schema for CodingContext persistent data - 极简版本
export const CodingContextDataSchema = z.object({
  current_workspace: z.string().describe("Current active workspace path."),
});

export type CodingContextData = z.infer<typeof CodingContextDataSchema>;

// Extended interface that includes runtime, sandbox, and snapshot functionality  
export interface ICodingContext extends IRAGEnabledContext<typeof CodingContextDataSchema> {
  getRuntime(): IRuntime;
  getSandbox(): ISandbox;
  getSnapshotManager(): SnapshotManager;
  getCurrentWorkspace(): string;
  switchToWorkspace(workspacePath: string): Promise<void>;
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
 * Validate if a path is within the current workspace
 */
function isPathInWorkspace(targetPath: string, workspacePath: string): boolean {
  const resolvedTarget = path.resolve(targetPath);
  const resolvedWorkspace = path.resolve(workspacePath);
  return resolvedTarget.startsWith(resolvedWorkspace);
}

/**
 * Create workspace management tools - 极简版本
 */
function createWorkspaceTools(context: ICodingContext): ITool<any, any, IAgent>[] {
  
  const SwitchWorkspaceTool = createTool({
    name: 'SwitchWorkspaceTool',
    description: 'Switch to a different workspace. This will close the current SnapshotManager and create a new one for the target workspace. The target directory will be created if it doesn\'t exist.',
    inputSchema: z.object({
      workspacePath: z.string().describe('The absolute or relative path to the workspace directory to switch to')
    }),
    async: true,
    execute: async (args, agent) => {
      try {
        const { workspacePath } = args;
        const resolvedPath = path.resolve(workspacePath);
        
        // Check if already current
        if (resolvedPath === context.getCurrentWorkspace()) {
          return {
            success: true,
            message: `Already in workspace: ${resolvedPath}`,
            currentWorkspace: resolvedPath
          };
        }
        
        // Create directory if it doesn't exist
        if (!fs.existsSync(resolvedPath)) {
          fs.mkdirSync(resolvedPath, { recursive: true });
          logger.info(`Created workspace directory: ${resolvedPath}`);
        } else if (!fs.statSync(resolvedPath).isDirectory()) {
          return {
            success: false,
            message: `Path '${resolvedPath}' exists but is not a directory`,
            currentWorkspace: context.getCurrentWorkspace()
          };
        }
        
        // Switch to the workspace
        await context.switchToWorkspace(resolvedPath);
        
        logger.info(`Switched to workspace: ${resolvedPath}`);
        
        return {
          success: true,
          message: `Successfully switched to workspace: ${resolvedPath}. SnapshotManager has been reinitialized.`,
          currentWorkspace: resolvedPath
        };
      } catch (error) {
        logger.error('Error switching workspace:', error);
        return {
          success: false,
          message: `Failed to switch workspace: ${error}`,
          currentWorkspace: context.getCurrentWorkspace()
        };
      }
    }
  });

  return [SwitchWorkspaceTool];
}

/**
 * Create a Coding Context with simple workspace switching
 */
export function createCodingContext(workspacePath: string, initialData?: Partial<CodingContextData>): ICodingContext {
  if (!workspacePath) {
    throw new Error("Workspace path is required to create a CodingContext.");
  }
  
  // 确保工作空间存在
  if (!fs.existsSync(workspacePath)) {
      fs.mkdirSync(workspacePath, { recursive: true });
      logger.info(`Created workspace directory: ${workspacePath}`);
  }
  
  const parsedInitialData = {
    current_workspace: workspacePath,
    ...initialData
  };

  // Initialize the runtime
  const runtime = new NodeJsSandboxedRuntime();
  
  // Initialize the sandbox with NoSandbox as a default
  // Will be replaced with platform-specific sandbox once initialized
  let sandbox: ISandbox = new NoSandbox();
  
  // Initialize the snapshot manager for the initial workspace
  let snapshotManager = new SnapshotManager(workspacePath);
  
  // Start the async initialization of the sandbox
  initializeSandbox(sandbox).then(newSandbox => {
    sandbox = newSandbox;
  });

  // Create the base RAG context first
  const baseContext = ContextHelper.createRAGContext({
    id: 'coding-context',
    description: 'Manages file operations and code modifications using diff-driven development workflow with simple workspace switching.',
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
      const currentWorkspace = data.current_workspace;
      
      let status = `**🎯 CURRENT WORKSPACE**: ${currentWorkspace}`;

      // Guidelines: Specific best practices with workspace restrictions
      const guideline = `**Programming Best Practices**:

**🚨 SINGLE WORKSPACE MODEL** (CRITICAL):
• **CURRENT WORKSPACE**: Only ONE workspace is active at any time: ${currentWorkspace}
• **WORKSPACE OPERATIONS**: All file operations are restricted to the current workspace and its subdirectories
• **SNAPSHOT MANAGEMENT**: SnapshotManager only tracks changes in the current workspace
• **WORKSPACE SWITCHING**: Use SwitchWorkspaceTool to change workspace (closes old SnapshotManager, creates new one)
• **PATH VALIDATION**: All file paths must be within: ${currentWorkspace}/**

**🗂️ Workspace Management Tools**:
• SwitchWorkspaceTool - Switch to any valid directory path (creates directory if needed)

**📝 Code Editing Tools** (automatically create snapshots in current workspace):
• ${SnapshotEditingToolSet.map(tool => tool.name).join(', ')} - All editing operations generate corresponding snapshots, all require 'goal' parameter to describe purpose.
• Prefer ApplyWholeFileEdit for complete file operations
• Use ApplyEditBlock or ApplyRangedEdit for small-scope modifications
• Use Delete tool for file removal
• Use ApplyUnifiedDiff for applying existing diffs

**📊 Snapshot Management Tools** (operates on current workspace):
• ReadSnapshot - View snapshot content and differences
• ListSnapshots - View snapshot history (supports limit parameter)
• RevertSnapshot - Rollback individual snapshots
• ConsolidateSnapshots - Merge multiple snapshots for optimization

**🔄 Workflow Recommendations**:
• Before modification, use ReadFile or run Grep with BashCommand to understand code structure
• Each edit automatically creates snapshots, recording all changes in current workspace
• After completing a feature module, use ConsolidateSnapshots to create milestones
• When testing reveals issues, prioritize using RevertSnapshot to rollback recent modifications
• For major feature rollbacks, use ConsolidateSnapshots with rollback strategy
• To work on different projects, use SwitchWorkspaceTool to change current workspace
`;

      // Examples: Common working patterns
      const examples = `**Common Working Patterns**:

**Workspace Switching**:
SwitchWorkspaceTool("/path/to/new/project") → [SnapshotManager closed and recreated]
SwitchWorkspaceTool("../other-project") → [relative paths work too]

**New Feature Development** (in current workspace):
ReadFile → ApplyWholeFileEdit(goal="Implement XX feature") → BashCommand(test) → ConsolidateSnapshots(title="XX feature completed")

**Code Fixing** (in current workspace):
ListSnapshots(limit=5) → ReadSnapshot(check issues) → ApplyEditBlock(goal="Fix XX problem") → BashCommand(verify)

**Project Switching**:
ConsolidateSnapshots(title="Current work checkpoint") → SwitchWorkspaceTool("/path/to/other/project") → ListSnapshots()

**Cross-Project Work**:
SwitchWorkspaceTool("/project1") → [do some work] → SwitchWorkspaceTool("/project2") → [do other work]
`;

      return {
        workflow: workflow,
        status: status,
        guideline: guideline,
        examples: examples
      };
    },
    toolSetFn: () => {
      // Cast to extended context to access workspace tools
      const extendedCtx = baseContext as ICodingContext;
      const workspaceTools = createWorkspaceTools(extendedCtx);
      
      const allTools: ITool<any, any, IAgent>[] = [
        ...workspaceTools,
        ...SnapshotEditingToolSet,
        ...snapshotManagerTools,
        ...ReadToolSet,
        ...BashToolSet,
        WebSearchTool,
      ];
      
      return {
        name: 'CodingAgentTools',
        description: 'Core tools for the Coding Agent, including simple workspace switching, file system, runtime, and editing tools.',
        tools: allTools,
        active: true,
        source: 'local',
      };
    },
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

      // Log workspace management operations
      if (toolName === 'SwitchWorkspaceTool') {
        if (resultData?.success) {
          console.log(`${toolName} succeeded:`, resultData.message);
        } else {
          console.log(`${toolName} failed:`, resultData?.message);
        }
      }
    }
  });

  // Extend the base context with runtime, sandbox, and snapshot functionality
  const extendedContext = baseContext as ICodingContext;
  
  extendedContext.getRuntime = () => runtime;
  extendedContext.getSandbox = () => sandbox;
  extendedContext.getSnapshotManager = () => snapshotManager;
  
  // Get current workspace
  extendedContext.getCurrentWorkspace = () => {
    const data = extendedContext.getData();
    return data.current_workspace || workspacePath;
  };
  
  // Switch workspace implementation - 极简版本
  extendedContext.switchToWorkspace = async (targetWorkspacePath: string) => {
    // Update the workspace
    extendedContext.setData({ current_workspace: targetWorkspacePath });
    
    // Close current SnapshotManager and create new one for the target workspace
    // Note: JavaScript doesn't have explicit cleanup for the old manager, 
    // but creating a new instance will replace the reference
    snapshotManager = new SnapshotManager(targetWorkspacePath);
    
    logger.info(`Switched to workspace: ${targetWorkspacePath}, SnapshotManager recreated`);
  };
  
  return extendedContext;
}

// Export a default instance factory function for backward compatibility
export const CodingContext = createCodingContext; 