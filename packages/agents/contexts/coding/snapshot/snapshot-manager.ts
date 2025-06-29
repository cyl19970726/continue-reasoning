/**
 * Snapshot Manager - Modular architecture without milestone system
 * Clean, modular design with separated concerns
 */

import * as path from 'path';
import * as fs from 'fs/promises';
import { IRuntime } from '../runtime/interface';

// Import modular components
import { CoreSnapshotManager } from './core/core-snapshot-manager';
import { CheckpointManager } from './core/checkpoint-manager';
import { IgnoreManager } from './core/ignore-manager';
import { ConsolidationManager, ConsolidationOptions, ConsolidationResult, ConsolidationCriteria, StorageStats } from './core/consolidation-manager';

// Import interfaces from the interfaces file
import { 
  SnapshotData, 
  SnapshotConfig, 
  EditHistoryItem,
  HistoryOptions,
  EditHistory,
  ReverseOptions,
  ReverseResult,
} from './interfaces';

// Default configuration
const DEFAULT_CONFIG: SnapshotConfig = {
  enableUnknownChangeDetection: true,
  unknownChangeStrategy: 'warn',
  keepAllCheckpoints: false,
  maxCheckpointAge: 7, // days
  excludeFromChecking: [
    '*.log',
    '*.tmp',
    '*_generated.*',
    'node_modules/**'
  ],
  saveLatestFiles: true, // Enable by default to support accurate diff generation
  saveDiffFiles: true, // Enable diff file storage by default for better readability
  diffFileFormat: 'md' // Use Markdown format for best readability
};

export class SnapshotManager {
  private workspacePath: string;
  private config: SnapshotConfig;
  
  // Modular components
  private coreManager: CoreSnapshotManager;
  private checkpointManager: CheckpointManager;
  private ignoreManager: IgnoreManager;
  private consolidationManager: ConsolidationManager;
  
  // State tracking
  private currentSequenceNumber: number = 0;
  private lastSnapshotId?: string;
  private currentFileHashes: Record<string, string> = {};
  private isInitialized: boolean = false;

  constructor(workspacePath: string, config?: Partial<SnapshotConfig>) {
    this.workspacePath = workspacePath;
    this.config = { ...DEFAULT_CONFIG, ...config };
    
    // Initialize modular components
    this.coreManager = new CoreSnapshotManager(workspacePath, this.config);
    this.checkpointManager = new CheckpointManager(workspacePath, this.config);
    this.ignoreManager = new IgnoreManager(workspacePath, this.config);
    this.consolidationManager = new ConsolidationManager(
      workspacePath, 
      path.join(workspacePath, '.continue-reasoning', 'snapshots')
    );
  }

