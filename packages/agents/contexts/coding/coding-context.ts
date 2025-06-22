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
      // 工作流程：详细但简洁的编程流程
      const workflow = `**编程工作流程**：
1. **分析需求** → 确定要创建/修改的文件和功能
2. **读取现有代码** → 使用 ReadFile 或者 BashCommand 了解当前状态
3. **选择编辑策略** → 根据修改范围选择合适的编辑工具
4. **实施修改** → 应用代码变更并自动生成快照
5. **创建里程碑** → 将相关快照组织为逻辑单元
6. **测试验证** → 运行代码确保功能正确
7. **回滚处理** → 如有问题可回滚快照或里程碑`;

      // 状态信息：包含更多上下文
      let status = `**工作目录**: ${data.current_workspace}`;

      // 指导原则：具体的最佳实践
      const guideline = `**编程最佳实践**：

**📝 代码编辑工具** (自动创建快照):
• ${SnapshotEditingToolSet.map(tool => tool.name).join(', ')} - 所有编辑操作都会生成对应的snapshot,都需要 goal 参数描述目的.
• 优先使用 ApplyWholeFileEdit 进行完整文件操作
• 小范围修改使用 ApplyEditBlock 或 ApplyRangedEdit
• 删除文件使用 Delete 工具
• 应用现有diff使用 ApplyUnifiedDiff

**📊 快照管理工具**:
• ReadSnapshot - 查看快照内容和差异
• ListSnapshots - 查看快照历史 (支持 recent 参数)
• ReverseSnapshot - 回滚单个快照

**🎯 里程碑管理工具**:
• CreateMilestoneByRange - 自动创建里程碑 (从上个里程碑到指定快照)
• ReadMilestone - 查看里程碑详细内容
• ListMilestones - 查看里程碑列表 (支持 recent, tags 参数)
• ReverseMilestone - 回滚整个里程碑

**🔄 工作流程建议**:
• 修改前先用 ReadFile 了解代码结构
• 每次编辑都会自动创建快照，记录所有变更
• 完成一个功能模块后使用 CreateMilestoneByRange 创建里程碑
• 测试时如发现问题，优先使用 ReverseSnapshot 回滚最近的修改
• 大的功能回滚使用 ReverseMilestone
`;

      // 示例：常见的工作模式
      const examples = `**常见工作模式**：

**新功能开发**:
ReadFile → ApplyWholeFileEdit(goal="实现XX功能") → BashCommand(测试) → CreateMilestoneByRange(title="XX功能完成")

**代码修复**:
ListSnapshots(recent=5) → ReadSnapshot(查看问题) → ApplyEditBlock(goal="修复XX问题") → BashCommand(验证)

**重构代码**:
ReadFile → ApplyWholeFileEdit(goal="重构XX模块") → CompareFiles → BashCommand → CreateMilestone

**错误回滚**:
ListSnapshots(recent=3) → ReverseSnapshot(问题快照ID) → 或 ReverseMilestone(问题里程碑ID)
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