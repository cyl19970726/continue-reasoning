/**
 * Snapshot Manager Tools - Based on new modular SnapshotManager
 * 
 * Provides core snapshot management tools:
 * - ReadSnapshotTool: Read snapshot details
 * - ListSnapshotsTool: View snapshot history
 * - ConsolidateSnapshotsTool: Storage optimization (merge snapshots)
 * - RevertSnapshotTool: Rollback snapshots
 */

import { createTool, IAgent } from '@continue-reasoning/core';
import { z } from 'zod';
import { SnapshotManager } from './snapshot-manager';
import { IRuntime } from '../runtime/interface';

// Helper function to get workspace path from agent
function getWorkspacePath(agent?: IAgent): string {
  const codingContext = agent?.contextManager.findContextById('coding-context');
  if (codingContext) {
    const data = (codingContext as any).getData();
    if (data?.current_workspace) {
      return data.current_workspace;
    }
  }
  return process.cwd();
}

// Helper function to get runtime from agent
function getRuntime(agent?: IAgent): IRuntime | null {
  const codingContext = agent?.contextManager.findContextById('coding-context');
  if (codingContext) {
    return (codingContext as any).getRuntime() as IRuntime;
  }
  return null;
}

// Input schemas
const ReadSnapshotInputSchema = z.object({
  snapshotId: z.string().describe('Snapshot ID'),
  includeDiff: z.boolean().optional().describe('Whether to include diff content, default is true')
});

const ListSnapshotsInputSchema = z.object({
  limit: z.number().optional().describe('Limit of returned snapshots'),
  since: z.string().optional().describe('Start time (ISO string)'),
  until: z.string().optional().describe('End time (ISO string)'),
  toolFilter: z.array(z.string()).optional().describe('Filter by tool type'),
  fileFilter: z.string().optional().describe('Filter by file name'),
  includeDiffs: z.boolean().optional().describe('Whether to include diff content, default is false')
});

const ConsolidateSnapshotsInputSchema = z.object({
  // Either specify exact snapshot IDs or use sequence number range (mutually exclusive)
  snapshotIds: z.array(z.string()).optional().describe('List of specific snapshot IDs to merge (mutually exclusive with sequenceNumberRange)'),
  sequenceNumberRange: z.object({
    start: z.number().describe('Starting sequence number (inclusive)'),
    end: z.number().describe('Ending sequence number (inclusive)')
  }).optional().describe('Range of sequence numbers to merge (mutually exclusive with snapshotIds)'),
  
  title: z.string().describe('Title of the merged snapshot'),
  description: z.string().describe('Description of the merged snapshot'),
  deleteOriginals: z.boolean().optional().describe('Whether to delete original snapshots, default is true')
});

const RevertSnapshotInputSchema = z.object({
  snapshotId: z.string().describe('Snapshot ID to revert'),
  dryRun: z.boolean().optional().describe('Whether to preview only, not execute, default is false'),
  force: z.boolean().optional().describe('Whether to force execution, ignoring conflict checks, default is false')
});

// Output schemas
const SnapshotDetailSchema = z.object({
  id: z.string(),
  timestamp: z.string(),
  description: z.string(),
  tool: z.string(),
  affectedFiles: z.array(z.string()),
  sequenceNumber: z.number(),
  previousSnapshotId: z.string().optional(),
  diff: z.string().optional(),
  metadata: z.object({
    filesSizeBytes: z.number(),
    linesChanged: z.number(),
    executionTimeMs: z.number()
  })
});

const ReadSnapshotOutputSchema = z.object({
  success: z.boolean(),
  snapshot: SnapshotDetailSchema.optional(),
  error: z.string().optional()
});

const ListSnapshotsOutputSchema = z.object({
  success: z.boolean(),
  snapshots: z.array(SnapshotDetailSchema),
  pagination: z.object({
    total: z.number(),
    hasMore: z.boolean(),
    nextCursor: z.string().optional()
  }),
  error: z.string().optional()
});

const ConsolidateSnapshotsOutputSchema = z.object({
  success: z.boolean(),
  consolidatedSnapshotId: z.string().optional(),
  originalSnapshotIds: z.array(z.string()),
  spaceFreed: z.number(),
  message: z.string()
});

const RevertSnapshotOutputSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  reversedDiff: z.string().optional(),
  affectedFiles: z.array(z.string()).optional(),
  conflicts: z.array(z.string()).optional(),
  newSnapshotId: z.string().optional()
});

