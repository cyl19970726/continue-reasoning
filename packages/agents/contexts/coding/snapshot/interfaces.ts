/**
 * Snapshot System Interfaces
 * Contains all type definitions for the snapshot system
 */

export interface SnapshotData {
  id: string;
  timestamp: string;
  description: string;
  tool: string;
  affectedFiles: string[];
  diff: string;
  reverseDiff?: string;
  previousSnapshotId?: string;
  sequenceNumber: number;
  baseFileHashes: Record<string, string>;
  resultFileHashes: Record<string, string>;
  context: {
    sessionId: string;
    workspacePath: string;
    toolParams?: any;
  };
  metadata: {
    filesSizeBytes: number;
    linesChanged: number;
    executionTimeMs: number;
  };
}

export interface SnapshotConfig {
  enableUnknownChangeDetection: boolean;
  unknownChangeStrategy: UnknownChangeStrategy;
  keepAllCheckpoints: boolean;
  maxCheckpointAge: number; // days
  excludeFromChecking: string[];
}

export type UnknownChangeStrategy = 'warn' | 'error' | 'ignore' | 'auto-fix';

export interface ValidationOptions {
  checkFileState?: boolean;
  allowPartialMatches?: boolean;
  strictMode?: boolean;
}

export interface ValidationResult {
  isValid: boolean;
  issues: string[];
  warnings: string[];
  fixedIssues?: string[];
}

export interface HandleResult {
  success: boolean;
  message?: string;
  snapshotId?: string;
  affectedFiles?: string[];
}

export interface EditHistoryItem {
  id: string;
  timestamp: string;
  description: string;
  tool: string;
  affectedFiles: string[];
  diff?: string;
  metadata: {
    linesChanged: number;
    executionTimeMs: number;
  };
}

export interface HistoryOptions {
  limit?: number;
  since?: string;
  until?: string;
  toolFilter?: string[];
  fileFilter?: string;
  includeDiffs?: boolean;
}

export interface EditHistory {
  history: EditHistoryItem[];
  pagination: {
    total: number;
    hasMore: boolean;
    nextCursor?: string;
  };
}

export interface ReverseOptions {
  dryRun?: boolean;
  skipValidation?: boolean;
  force?: boolean;
}

export interface ReverseResult {
  success: boolean;
  message?: string;
  reversedDiff?: string;
  affectedFiles?: string[];
  newSnapshotId?: string;
}

export interface UnknownChange {
  filePath: string;
  changeType: 'modified' | 'added' | 'deleted';
  expectedHash?: string;
  actualHash?: string;
  diff?: string;
}

export interface UnknownChangeResult {
  hasUnknownChanges: boolean;
  unknownChanges: UnknownChange[];
  affectedFiles: string[];
  generatedDiff?: string;
}

export interface CheckpointData {
  id: string;
  timestamp: string;
  snapshotId: string;
  files: Record<string, string>;
  metadata: {
    totalFiles: number;
    totalSizeBytes: number;
    creationTimeMs: number;
  };
} 