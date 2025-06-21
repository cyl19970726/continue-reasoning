/**
 * Tests for CoreSnapshotManager
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { CoreSnapshotManager } from '../core/core-snapshot-manager';
import { SnapshotData, SnapshotConfig } from '../interfaces';

describe('CoreSnapshotManager', () => {
  let manager: CoreSnapshotManager;
  let testWorkspace: string;
  let config: SnapshotConfig;

  beforeEach(async () => {
    // Create temporary test workspace
    testWorkspace = path.join(process.cwd(), 'test-workspace-core-' + Date.now());
    await fs.mkdir(testWorkspace, { recursive: true });
    
    config = {
      enableUnknownChangeDetection: true,
      unknownChangeStrategy: 'warn',
      keepAllCheckpoints: false,
      maxCheckpointAge: 7,
      excludeFromChecking: []
    };
    
    manager = new CoreSnapshotManager(testWorkspace, config);
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
    it('should initialize snapshot directory structure', async () => {
      await manager.initialize();
      
      const snapshotsDir = path.join(testWorkspace, '.continue-reasoning', 'snapshots');
      const indexPath = path.join(snapshotsDir, 'index.json');
      
      // Check directories exist
      const snapshotsDirExists = await fs.access(snapshotsDir).then(() => true).catch(() => false);
      expect(snapshotsDirExists).toBe(true);
      
      // Check index file exists
      const indexExists = await fs.access(indexPath).then(() => true).catch(() => false);
      expect(indexExists).toBe(true);
      
      // Check index content
      const indexContent = await fs.readFile(indexPath, 'utf-8');
      const index = JSON.parse(indexContent);
      expect(index).toEqual({ snapshots: [] });
    });

    it('should load existing cache on initialization', async () => {
      await manager.initialize();
      
      // Create a test snapshot
      const snapshot: SnapshotData = {
        id: 'test-123',
        timestamp: new Date().toISOString(),
        description: 'Test snapshot',
        tool: 'TestTool',
        affectedFiles: ['test.txt'],
        diff: 'test diff',
        reverseDiff: 'reverse diff',
        previousSnapshotId: undefined,
        sequenceNumber: 1,
        baseFileHashes: { 'test.txt': 'hash1' },
        resultFileHashes: { 'test.txt': 'hash2' },
        context: {
          sessionId: 'test-session',
          workspacePath: testWorkspace
        },
        metadata: {
          filesSizeBytes: 100,
          linesChanged: 5,
          executionTimeMs: 50
        }
      };
      
      await manager.saveSnapshot(snapshot);
      
      // Create new manager instance and initialize
      const newManager = new CoreSnapshotManager(testWorkspace, config);
      await newManager.initialize();
      
      // Check cache was loaded
      const stats = newManager.getCacheStats();
      expect(stats.snapshotCount).toBe(1);
      expect(stats.cacheLoaded).toBe(true);
    });
  });

  describe('snapshot operations', () => {
    beforeEach(async () => {
      await manager.initialize();
    });

    it('should save and load snapshots correctly', async () => {
      const snapshot: SnapshotData = {
        id: 'test-456',
        timestamp: new Date().toISOString(),
        description: 'Test save/load',
        tool: 'SaveLoadTool',
        affectedFiles: ['file1.txt', 'file2.txt'],
        diff: 'test diff content',
        reverseDiff: 'reverse diff content',
        previousSnapshotId: undefined,
        sequenceNumber: 1,
        baseFileHashes: { 'file1.txt': 'hash1', 'file2.txt': 'hash2' },
        resultFileHashes: { 'file1.txt': 'hash3', 'file2.txt': 'hash4' },
        context: {
          sessionId: 'save-load-session',
          workspacePath: testWorkspace,
          toolParams: { test: true }
        },
        metadata: {
          filesSizeBytes: 200,
          linesChanged: 10,
          executionTimeMs: 100
        }
      };

      // Save snapshot
      await manager.saveSnapshot(snapshot);

      // Load snapshot
      const loadedSnapshot = await manager.loadSnapshot('test-456');
      
      expect(loadedSnapshot).not.toBeNull();
      expect(loadedSnapshot!.id).toBe('test-456');
      expect(loadedSnapshot!.description).toBe('Test save/load');
      expect(loadedSnapshot!.tool).toBe('SaveLoadTool');
      expect(loadedSnapshot!.affectedFiles).toEqual(['file1.txt', 'file2.txt']);
      expect(loadedSnapshot!.diff).toBe('test diff content');
    });

    it('should return null for non-existent snapshots', async () => {
      const result = await manager.loadSnapshot('non-existent-id');
      expect(result).toBeNull();
    });

    it('should maintain snapshot index correctly', async () => {
      const snapshot1: SnapshotData = {
        id: 'snap-1',
        timestamp: '2024-01-01T10:00:00.000Z',
        description: 'First snapshot',
        tool: 'Tool1',
        affectedFiles: ['file1.txt'],
        diff: 'diff1',
        reverseDiff: '',
        previousSnapshotId: undefined,
        sequenceNumber: 1,
        baseFileHashes: {},
        resultFileHashes: {},
        context: { sessionId: 'session1', workspacePath: testWorkspace },
        metadata: { filesSizeBytes: 50, linesChanged: 3, executionTimeMs: 25 }
      };

      const snapshot2: SnapshotData = {
        id: 'snap-2',
        timestamp: '2024-01-01T11:00:00.000Z',
        description: 'Second snapshot',
        tool: 'Tool2',
        affectedFiles: ['file2.txt'],
        diff: 'diff2',
        reverseDiff: '',
        previousSnapshotId: 'snap-1',
        sequenceNumber: 2,
        baseFileHashes: {},
        resultFileHashes: {},
        context: { sessionId: 'session1', workspacePath: testWorkspace },
        metadata: { filesSizeBytes: 75, linesChanged: 5, executionTimeMs: 30 }
      };

      await manager.saveSnapshot(snapshot1);
      await manager.saveSnapshot(snapshot2);

      const index = manager.getSnapshotIndex();
      expect(index).toHaveLength(2);
      
      const idsByTime = manager.getSnapshotIdsByTime();
      expect(idsByTime).toEqual(['snap-1', 'snap-2']); // sorted by timestamp
      
      const idsBySequence = manager.getSnapshotIdsBySequence();
      expect(idsBySequence).toEqual(['snap-1', 'snap-2']); // sorted by sequence
    });

    it('should get latest snapshot correctly', async () => {
      expect(manager.getLatestSnapshot()).toBeNull();

      const snapshot1: SnapshotData = {
        id: 'early-snap',
        timestamp: '2024-01-01T08:00:00.000Z',
        description: 'Early snapshot',
        tool: 'EarlyTool',
        affectedFiles: [],
        diff: '',
        reverseDiff: '',
        previousSnapshotId: undefined,
        sequenceNumber: 1,
        baseFileHashes: {},
        resultFileHashes: {},
        context: { sessionId: 'session', workspacePath: testWorkspace },
        metadata: { filesSizeBytes: 0, linesChanged: 0, executionTimeMs: 0 }
      };

      const snapshot2: SnapshotData = {
        id: 'latest-snap',
        timestamp: '2024-01-01T12:00:00.000Z',
        description: 'Latest snapshot',
        tool: 'LatestTool',
        affectedFiles: [],
        diff: '',
        reverseDiff: '',
        previousSnapshotId: 'early-snap',
        sequenceNumber: 2,
        baseFileHashes: {},
        resultFileHashes: {},
        context: { sessionId: 'session', workspacePath: testWorkspace },
        metadata: { filesSizeBytes: 0, linesChanged: 0, executionTimeMs: 0 }
      };

      await manager.saveSnapshot(snapshot1);
      await manager.saveSnapshot(snapshot2);

      const latest = manager.getLatestSnapshot();
      expect(latest).not.toBeNull();
      expect(latest!.id).toBe('latest-snap');
      expect(latest!.timestamp).toBe('2024-01-01T12:00:00.000Z');
    });
  });

  describe('cache management', () => {
    beforeEach(async () => {
      await manager.initialize();
    });

    it('should provide accurate cache statistics', async () => {
      const initialStats = manager.getCacheStats();
      expect(initialStats.cacheLoaded).toBe(true);
      expect(initialStats.snapshotCount).toBe(0);

      // Add a snapshot
      const snapshot: SnapshotData = {
        id: 'stats-test',
        timestamp: new Date().toISOString(),
        description: 'Stats test',
        tool: 'StatsTool',
        affectedFiles: [],
        diff: '',
        reverseDiff: '',
        previousSnapshotId: undefined,
        sequenceNumber: 1,
        baseFileHashes: {},
        resultFileHashes: {},
        context: { sessionId: 'stats-session', workspacePath: testWorkspace },
        metadata: { filesSizeBytes: 0, linesChanged: 0, executionTimeMs: 0 }
      };

      await manager.saveSnapshot(snapshot);

      const updatedStats = manager.getCacheStats();
      expect(updatedStats.snapshotCount).toBe(1);
      expect(updatedStats.memoryUsage.snapshotCacheSize).toBe(1);
      expect(updatedStats.memoryUsage.arraySize).toBe(2); // snapshotIdsByTime + snapshotIdsBySequence
    });

    it('should clear cache correctly', async () => {
      // Add a snapshot
      const snapshot: SnapshotData = {
        id: 'clear-test',
        timestamp: new Date().toISOString(),
        description: 'Clear test',
        tool: 'ClearTool',
        affectedFiles: [],
        diff: '',
        reverseDiff: '',
        previousSnapshotId: undefined,
        sequenceNumber: 1,
        baseFileHashes: {},
        resultFileHashes: {},
        context: { sessionId: 'clear-session', workspacePath: testWorkspace },
        metadata: { filesSizeBytes: 0, linesChanged: 0, executionTimeMs: 0 }
      };

      await manager.saveSnapshot(snapshot);
      expect(manager.getCacheStats().snapshotCount).toBe(1);

      // Clear cache
      manager.clearCache();
      
      const stats = manager.getCacheStats();
      expect(stats.cacheLoaded).toBe(false);
      expect(stats.snapshotCount).toBe(0);
      expect(stats.memoryUsage.snapshotCacheSize).toBe(0);
      expect(stats.memoryUsage.arraySize).toBe(0);
    });
  });

  describe('error handling', () => {
    it('should handle initialization with missing directories gracefully', async () => {
      // This should not throw
      await expect(manager.initialize()).resolves.not.toThrow();
    });

    it('should handle corrupted index file gracefully', async () => {
      await manager.initialize();
      
      // Corrupt the index file
      const indexPath = path.join(testWorkspace, '.continue-reasoning', 'snapshots', 'index.json');
      await fs.writeFile(indexPath, 'invalid json content');
      
      // Create new manager and initialize - should handle gracefully
      const newManager = new CoreSnapshotManager(testWorkspace, config);
      await expect(newManager.initialize()).resolves.not.toThrow();
      
      // Should have empty cache
      const stats = newManager.getCacheStats();
      expect(stats.snapshotCount).toBe(0);
      expect(stats.cacheLoaded).toBe(true);
    });
  });
}); 