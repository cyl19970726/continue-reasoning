/**
 * Simple Snapshot Tools - User-facing tools for the simplified snapshot system
 */

import { z } from 'zod';
import { SimpleSnapshotManager } from './simple-snapshot-manager';
import { createTool } from '@continue-reasoning/core';
import { IAgent } from '@continue-reasoning/core';
import { IRuntime } from '../runtime/interface';

// ReadSnapshotDiff Tool
const ReadSnapshotDiffParamsSchema = z.object({
  snapshotId: z.string().describe("快照ID"),
  format: z.enum(['unified', 'context', 'git']).optional().describe("diff格式，默认unified")
});

const ReadSnapshotDiffReturnsSchema = z.object({
  success: z.boolean(),
  diff: z.string().optional().describe("diff内容"),
  snapshot: z.object({
    id: z.string(),
    timestamp: z.string(),
    description: z.string(),
    tool: z.string(),
    affectedFiles: z.array(z.string())
  }).optional().describe("快照基本信息")
});

export const ReadSnapshotDiffTool = createTool({
  id: 'ReadSnapshotDiff',
  name: 'ReadSnapshotDiff',
  description: '读取特定快照的diff内容，支持多种格式输出',
  inputSchema: ReadSnapshotDiffParamsSchema,
  outputSchema: ReadSnapshotDiffReturnsSchema,
  async: true,
  execute: async (params, agent?: IAgent) => {
    try {
      const codingContext = agent?.contextManager.findContextById('coding-context');
      if (!codingContext) {
        throw new Error('Coding context not found');
      }

      const workspacePath = codingContext.getData()?.current_workspace || process.cwd();
      const snapshotManager = new SimpleSnapshotManager(workspacePath);

      const result = await snapshotManager.readSnapshotDiff(
        params.snapshotId,
        params.format || 'unified'
      );

      return result;
    } catch (error: any) {
      console.error('ReadSnapshotDiffTool error:', error);
      return {
        success: false,
        message: `Failed to read snapshot diff: ${error.message || 'Unknown error'}`
      };
    }
  }
});

// GetEditHistory Tool
const GetEditHistoryParamsSchema = z.object({
  limit: z.number().int().min(1).max(100).optional().describe("返回的历史记录数量限制，默认20"),
  includeDiffs: z.boolean().optional().describe("是否包含diff内容，默认false"),
  since: z.string().optional().describe("从指定时间开始的历史 (ISO格式)"),
  until: z.string().optional().describe("到指定时间的历史 (ISO格式)"),
  toolFilter: z.array(z.string()).optional().describe("按工具类型过滤"),
  fileFilter: z.string().optional().describe("按文件路径过滤 (支持glob pattern)")
});

const GetEditHistoryReturnsSchema = z.object({
  success: z.boolean(),
  history: z.array(z.object({
    id: z.string(),
    timestamp: z.string(),
    description: z.string(),
    tool: z.string(),
    affectedFiles: z.array(z.string()),
    diff: z.string().optional(),
    metadata: z.object({
      linesChanged: z.number(),
      executionTimeMs: z.number()
    })
  })),
  pagination: z.object({
    total: z.number(),
    hasMore: z.boolean(),
    nextCursor: z.string().optional()
  })
});

export const GetEditHistoryTool = createTool({
  id: 'GetEditHistory',
  name: 'GetEditHistory',
  description: '获取编辑历史记录，支持多种过滤选项和可选的diff内容',
  inputSchema: GetEditHistoryParamsSchema,
  outputSchema: GetEditHistoryReturnsSchema,
  async: true,
  execute: async (params, agent?: IAgent) => {
    try {
      const codingContext = agent?.contextManager.findContextById('coding-context');
      if (!codingContext) {
        throw new Error('Coding context not found');
      }

      const workspacePath = codingContext.getData()?.current_workspace || process.cwd();
      const snapshotManager = new SimpleSnapshotManager(workspacePath);

      const result = await snapshotManager.getEditHistory({
        limit: params.limit,
        includeDiffs: params.includeDiffs,
        since: params.since,
        until: params.until,
        toolFilter: params.toolFilter,
        fileFilter: params.fileFilter
      });

      return {
        success: true,
        ...result
      };
    } catch (error: any) {
      console.error('GetEditHistoryTool error:', error);
      return {
        success: false,
        history: [],
        pagination: { total: 0, hasMore: false }
      };
    }
  }
});

// ReverseOp Tool
const ReverseOpParamsSchema = z.object({
  snapshotId: z.string().describe("要回滚的快照ID"),
  dryRun: z.boolean().optional().describe("是否只是预览不实际执行，默认false"),
  targetSnapshot: z.string().optional().describe("回滚到指定快照状态 (回滚多个操作)"),
  force: z.boolean().optional().describe("是否强制回滚，忽略冲突检测，默认false")
});

