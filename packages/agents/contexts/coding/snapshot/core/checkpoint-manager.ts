/**
 * Checkpoint Manager - Handles file checkpoints and unknown change detection
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { generateUnifiedDiff, mergeDiffs } from '../../runtime/diff';
import { CheckpointData, UnknownChange, UnknownChangeResult, SnapshotConfig } from '../interfaces';

export class CheckpointManager {
  private workspacePath: string;
  private checkpointsDir: string;
  private checkpointMetadataPath: string;
  private config: SnapshotConfig;
  
  // Cache for latest checkpoint
  private latestCheckpoint?: CheckpointData;

  constructor(workspacePath: string, config: SnapshotConfig) {
    this.workspacePath = workspacePath;
    this.checkpointsDir = path.join(workspacePath, '.continue-reasoning', 'checkpoints');
    this.checkpointMetadataPath = path.join(this.checkpointsDir, 'checkpoint-metadata.json');
    this.config = config;
  }

  /**
   * Initialize checkpoint storage
   */
  async initialize(): Promise<void> {
    await fs.mkdir(this.checkpointsDir, { recursive: true });
    await fs.mkdir(path.join(this.checkpointsDir, 'latest'), { recursive: true });
    
    // Create checkpoint metadata if it doesn't exist
    try {
      await fs.access(this.checkpointMetadataPath);
    } catch {
      await fs.writeFile(this.checkpointMetadataPath, JSON.stringify({ 
        checkpoints: [],
        latestCheckpointId: null 
      }, null, 2));
    }
    
    await this.loadLatestCheckpoint();
  }

  /**
   * Create file checkpoint after successful snapshot
   */
  async createFileCheckpoint(snapshotId: string, affectedFiles: string[], generateId: () => string): Promise<string> {
    const startTime = Date.now();
    const checkpointId = generateId();
    
    try {
      const filesContent: Record<string, string> = {};
      let totalSizeBytes = 0;
      
      // Start with files from previous checkpoint (if any) to maintain complete state
      if (this.latestCheckpoint) {
        for (const [filePath, content] of Object.entries(this.latestCheckpoint.files)) {
          filesContent[filePath] = content;
          totalSizeBytes += content.length;
        }
      }
      
      // Read and update file contents for affected files
      for (const filePath of affectedFiles) {
        try {
          const fullPath = path.isAbsolute(filePath) ? filePath : path.join(this.workspacePath, filePath);
          const content = await fs.readFile(fullPath, 'utf-8');
          
          // Update or add the file content
          if (filesContent[filePath] !== content) {
            // Only update size if content changed
            if (filesContent[filePath]) {
              totalSizeBytes -= filesContent[filePath].length;
            }
            filesContent[filePath] = content;
            totalSizeBytes += content.length;
          }
          
          // Also store in latest directory for quick access
          const latestFilePath = path.join(this.checkpointsDir, 'latest', path.basename(filePath));
          await fs.mkdir(path.dirname(latestFilePath), { recursive: true });
          await fs.writeFile(latestFilePath, content);
        } catch (error) {
          console.warn(`Failed to read file for checkpoint: ${filePath}`, error);
          // If file doesn't exist, remove it from checkpoint
          if (filesContent[filePath]) {
            totalSizeBytes -= filesContent[filePath].length;
            delete filesContent[filePath];
          }
        }
      }
      
      const checkpoint: CheckpointData = {
        id: checkpointId,
        timestamp: new Date().toISOString(),
        snapshotId,
        files: filesContent,
        metadata: {
          totalFiles: Object.keys(filesContent).length,
          totalSizeBytes,
          creationTimeMs: Date.now() - startTime
        }
      };
      
      // Save checkpoint file
      const checkpointPath = path.join(this.checkpointsDir, `${checkpointId}.json`);
      await fs.writeFile(checkpointPath, JSON.stringify(checkpoint, null, 2));
      
      // Update metadata
      await this.updateCheckpointMetadata(checkpointId);
      
      // Update memory cache
      this.latestCheckpoint = checkpoint;
      
      return checkpointId;
    } catch (error) {
      console.error('Failed to create file checkpoint:', error);
      throw new Error(`Failed to create checkpoint: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Load file checkpoint by ID
   */
  async loadFileCheckpoint(checkpointId?: string): Promise<CheckpointData | null> {
    try {
      let targetCheckpointId = checkpointId;
      
      if (!targetCheckpointId) {
        // Load latest checkpoint ID from metadata
        const metadataContent = await fs.readFile(this.checkpointMetadataPath, 'utf-8');
        const metadata = JSON.parse(metadataContent);
        targetCheckpointId = metadata.latestCheckpointId;
      }
      
      if (!targetCheckpointId) {
        return null;
      }
      
      const checkpointPath = path.join(this.checkpointsDir, `${targetCheckpointId}.json`);
      const content = await fs.readFile(checkpointPath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      console.warn(`Failed to load checkpoint ${checkpointId}:`, error);
      return null;
    }
  }

  /**
   * Detect unknown modifications by comparing current file state with last checkpoint
   */
  async detectUnknownModifications(
    affectedFiles: string[], 
    currentFileHashes: Record<string, string>,
    calculateFileHashes: (filePaths: string[]) => Promise<Record<string, string>>
  ): Promise<UnknownChangeResult> {
    try {
      if (!this.config.enableUnknownChangeDetection) {
        return {
          hasUnknownChanges: false,
          unknownChanges: [],
          affectedFiles: []
        };
      }

      const unknownChanges: UnknownChange[] = [];
      
      // Get files to check: affected files + any new files that might have been created
      const filesToCheck = await this.getFilesToCheckForUnknownChanges(affectedFiles);
      const currentHashes = await calculateFileHashes(filesToCheck);
      
      // Compare with expected state (from last checkpoint or current file hashes)
      const expectedHashes = this.latestCheckpoint ? 
        await this.getHashesFromCheckpoint(this.latestCheckpoint, filesToCheck) :
        currentFileHashes;

      for (const filePath of filesToCheck) {
        // Skip files that are being actively modified (in affectedFiles)
        if (affectedFiles.includes(filePath)) {
          continue;
        }
        
        const expectedHash = expectedHashes[filePath];
        const actualHash = currentHashes[filePath];
        
        if (expectedHash && expectedHash !== actualHash) {
          // Generate diff for the unknown change
          let diff: string | undefined;
          try {
            const expectedContent = this.latestCheckpoint?.files[filePath] || '';
            const actualContent = await this.readFileContent(filePath);
            diff = await generateUnifiedDiff(expectedContent, actualContent, {
              oldPath: `a/${filePath}`,
              newPath: `b/${filePath}`
            });
          } catch (error) {
            console.warn(`Failed to generate diff for ${filePath}:`, error);
          }

          unknownChanges.push({
            filePath,
            changeType: expectedHash === undefined ? 'added' : 'modified',
            expectedHash,
            actualHash,
            diff
          });
        } else if (!expectedHash && actualHash) {
          // New file created
          let diff: string | undefined;
          try {
            const actualContent = await this.readFileContent(filePath);
            diff = await generateUnifiedDiff('', actualContent, {
              oldPath: '/dev/null',
              newPath: `b/${filePath}`
            });
          } catch (error) {
            console.warn(`Failed to generate diff for new file ${filePath}:`, error);
          }

          unknownChanges.push({
            filePath,
            changeType: 'added',
            expectedHash: '',
            actualHash,
            diff
          });
        }
      }

      // Check for deleted files
      for (const [filePath, expectedHash] of Object.entries(expectedHashes)) {
        if (filesToCheck.includes(filePath) && !currentHashes[filePath]) {
          unknownChanges.push({
            filePath,
            changeType: 'deleted',
            expectedHash,
            actualHash: '',
            diff: undefined // Could generate deletion diff if needed
          });
        }
      }

      // Generate combined diff if there are unknown changes
      let generatedDiff: string | undefined;
      if (unknownChanges.length > 0) {
        const diffs = unknownChanges.map(change => change.diff).filter(Boolean) as string[];
        if (diffs.length > 0) {
          const mergeResult = mergeDiffs(diffs, { 
            preserveGitHeaders: true,
            conflictResolution: 'concatenate'
          });
          generatedDiff = mergeResult.success ? mergeResult.mergedDiff : diffs.join('\n');
        }
      }

      return {
        hasUnknownChanges: unknownChanges.length > 0,
        unknownChanges,
        affectedFiles: unknownChanges.map(change => change.filePath),
        generatedDiff
      };
    } catch (error) {
      console.error('Failed to detect unknown modifications:', error);
      return {
        hasUnknownChanges: false,
        unknownChanges: [],
        affectedFiles: [],
        generatedDiff: undefined
      };
    }
  }

  /**
   * Clean up old checkpoints
   */
  async cleanupOldCheckpoints(olderThan?: Date): Promise<void> {
    try {
      const cutoffDate = olderThan || new Date(Date.now() - this.config.maxCheckpointAge * 24 * 60 * 60 * 1000);
      
      // Load checkpoint metadata
      const metadataContent = await fs.readFile(this.checkpointMetadataPath, 'utf-8');
      const metadata = JSON.parse(metadataContent);
      
      const checkpointsToRemove = metadata.checkpoints.filter((cp: any) => 
        new Date(cp.timestamp) < cutoffDate
      );
      
      for (const checkpoint of checkpointsToRemove) {
        try {
          const checkpointPath = path.join(this.checkpointsDir, `${checkpoint.id}.json`);
          await fs.unlink(checkpointPath);
        } catch (error) {
          console.warn(`Failed to delete checkpoint ${checkpoint.id}:`, error);
        }
      }
      
      // Update metadata
      metadata.checkpoints = metadata.checkpoints.filter((cp: any) => 
        new Date(cp.timestamp) >= cutoffDate
      );
      
      await fs.writeFile(this.checkpointMetadataPath, JSON.stringify(metadata, null, 2));
      
      console.log(`Cleaned up ${checkpointsToRemove.length} old checkpoints`);
    } catch (error) {
      console.error('Error during checkpoint cleanup:', error);
    }
  }

  /**
   * Get checkpoint information
   */
  getCheckpointInfo() {
    return {
      hasLatestCheckpoint: !!this.latestCheckpoint,
      latestCheckpointFiles: this.latestCheckpoint?.metadata.totalFiles || 0,
      latestCheckpointSize: this.latestCheckpoint?.metadata.totalSizeBytes || 0
    };
  }

  // Private helper methods

  private async loadLatestCheckpoint(): Promise<void> {
    try {
      const metadataContent = await fs.readFile(this.checkpointMetadataPath, 'utf-8');
      const metadata = JSON.parse(metadataContent);
      
      if (metadata.latestCheckpointId) {
        const checkpoint = await this.loadFileCheckpoint(metadata.latestCheckpointId);
        this.latestCheckpoint = checkpoint || undefined;
      }
    } catch (error) {
      console.warn('Failed to load latest checkpoint:', error);
      this.latestCheckpoint = undefined;
    }
  }

  private async updateCheckpointMetadata(checkpointId: string): Promise<void> {
    try {
      let metadata;
      try {
        const content = await fs.readFile(this.checkpointMetadataPath, 'utf-8');
        metadata = JSON.parse(content);
      } catch {
        metadata = { checkpoints: [], latestCheckpointId: null };
      }
      
      // Add to checkpoint list
      metadata.checkpoints.push({
        id: checkpointId,
        timestamp: new Date().toISOString()
      });
      
      // Update latest
      metadata.latestCheckpointId = checkpointId;
      
      // Keep only recent checkpoints if not keeping all
      if (!this.config.keepAllCheckpoints && metadata.checkpoints.length > 5) {
        metadata.checkpoints = metadata.checkpoints.slice(-5); // Keep last 5
      }
      
      await fs.writeFile(this.checkpointMetadataPath, JSON.stringify(metadata, null, 2));
    } catch (error) {
      console.error('Failed to update checkpoint metadata:', error);
    }
  }

  private async getHashesFromCheckpoint(checkpoint: CheckpointData, filePaths: string[]): Promise<Record<string, string>> {
    const crypto = await import('crypto');
    const hashes: Record<string, string> = {};
    
    for (const filePath of filePaths) {
      const content = checkpoint.files[filePath];
      if (content !== undefined) {
        const hash = crypto.createHash('sha256').update(content).digest('hex').substring(0, 8);
        hashes[filePath] = hash;
      }
    }
    
    return hashes;
  }

  private async readFileContent(filePath: string): Promise<string> {
    try {
      const fullPath = path.isAbsolute(filePath) ? filePath : path.join(this.workspacePath, filePath);
      return await fs.readFile(fullPath, 'utf-8');
    } catch (error) {
      return ''; // Return empty string if file doesn't exist or can't be read
    }
  }

  /**
   * Get files to check for unknown changes
   * This is now handled by SnapshotManager, so this method just returns the input
   */
  private async getFilesToCheckForUnknownChanges(affectedFiles: string[]): Promise<string[]> {
    return affectedFiles;
  }
} 