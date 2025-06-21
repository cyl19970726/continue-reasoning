/**
 * Modular Snapshot System - Main Export
 * 
 * This module exports the complete modular snapshot system components:
 * - SnapshotManager: Core snapshot management functionality using modular architecture
 * - Snapshot Tools: User-facing tools for snapshot operations
 * - Core Managers: Individual modular components
 * - Types and Interfaces: All necessary type definitions
 */

// Core Snapshot Manager (new modular version)
export { SnapshotManager } from './snapshot-manager';

// Import types for internal use
import { SnapshotManager } from './snapshot-manager';
import type { SnapshotConfig } from './interfaces';

// Core modular components
export { CoreSnapshotManager } from './core/core-snapshot-manager';
export { CheckpointManager } from './core/checkpoint-manager';
export { IgnoreManager } from './core/ignore-manager';
export { ConsolidationManager } from './core/consolidation-manager';

// Snapshot Management Tools
export { 
  ReadSnapshotTool,
  ListSnapshotsTool,
  ConsolidateSnapshotsTool,
  RevertSnapshotTool,
  snapshotManagerTools
} from './snapshot-manager-tools';

// Enhanced Editing Tools with snapshot integration
export { 
  ApplyWholeFileEditTool,
  ApplyUnifiedDiffTool,
  ApplyEditBlockTool,
  ApplyRangedEditTool,
  DeleteTool,
  SnapshotEditingToolSet
} from './snapshot-enhanced-tools';

// Types and Interfaces
export type {
  SnapshotData,
  SnapshotConfig,
  EditHistoryItem,
  HistoryOptions,
  EditHistory,
  ReverseOptions,
  ReverseResult,
  HandleResult
} from './interfaces';

// Enhanced Diff utilities
export {
  calculateFileHash,
  getGitTimestamp,
  addFileHashesToDiff
} from '../runtime/diff';

/**
 * Initialize the modular snapshot system for a workspace
 */
export async function initializeSnapshotSystem(workspacePath: string): Promise<SnapshotManager> {
  const manager = new SnapshotManager(workspacePath);
  await manager.initialize();
  return manager;
}

/**
 * Get all available tools including snapshot management and enhanced editing tools
 */
export async function getAllSnapshotTools() {
  const snapshotTools = await import('./snapshot-manager-tools');
  const enhancedTools = await import('./snapshot-enhanced-tools');
  
  return [
    ...snapshotTools.snapshotManagerTools,
    ...enhancedTools.SnapshotEditingToolSet
  ];
}

/**
 * Default configuration for the snapshot system
 */
export const DEFAULT_SNAPSHOT_CONFIG: SnapshotConfig = {
  enableUnknownChangeDetection: true,
  unknownChangeStrategy: 'auto-fix',
  keepAllCheckpoints: false,
  maxCheckpointAge: 30, // days
  excludeFromChecking: [
    '.git/**',
    'node_modules/**',
    '.continue-reasoning/**',
    '**/*.log',
    '**/tmp/**',
    '**/temp/**'
  ]
};

/**
 * Utility function to create a snapshot for any operation
 */
export async function createOperationSnapshot(
  manager: SnapshotManager,
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

/**
 * Utility function to get storage statistics
 */
export async function getSnapshotStorageStats(workspacePath: string) {
  const manager = new SnapshotManager(workspacePath);
  await manager.initialize();
  return await manager.getStorageStats();
}

/**
 * Utility function to get consolidation candidates
 */
export async function getConsolidationCandidates(workspacePath: string) {
  const manager = new SnapshotManager(workspacePath);
  await manager.initialize();
  return await manager.getConsolidationCandidates();
}