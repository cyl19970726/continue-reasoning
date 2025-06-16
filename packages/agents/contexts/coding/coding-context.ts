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
import { SimpleSnapshotManager } from './snapshot/simple-snapshot-manager';

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
    description: 'Manages file operations and code modifications using diff-driven development workflow with comprehensive editing tools.',
    dataSchema: CodingContextDataSchema,
    initialData: parsedInitialData,
    renderPromptFn: (data: CodingContextData): PromptCtx => {
      // 工作流程：详细但简洁的编程流程
      const workflow = `**编程工作流程**：
1. **分析需求** → 确定要创建/修改的文件和功能
2. **读取现有代码** → 使用 ReadFile 或者 BashCommand 了解当前状态
3. **选择编辑策略** → 根据修改范围选择合适的编辑工具
4. **实施修改** → 应用代码变更并生成差异
5. **测试验证** → 运行代码确保功能正确`;

      // 状态信息：包含更多上下文
      let status = `**工作目录**: ${data.current_workspace}
**编辑策略**: ${data.selected_editing_strategy}`;

      // 文件上下文详细信息
      if (data.open_files && Object.keys(data.open_files).length > 0) {
        const fileList = Object.keys(data.open_files).slice(0, 5); // 最多显示5个文件
        const fileCount = Object.keys(data.open_files).length;
        status += `\n**活跃文件** (${fileCount}个): ${fileList.join(', ')}`;
        if (fileCount > 5) {
          status += ` ...等${fileCount - 5}个`;
        }
      }

      // 变更信息
      if (data.active_diffs && Object.keys(data.active_diffs).length > 0) {
        const diffFiles = Object.keys(data.active_diffs);
        status += `\n**待处理变更**: ${diffFiles.join(', ')}`;
      }

      // 指导原则：具体的最佳实践
      const guideline = `**编程最佳实践**：
• 修改前先用 ReadFile 了解代码结构
• 优先使用 ApplyWholeFileEdit 进行完整文件操作
• 小范围修改使用 ApplyEditBlock 或 ApplyRangedEdit
• 修改后用 BashCommand 测试功能
• 出现错误时用 ReverseDiff 回滚变更`;

      // 示例：常见的工作模式
      const examples = `**常见工作模式**：
创建新文件: ApplyWholeFileEdit → BashCommand(测试)
修改现有代码: ReadFile → ApplyEditBlock → BashCommand(验证)
重构代码: ReadFile → ApplyWholeFileEdit → CompareFiles → BashCommand
处理错误: ReverseDiff → ReadFile → ApplyEditBlock → BashCommand`;

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

  // Extend the base context with runtime and sandbox functionality
  const extendedContext = baseContext as ICodingContext;
  
  extendedContext.getRuntime = () => runtime;
  extendedContext.getSandbox = () => sandbox;
  
  return extendedContext;
}

// Export a default instance factory function for backward compatibility
export const CodingContext = createCodingContext; 