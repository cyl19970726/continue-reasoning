/**
 * SimpleSnapshotManager - A simplified, file-based snapshot system
 * Focuses on core functionality without the complexity of the old system
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { IRuntime } from '../runtime/interface';
import { reverseDiff } from '../runtime/diff';

export interface SnapshotData {
  id: string;
  timestamp: string;
  description: string;
  tool: string;
  affectedFiles: string[];
  diff: string;
  reverseDiff?: string;
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

export interface MilestoneData {
  id: string;
  timestamp: string;
  title: string;
  description: string;
  snapshotIds: string[];
  summary: {
    totalOperations: number;
    affectedFiles: string[];
    linesAdded: number;
    linesRemoved: number;
  };
  combinedDiff: string;
  tags: string[];
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
  includeDiffs?: boolean;
  since?: string;
  until?: string;
  toolFilter?: string[];
  fileFilter?: string;
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
  targetSnapshot?: string;
  force?: boolean;
}

export interface ReverseResult {
  success: boolean;
  message?: string;
  reversedDiff?: string;
  affectedFiles?: string[];
  conflicts?: string[];
  newSnapshotId?: string;
}

export interface MilestoneSummary {
  totalOperations: number;
  affectedFiles: string[];
  linesAdded: number;
  linesRemoved: number;
}

export class SimpleSnapshotManager {
  private workspacePath: string;
  private snapshotsDir: string;
  private milestonesDir: string;
  private indexPath: string;
  
  constructor(workspacePath: string) {
    this.workspacePath = workspacePath;
    this.snapshotsDir = path.join(workspacePath, '.continue-reasoning', 'snapshots');
    this.milestonesDir = path.join(this.snapshotsDir, 'milestones');
    this.indexPath = path.join(this.snapshotsDir, 'index.json');
  }

  /**
   * Initialize the snapshot directory structure
   */
  async initialize(): Promise<void> {
    await fs.mkdir(this.snapshotsDir, { recursive: true });
    await fs.mkdir(this.milestonesDir, { recursive: true });
    
    // Create index if it doesn't exist
    try {
      await fs.access(this.indexPath);
    } catch {
      await fs.writeFile(this.indexPath, JSON.stringify({ snapshots: [], milestones: [] }, null, 2));
    }
  }

  /**
   * Create a snapshot for an editing operation
   */
  async createSnapshot(operation: {
    tool: string;
    description: string;
    affectedFiles: string[];
    diff: string;
    context: {
      sessionId: string;
      toolParams?: any;
    };
    metadata: {
      filesSizeBytes: number;
      linesChanged: number;
      executionTimeMs: number;
    };
  }): Promise<string> {
    await this.initialize();
    
    const id = this.generateId();
    const timestamp = new Date().toISOString();
    
    // Generate reverse diff
    let reverseDiffContent = '';
    try {
      const reverseResult = reverseDiff(operation.diff);
      if (reverseResult.success) {
        reverseDiffContent = reverseResult.reversedDiff;
      }
    } catch (error) {
      console.warn('Failed to generate reverse diff:', error);
    }

    const snapshot: SnapshotData = {
      id,
      timestamp,
      description: operation.description,
      tool: operation.tool,
      affectedFiles: operation.affectedFiles,
      diff: operation.diff,
      reverseDiff: reverseDiffContent,
      context: {
        sessionId: operation.context.sessionId,
        workspacePath: this.workspacePath,
        toolParams: operation.context.toolParams
      },
      metadata: operation.metadata
    };

    // Save snapshot file
    const snapshotPath = this.getSnapshotPath(timestamp, id);
    await fs.mkdir(path.dirname(snapshotPath), { recursive: true });
    await fs.writeFile(snapshotPath, JSON.stringify(snapshot, null, 2));

    // Update index
    await this.updateIndex('snapshot', { id, timestamp, tool: operation.tool, affectedFiles: operation.affectedFiles });

    return id;
  }

  /**
   * Read a snapshot's diff content
   */
  async readSnapshotDiff(snapshotId: string, format: 'unified' | 'context' | 'git' = 'unified'): Promise<{
    success: boolean;
    diff?: string;
    snapshot?: {
      id: string;
      timestamp: string;
      description: string;
      tool: string;
      affectedFiles: string[];
    };
  }> {
    try {
      const snapshot = await this.loadSnapshot(snapshotId);
      if (!snapshot) {
        return { success: false };
      }

      let diff = snapshot.diff;
      
      // Format conversion if needed
      if (format === 'git') {
        // Add git headers if not present
        if (!diff.includes('diff --git')) {
          const { addFileHashesToDiff } = await import('../runtime/diff');
          diff = addFileHashesToDiff(diff);
        }
      }

      return {
        success: true,
        diff,
        snapshot: {
          id: snapshot.id,
          timestamp: snapshot.timestamp,
          description: snapshot.description,
          tool: snapshot.tool,
          affectedFiles: snapshot.affectedFiles
        }
      };
    } catch (error) {
      console.error('Error reading snapshot diff:', error);
      return { success: false };
    }
  }

  /**
   * Get editing history with optional filters
   */
  async getEditHistory(options: HistoryOptions = {}): Promise<EditHistory> {
    try {
      const index = await this.loadIndex();
      let snapshots = index.snapshots || [];

      // Apply filters
      if (options.since) {
        const sinceDate = new Date(options.since);
        snapshots = snapshots.filter(s => new Date(s.timestamp) >= sinceDate);
      }

      if (options.until) {
        const untilDate = new Date(options.until);
        snapshots = snapshots.filter(s => new Date(s.timestamp) <= untilDate);
      }

      if (options.toolFilter) {
        snapshots = snapshots.filter(s => options.toolFilter!.includes(s.tool));
      }

      if (options.fileFilter) {
        const pattern = options.fileFilter;
        snapshots = snapshots.filter(s => 
          s.affectedFiles.some(file => file.includes(pattern))
        );
      }

      // Sort by timestamp (newest first)
      snapshots.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      // Apply limit
      const limit = options.limit || 20;
      const hasMore = snapshots.length > limit;
      const limitedSnapshots = snapshots.slice(0, limit);

      // Load full snapshot data if diffs are requested
      const history: EditHistoryItem[] = [];
      for (const snapshotRef of limitedSnapshots) {
        try {
          const snapshot = await this.loadSnapshot(snapshotRef.id);
          if (snapshot) {
            history.push({
              id: snapshot.id,
              timestamp: snapshot.timestamp,
              description: snapshot.description,
              tool: snapshot.tool,
              affectedFiles: snapshot.affectedFiles,
              diff: options.includeDiffs ? snapshot.diff : undefined,
              metadata: {
                linesChanged: snapshot.metadata.linesChanged,
                executionTimeMs: snapshot.metadata.executionTimeMs
              }
            });
          }
        } catch (error) {
          console.warn(`Failed to load snapshot ${snapshotRef.id}:`, error);
        }
      }

      return {
        history,
        pagination: {
          total: snapshots.length,
          hasMore,
          nextCursor: hasMore ? limitedSnapshots[limitedSnapshots.length - 1].id : undefined
        }
      };
    } catch (error) {
      console.error('Error getting edit history:', error);
      return {
        history: [],
        pagination: { total: 0, hasMore: false }
      };
    }
  }

  /**
   * Reverse an operation (rollback)
   */
  async reverseOp(snapshotId: string, options: ReverseOptions = {}, runtime: IRuntime): Promise<ReverseResult> {
    try {
      const snapshot = await this.loadSnapshot(snapshotId);
      if (!snapshot) {
        return {
          success: false,
          message: `Snapshot ${snapshotId} not found`
        };
      }

      if (!snapshot.reverseDiff) {
        return {
          success: false,
          message: `No reverse diff available for snapshot ${snapshotId}`
        };
      }

      // Check for conflicts if not forcing
      if (!options.force) {
        // TODO: Implement conflict detection
        // For now, just proceed
      }

      if (options.dryRun) {
        return {
          success: true,
          message: `[DRY RUN] Would reverse operation affecting ${snapshot.affectedFiles.length} file(s)`,
          reversedDiff: snapshot.reverseDiff,
          affectedFiles: snapshot.affectedFiles
        };
      }

      // Apply the reverse diff
      const applyResult = await runtime.applyUnifiedDiff(snapshot.reverseDiff, {
        baseDir: this.workspacePath
      });

      if (!applyResult.success) {
        return {
          success: false,
          message: `Failed to apply reverse diff: ${applyResult.message}`,
          reversedDiff: snapshot.reverseDiff
        };
      }

      // Create a new snapshot for the reversal operation
      const reversalSnapshotId = await this.createSnapshot({
        tool: 'ReverseOp',
        description: `Reverse operation: ${snapshot.description}`,
        affectedFiles: snapshot.affectedFiles,
        diff: snapshot.reverseDiff,
        context: {
          sessionId: snapshot.context.sessionId,
          toolParams: { originalSnapshotId: snapshotId }
        },
        metadata: {
          filesSizeBytes: 0, // TODO: Calculate
          linesChanged: snapshot.metadata.linesChanged,
          executionTimeMs: 0 // Placeholder
        }
      });

      return {
        success: true,
        message: `Successfully reversed operation affecting ${applyResult.changesApplied} file(s)`,
        reversedDiff: snapshot.reverseDiff,
        affectedFiles: snapshot.affectedFiles,
        newSnapshotId: reversalSnapshotId
      };
    } catch (error) {
      console.error('Error reversing operation:', error);
      return {
        success: false,
        message: `Failed to reverse operation: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Create a milestone from multiple snapshots
   */
  async createMilestone(params: {
    title: string;
    description: string;
    snapshotIds: string[];
    tags?: string[];
  }): Promise<{ success: boolean; milestoneId?: string; summary?: MilestoneSummary }> {
    try {
      const milestoneId = this.generateId();
      const timestamp = new Date().toISOString();

      // Load all snapshots
      const snapshots: SnapshotData[] = [];
      for (const snapshotId of params.snapshotIds) {
        const snapshot = await this.loadSnapshot(snapshotId);
        if (snapshot) {
          snapshots.push(snapshot);
        }
      }

      if (snapshots.length === 0) {
        return { success: false };
      }

      // Calculate summary
      const allAffectedFiles = new Set<string>();
      let totalLinesAdded = 0;
      let totalLinesRemoved = 0;

      for (const snapshot of snapshots) {
        snapshot.affectedFiles.forEach(file => allAffectedFiles.add(file));
        
        // Simple heuristic: count + and - lines in diff
        const lines = snapshot.diff.split('\n');
        const addedLines = lines.filter(line => line.startsWith('+')).length;
        const removedLines = lines.filter(line => line.startsWith('-')).length;
        
        totalLinesAdded += addedLines;
        totalLinesRemoved += removedLines;
      }

      // Combine all diffs
      const combinedDiff = snapshots.map(s => s.diff).join('\n');

      const summary: MilestoneSummary = {
        totalOperations: snapshots.length,
        affectedFiles: Array.from(allAffectedFiles),
        linesAdded: totalLinesAdded,
        linesRemoved: totalLinesRemoved
      };

      const milestone: MilestoneData = {
        id: milestoneId,
        timestamp,
        title: params.title,
        description: params.description,
        snapshotIds: params.snapshotIds,
        summary,
        combinedDiff,
        tags: params.tags || []
      };

      // Save milestone
      const milestonePath = path.join(this.milestonesDir, `${milestoneId}.json`);
      await fs.writeFile(milestonePath, JSON.stringify(milestone, null, 2));

      // Update index
      await this.updateIndex('milestone', { id: milestoneId, timestamp, title: params.title });

      return { success: true, milestoneId, summary };
    } catch (error) {
      console.error('Error creating milestone:', error);
      return { success: false };
    }
  }

  /**
   * Get milestones list
   */
  async getMilestones(includeDiffs: boolean = false, tags?: string[]): Promise<{
    success: boolean;
    milestones: Array<{
      id: string;
      title: string;
      description: string;
      timestamp: string;
      summary: MilestoneSummary;
      combinedDiff?: string;
      tags: string[];
    }>;
  }> {
    try {
      const index = await this.loadIndex();
      let milestoneRefs = index.milestones || [];

      // Apply tag filter
      if (tags && tags.length > 0) {
        const milestones: MilestoneData[] = [];
        for (const ref of milestoneRefs) {
          const milestone = await this.loadMilestone(ref.id);
          if (milestone && milestone.tags.some(tag => tags.includes(tag))) {
            milestones.push(milestone);
          }
        }
        milestoneRefs = milestones.map(m => ({ id: m.id, timestamp: m.timestamp, title: m.title }));
      }

      // Load full milestone data
      const milestones = [];
      for (const ref of milestoneRefs) {
        try {
          const milestone = await this.loadMilestone(ref.id);
          if (milestone) {
            milestones.push({
              id: milestone.id,
              title: milestone.title,
              description: milestone.description,
              timestamp: milestone.timestamp,
              summary: milestone.summary,
              combinedDiff: includeDiffs ? milestone.combinedDiff : undefined,
              tags: milestone.tags
            });
          }
        } catch (error) {
          console.warn(`Failed to load milestone ${ref.id}:`, error);
        }
      }

      // Sort by timestamp (newest first)
      milestones.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      return { success: true, milestones };
    } catch (error) {
      console.error('Error getting milestones:', error);
      return { success: false, milestones: [] };
    }
  }

  /**
   * Clean up old snapshots
   */
  async cleanup(olderThan?: Date): Promise<void> {
    try {
      const cutoffDate = olderThan || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
      const index = await this.loadIndex();
      
      const toRemove = index.snapshots.filter(s => new Date(s.timestamp) < cutoffDate);
      
      for (const snapshotRef of toRemove) {
        try {
          const snapshotPath = this.findSnapshotPath(snapshotRef.id);
          if (snapshotPath) {
            await fs.unlink(snapshotPath);
          }
        } catch (error) {
          console.warn(`Failed to delete snapshot ${snapshotRef.id}:`, error);
        }
      }

      // Update index
      index.snapshots = index.snapshots.filter(s => new Date(s.timestamp) >= cutoffDate);
      await fs.writeFile(this.indexPath, JSON.stringify(index, null, 2));
    } catch (error) {
      console.error('Error during cleanup:', error);
    }
  }

  // Private helper methods

  private generateId(): string {
    return Math.random().toString(36).substring(2, 8);
  }

  private getSnapshotPath(timestamp: string, id: string): string {
    const date = new Date(timestamp);
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const time = date.toTimeString().substring(0, 8).replace(/:/g, '');
    
    return path.join(this.snapshotsDir, `${year}`, `${month}`, `${day}`, `${time}_${id}.json`);
  }

  private async findSnapshotPath(id: string): Promise<string | null> {
    // This is a simple implementation - could be optimized with better indexing
    const index = await this.loadIndex();
    const snapshotRef = index.snapshots.find(s => s.id === id);
    if (snapshotRef) {
      return this.getSnapshotPath(snapshotRef.timestamp, id);
    }
    return null;
  }

  private async loadSnapshot(id: string): Promise<SnapshotData | null> {
    try {
      const snapshotPath = await this.findSnapshotPath(id);
      if (!snapshotPath) return null;
      
      const content = await fs.readFile(snapshotPath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      console.warn(`Failed to load snapshot ${id}:`, error);
      return null;
    }
  }

  private async loadMilestone(id: string): Promise<MilestoneData | null> {
    try {
      const milestonePath = path.join(this.milestonesDir, `${id}.json`);
      const content = await fs.readFile(milestonePath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      console.warn(`Failed to load milestone ${id}:`, error);
      return null;
    }
  }

  private async loadIndex(): Promise<{ snapshots: any[]; milestones: any[] }> {
    try {
      const content = await fs.readFile(this.indexPath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      return { snapshots: [], milestones: [] };
    }
  }

  private async updateIndex(type: 'snapshot' | 'milestone', item: any): Promise<void> {
    const index = await this.loadIndex();
    
    if (type === 'snapshot') {
      index.snapshots.push(item);
    } else {
      index.milestones.push(item);
    }
    
    await fs.writeFile(this.indexPath, JSON.stringify(index, null, 2));
  }
}