const ReverseOpReturnsSchema = z.object({
  success: z.boolean(),
  message: z.string().optional(),
  reversedDiff: z.string().optional().describe("实际应用的回滚diff"),
  affectedFiles: z.array(z.string()).optional(),
  conflicts: z.array(z.string()).optional().describe("检测到的冲突"),
  newSnapshotId: z.string().optional().describe("回滚操作本身的快照ID")
});

export const ReverseOpTool = createTool({
  id: 'ReverseOp',
  name: 'ReverseOp',
  description: '回滚指定的编辑操作，支持dry run模式和冲突检测',
  inputSchema: ReverseOpParamsSchema,
  outputSchema: ReverseOpReturnsSchema,
  async: true,
  execute: async (params, agent?: IAgent) => {
    try {
      const codingContext = agent?.contextManager.findContextById('coding-context');
      if (!codingContext) {
        throw new Error('Coding context not found');
      }

      const runtime = (codingContext as any).getRuntime() as IRuntime;
      if (!runtime) {
        throw new Error('Runtime not found in the coding context');
      }

      const workspacePath = codingContext.getData()?.current_workspace || process.cwd();
      const snapshotManager = new SimpleSnapshotManager(workspacePath);

      const result = await snapshotManager.reverseOp(params.snapshotId, {
        dryRun: params.dryRun,
        targetSnapshot: params.targetSnapshot,
        force: params.force
      }, runtime);

      return result;
    } catch (error: any) {
      console.error('ReverseOpTool error:', error);
      return {
        success: false,
        message: `Failed to reverse operation: ${error.message || 'Unknown error'}`
      };
    }
  }
});

// CreateMilestone Tool
const CreateMilestoneParamsSchema = z.object({
  title: z.string().describe("里程碑标题"),
  description: z.string().describe("里程碑描述"),
  snapshotIds: z.array(z.string()).describe("包含的快照ID列表"),
  tags: z.array(z.string()).optional().describe("标签")
});

const CreateMilestoneReturnsSchema = z.object({
  success: z.boolean(),
  milestoneId: z.string().optional(),
  summary: z.object({
    totalOperations: z.number(),
    affectedFiles: z.array(z.string()),
    linesAdded: z.number(),
    linesRemoved: z.number()
  }).optional()
});

export const CreateMilestoneTool = createTool({
  id: 'CreateMilestone',
  name: 'CreateMilestone',
  description: '创建里程碑，将多个操作合并为一个逻辑单元',
  inputSchema: CreateMilestoneParamsSchema,
  outputSchema: CreateMilestoneReturnsSchema,
  async: true,
  execute: async (params, agent?: IAgent) => {
    try {
      const codingContext = agent?.contextManager.findContextById('coding-context');
      if (!codingContext) {
        throw new Error('Coding context not found');
      }

      const workspacePath = codingContext.getData()?.current_workspace || process.cwd();
      const snapshotManager = new SimpleSnapshotManager(workspacePath);

      const result = await snapshotManager.createMilestone({
        title: params.title,
        description: params.description,
        snapshotIds: params.snapshotIds,
        tags: params.tags
      });

      return result;
    } catch (error: any) {
      console.error('CreateMilestoneTool error:', error);
      return {
        success: false,
        message: `Failed to create milestone: ${error.message || 'Unknown error'}`
      };
    }
  }
});

// GetMilestones Tool
const GetMilestonesParamsSchema = z.object({
  includeDiffs: z.boolean().optional().describe("是否包含合并的diff，默认false"),
  tags: z.array(z.string()).optional().describe("按标签过滤")
});

const GetMilestonesReturnsSchema = z.object({
  success: z.boolean(),
  milestones: z.array(z.object({
    id: z.string(),
    title: z.string(),
    description: z.string(),
    timestamp: z.string(),
    summary: z.object({
      totalOperations: z.number(),
      affectedFiles: z.array(z.string()),
      linesAdded: z.number(),
      linesRemoved: z.number()
    }),
    combinedDiff: z.string().optional(),
    tags: z.array(z.string())
  }))
});

export const GetMilestonesTool = createTool({
  id: 'GetMilestones',
  name: 'GetMilestones',
  description: '获取所有里程碑列表，可选择包含合并diff和按标签过滤',
  inputSchema: GetMilestonesParamsSchema,
  outputSchema: GetMilestonesReturnsSchema,
  async: true,
  execute: async (params, agent?: IAgent) => {
    try {
      const codingContext = agent?.contextManager.findContextById('coding-context');
      if (!codingContext) {
        throw new Error('Coding context not found');
      }

      const workspacePath = codingContext.getData()?.current_workspace || process.cwd();
      const snapshotManager = new SimpleSnapshotManager(workspacePath);

      const result = await snapshotManager.getMilestones(
        params.includeDiffs || false,
        params.tags
      );

      return result;
    } catch (error: any) {
      console.error('GetMilestonesTool error:', error);
      return {
        success: false,
        milestones: []
      };
    }
  }
});

// Export all tools
export const SimpleSnapshotToolSet = [
  ReadSnapshotDiffTool,
  GetEditHistoryTool,
  ReverseOpTool,
  CreateMilestoneTool,
  GetMilestonesTool
];