/**
 * ConsolidationManager - Handles snapshot consolidation operations
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { mergeDiffs } from '../../runtime/diff';
import { SnapshotData } from '../interfaces';

export interface ConsolidatedSnapshot extends SnapshotData {
  // 方案3: 虚拟序列号 - 使用序列号范围表示合并快照覆盖的序列
  sequenceRange: [number, number]; // [startSequence, endSequence] 表示覆盖的序列范围
  // Consolidation-specific fields
  consolidatedFrom: string[];
  consolidationMetadata: {
    originalCount: number;
    totalLinesChanged: number;
    consolidationTimestamp: string;
    spaceFreed: number;
  };
}

export interface ConsolidationOptions {
  snapshotIds: string[];
  title: string;
  description: string;
  deleteOriginals: boolean;
  preserveIntermediateStates?: boolean;
}

export interface ConsolidationCriteria {
  maxAge?: number; // days
  minSnapshots?: number;
  maxSnapshots?: number;
  toolFilter?: string[];
  filePatternFilter?: string;
}

export interface ConsolidationResult {
  success: boolean;
  consolidatedSnapshotId?: string;
  originalSnapshotIds: string[];
  spaceFreed: number;
  message?: string;
}

export interface StorageStats {
  totalSnapshots: number;
  consolidatedSnapshots: number;
  totalStorageBytes: number;
  consolidatedStorageBytes: number;
  spaceSavingsPercent: number;
}

export class ConsolidationManager {
  constructor(
    private workspacePath: string,
    private snapshotsDir: string
  ) {}

  /**
   * Consolidate multiple snapshots into a single consolidated snapshot
   * 方案3: 使用虚拟序列号范围，保持快照链连续性
   */
  async consolidateSnapshots(
    snapshots: any[],
    options: ConsolidationOptions,
    generateId: () => string,
    coreManager?: any,
    allSnapshots?: any[]
  ): Promise<ConsolidationResult> {
    try {
      // Validate snapshots continuity
      this.validateSnapshotContinuity(snapshots);

      // Sort by sequence number
      const sortedSnapshots = snapshots.sort((a, b) => a.sequenceNumber - b.sequenceNumber);
      
      // Calculate consolidation metadata (safely handle undefined metadata)
      const totalLinesChanged = sortedSnapshots.reduce((sum, s) => sum + (s.metadata?.linesChanged || 0), 0);
      const totalFileSize = sortedSnapshots.reduce((sum, s) => sum + (s.metadata?.filesSizeBytes || 0), 0);
      
      // Merge all diffs
      const diffs = sortedSnapshots.map(s => s.diff);
      const mergeResult = mergeDiffs(diffs, {
        preserveGitHeaders: true,
        conflictResolution: 'concatenate'
      });

      if (!mergeResult.success) {
        console.warn('Diff merge had conflicts, proceeding with concatenation:', mergeResult.conflicts);
      }

      // Collect all affected files
      const allAffectedFiles = new Set<string>();
      sortedSnapshots.forEach(s => s.affectedFiles.forEach((f: string) => allAffectedFiles.add(f)));

      // Create consolidated snapshot
      const consolidatedId = generateId();
      const consolidatedSnapshot: ConsolidatedSnapshot = {
        id: consolidatedId,
        timestamp: new Date().toISOString(),
        description: `${options.title}: ${options.description}`,
        tool: 'ConsolidateSnapshots',
        affectedFiles: Array.from(allAffectedFiles),
        diff: mergeResult.mergedDiff,
        reverseDiff: undefined, // TODO: Generate reverse diff for consolidated snapshot
        previousSnapshotId: sortedSnapshots[0].previousSnapshotId,
        sequenceNumber: sortedSnapshots[0].sequenceNumber,
        // 方案3: 设置序列号范围，表示这个合并快照覆盖的序列范围
        sequenceRange: [
          sortedSnapshots[0].sequenceNumber,
          sortedSnapshots[sortedSnapshots.length - 1].sequenceNumber
        ],
        baseFileHashes: sortedSnapshots[0].baseFileHashes,
        resultFileHashes: sortedSnapshots[sortedSnapshots.length - 1].resultFileHashes,
        context: {
          sessionId: 'consolidation',
          workspacePath: this.workspacePath,
          toolParams: {
            originalSnapshotIds: options.snapshotIds,
            consolidationOptions: options
          }
        },
        metadata: {
          filesSizeBytes: mergeResult.mergedDiff.length,
          linesChanged: totalLinesChanged,
          executionTimeMs: 0
        },
        consolidatedFrom: options.snapshotIds,
        consolidationMetadata: {
          originalCount: options.snapshotIds.length,
          totalLinesChanged,
          consolidationTimestamp: new Date().toISOString(),
          spaceFreed: totalFileSize
        }
      };

      // Save consolidated snapshot through coreManager if available
      if (coreManager) {
        await coreManager.saveSnapshot(consolidatedSnapshot);
      } else {
        // Fallback: Save directly to file system
        const consolidatedPath = this.getSnapshotPath(consolidatedSnapshot.timestamp, consolidatedId);
        await fs.mkdir(path.dirname(consolidatedPath), { recursive: true });
        await fs.writeFile(consolidatedPath, JSON.stringify(consolidatedSnapshot, null, 2));
      }

      // 方案3: 更新后续快照的引用，确保序列号连续性
      if (coreManager && allSnapshots) {
        try {
          await this.updateSubsequentSnapshotReferences(
            consolidatedSnapshot,
            allSnapshots,
            coreManager
          );
        } catch (error) {
          console.warn('Failed to update subsequent snapshot references:', error);
          // Continue with consolidation even if reference update fails
        }
      }

      // Delete original snapshots if requested
      let actualSpaceFreed = 0;
      if (options.deleteOriginals) {
        actualSpaceFreed = await this.deleteOriginalSnapshots(sortedSnapshots);
      }

      return {
        success: true,
        consolidatedSnapshotId: consolidatedId,
        originalSnapshotIds: options.snapshotIds,
        spaceFreed: actualSpaceFreed,
        message: `Successfully consolidated ${options.snapshotIds.length} snapshots into ${consolidatedId} (range: ${consolidatedSnapshot.sequenceRange[0]}-${consolidatedSnapshot.sequenceRange[1]})`
      };
    } catch (error) {
      return {
        success: false,
        originalSnapshotIds: options.snapshotIds,
        spaceFreed: 0,
        message: `Consolidation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Get candidates for consolidation based on criteria
   */
  async getConsolidationCandidates(
    allSnapshots: any[],
    criteria: ConsolidationCriteria = {}
  ): Promise<string[]> {
    let candidates = [...allSnapshots];

    // Filter by age
    if (criteria.maxAge) {
      const cutoffDate = new Date(Date.now() - criteria.maxAge * 24 * 60 * 60 * 1000);
      candidates = candidates.filter(s => new Date(s.timestamp) >= cutoffDate);
    }

    // Filter by tool
    if (criteria.toolFilter && criteria.toolFilter.length > 0) {
      candidates = candidates.filter(s => criteria.toolFilter!.includes(s.tool));
    }

    // Filter by file pattern
    if (criteria.filePatternFilter) {
      const pattern = criteria.filePatternFilter;
      candidates = candidates.filter(s => 
        s.affectedFiles.some((file: string) => file.includes(pattern))
      );
    }

    // Apply min/max constraints
    const minSnapshots = criteria.minSnapshots || 2;
    const maxSnapshots = criteria.maxSnapshots || 10;

    if (candidates.length < minSnapshots) {
      return [];
    }

    // Sort by sequence number and take up to maxSnapshots
    candidates.sort((a, b) => a.sequenceNumber - b.sequenceNumber);
    candidates = candidates.slice(0, maxSnapshots);

    return candidates.map(s => s.id);
  }

  /**
   * Calculate storage statistics
   */
  async calculateStorageStats(allSnapshots: any[]): Promise<StorageStats> {
    const totalSnapshots = allSnapshots.length;
    const consolidatedSnapshots = allSnapshots.filter(s => s.consolidatedFrom).length;
    
    let totalStorageBytes = 0;
    let consolidatedStorageBytes = 0;

    for (const snapshot of allSnapshots) {
      const size = snapshot.metadata.filesSizeBytes || 0;
      totalStorageBytes += size;
      
      if (snapshot.consolidatedFrom) {
        consolidatedStorageBytes += size;
      }
    }

    const spaceSavingsPercent = totalStorageBytes > 0 
      ? ((totalStorageBytes - consolidatedStorageBytes) / totalStorageBytes) * 100 
      : 0;

    return {
      totalSnapshots,
      consolidatedSnapshots,
      totalStorageBytes,
      consolidatedStorageBytes,
      spaceSavingsPercent
    };
  }

  /**
   * Validate that snapshots form a continuous chain
   */
  private validateSnapshotContinuity(snapshots: any[]): void {
    if (snapshots.length < 2) return;

    const sorted = snapshots.sort((a, b) => a.sequenceNumber - b.sequenceNumber);
    
    for (let i = 1; i < sorted.length; i++) {
      const current = sorted[i];
      const previous = sorted[i - 1];
      
      if (current.previousSnapshotId !== previous.id) {
        throw new Error(
          `Snapshot continuity violation: ${current.id} expects parent ${current.previousSnapshotId}, ` +
          `but previous snapshot is ${previous.id}`
        );
      }
      
      if (current.sequenceNumber !== previous.sequenceNumber + 1) {
        throw new Error(
          `Sequence number gap: ${previous.id} has sequence ${previous.sequenceNumber}, ` +
          `${current.id} has sequence ${current.sequenceNumber}`
        );
      }
    }
  }

  /**
   * Delete original snapshot files and return space freed
   */
  private async deleteOriginalSnapshots(snapshots: any[]): Promise<number> {
    let spaceFreed = 0;
    
    for (const snapshot of snapshots) {
      try {
        const snapshotPath = this.getSnapshotPath(snapshot.timestamp, snapshot.id);
        const stats = await fs.stat(snapshotPath);
        spaceFreed += stats.size;
        await fs.unlink(snapshotPath);
      } catch (error) {
        console.warn(`Failed to delete snapshot ${snapshot.id}:`, error);
      }
    }
    
    return spaceFreed;
  }

  /**
   * Get snapshot file path
   */
  private getSnapshotPath(timestamp: string, id: string): string {
    const date = new Date(timestamp);
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const time = date.toTimeString().substring(0, 8).replace(/:/g, '');
    
    return path.join(this.snapshotsDir, `${year}`, `${month}`, `${day}`, `${time}_${id}.json`);
  }

  /**
   * Update subsequent snapshots to reference the consolidated snapshot
   * 方案3: 更新后续快照的引用，确保序列号连续性
   */
  async updateSubsequentSnapshotReferences(
    consolidatedSnapshot: ConsolidatedSnapshot,
    allSnapshots: any[],
    coreManager: any
  ): Promise<void> {
    const consolidatedRange = consolidatedSnapshot.sequenceRange;
    const maxConsolidatedSequence = consolidatedRange[1];
    const minConsolidatedSequence = consolidatedRange[0];
    const mergedCount = consolidatedRange[1] - consolidatedRange[0] + 1; // Number of original snapshots merged
    const sequenceReduction = mergedCount - 1; // How much to reduce subsequent sequence numbers
    
    // Find snapshots that come after the consolidated range
    const subsequentSnapshots = allSnapshots.filter(s => 
      s.sequenceNumber > maxConsolidatedSequence && 
      !consolidatedSnapshot.consolidatedFrom.includes(s.id)
    );
    
    // Update the first subsequent snapshot to reference the consolidated snapshot
    if (subsequentSnapshots.length > 0) {
      // Sort by sequence number
      subsequentSnapshots.sort((a, b) => a.sequenceNumber - b.sequenceNumber);
      const firstSubsequent = subsequentSnapshots[0];
      
      // Check if the first subsequent snapshot was referencing any of the consolidated snapshots
      const shouldUpdateReference = consolidatedSnapshot.consolidatedFrom.includes(
        firstSubsequent.previousSnapshotId
      );
      
      if (shouldUpdateReference) {
        // Update the reference to point to the consolidated snapshot
        firstSubsequent.previousSnapshotId = consolidatedSnapshot.id;
        
        // Save the updated snapshot
        await coreManager.saveSnapshot(firstSubsequent);
        
        console.log(
          `Updated snapshot ${firstSubsequent.id} to reference consolidated snapshot ${consolidatedSnapshot.id}`
        );
      }
    }
    
    // 重新编号后续快照的sequence numbers
    await this.renumberSubsequentSnapshots(
      consolidatedSnapshot,
      allSnapshots,
      coreManager,
      sequenceReduction
    );
  }

  /**
   * Renumber subsequent snapshots after consolidation
   * 重新编号合并后的后续快照，确保sequence number连续性
   */
  async renumberSubsequentSnapshots(
    consolidatedSnapshot: ConsolidatedSnapshot,
    allSnapshots: any[],
    coreManager: any,
    sequenceReduction: number
  ): Promise<void> {
    const consolidatedRange = consolidatedSnapshot.sequenceRange;
    const maxConsolidatedSequence = consolidatedRange[1];
    
    // Find all snapshots that come after the consolidated range
    const subsequentSnapshots = allSnapshots.filter(s => 
      s.sequenceNumber > maxConsolidatedSequence && 
      !consolidatedSnapshot.consolidatedFrom.includes(s.id)
    );
    
    if (subsequentSnapshots.length === 0 || sequenceReduction <= 0) {
      return;
    }
    
    // Sort by sequence number to process in order
    subsequentSnapshots.sort((a, b) => a.sequenceNumber - b.sequenceNumber);
    
    console.log(
      `Renumbering ${subsequentSnapshots.length} subsequent snapshots, reducing sequence numbers by ${sequenceReduction}`
    );
    
    // Update sequence numbers for all subsequent snapshots
    for (const snapshot of subsequentSnapshots) {
      const oldSequenceNumber = snapshot.sequenceNumber;
      const newSequenceNumber = oldSequenceNumber - sequenceReduction;
      
      console.log(
        `Updating snapshot ${snapshot.id.substring(0, 6)}: sequence ${oldSequenceNumber} -> ${newSequenceNumber}`
      );
      
      // Update the snapshot's sequence number
      snapshot.sequenceNumber = newSequenceNumber;
      
      // Save the updated snapshot (this will update both file and cache)
      await coreManager.saveSnapshot(snapshot);
    }
    
    // Also need to update the core manager's internal cache
    await coreManager.reloadCache();
  }

  /**
   * Validate sequence continuity considering consolidated snapshots
   * 方案3: 验证序列连续性，考虑合并快照的序列范围
   */
  validateSequenceContinuityWithConsolidation(snapshots: any[]): {
    isValid: boolean;
    issues: string[];
  } {
    const issues: string[] = [];
    
    if (snapshots.length < 2) {
      return { isValid: true, issues: [] };
    }

    const sorted = snapshots.sort((a, b) => a.sequenceNumber - b.sequenceNumber);
    
    for (let i = 1; i < sorted.length; i++) {
      const current = sorted[i];
      const previous = sorted[i - 1];
      
      // Check if previous is a consolidated snapshot
      const isConsolidated = previous.sequenceRange !== undefined;
      
      if (isConsolidated) {
        // For consolidated snapshots, check if current sequence follows the range
        const consolidatedRange = previous.sequenceRange as [number, number];
        const expectedSequence = consolidatedRange[1] + 1;
        
        if (current.sequenceNumber !== expectedSequence) {
          issues.push(
            `Sequence gap after consolidated snapshot ${previous.id}: ` +
            `expected ${expectedSequence}, got ${current.sequenceNumber}`
          );
        }
        
        // Check if current references the consolidated snapshot correctly
        if (current.previousSnapshotId !== previous.id) {
          issues.push(
            `Snapshot ${current.id} should reference consolidated snapshot ${previous.id}, ` +
            `but references ${current.previousSnapshotId}`
          );
        }
      } else {
        // Standard continuity check
        if (current.previousSnapshotId !== previous.id) {
          issues.push(
            `Snapshot continuity violation: ${current.id} expects parent ${current.previousSnapshotId}, ` +
            `but previous snapshot is ${previous.id}`
          );
        }
        
        if (current.sequenceNumber !== previous.sequenceNumber + 1) {
          issues.push(
            `Sequence number gap: ${previous.id} has sequence ${previous.sequenceNumber}, ` +
            `${current.id} has sequence ${current.sequenceNumber}`
          );
        }
      }
    }
    
    return {
      isValid: issues.length === 0,
      issues
    };
  }
} 