  /**
   * Initialize all components
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    // Initialize all modular components
    await Promise.all([
      this.coreManager.initialize(),
      this.checkpointManager.initialize(),
      this.ignoreManager.initialize()
    ]);
    
    // Load current state
    await this.loadCurrentState();
    
    // Create initial checkpoint if none exists
    const checkpointInfo = this.checkpointManager.getCheckpointInfo();
    if (!checkpointInfo.hasLatestCheckpoint) {
      try {
        const initialCheckpointId = await this.checkpointManager.createInitialCheckpoint(
          this.generateId.bind(this)
        );
        console.log(`📸 Created initial baseline checkpoint: ${initialCheckpointId}`);
      } catch (error) {
        console.warn('Failed to create initial checkpoint:', error);
      }
    }
    
    this.isInitialized = true;
  }

  /**
   * Create a snapshot with unknown change detection
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
    
    // Filter out ignored files
    const filteredAffectedFiles = this.filterIgnoredFiles(operation.affectedFiles);
    
    if (filteredAffectedFiles.length === 0) {
      throw new Error('All affected files are ignored by snapshot system');
    }

    // 🔍 STEP 1: Detect unknown changes before creating the intended snapshot
    if (this.config.enableUnknownChangeDetection) {
      try {
        // Don't exclude affected files from unknown change detection
        // We want to detect if they were modified externally before our intended operation
        const unknownChanges = await this.detectUnknownChanges([]);
        
        if (unknownChanges.length > 0) {
          // Create unknown change snapshot
          const unknownSnapshotId = await this.createUnknownSnapshot(unknownChanges, operation.context.sessionId);
          
          // Create checkpoint for unknown changes
          await this.checkpointManager.createFileCheckpoint(
            unknownSnapshotId,
            unknownChanges.map(c => c.filePath),
            this.generateId.bind(this)
          );
          
          console.log(`📸 Created unknown change snapshot: ${unknownSnapshotId}`);
        }
      } catch (error) {
        console.warn('Failed to detect unknown changes:', error);
      }
    }
    
    // 🔍 STEP 2: Create the intended snapshot
    const snapshotId = await this.createIntendedSnapshot(operation);
    
    // 🔍 STEP 3: Create checkpoint for intended snapshot (becomes latest)
    try {
      await this.checkpointManager.createFileCheckpoint(
        snapshotId,
        filteredAffectedFiles,
        this.generateId.bind(this)
      );
    } catch (error) {
      console.warn('Failed to create checkpoint:', error);
    }
    
    // 🔍 STEP 4: Update known file state from latest checkpoint
    await this.updateKnownFileState();

    return snapshotId;
  }

  /**
   * Read a snapshot's diff content
   */
  async readSnapshotDiff(snapshotId: string): Promise<{
    success: boolean;
    diff?: string;
    snapshot?: {
      id: string;
      timestamp: string;
      description: string;
      tool: string;
      affectedFiles: string[];
      sequenceNumber: number;
      previousSnapshotId?: string;
      diffPath?: string;
      reverseDiffPath?: string;
      metadata?: {
        filesSizeBytes: number;
        linesChanged: number;
        executionTimeMs: number;
      };
    };
  }> {
    try {
      const snapshot = await this.coreManager.loadSnapshot(snapshotId);
      if (!snapshot) {
        return { success: false };
      }

      return {
        success: true,
        diff: snapshot.diff,
        snapshot: {
          id: snapshot.id,
          timestamp: snapshot.timestamp,
          description: snapshot.description,
          tool: snapshot.tool,
          affectedFiles: snapshot.affectedFiles,
          sequenceNumber: snapshot.sequenceNumber,
          previousSnapshotId: snapshot.previousSnapshotId,
          diffPath: snapshot.diffPath,
          reverseDiffPath: snapshot.reverseDiffPath,
          metadata: snapshot.metadata
        }
      };
    } catch (error) {
      console.error('Error reading snapshot diff:', error);
      return { success: false };
    }
  }

