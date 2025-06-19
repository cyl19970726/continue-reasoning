/**
 * Simple Snapshot Tools - User-facing tools for the simplified snapshot system
 */

import { z } from 'zod';
import { SimpleSnapshotManager } from './simple-snapshot-manager';
import { createTool } from '@continue-reasoning/core';
import { IAgent } from '@continue-reasoning/core';
import { IRuntime } from '../runtime/interface';
import { ICodingContext } from '../coding-context';

/**
 * Get the shared SimpleSnapshotManager instance from CodingContext
 */
function getSnapshotManager(agent?: IAgent): SimpleSnapshotManager {
  const codingContext = agent?.contextManager.findContextById('coding-context') as ICodingContext;
  if (!codingContext) {
    throw new Error('Coding context not found');
  }
  
  return codingContext.getSnapshotManager();
}

export const ReadMilestoneTool = createTool({
  id: 'ReadMilestone',
  name: 'ReadMilestone',
  description: 'Read the content of a specific milestone',
  inputSchema: z.object({
    milestoneId: z.string().describe("The ID of the milestone to read")
  }),
  async: false,
  execute: async (params, agent?: IAgent) => {
    const snapshotManager = getSnapshotManager(agent);
    const milestone = await snapshotManager.getMilestone(params.milestoneId);
    if (!milestone) {
      return {
        success: false,
        message: `Milestone ${params.milestoneId} not found`
      };
    }else{
      return {
        success: true,
        milestone: milestone,
        message: `Successfully read milestone ${params.milestoneId}`
      };
    }
  }
});

// ReadSnapshotDiff Tool
export const ReadSnapshotTool = createTool({
  id: 'ReadSnapshot',
  name: 'ReadSnapshot',
  description: 'Read the diff content of a specific snapshot (Git format only)',
  inputSchema: z.object({
    snapshotId: z.string().describe("The ID of the snapshot to read")
  }),
  outputSchema: z.object({
    success: z.boolean(),
    diff: z.string().optional(),
    snapshot: z.object({
      id: z.string(),
      timestamp: z.string(),
      description: z.string(),
      tool: z.string(),
      affectedFiles: z.array(z.string())
    }).optional(),
    message: z.string().optional()
  }),
  async: true,
  execute: async (params, agent?: IAgent) => {
    try {
      const snapshotManager = getSnapshotManager(agent);
      const result = await snapshotManager.readSnapshotDiff(params.snapshotId);
      
      if (!result.success) {
        return {
          success: false,
          message: `Failed to read snapshot ${params.snapshotId}`
        };
      }

      return {
        success: true,
        diff: result.diff,
        snapshot: result.snapshot
      };
    } catch (error: any) {
      return {
        success: false,
        message: `Error reading snapshot diff: ${error.message || 'Unknown error'}`
      };
    }
  }
});

// GetSnapshots Tool (renamed from GetEditHistory)
const ListSnapshotsParamsSchema = z.object({
  limit: z.number().int().min(1).max(100).optional().describe("Number of snapshots to return, default 20"),
  recent: z.number().int().min(1).max(50).optional().describe("Get the most recent n snapshots, takes priority over other filters"),
  includeDiffs: z.boolean().optional().describe("Whether to include diff content, default false"),
  since: z.string().optional().describe("History since specified time (ISO format)"),
  until: z.string().optional().describe("History until specified time (ISO format)"),
  toolFilter: z.array(z.string()).optional().describe("Filter by tool type"),
  fileFilter: z.string().optional().describe("Filter by file path (supports glob pattern)")
});