/**
 * ReadSnapshotTool - Read snapshot details
 */
export const ReadSnapshotTool = createTool({
  id: 'read_snapshot',
  name: 'ReadSnapshot',
  description: 'Read detailed information of specified snapshot, including metadata, affected files and optional diff content',
  inputSchema: ReadSnapshotInputSchema,
  outputSchema: ReadSnapshotOutputSchema,
  async: true,
  execute: async (params, agent?: IAgent) => {
    try {
      const workspacePath = getWorkspacePath(agent);
      const snapshotManager = new SnapshotManager(workspacePath);
      
      await snapshotManager.initialize();
      
      // Read snapshot
      const result = await snapshotManager.readSnapshotDiff(params.snapshotId);
      
      if (!result.success || !result.snapshot) {
        return {
          success: false,
          error: `Snapshot ${params.snapshotId} not found`
        };
      }

      if (params.includeDiff === undefined) {
        params.includeDiff = true;
      }
      
      // Build return data
      const snapshotDetail = {
        id: result.snapshot.id,
        timestamp: result.snapshot.timestamp,
        description: result.snapshot.description,
        tool: result.snapshot.tool,
        affectedFiles: result.snapshot.affectedFiles,
        sequenceNumber: 0, // TODO: Get from complete snapshot data
        previousSnapshotId: undefined, // TODO: Get from complete snapshot data
        diff: params.includeDiff ? result.diff : undefined,
        metadata: {
          filesSizeBytes: 0, // TODO: Get from complete snapshot data
          linesChanged: 0, // TODO: Get from complete snapshot data
          executionTimeMs: 0 // TODO: Get from complete snapshot data
        }
      };
      
      return {
        success: true,
        snapshot: snapshotDetail
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to read snapshot: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }
});

/**
 * ListSnapshotsTool - View snapshot history
 */
export const ListSnapshotsTool = createTool({
  id: 'list_snapshots',
  name: 'ListSnapshots',
  description: 'Get snapshot history list with support for various filtering conditions and pagination',
  inputSchema: ListSnapshotsInputSchema,
  outputSchema: ListSnapshotsOutputSchema,
  async: true,
  execute: async (params, agent?: IAgent) => {
    if (params.includeDiffs === undefined) {
      params.includeDiffs = false;
    }
    if (params.limit === undefined) {
      params.limit = 20;
    }

    try {
      const workspacePath = getWorkspacePath(agent);
      const snapshotManager = new SnapshotManager(workspacePath);
      
      await snapshotManager.initialize();
      
      // Get edit history
      const historyResult = await snapshotManager.getEditHistory({
        limit: params.limit,
        since: params.since,
        until: params.until,
        toolFilter: params.toolFilter,
        fileFilter: params.fileFilter,
        includeDiffs: params.includeDiffs
      });
      
      // Convert to output format - get sequenceNumber and previousSnapshotId from readSnapshotDiff
      const snapshots = [];
      for (const item of historyResult.history) {
        // Use readSnapshotDiff to get complete snapshot data
        const completeSnapshot = await snapshotManager.readSnapshotDiff(item.id);
        if (completeSnapshot.success && completeSnapshot.snapshot) {
          snapshots.push({
            id: item.id,
            timestamp: item.timestamp,
            description: item.description,
            tool: item.tool,
            affectedFiles: item.affectedFiles,
            sequenceNumber: completeSnapshot.snapshot.sequenceNumber,
            previousSnapshotId: completeSnapshot.snapshot.previousSnapshotId,
            diff: item.diff,
            metadata: {
              filesSizeBytes: completeSnapshot.snapshot.metadata?.filesSizeBytes || 0,
              linesChanged: item.metadata.linesChanged,
              executionTimeMs: item.metadata.executionTimeMs
            }
          });
        }
      }
      
      return {
        success: true,
        snapshots,
        pagination: historyResult.pagination
      };
    } catch (error) {
      return {
        success: false,
        snapshots: [],
        pagination: { total: 0, hasMore: false },
        error: `Failed to get snapshot list: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }
});

/**
 * ConsolidateSnapshotsTool - Storage optimization (merge snapshots)
 */
export const ConsolidateSnapshotsTool = createTool({
  id: 'consolidate_snapshots',
  name: 'ConsolidateSnapshots',
  description: 'Merge multiple consecutive snapshots into a single snapshot for storage optimization and snapshot chain simplification',
  inputSchema: ConsolidateSnapshotsInputSchema,
  outputSchema: ConsolidateSnapshotsOutputSchema,
  async: true,
  execute: async (params, agent?: IAgent) => {
    if (params.deleteOriginals === undefined) {
      params.deleteOriginals = true;
    }

    try {
      const workspacePath = getWorkspacePath(agent);
      const snapshotManager = new SnapshotManager(workspacePath);
      
      await snapshotManager.initialize();
      
      // Validate input: exactly one of snapshotIds or sequenceNumberRange must be provided
      const hasSnapshotIds = params.snapshotIds && params.snapshotIds.length > 0;
      const hasSequenceRange = params.sequenceNumberRange;
      
      if (!hasSnapshotIds && !hasSequenceRange) {
        return {
          success: false,
          originalSnapshotIds: [],
          spaceFreed: 0,
          message: 'Must provide either snapshotIds or sequenceNumberRange'
        };
      }
      
      if (hasSnapshotIds && hasSequenceRange) {
        return {
          success: false,
          originalSnapshotIds: params.snapshotIds || [],
          spaceFreed: 0,
          message: 'Cannot provide both snapshotIds and sequenceNumberRange'
        };
      }
      
      let snapshotIds: string[];
      
        if (hasSequenceRange) {
         // Use the new bottom-level method to get snapshot IDs by sequence range
         snapshotIds = await snapshotManager.getSnapshotIdsBySequenceRange(
           params.sequenceNumberRange!.start,
           params.sequenceNumberRange!.end
         );
         
         if (snapshotIds.length === 0) {
           return {
             success: false,
             originalSnapshotIds: [],
             spaceFreed: 0,
             message: `No snapshots found in sequence range ${params.sequenceNumberRange!.start}-${params.sequenceNumberRange!.end}`
           };
         }
       } else {
         snapshotIds = params.snapshotIds!;
       }
      
      // Execute snapshot merge
      const result = await snapshotManager.consolidateSnapshots({
        snapshotIds,
        title: params.title,
        description: params.description,
        deleteOriginals: params.deleteOriginals
      });
      
      return {
        success: result.success,
        consolidatedSnapshotId: result.consolidatedSnapshotId,
        originalSnapshotIds: result.originalSnapshotIds,
        spaceFreed: result.spaceFreed,
        message: result.message || (result.success ? 'Merge successful' : 'Merge failed')
      };
    } catch (error) {
      const fallbackIds = params.snapshotIds || [];
      return {
        success: false,
        originalSnapshotIds: fallbackIds,
        spaceFreed: 0,
        message: `Snapshot merge failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }
});

/**
 * RevertSnapshotTool - Rollback snapshot
 */
export const RevertSnapshotTool = createTool({
  id: 'revert_snapshot',
  name: 'RevertSnapshot',
  description: 'Rollback the operation of specified snapshot, restoring files to the state before the snapshot',
  inputSchema: RevertSnapshotInputSchema,
  outputSchema: RevertSnapshotOutputSchema,
  async: true,
  execute: async (params, agent?: IAgent) => {
    if (params.dryRun === undefined) {
      params.dryRun = false;
    }
    if (params.force === undefined) {
      params.force = false;
    }
    
    try {
      const workspacePath = getWorkspacePath(agent);
      const runtime = getRuntime(agent);
      
      if (!runtime) {
        return {
          success: false,
          message: 'Missing runtime environment, cannot execute file operations'
        };
      }
      
      const snapshotManager = new SnapshotManager(workspacePath);
      await snapshotManager.initialize();
      
      // Execute rollback operation
      const result = await snapshotManager.reverseOp(params.snapshotId, {
        dryRun: params.dryRun,
        force: params.force
      }, runtime);
      
      // Ensure message is always a string
      return {
        success: result.success,
        message: result.message || (result.success ? 'Rollback successful' : 'Rollback failed'),
        reversedDiff: result.reversedDiff,
        affectedFiles: result.affectedFiles,
        newSnapshotId: result.newSnapshotId
      };
    } catch (error) {
      return {
        success: false,
        message: `Snapshot rollback failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }
});

// Export all tools
export const snapshotManagerTools = [
  ReadSnapshotTool,
  ListSnapshotsTool,
  ConsolidateSnapshotsTool,
  RevertSnapshotTool
];


export default snapshotManagerTools; 