  /**
   * Get editing history with filters
   */
  async getEditHistory(options: HistoryOptions = {}): Promise<EditHistory> {
    try {
      await this.initialize();
      
      const limit = options.limit || 50;
      const snapshotRefs = this.coreManager.getSnapshotIdsByTime().reverse();
      const hasMore = snapshotRefs.length > limit;
      const limitedSnapshots = snapshotRefs.slice(0, limit);

      // Load full snapshot data if diffs are requested
      const history: EditHistoryItem[] = [];
      const processedIds = new Set<string>(); // Prevent duplicates
      
      for (const snapshotRef of limitedSnapshots) {
        if (processedIds.has(snapshotRef)) {
          continue;
        }
        
        try {
          const snapshot = await this.coreManager.loadSnapshot(snapshotRef);
          if (snapshot) {
            // Apply tool filter if specified
            if (options.toolFilter && options.toolFilter.length > 0) {
              if (!options.toolFilter.includes(snapshot.tool)) {
                continue;
              }
            }
            
            processedIds.add(snapshotRef);
            
            // Handle both regular snapshots and consolidated snapshots
            const metadata = snapshot.metadata || {};
            const linesChanged = metadata.linesChanged || 0;
            const executionTimeMs = metadata.executionTimeMs || 0;
            
            history.push({
              id: snapshot.id,
              timestamp: snapshot.timestamp,
              description: snapshot.description,
              tool: snapshot.tool,
              affectedFiles: snapshot.affectedFiles,
              diff: options.includeDiffs ? snapshot.diff : undefined,
              metadata: {
                linesChanged,
                executionTimeMs
              }
            });
          }
        } catch (error) {
          console.warn(`Failed to load snapshot ${snapshotRef}:`, error);
        }
      }

      return {
        history,
        pagination: {
          total: snapshotRefs.length,
          hasMore,
          nextCursor: hasMore ? limitedSnapshots[limitedSnapshots.length - 1] : undefined
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
      const snapshot = await this.coreManager.loadSnapshot(snapshotId);
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
   * Consolidate multiple snapshots
   */
  async consolidateSnapshots(options: ConsolidationOptions): Promise<ConsolidationResult> {
    await this.initialize();
    
    // Load all snapshots to be consolidated
    const snapshots: SnapshotData[] = [];
    for (const snapshotId of options.snapshotIds) {
      const snapshot = await this.coreManager.loadSnapshot(snapshotId);
      if (snapshot) {
        snapshots.push(snapshot);
      }
    }
    
    if (snapshots.length === 0) {
      return {
        success: false,
        originalSnapshotIds: options.snapshotIds,
        spaceFreed: 0,
        message: 'No valid snapshots found to consolidate'
      };
    }
    
    // Get all snapshots for reference updates
    const allSnapshots = this.coreManager.getSnapshotIndex();
    const result = await this.consolidationManager.consolidateSnapshots(
      snapshots, 
      options, 
      () => this.generateId(),
      this.coreManager,
      allSnapshots
    );
    
    if (result.success && result.consolidatedSnapshotId) {
      // Remove original snapshots from index if they were deleted
      if (options.deleteOriginals) {
        for (const snapshotId of options.snapshotIds) {
          await this.removeSnapshotFromIndex(snapshotId);
        }
      }
      
      // Update our internal state
      const consolidatedSnapshot = await this.coreManager.loadSnapshot(result.consolidatedSnapshotId);
      if (consolidatedSnapshot) {
        this.lastSnapshotId = result.consolidatedSnapshotId;
        this.currentSequenceNumber = Math.max(this.currentSequenceNumber, consolidatedSnapshot.sequenceNumber);
      }
    }
    
    return result;
  }

  /**
   * Remove snapshot from index (helper method)
   */
  private async removeSnapshotFromIndex(snapshotId: string): Promise<void> {
    await this.coreManager.removeSnapshot(snapshotId);
  }

  /**
   * Get snapshot IDs by sequence number range
   */
  async getSnapshotIdsBySequenceRange(startSequence: number, endSequence: number): Promise<string[]> {
    await this.initialize();
    
    const snapshotIndex = this.coreManager.getSnapshotIndex();
    const matchingSnapshots = snapshotIndex.filter(ref => 
      ref.sequenceNumber >= startSequence && ref.sequenceNumber <= endSequence
    );
    
    // Sort by sequence number to maintain order
    matchingSnapshots.sort((a, b) => a.sequenceNumber - b.sequenceNumber);
    
    return matchingSnapshots.map(ref => ref.id);
  }

  /**
   * Get consolidation candidates
   */
  async getConsolidationCandidates(criteria?: ConsolidationCriteria): Promise<string[]> {
    await this.initialize();
    
    const allSnapshots = this.coreManager.getSnapshotIndex().map(ref => ({
      id: ref.id,
      timestamp: ref.timestamp,
      tool: ref.tool,
      affectedFiles: ref.affectedFiles,
      sequenceNumber: ref.sequenceNumber
    }));
    
    return await this.consolidationManager.getConsolidationCandidates(allSnapshots, criteria);
  }

  /**
   * Get storage statistics
   */
  async getStorageStats(): Promise<StorageStats> {
    await this.initialize();
    
    // Load all snapshots for statistics calculation
    const allSnapshots: any[] = [];
    const snapshotIndex = this.coreManager.getSnapshotIndex();
    
    for (const ref of snapshotIndex) {
      const snapshot = await this.coreManager.loadSnapshot(ref.id);
      if (snapshot) {
        allSnapshots.push(snapshot);
      }
    }
    
    return await this.consolidationManager.calculateStorageStats(allSnapshots);
  }

  /**
   * Clean up old snapshots and checkpoints
   */
  async cleanup(olderThan?: Date): Promise<void> {
    const cutoffDate = olderThan || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
    
    // Clean up checkpoints
    await this.checkpointManager.cleanupOldCheckpoints(cutoffDate);
    
    // Note: Snapshot cleanup would need to be implemented in CoreSnapshotManager
    // For now, we'll just log this
    console.log('Snapshot cleanup not yet implemented in modular architecture');
  }

  /**
   * Get system statistics
   */
  getCacheStats() {
    const coreStats = this.coreManager.getCacheStats();
    const checkpointInfo = this.checkpointManager.getCheckpointInfo();
    const ignoreInfo = this.ignoreManager.getIgnoreInfo();
    
    return {
      ...coreStats,
      checkpointInfo,
      ignoreInfo,
      config: this.getConfig()
    };
  }

  /**
   * Get current state information
   */
  getCurrentState(): {
    sequenceNumber: number;
    lastSnapshotId?: string;
    isInitialized: boolean;
    currentFileHashes: Record<string, string>;
  } {
    return {
      sequenceNumber: this.currentSequenceNumber,
      lastSnapshotId: this.lastSnapshotId,
      isInitialized: this.isInitialized,
      currentFileHashes: { ...this.currentFileHashes }
    };
  }

  /**
   * Configuration management
   */
  updateConfig(config: Partial<SnapshotConfig>): void {
    this.config = { ...this.config, ...config };
  }

  getConfig(): SnapshotConfig {
    return { ...this.config };
  }

  /**
   * Get workspace path
   */
  getWorkspacePath(): string {
    return this.workspacePath;
  }

  /**
   * Delegate ignore-related methods to IgnoreManager
   */
  filterIgnoredFiles(filePaths: string[]): string[] {
    return this.ignoreManager.filterIgnoredFiles(filePaths);
  }

  async createDefaultSnapshotIgnore(): Promise<void> {
    return this.ignoreManager.createDefaultSnapshotIgnore();
  }

  getIgnoreInfo() {
    return this.ignoreManager.getIgnoreInfo();
  }

  async reloadIgnoreRules(): Promise<void> {
    return this.ignoreManager.reloadIgnoreRules();
  }

  // Private helper methods

  private async loadCurrentState(): Promise<void> {
    try {
      const latestSnapshot = this.coreManager.getLatestSnapshot();
      
      if (latestSnapshot) {
        const snapshot = await this.coreManager.loadSnapshot(latestSnapshot.id);
        
        if (snapshot) {
          this.currentSequenceNumber = snapshot.sequenceNumber;
          this.lastSnapshotId = snapshot.id;
          this.currentFileHashes = { ...snapshot.resultFileHashes };
        }
      }
    } catch (error) {
      console.warn('Failed to load current state:', error);
    }
  }

  private generateId(): string {
    return Math.random().toString(36).substring(2, 8);
  }

  /**
   * Calculate file hashes for given file paths
   */
  private async calculateFileHashes(filePaths: string[]): Promise<Record<string, string>> {
    const crypto = await import('crypto');
    const fs = await import('fs/promises');
    const hashes: Record<string, string> = {};
    
    for (const filePath of filePaths) {
      try {
        const fullPath = path.isAbsolute(filePath) ? filePath : path.join(this.workspacePath, filePath);
        const content = await fs.readFile(fullPath, 'utf-8');
        const hash = crypto.createHash('sha256').update(content).digest('hex').substring(0, 8);
        hashes[filePath] = hash;
      } catch (error) {
        // File doesn't exist or can't be read, use empty hash
        hashes[filePath] = '';
      }
    }
    
    return hashes;
  }



  /**
   * Simple recursive file scanner for workspace
   */
  private async scanWorkspaceFiles(dir: string = ''): Promise<string[]> {
    const fs = await import('fs/promises');
    const files: string[] = [];
    
    try {
      const fullDir = path.join(this.workspacePath, dir);
      const entries = await fs.readdir(fullDir, { withFileTypes: true });
      
      for (const entry of entries) {
        const relativePath = dir ? path.join(dir, entry.name) : entry.name;
        
        // Skip ignored directories
        if (entry.isDirectory()) {
          if (this.shouldSkipDirectory(entry.name)) {
            continue;
          }
          // Recursively scan subdirectory
          const subFiles = await this.scanWorkspaceFiles(relativePath);
          files.push(...subFiles);
        } else if (entry.isFile()) {
          // Skip ignored file types
          if (!this.shouldSkipFile(entry.name)) {
            files.push(relativePath);
          }
        }
      }
    } catch (error) {
      console.warn(`Failed to scan directory ${dir}:`, error);
    }
    
    return files;
  }

  private shouldSkipDirectory(name: string): boolean {
    return [
      '.continue-reasoning',
      'node_modules',
      '.git',
      '.DS_Store'
    ].includes(name);
  }

  private shouldSkipFile(name: string): boolean {
    return name.endsWith('.log') || name === '.DS_Store';
  }

  /**
   * Detect unknown changes by comparing current state with last known state
   * @param excludeFiles Files that are being actively modified (should not be detected as unknown changes)
   */
  private async detectUnknownChanges(excludeFiles: string[] = []): Promise<Array<{
    filePath: string;
    changeType: 'added' | 'modified' | 'deleted';
    diff?: string;
  }>> {
    const allFiles = await this.scanWorkspaceFiles();
    const filteredFiles = this.filterIgnoredFiles(allFiles);
    const unknownChanges: Array<{
      filePath: string;
      changeType: 'added' | 'modified' | 'deleted';
      diff?: string;
    }> = [];

    // Get latest checkpoint for content comparison
    const latestCheckpoint = await this.checkpointManager.loadFileCheckpoint();

    for (const filePath of filteredFiles) {
      // Skip files that are being actively modified
      if (excludeFiles.includes(filePath)) {
        continue;
      }

      const currentHash = await this.calculateFileHash(filePath);
      const lastKnownHash = this.currentFileHashes[filePath];

      if (lastKnownHash === undefined && currentHash !== '') {
        // New file created
        try {
          const content = await fs.readFile(path.join(this.workspacePath, filePath), 'utf-8');
          const diff = `--- /dev/null\n+++ b/${filePath}\n@@ -1,0 +1,${content.split('\n').length} @@\n` +
                      content.split('\n').map((line: string) => `+${line}`).join('\n');
          unknownChanges.push({
            filePath,
            changeType: 'added',
            diff
          });
        } catch (error) {
          console.warn(`Failed to generate diff for new file ${filePath}:`, error);
        }
      } else if (lastKnownHash !== undefined && currentHash !== lastKnownHash && currentHash !== '') {
        // File modified - generate proper diff if we have stored content
        try {
          let diff: string;
          
                     if (latestCheckpoint?.fileContents && latestCheckpoint.fileContents[filePath]) {
             // Use stored content to generate accurate diff
             const oldContent = latestCheckpoint.fileContents[filePath];
             const newContent = await fs.readFile(path.join(this.workspacePath, filePath), 'utf-8');
             
             // Import diff utility
             const { generateUnifiedDiff } = await import('../runtime/diff');
             diff = await generateUnifiedDiff(oldContent, newContent, {
               oldPath: `a/${filePath}`,
               newPath: `b/${filePath}`
             });
           } else {
            // Fallback to simple placeholder diff
            diff = `--- a/${filePath}\n+++ b/${filePath}\n@@ -1,1 +1,1 @@\n-[modified]\n+[modified]`;
          }
          
          unknownChanges.push({
            filePath,
            changeType: 'modified',
            diff
          });
        } catch (error) {
          console.warn(`Failed to generate diff for modified file ${filePath}:`, error);
          // Add with simple placeholder diff
          unknownChanges.push({
            filePath,
            changeType: 'modified',
            diff: `--- a/${filePath}\n+++ b/${filePath}\n@@ -1,1 +1,1 @@\n-[modified]\n+[modified]`
          });
        }
      } else if (lastKnownHash !== undefined && currentHash === '') {
        // File deleted - show old content if available
        try {
          let diff: string;
          
          if (latestCheckpoint?.fileContents && latestCheckpoint.fileContents[filePath]) {
            // Use stored content to show what was deleted
            const oldContent = latestCheckpoint.fileContents[filePath];
            const lines = oldContent.split('\n');
            diff = `--- a/${filePath}\n+++ /dev/null\n@@ -1,${lines.length} +1,0 @@\n` +
                   lines.map((line: string) => `-${line}`).join('\n');
          } else {
            // Fallback to simple placeholder diff
            diff = `--- a/${filePath}\n+++ /dev/null\n@@ -1,1 +1,0 @@\n-[deleted]`;
          }
          
          unknownChanges.push({
            filePath,
            changeType: 'deleted',
            diff
          });
        } catch (error) {
          console.warn(`Failed to generate diff for deleted file ${filePath}:`, error);
          unknownChanges.push({
            filePath,
            changeType: 'deleted',
            diff: `--- a/${filePath}\n+++ /dev/null\n@@ -1,1 +1,0 @@\n-[deleted]`
          });
        }
      }
    }

    return unknownChanges;
  }

  /**
   * Create unknown change snapshot
   */
  private async createUnknownSnapshot(unknownChanges: Array<{
    filePath: string;
    changeType: 'added' | 'modified' | 'deleted';
    diff?: string;
  }>, sessionId: string): Promise<string> {
    const unknownId = this.generateId();
    const timestamp = new Date().toISOString();
    const affectedFiles = unknownChanges.map(c => c.filePath);
    const combinedDiff = unknownChanges.map(c => c.diff).filter(Boolean).join('\n');

    const unknownSnapshot: SnapshotData = {
      id: unknownId,
      timestamp,
      description: `Unknown changes detected in ${affectedFiles.length} file(s): ${affectedFiles.join(', ')}`,
      tool: 'UnknownChangeIntegration',
      affectedFiles,
      diff: combinedDiff,
      reverseDiff: '',
      previousSnapshotId: this.lastSnapshotId,
      sequenceNumber: ++this.currentSequenceNumber,
      baseFileHashes: this.currentFileHashes,
      resultFileHashes: await this.calculateFileHashes(affectedFiles),
      context: {
        sessionId,
        workspacePath: this.workspacePath,
        toolParams: { unknownChangeDetails: unknownChanges }
      },
      metadata: {
        filesSizeBytes: combinedDiff.length,
        linesChanged: combinedDiff.split('\n').filter(line => line.startsWith('+') || line.startsWith('-')).length,
        executionTimeMs: 0
      }
    };

    await this.coreManager.saveSnapshot(unknownSnapshot);
    
    // Update state
    this.lastSnapshotId = unknownId;
    
    console.log(`⚠️ Detected ${unknownChanges.length} unknown changes in files: ${affectedFiles.join(', ')}`);
    
    return unknownId;
  }

  /**
   * Create intended snapshot
   */
  private async createIntendedSnapshot(operation: {
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
    const filteredAffectedFiles = this.filterIgnoredFiles(operation.affectedFiles);
    const id = this.generateId();
    const timestamp = new Date().toISOString();
    const resultHashes = await this.calculateFileHashes(filteredAffectedFiles);

    const snapshot: SnapshotData = {
      id,
      timestamp,
      description: operation.description,
      tool: operation.tool,
      affectedFiles: filteredAffectedFiles,
      diff: operation.diff,
      reverseDiff: '',
      previousSnapshotId: this.lastSnapshotId,
      sequenceNumber: ++this.currentSequenceNumber,
      baseFileHashes: this.currentFileHashes,
      resultFileHashes: resultHashes,
      context: {
        sessionId: operation.context.sessionId,
        workspacePath: this.workspacePath,
        toolParams: operation.context.toolParams
      },
      metadata: operation.metadata
    };

    await this.coreManager.saveSnapshot(snapshot);
    
    // Update state
    this.lastSnapshotId = id;
    
    return id;
  }

  /**
   * Update known file state from latest checkpoint
   */
  private async updateKnownFileState(): Promise<void> {
    const latestCheckpoint = await this.checkpointManager.loadFileCheckpoint();
    
    if (latestCheckpoint) {
      // Use checkpoint file hashes as known state
      this.currentFileHashes = { ...latestCheckpoint.fileHashes };
    } else {
      // Fallback: scan current files
      const allFiles = await this.scanWorkspaceFiles();
      const filteredFiles = this.filterIgnoredFiles(allFiles);
      
      this.currentFileHashes = {};
      for (const filePath of filteredFiles) {
        this.currentFileHashes[filePath] = await this.calculateFileHash(filePath);
      }
    }
  }

  /**
   * Calculate hash from file content
   */
  private async calculateHashFromContent(content: string): Promise<string> {
    const crypto = await import('crypto');
    return crypto.createHash('sha256').update(content).digest('hex').substring(0, 8);
  }

  /**
   * Calculate hash for a single file
   */
  private async calculateFileHash(filePath: string): Promise<string> {
    try {
      const fullPath = path.isAbsolute(filePath) ? filePath : path.join(this.workspacePath, filePath);
      const content = await fs.readFile(fullPath, 'utf-8');
      return await this.calculateHashFromContent(content);
    } catch (error) {
      return ''; // File doesn't exist
    }
  }
} 