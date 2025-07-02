import { IContext, ITool, IAgent, ToolExecutionResult, ToolSet as ToolSetInterface, IRAGEnabledContext, PromptCtx } from '@continue-reasoning/core';
import { z } from 'zod';
import { logger } from '@continue-reasoning/core';
import { createTool } from '@continue-reasoning/core';
import { EditingStrategyToolSet, BashToolSet, EditingStrategyToolExamples, GrepToolSet } from './toolsets';
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

// AgentStopTool - 停止Agent执行
const AgentStopTool = createTool({
  name: 'AgentStopTool',
  description: 'Stop the agent execution completely. Use this when the task is completed or when you need to terminate agent processing.',
  inputSchema: z.object({
    reason: z.string().describe('Reason for stopping the agent. Example: "Task completed successfully" or "User request fulfilled"')
  }),
  async: false,
  execute: async (args, agent) => {
    const { reason } = args;
    
    if (!agent) {
      return {
        success: false,
        message: 'Agent context is required to stop execution'
      };
    }

    try {
      // Call the agent's stop method
      await agent.stop();
      
      return {
        success: true,
        message: `Agent stopped successfully. Reason: ${reason}`,
        stopped: true
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to stop agent: ${error}`,
        stopped: false
      };
    }
  }
});

// TodosManagerTool - 管理context data中的todos
const TodosManagerTool = createTool({
  name: 'TodosManagerTool',
  description: 'Manage todos list stored in coding context. Use markdown format: "- [ ] task" for open tasks, "- [x] task" for completed tasks. For simple 1-step tasks, todos creation is not required.',
  inputSchema: z.object({
    action: z.enum(['create', 'update', 'read']).describe('Action to perform: create (replace all todos), update (modify existing todos), or read (get current todos)'),
    todos: z.string().optional().describe('Todos in markdown format. Example: "- [ ] task1\\n- [ ] task2\\n- [x] completed_task". Required for create and update actions.')
  }),
  async: false,
  execute: async (args, agent) => {
    const { action, todos } = args;
    
    if (!agent) {
      return {
        success: false,
        message: 'Agent context is required',
        todos: ''
      };
    }

    // Get the coding context
    const codingContext = agent.contextManager.findContextById('coding-context');
    if (!codingContext) {
      return {
        success: false,
        message: 'Coding context not found',
        todos: ''
      };
    }

    const contextData = codingContext.getData();
    const currentTodos = contextData.todos || '';
    
    switch (action) {
      case 'create':
        if (!todos || todos.trim() === '') {
          return {
            success: false,
            message: 'Todos string is required for create action',
            todos: currentTodos
          };
        }
        
        // Update context data
        codingContext.setData({
          ...contextData,
          todos: todos.trim()
        });
        
        const createTaskCount = (todos.match(/^- \[/gm) || []).length;
        return {
          success: true,
          message: `Created new todos list with ${createTaskCount} tasks`,
          todos: todos.trim()
        };
        
      case 'update':
        if (!todos) {
          return {
            success: false,
            message: 'Todos string is required for update action',
            todos: currentTodos
          };
        }
        
        // Update context data
        codingContext.setData({
          ...contextData,
          todos: todos.trim()
        });
        
        const updateTaskCount = (todos.match(/^- \[/gm) || []).length;
        return {
          success: true,
          message: `Updated todos list with ${updateTaskCount} tasks`,
          todos: todos.trim()
        };
        
      case 'read':
        const taskCount = currentTodos ? (currentTodos.match(/^- \[/gm) || []).length : 0;
        return {
          success: true,
          message: `Current todos list has ${taskCount} tasks`,
          todos: currentTodos
        };
        
      default:
        return {
          success: false,
          message: `Unknown action: ${action}`,
          todos: currentTodos
        };
    }
  }
});

// Schema for CodingContext persistent data - 极简版本
export const CodingContextDataSchema = z.object({
  current_workspace: z.string().describe("Current active workspace path."),
  todos: z.string().optional().describe("Current task list in markdown format. Example: '- [ ] task1\\n- [ ] task2'. Mark completed tasks with '- [x] task1'."),
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
    todos: 'None Todos',
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
    description: 'Manages file operations and code modifications using diff-driven development workflow with workspace switching and advanced code search capabilities.',
    dataSchema: CodingContextDataSchema,
    initialData: parsedInitialData,
    renderPromptFn: (data: CodingContextData): PromptCtx => {
      // 简化的状态信息，主要prompt内容现在由Agent统一管理
      const currentWorkspace = data.current_workspace;
      
      const status = `**🎯 CURRENT WORKSPACE**: ${currentWorkspace}`;
      
      // 简化的基本信息，不再包含复杂的工作流和示例
      const workflow = `**Current Workspace**: ${currentWorkspace}`;
      const guideline = `**Workspace Operations**: All file operations are restricted to: ${currentWorkspace}/**`;
      const examples = `**Note**: All programming guidelines and examples are now managed centrally by the Agent.`;

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
        ...GrepToolSet,
        WebSearchTool,
        TodosManagerTool,
        AgentStopTool,
      ];
      
      return {
        name: 'CodingAgentTools',
        description: 'Core tools for the Coding Agent, including workspace switching, file system, code search (Grep), runtime, and editing tools.',
        tools: allTools,
        active: true,
        source: 'local',
      };
    },
            handleToolCall: (toolCallResult: ToolExecutionResult) => {
      const toolName = toolCallResult.name || 'Unknown';
      const callId = toolCallResult.call_id || 'Unknown';
      
      console.log(`CodingContext.onToolCall: Tool ${toolName} (ID: ${callId}) executed.`);
      
      // Log additional debug info if name/id are missing
      if (!toolCallResult.name || !toolCallResult.call_id) {
        console.warn('Tool call result missing name or call_id:', {
          name: toolCallResult.name,
          call_id: toolCallResult.call_id,
          resultKeys: Object.keys(toolCallResult.result || {})
        });
      }
      
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