const ListSnapshotsReturnsSchema = z.object({
  success: z.boolean(),
  snapshots: z.array(z.object({
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

export const ListSnapshotsTool = createTool({
  id: 'ListSnapshots',
  name: 'ListSnapshots',
  description: 'Get snapshot history with support for recent n records and multiple filtering options',
  inputSchema: ListSnapshotsParamsSchema,
  outputSchema: ListSnapshotsReturnsSchema,
  async: true,
  execute: async (params, agent?: IAgent) => {
    try {
      const snapshotManager = getSnapshotManager(agent);

      // If recent is specified, use it as the primary filter
      let queryParams;
      if (params.recent) {
        queryParams = {
          limit: params.recent,
          includeDiffs: params.includeDiffs
        };
      } else {
        queryParams = {
          limit: params.limit,
          includeDiffs: params.includeDiffs,
          since: params.since,
          until: params.until,
          toolFilter: params.toolFilter,
          fileFilter: params.fileFilter
        };
      }

      const result = await snapshotManager.getEditHistory(queryParams);

      return {
        success: true,
        snapshots: result.history,
        pagination: result.pagination
      };
    } catch (error: any) {
      console.error('ListSnapshotsTool error:', error);
      return {
        success: false,
        snapshots: [],
        pagination: { total: 0, hasMore: false }
      };
    }
  }
});

// ReverseOp Tool (existing, but renamed for clarity)
const ReverseSnapshotParamsSchema = z.object({
  snapshotId: z.string().describe("The snapshot ID to reverse"),
  dryRun: z.boolean().optional().describe("Whether to only preview without execution, default false"),
  targetSnapshot: z.string().optional().describe("Reverse to specific snapshot state (reverse multiple operations)"),
  force: z.boolean().optional().describe("Whether to force reverse, ignoring conflict detection, default false")
});

const ReverseSnapshotReturnsSchema = z.object({
  success: z.boolean(),
  message: z.string().optional(),
  reversedDiff: z.string().optional().describe("The actually applied reverse diff"),
  affectedFiles: z.array(z.string()).optional(),
  conflicts: z.array(z.string()).optional().describe("Detected conflicts"),
  newSnapshotId: z.string().optional().describe("Snapshot ID of the reverse operation itself")
});

export const ReverseSnapshotTool = createTool({
  id: 'ReverseSnapshot',
  name: 'ReverseSnapshot',
  description: 'Reverse a specific snapshot operation with support for dry run mode and conflict detection',
  inputSchema: ReverseSnapshotParamsSchema,
  outputSchema: ReverseSnapshotReturnsSchema,
  async: true,
  execute: async (params, agent?: IAgent) => {
    try {
      const codingContext = agent?.contextManager.findContextById('coding-context') as ICodingContext;
      if (!codingContext) {
        throw new Error('Coding context not found');
      }

      const runtime = codingContext.getRuntime() as IRuntime;
      if (!runtime) {
        throw new Error('Runtime not found in the coding context');
      }

      const snapshotManager = getSnapshotManager(agent);

      const result = await snapshotManager.reverseOp(params.snapshotId, {
        dryRun: params.dryRun,
        targetSnapshot: params.targetSnapshot,
        force: params.force
      }, runtime);

      return result;
    } catch (error: any) {
      console.error('ReverseSnapshotTool error:', error);
      return {
        success: false,
        message: `Failed to reverse snapshot: ${error.message || 'Unknown error'}`
      };
    }
  }
});

// ReverseMilestone Tool
const ReverseMilestoneParamsSchema = z.object({
  milestoneId: z.string().describe("The milestone ID to reverse"),
  dryRun: z.boolean().optional().describe("Whether to only preview without execution, default false"),
  force: z.boolean().optional().describe("Whether to force reverse, ignoring conflict detection, default false")
});

const ReverseMilestoneReturnsSchema = z.object({
  success: z.boolean(),
  message: z.string().optional(),
  reversedSnapshots: z.array(z.string()).optional().describe("List of reversed snapshot IDs"),
  affectedFiles: z.array(z.string()).optional(),
  conflicts: z.array(z.string()).optional().describe("Detected conflicts"),
  newSnapshotId: z.string().optional().describe("Snapshot ID of the reverse operation itself")
});

export const ReverseMilestoneTool = createTool({
  id: 'ReverseMilestone',
  name: 'ReverseMilestone',
  description: 'Reverse all operations in a milestone, reversing all snapshots in the milestone in reverse order',
  inputSchema: ReverseMilestoneParamsSchema,
  outputSchema: ReverseMilestoneReturnsSchema,
  async: true,
  execute: async (params, agent?: IAgent) => {
    try {
      const codingContext = agent?.contextManager.findContextById('coding-context') as ICodingContext;
      if (!codingContext) {
        throw new Error('Coding context not found');
      }

      const runtime = codingContext.getRuntime() as IRuntime;
      if (!runtime) {
        throw new Error('Runtime not found in the coding context');
      }

      const snapshotManager = getSnapshotManager(agent);

      // Get milestone details to find snapshot IDs
      const milestonesResult = await snapshotManager.getMilestones(false);
      const milestone = milestonesResult.milestones.find(m => m.id === params.milestoneId);
      
      if (!milestone) {
        return {
          success: false,
          message: `Milestone ${params.milestoneId} not found`
        };
      }

      // Get milestone details to find snapshot IDs
      const milestoneData = await snapshotManager.getMilestone(params.milestoneId);
      if (!milestoneData) {
        return {
          success: false,
          message: `Failed to load milestone data for ${params.milestoneId}`
        };
      }

      const snapshotIds = milestoneData.snapshotIds;
      
      if (params.dryRun) {
        return {
          success: true,
          message: `[DRY RUN] Would reverse milestone ${params.milestoneId} containing ${snapshotIds.length} snapshots`,
          reversedSnapshots: snapshotIds
        };
      }

      // Reverse snapshots in reverse order (last to first)
      const reversedSnapshots: string[] = [];
      const allAffectedFiles: string[] = [];
      const allConflicts: string[] = [];
      
      for (let i = snapshotIds.length - 1; i >= 0; i--) {
        const snapshotId = snapshotIds[i];
        
        try {
          const reverseResult = await snapshotManager.reverseOp(snapshotId, {
            dryRun: false,
            force: params.force
          }, runtime);
          
          if (reverseResult.success) {
            reversedSnapshots.push(snapshotId);
            if (reverseResult.affectedFiles) {
              allAffectedFiles.push(...reverseResult.affectedFiles);
            }
          } else {
            // If one snapshot fails, we might want to continue or stop
            console.warn(`Failed to reverse snapshot ${snapshotId}: ${reverseResult.message}`);
            if (reverseResult.conflicts) {
              allConflicts.push(...reverseResult.conflicts);
            }
            
            if (!params.force) {
              return {
                success: false,
                message: `Failed to reverse snapshot ${snapshotId} in milestone: ${reverseResult.message}. Use force=true to continue despite conflicts.`,
                reversedSnapshots,
                conflicts: allConflicts
              };
            }
          }
        } catch (error: any) {
          console.error(`Error reversing snapshot ${snapshotId}:`, error);
          if (!params.force) {
            return {
              success: false,
              message: `Error reversing snapshot ${snapshotId}: ${error.message}`,
              reversedSnapshots
            };
          }
        }
      }

      // Create a snapshot for the milestone reversal operation
      const combinedDiff = `Reversed milestone: ${milestone.title}\nReversed ${reversedSnapshots.length} snapshots`;
      
      const newSnapshotId = await snapshotManager.createSnapshot({
        tool: 'ReverseMilestone',
        description: `Reversed milestone: ${milestone.title}`,
        affectedFiles: [...new Set(allAffectedFiles)], // Remove duplicates
        diff: combinedDiff,
        context: {
          sessionId: 'default',
          toolParams: { 
            milestoneId: params.milestoneId,
            reversedSnapshots
          }
        },
        metadata: {
          filesSizeBytes: combinedDiff.length,
          linesChanged: reversedSnapshots.length,
          executionTimeMs: 0
        }
      });

      return {
        success: true,
        message: `Successfully reversed milestone ${params.milestoneId} (${reversedSnapshots.length} snapshots)`,
        reversedSnapshots,
        affectedFiles: [...new Set(allAffectedFiles)],
        conflicts: allConflicts.length > 0 ? allConflicts : undefined,
        newSnapshotId
      };
    } catch (error: any) {
      console.error('ReverseMilestoneTool error:', error);
      return {
        success: false,
        message: `Failed to reverse milestone: ${error.message || 'Unknown error'}`
      };
    }
  }
});

// CreateMilestone Tool
const CreateMilestoneParamsSchema = z.object({
  title: z.string().describe("Milestone title"),
  description: z.string().describe("Milestone description"),
  snapshotIds: z.array(z.string()).describe("List of snapshot IDs to include"),
  tags: z.array(z.string()).optional().describe("Tags")
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
  description: 'Create a milestone by combining multiple operations into a logical unit',
  inputSchema: CreateMilestoneParamsSchema,
  outputSchema: CreateMilestoneReturnsSchema,
  async: true,
  execute: async (params, agent?: IAgent) => {
    try {
      const snapshotManager = getSnapshotManager(agent);

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

// CreateMilestoneByRange Tool
const CreateMilestoneByRangeParamsSchema = z.object({
  title: z.string().describe("Milestone title"),
  description: z.string().describe("Milestone description"),
  endSnapshotId: z.string().optional().describe("End snapshot ID, if not specified, use the latest snapshot"),
  tags: z.array(z.string()).optional().describe("Tags")
});

const CreateMilestoneByRangeReturnsSchema = z.object({
  success: z.boolean(),
  milestoneId: z.string().optional(),
  snapshotIds: z.array(z.string()).optional().describe("List of actually included snapshot IDs"),
  summary: z.object({
    totalOperations: z.number(),
    affectedFiles: z.array(z.string()),
    linesAdded: z.number(),
    linesRemoved: z.number()
  }).optional()
});

export const CreateMilestoneByRangeTool = createTool({
  id: 'CreateMilestoneByRange',
  name: 'CreateMilestoneByRange',
  description: 'Convenient milestone creation: automatically start from the next snapshot after the last milestone to the specified end snapshot (or latest snapshot), ensuring continuous coverage',
  inputSchema: CreateMilestoneByRangeParamsSchema,
  outputSchema: CreateMilestoneByRangeReturnsSchema,
  async: true,
  execute: async (params, agent?: IAgent) => {
    try {
      const snapshotManager = getSnapshotManager(agent);

      const result = await snapshotManager.createMilestoneByRange({
        title: params.title,
        description: params.description,
        endSnapshotId: params.endSnapshotId,
        tags: params.tags
      });

      return result;
    } catch (error: any) {
      console.error('CreateMilestoneByRangeTool error:', error);
      return {
        success: false,
        message: `Failed to create milestone by range: ${error.message || 'Unknown error'}`
      };
    }
  }
});

// GetMilestones Tool (enhanced with recent support)
const ListMilestonesParamsSchema = z.object({
  recent: z.number().int().min(1).max(20).optional().describe("Get the most recent n milestones, takes priority over other filtering conditions"),
  includeDiffs: z.boolean().optional().describe("Whether to include merged diff, default false"),
  tags: z.array(z.string()).optional().describe("Filter by tags")
});

const ListMilestonesReturnsSchema = z.object({
  success: z.boolean(),
  message: z.string().optional(),
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

export const ListMilestonesTool = createTool({
  id: 'ListMilestones',
  name: 'ListMilestones',
  description: 'Get milestones list with support for recent n records, including merged diff and filtering by tags',
  inputSchema: ListMilestonesParamsSchema,
  outputSchema: ListMilestonesReturnsSchema,
  async: true,
  execute: async (params, agent?: IAgent) => {
    try {
      const snapshotManager = getSnapshotManager(agent);

      const result = await snapshotManager.getMilestones(
        params.includeDiffs || false,
        params.tags
      );

      // If recent is specified, limit the results
      let milestones = result.milestones;
      if (params.recent) {
        milestones = milestones
          .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
          .slice(0, params.recent);
      }

      return {
        success: true,
        message: `Successfully listed ${milestones.length} milestones`,
        milestones
      };
    } catch (error: any) {
      console.error('ListMilestonesTool error:', error);
      return {
        success: false,
        message: `Failed to list milestones: ${error.message || 'Unknown error'}`,
        milestones: []
      };
    }
  }
});

// Enhanced CreateSnapshotIgnore Tool
export const CreateSnapshotIgnoreTool = createTool({
  id: 'CreateSnapshotIgnore',
  name: 'CreateSnapshotIgnore',
  description: 'Create default .snapshotignore file to configure files and directories that the snapshot system should ignore (similar to .gitignore)',
  inputSchema: z.object({
    force: z.boolean().optional().describe("Whether to force overwrite existing .snapshotignore file, default false")
  }),
  outputSchema: z.object({
    success: z.boolean(),
    message: z.string(),
    ignoreFilePath: z.string().optional()
  }),
  async: true,
  execute: async (params, agent?: IAgent) => {
    try {
      const snapshotManager = getSnapshotManager(agent);
      const ignoreInfo = snapshotManager.getIgnoreInfo();
      
      if (ignoreInfo.ignoreFileExists && !params.force) {
        return {
          success: false,
          message: `❌ .snapshotignore file already exists: ${ignoreInfo.ignoreFilePath}. Use force=true to overwrite.`,
          ignoreFilePath: ignoreInfo.ignoreFilePath
        };
      }
      
      await snapshotManager.createDefaultSnapshotIgnore();
      
      return {
        success: true,
        message: `✅ Successfully created .snapshotignore file: ${ignoreInfo.ignoreFilePath}`,
        ignoreFilePath: ignoreInfo.ignoreFilePath
      };
    } catch (error: any) {
      return {
        success: false,
        message: `❌ Failed to create .snapshotignore file: ${error.message || 'Unknown error'}`
      };
    }
  }
});

// Enhanced GetSnapshotIgnoreInfo Tool
export const GetSnapshotIgnoreInfoTool = createTool({
  id: 'GetSnapshotIgnoreInfo',
  name: 'GetSnapshotIgnoreInfo',
  description: 'Get detailed information about current snapshot ignore rules, including file path, existence status and loaded rules',
  inputSchema: z.object({
    showPatterns: z.boolean().optional().describe("Whether to display detailed ignore rules list, default true")
  }),
  outputSchema: z.object({
    success: z.boolean(),
    ignoreFilePath: z.string(),
    ignoreFileExists: z.boolean(),
    isLoaded: z.boolean(),
    patternCount: z.number(),
    patterns: z.array(z.string()).optional()
  }),
  async: false,
  execute: async (params, agent?: IAgent) => {
    try {
      const snapshotManager = getSnapshotManager(agent);
      const ignoreInfo = snapshotManager.getIgnoreInfo();
      
      return {
        success: true,
        ignoreFilePath: ignoreInfo.ignoreFilePath,
        ignoreFileExists: ignoreInfo.ignoreFileExists,
        isLoaded: ignoreInfo.isLoaded,
        patternCount: ignoreInfo.patterns.length,
        patterns: (params.showPatterns !== false) ? ignoreInfo.patterns : undefined
      };
    } catch (error: any) {
      return {
        success: false,
        ignoreFilePath: '',
        ignoreFileExists: false,
        isLoaded: false,
        patternCount: 0,
        patterns: []
      };
    }
  }
});

// Enhanced ReloadSnapshotIgnore Tool
export const ReloadSnapshotIgnoreTool = createTool({
  id: 'ReloadSnapshotIgnore',
  name: 'ReloadSnapshotIgnore',
  description: 'Reload ignore rules from .snapshotignore file (use after manually modifying the ignore file)',
  inputSchema: z.object({
    dummy: z.string().optional().describe("Placeholder parameter")
  }),
  outputSchema: z.object({
    success: z.boolean(),
    message: z.string(),
    patternCount: z.number().optional()
  }),
  async: true,
  execute: async (params, agent?: IAgent) => {
    try {
      const snapshotManager = getSnapshotManager(agent);
      
      await snapshotManager.reloadIgnoreRules();
      const ignoreInfo = snapshotManager.getIgnoreInfo();
      
      return {
        success: true,
        message: `✅ Successfully reloaded ignore rules, currently have ${ignoreInfo.patterns.length} rules`,
        patternCount: ignoreInfo.patterns.length
      };
    } catch (error: any) {
      return {
        success: false,
        message: `❌ Failed to reload ignore rules: ${error.message || 'Unknown error'}`
      };
    }
  }
});

// Export all tools
export const SimpleSnapshotToolSet = [
  ReadMilestoneTool,
  ReadSnapshotTool,
  ListSnapshotsTool, // Renamed from GetEditHistoryTool
  ReverseSnapshotTool, // Renamed from ReverseOpTool for clarity
  ReverseMilestoneTool, // New tool
  CreateMilestoneTool,
  CreateMilestoneByRangeTool,
  ListMilestonesTool,
  // 🆕 新增ignore管理工具
  CreateSnapshotIgnoreTool,
  GetSnapshotIgnoreInfoTool,
  ReloadSnapshotIgnoreTool
];