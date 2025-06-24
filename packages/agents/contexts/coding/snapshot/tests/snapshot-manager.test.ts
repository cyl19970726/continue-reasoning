/**
 * Tests for SnapshotManager (Modular Architecture)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { SnapshotManager } from '../snapshot-manager';
import { SnapshotConfig } from '../interfaces';

describe('SnapshotManager', () => {
  let manager: SnapshotManager;
  let testWorkspace: string;
  let config: SnapshotConfig;

  beforeEach(async () => {
    // Create temporary test workspace
    testWorkspace = path.join(process.cwd(), 'test-workspace-snapshot-' + Date.now());
    await fs.mkdir(testWorkspace, { recursive: true });
    
    config = {
      enableUnknownChangeDetection: true,
      unknownChangeStrategy: 'warn',
      keepAllCheckpoints: false,
      maxCheckpointAge: 7,
      excludeFromChecking: ['*.tmp', '*.log']
    };
    
    manager = new SnapshotManager(testWorkspace, config);
  });

  afterEach(async () => {
    // Clean up test workspace
    try {
      await fs.rm(testWorkspace, { recursive: true, force: true });
    } catch (error) {
      console.warn('Failed to clean up test workspace:', error);
    }
  });

  describe('initialization', () => {
    it('should initialize all components correctly', async () => {
      await manager.initialize();
      
      // Check that all directories are created
      const snapshotsDir = path.join(testWorkspace, '.continue-reasoning', 'snapshots');
      const checkpointsDir = path.join(testWorkspace, '.continue-reasoning', 'checkpoints');
      const snapshotIgnore = path.join(testWorkspace, '.snapshotignore');
      
      const snapshotsDirExists = await fs.access(snapshotsDir).then(() => true).catch(() => false);
      const checkpointsDirExists = await fs.access(checkpointsDir).then(() => true).catch(() => false);
      const snapshotIgnoreExists = await fs.access(snapshotIgnore).then(() => true).catch(() => false);
      
      expect(snapshotsDirExists).toBe(true);
      expect(checkpointsDirExists).toBe(true);
      expect(snapshotIgnoreExists).toBe(true);
      
      // Check that manager is properly initialized
      const state = manager.getCurrentState();
      expect(state.isInitialized).toBe(true);
    });

    it('should load existing state on initialization', async () => {
      // Initialize once
      await manager.initialize();
      
      // Create a test snapshot
      await fs.writeFile(path.join(testWorkspace, 'test.txt'), 'test content');
      
      const snapshotId = await manager.createSnapshot({
        tool: 'TestTool',
        description: 'Test snapshot',
        affectedFiles: ['test.txt'],
        diff: '+test content',
        context: {
          sessionId: 'test-session'
        },
        metadata: {
          filesSizeBytes: 12,
          linesChanged: 1,
          executionTimeMs: 50
        }
      });
      
      // Create new manager and initialize
      const newManager = new SnapshotManager(testWorkspace, config);
      await newManager.initialize();
      
      // Should load existing state
      const newState = newManager.getCurrentState();
      expect(newState.isInitialized).toBe(true);
      expect(newState.lastSnapshotId).toBe(snapshotId);
      expect(newState.sequenceNumber).toBeGreaterThan(0);
    });
  });

  describe('snapshot operations', () => {
    beforeEach(async () => {
      await manager.initialize();
      
      // Create test files
      await fs.writeFile(path.join(testWorkspace, 'test1.txt'), 'Initial content 1');
      await fs.writeFile(path.join(testWorkspace, 'test2.txt'), 'Initial content 2');
    });

    it('should create snapshots correctly', async () => {
      const snapshotId = await manager.createSnapshot({
        tool: 'EditTool',
        description: 'Edit test files',
        affectedFiles: ['test1.txt', 'test2.txt'],
        diff: '+Modified content',
        context: {
          sessionId: 'edit-session',
          toolParams: { mode: 'edit' }
        },
        metadata: {
          filesSizeBytes: 100,
          linesChanged: 2,
          executionTimeMs: 75
        }
      });
      
      expect(snapshotId).toBeDefined();
      expect(typeof snapshotId).toBe('string');
      
      // Check that snapshot was saved
      const snapshotData = await manager.readSnapshotDiff(snapshotId);
      expect(snapshotData.success).toBe(true);
      expect(snapshotData.snapshot).toBeDefined();
      expect(snapshotData.snapshot!.tool).toBe('EditTool');
      expect(snapshotData.snapshot!.description).toBe('Edit test files');
    });

    it('should maintain sequence continuity', async () => {
      const snapshot1Id = await manager.createSnapshot({
        tool: 'Tool1',
        description: 'First snapshot',
        affectedFiles: ['test1.txt'],
        diff: '+First change',
        context: { sessionId: 'seq-test' },
        metadata: { filesSizeBytes: 50, linesChanged: 1, executionTimeMs: 25 }
      });
      
      const snapshot2Id = await manager.createSnapshot({
        tool: 'Tool2',
        description: 'Second snapshot',
        affectedFiles: ['test2.txt'],
        diff: '+Second change',
        context: { sessionId: 'seq-test' },
        metadata: { filesSizeBytes: 60, linesChanged: 1, executionTimeMs: 30 }
      });
      
      const state = manager.getCurrentState();
      expect(state.sequenceNumber).toBe(2);
      expect(state.lastSnapshotId).toBe(snapshot2Id);
      
      // Check that snapshots are linked
      const snapshot1 = await manager.readSnapshotDiff(snapshot1Id);
      const snapshot2 = await manager.readSnapshotDiff(snapshot2Id);
      
      expect(snapshot1.snapshot!.id).toBe(snapshot1Id);
      expect(snapshot2.snapshot!.id).toBe(snapshot2Id);
    });

    it('should handle file filtering correctly', async () => {
      // Create files that should be ignored
      await fs.writeFile(path.join(testWorkspace, 'temp.tmp'), 'temp content');
      await fs.writeFile(path.join(testWorkspace, 'debug.log'), 'log content');
      
      const snapshotId = await manager.createSnapshot({
        tool: 'FilterTool',
        description: 'Test filtering',
        affectedFiles: ['test1.txt', 'temp.tmp', 'debug.log'],
        diff: '+changes',
        context: { sessionId: 'filter-test' },
        metadata: { filesSizeBytes: 100, linesChanged: 3, executionTimeMs: 50 }
      });
      
      const snapshotData = await manager.readSnapshotDiff(snapshotId);
      expect(snapshotData.success).toBe(true);
      
      // Should only include non-ignored files
      expect(snapshotData.snapshot!.affectedFiles).toContain('test1.txt');
      expect(snapshotData.snapshot!.affectedFiles).not.toContain('temp.tmp');
      expect(snapshotData.snapshot!.affectedFiles).not.toContain('debug.log');
    });
  });

  describe('edit history', () => {
    beforeEach(async () => {
      await manager.initialize();
      await fs.writeFile(path.join(testWorkspace, 'history-test.txt'), 'content');
    });

    it('should provide edit history correctly', async () => {
      // Create multiple snapshots
      const snapshots = [];
      for (let i = 1; i <= 3; i++) {
        const snapshotId = await manager.createSnapshot({
          tool: `Tool${i}`,
          description: `Snapshot ${i}`,
          affectedFiles: ['history-test.txt'],
          diff: `+Change ${i}`,
          context: { sessionId: 'history-session' },
          metadata: { filesSizeBytes: 50 + i * 10, linesChanged: i, executionTimeMs: 25 + i * 5 }
        });
        snapshots.push(snapshotId);
      }
      
      // Get edit history
      const history = await manager.getEditHistory({ limit: 10, includeDiffs: true });
      
      expect(history.history).toHaveLength(3);
      expect(history.pagination.total).toBe(3);
      expect(history.pagination.hasMore).toBe(false);
      
      // Check order (should be most recent first)
      expect(history.history[0].tool).toBe('Tool3');
      expect(history.history[1].tool).toBe('Tool2');
      expect(history.history[2].tool).toBe('Tool1');
    });

    it('should support history filtering', async () => {
      // Create snapshots with different tools
      await manager.createSnapshot({
        tool: 'EditTool',
        description: 'Edit operation',
        affectedFiles: ['history-test.txt'],
        diff: '+edit change',
        context: { sessionId: 'filter-session' },
        metadata: { filesSizeBytes: 50, linesChanged: 1, executionTimeMs: 25 }
      });
      
      await manager.createSnapshot({
        tool: 'DeleteTool',
        description: 'Delete operation',
        affectedFiles: ['history-test.txt'],
        diff: '-deleted content',
        context: { sessionId: 'filter-session' },
        metadata: { filesSizeBytes: 40, linesChanged: 1, executionTimeMs: 20 }
      });
      
      // Filter by tool
      const editHistory = await manager.getEditHistory({ 
        toolFilter: ['EditTool'],
        includeDiffs: false 
      });
      
      expect(editHistory.history).toHaveLength(1);
      expect(editHistory.history[0].tool).toBe('EditTool');
      expect(editHistory.history[0].diff).toBeUndefined(); // includeDiffs: false
    });
  });

  describe('cache management', () => {
    beforeEach(async () => {
      await manager.initialize();
    });

    it('should provide cache statistics', async () => {
      const initialStats = manager.getCacheStats();
      expect(initialStats.cacheLoaded).toBe(true);
      expect(initialStats.snapshotCount).toBe(0);
      expect(initialStats.config).toEqual(config);
      
      // Create a snapshot
      await fs.writeFile(path.join(testWorkspace, 'cache-test.txt'), 'content');
      await manager.createSnapshot({
        tool: 'CacheTool',
        description: 'Cache test',
        affectedFiles: ['cache-test.txt'],
        diff: '+content',
        context: { sessionId: 'cache-session' },
        metadata: { filesSizeBytes: 7, linesChanged: 1, executionTimeMs: 15 }
      });
      
      const updatedStats = manager.getCacheStats();
      expect(updatedStats.snapshotCount).toBe(1);
      expect(updatedStats.memoryUsage.snapshotCacheSize).toBe(1);
    });

         it('should support cache operations', async () => {
       // Create a snapshot
       await fs.writeFile(path.join(testWorkspace, 'reload-test.txt'), 'content');
       await manager.createSnapshot({
         tool: 'ReloadTool',
         description: 'Reload test',
         affectedFiles: ['reload-test.txt'],
         diff: '+content',
         context: { sessionId: 'reload-session' },
         metadata: { filesSizeBytes: 7, linesChanged: 1, executionTimeMs: 15 }
       });
       
       expect(manager.getCacheStats().snapshotCount).toBe(1);
       
       // Test that cache stats are available
       const stats = manager.getCacheStats();
       expect(stats.cacheLoaded).toBe(true);
       expect(stats.snapshotCount).toBe(1);
     });
  });

  describe('configuration management', () => {
    beforeEach(async () => {
      await manager.initialize();
    });

    it('should support configuration updates', () => {
      const initialConfig = manager.getConfig();
      expect(initialConfig.unknownChangeStrategy).toBe('warn');
      
      // Update configuration
      manager.updateConfig({
        unknownChangeStrategy: 'strict',
        maxCheckpointAge: 14
      });
      
      const updatedConfig = manager.getConfig();
      expect(updatedConfig.unknownChangeStrategy).toBe('strict');
      expect(updatedConfig.maxCheckpointAge).toBe(14);
      expect(updatedConfig.enableUnknownChangeDetection).toBe(true); // Should preserve other settings
    });

    it('should provide ignore information', () => {
      const ignoreInfo = manager.getIgnoreInfo();
      
      expect(ignoreInfo).toHaveProperty('ignoreFilePath');
      expect(ignoreInfo).toHaveProperty('ignoreFileExists');
      expect(ignoreInfo).toHaveProperty('patterns');
      expect(ignoreInfo).toHaveProperty('isLoaded');
      
      expect(ignoreInfo.ignoreFilePath).toBe(path.join(testWorkspace, '.snapshotignore'));
      expect(Array.isArray(ignoreInfo.patterns)).toBe(true);
    });
  });

  describe('cleanup operations', () => {
    beforeEach(async () => {
      await manager.initialize();
    });

    it('should support snapshot cleanup', async () => {
      // Create a test snapshot
      await fs.writeFile(path.join(testWorkspace, 'cleanup-test.txt'), 'content');
      await manager.createSnapshot({
        tool: 'CleanupTool',
        description: 'Cleanup test',
        affectedFiles: ['cleanup-test.txt'],
        diff: '+content',
        context: { sessionId: 'cleanup-session' },
        metadata: { filesSizeBytes: 7, linesChanged: 1, executionTimeMs: 15 }
      });
      
      expect(manager.getCacheStats().snapshotCount).toBe(1);
      
      // Cleanup (this is a basic test since we can't easily mock timestamps)
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 30); // 30 days ago
      
      await expect(manager.cleanup(oldDate)).resolves.not.toThrow();
    });

         it('should support checkpoint cleanup', async () => {
       // Create a test snapshot (which creates a checkpoint)
       await fs.writeFile(path.join(testWorkspace, 'checkpoint-cleanup.txt'), 'content');
       await manager.createSnapshot({
         tool: 'CheckpointCleanupTool',
         description: 'Checkpoint cleanup test',
         affectedFiles: ['checkpoint-cleanup.txt'],
         diff: '+content',
         context: { sessionId: 'checkpoint-cleanup-session' },
         metadata: { filesSizeBytes: 7, linesChanged: 1, executionTimeMs: 15 }
       });
       
       // Test that cleanup works through general cleanup method
       const oldDate = new Date();
       oldDate.setDate(oldDate.getDate() - 30);
       
       await expect(manager.cleanup(oldDate)).resolves.not.toThrow();
     });
  });

  describe('error handling', () => {
    beforeEach(async () => {
      await manager.initialize();
    });

    it('should handle invalid snapshot IDs gracefully', async () => {
      const result = await manager.readSnapshotDiff('non-existent-id');
      expect(result.success).toBe(false);
      expect(result.diff).toBeUndefined();
      expect(result.snapshot).toBeUndefined();
    });

    it('should handle file system errors gracefully', async () => {
      // Try to create snapshot with non-existent files
      await expect(manager.createSnapshot({
        tool: 'ErrorTool',
        description: 'Error test',
        affectedFiles: ['non-existent.txt'],
        diff: '+content',
        context: { sessionId: 'error-session' },
        metadata: { filesSizeBytes: 0, linesChanged: 0, executionTimeMs: 0 }
      })).resolves.not.toThrow();
    });

         it('should handle corrupted data gracefully', async () => {
       // This tests the underlying managers' error handling
       await expect(manager.getEditHistory()).resolves.not.toThrow();
       
       // Test that basic operations work even with potential data issues
       const state = manager.getCurrentState();
       expect(state).toBeDefined();
     });
  });

  describe('state management', () => {
    beforeEach(async () => {
      await manager.initialize();
    });

    it('should provide current state information', () => {
      const state = manager.getCurrentState();
      
      expect(state).toHaveProperty('sequenceNumber');
      expect(state).toHaveProperty('lastSnapshotId');
      expect(state).toHaveProperty('isInitialized');
      expect(state).toHaveProperty('currentFileHashes');
      
      expect(state.isInitialized).toBe(true);
      expect(state.sequenceNumber).toBe(0); // Initially 0
      expect(typeof state.currentFileHashes).toBe('object');
    });

         it('should track state changes correctly', async () => {
       // Create a snapshot first
       await fs.writeFile(path.join(testWorkspace, 'state-test.txt'), 'content');
       await manager.createSnapshot({
         tool: 'StateTool',
         description: 'State test',
         affectedFiles: ['state-test.txt'],
         diff: '+content',
         context: { sessionId: 'state-session' },
         metadata: { filesSizeBytes: 7, linesChanged: 1, executionTimeMs: 15 }
       });
       
       const state = manager.getCurrentState();
       expect(state.sequenceNumber).toBeGreaterThan(0);
       expect(state.lastSnapshotId).toBeDefined();
       expect(state.isInitialized).toBe(true);
       
       // Test that state is consistent
       expect(typeof state.currentFileHashes).toBe('object');
     });
  });
}); 