/**
 * Simplified Snapshot System - Main Export
 * 
 * This module exports the complete simplified snapshot system components:
 * - SimpleSnapshotManager: Core snapshot management functionality
 * - Snapshot Tools: User-facing tools for snapshot operations
 * - Enhanced Editing Tools: Editing tools with automatic snapshot creation
 * - Types and Interfaces: All necessary type definitions
 */

// Core Manager
export { SimpleSnapshotManager } from './simple-snapshot-manager';

// Types and Interfaces
export type {
  SnapshotData,
  MilestoneData,
  EditHistoryItem,
  HistoryOptions,
  EditHistory,
  ReverseOptions,
  ReverseResult,
  MilestoneSummary
} from './simple-snapshot-manager';

// Snapshot Management Tools
export {
  ReadSnapshotDiffTool,
  GetEditHistoryTool,
  ReverseOpTool,
  CreateMilestoneTool,
  GetMilestonesTool,
  SimpleSnapshotToolSet
} from './simple-snapshot-tools';

// Enhanced Editing Tools
export {
  createSnapshotEnhancedTools,
  createEnhancedWholeFileEditTool,
  SnapshotEnhancedApplyWholeFileEditTool
} from './snapshot-enhanced-tools';

// Enhanced Diff utilities
export {
  calculateFileHash,
  getGitTimestamp,
  addFileHashesToDiff
} from '../runtime/diff';

/**
 * Initialize the simplified snapshot system for a workspace
 */
export async function initializeSnapshotSystem(workspacePath: string): Promise<SimpleSnapshotManager> {
  const manager = new SimpleSnapshotManager(workspacePath);
  await manager.initialize();
  return manager;
}

/**
 * Get all available tools including snapshot management and enhanced editing tools
 */
export async function getAllSnapshotTools() {
  const snapshotTools = await import('./simple-snapshot-tools');
  const enhancedTools = await import('./snapshot-enhanced-tools');
  
  return [
    ...snapshotTools.SimpleSnapshotToolSet,
    enhancedTools.SnapshotEnhancedApplyWholeFileEditTool,
    // Add more enhanced tools as they're created
  ];
}

/**
 * Default configuration for the snapshot system
 */
export const DEFAULT_SNAPSHOT_CONFIG = {
  // Automatically create snapshots for these tools
  autoSnapshotTools: [
    'ApplyWholeFileEdit',
    'ApplyEditBlock', 
    'ApplyRangedEdit',
    'ApplyUnifiedDiff',
    'Delete'
  ],
  
  // Maximum number of snapshots to keep in memory
  maxSnapshots: 1000,
  
  // Automatically clean up snapshots older than this (days)
  autoCleanupDays: 30,
  
  // Enable Git-compatible diff format by default
  useGitCompatibleDiffs: true,
  
  // Default milestone tags
  defaultMilestoneTags: ['feature', 'bugfix', 'refactor', 'enhancement']
} as const;

/**
 * Utility function to create a snapshot for any operation
 */
export async function createOperationSnapshot(
  manager: SimpleSnapshotManager,
  operation: {
    tool: string;
    description: string;
    affectedFiles: string[];
    diff: string;
    sessionId?: string;
    toolParams?: any;
    metadata?: {
      filesSizeBytes?: number;
      linesChanged?: number;
      executionTimeMs?: number;
    };
  }
): Promise<string | null> {
  try {
    return await manager.createSnapshot({
      tool: operation.tool,
      description: operation.description,
      affectedFiles: operation.affectedFiles,
      diff: operation.diff,
      context: {
        sessionId: operation.sessionId || 'default',
        toolParams: operation.toolParams
      },
      metadata: {
        filesSizeBytes: operation.metadata?.filesSizeBytes || 0,
        linesChanged: operation.metadata?.linesChanged || 0,
        executionTimeMs: operation.metadata?.executionTimeMs || 0
      }
    });
  } catch (error) {
    console.error('Failed to create operation snapshot:', error);
    return null;
  }
}