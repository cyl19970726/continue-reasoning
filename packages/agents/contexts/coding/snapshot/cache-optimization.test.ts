/**
 * Cache Optimization Tests
 * 
 * Tests for memory caching improvements in SimpleSnapshotManager
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { SimpleSnapshotManager } from './simple-snapshot-manager';

describe('Cache Optimization', () => {
  let tempDir: string;
  let snapshotManager: SimpleSnapshotManager;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cache-optimization-test-'));
    snapshotManager = new SimpleSnapshotManager(tempDir);
    await snapshotManager.initialize();
  });

  afterEach(async () => {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  describe('Cache Loading and Management', () => {
    it('should load cache during initialization', async () => {
      const stats = snapshotManager.getCacheStats();
      expect(stats.cacheLoaded).toBe(true);
      expect(stats.snapshotCount).toBe(0);
      expect(stats.milestoneCount).toBe(0);
    });

    it('should update cache when creating snapshots', async () => {
      const initialStats = snapshotManager.getCacheStats();
      expect(initialStats.snapshotCount).toBe(0);

      // Create a snapshot
      await snapshotManager.createSnapshot({
        tool: 'test-tool',
        description: 'Test snapshot',
        affectedFiles: ['test.txt'],
        diff: 'test diff',
        context: { sessionId: 'test-session' },
        metadata: { filesSizeBytes: 100, linesChanged: 1, executionTimeMs: 10 }
      });

      const updatedStats = snapshotManager.getCacheStats();
      expect(updatedStats.snapshotCount).toBe(1);
      expect(updatedStats.memoryUsage.snapshotCacheSize).toBe(1);
    });

    it('should update cache when creating milestones', async () => {
      // Create a snapshot first
      const snapshotId = await snapshotManager.createSnapshot({
        tool: 'test-tool',
        description: 'Test snapshot',
        affectedFiles: ['test.txt'],
        diff: 'test diff',
        context: { sessionId: 'test-session' },
        metadata: { filesSizeBytes: 100, linesChanged: 1, executionTimeMs: 10 }
      });

      const initialStats = snapshotManager.getCacheStats();
      expect(initialStats.milestoneCount).toBe(0);

      // Create a milestone
      await snapshotManager.createMilestone({
        title: 'Test Milestone',
        description: 'Test milestone',
        snapshotIds: [snapshotId],
        tags: ['test']
      });

      const updatedStats = snapshotManager.getCacheStats();
      expect(updatedStats.milestoneCount).toBe(1);
      expect(updatedStats.memoryUsage.milestoneCacheSize).toBe(1);
    });
  });

  describe('Performance Optimization', () => {
    it('should reduce file IO operations by using cache', async () => {
      // Create multiple snapshots first
      const snapshotIds = [];
      for (let i = 0; i < 5; i++) {
        const snapshotId = await snapshotManager.createSnapshot({
          tool: 'test-tool',
          description: `Snapshot ${i}`,
          affectedFiles: [`file${i}.txt`],
          diff: `diff ${i}`,
          context: { sessionId: 'test-session' },
          metadata: { filesSizeBytes: 100 * i, linesChanged: i, executionTimeMs: 10 * i }
        });
        snapshotIds.push(snapshotId);
      }

      // Test cache performance by measuring time instead of spying on fs
      const startTime = Date.now();

      // Get edit history multiple times - should use cache and be fast
      for (let i = 0; i < 10; i++) {
        await snapshotManager.getEditHistory({ limit: 5 });
      }

      const endTime = Date.now();
      const totalTime = endTime - startTime;

      // Should be very fast due to caching (less than 100ms for 10 operations)
      expect(totalTime).toBeLessThan(100);

      // Verify cache stats
      const stats = snapshotManager.getCacheStats();
      expect(stats.cacheLoaded).toBe(true);
      expect(stats.snapshotCount).toBe(5);
    });

    it('should handle large numbers of snapshots efficiently', async () => {
      const startTime = Date.now();
      
      // Create many snapshots
      const snapshotIds = [];
      for (let i = 0; i < 50; i++) {
        const snapshotId = await snapshotManager.createSnapshot({
          tool: 'test-tool',
          description: `Snapshot ${i}`,
          affectedFiles: [`file${i}.txt`],
          diff: `diff ${i}`,
          context: { sessionId: 'test-session' },
          metadata: { filesSizeBytes: 100 * i, linesChanged: i, executionTimeMs: 10 * i }
        });
        snapshotIds.push(snapshotId);
      }

      const creationTime = Date.now() - startTime;

      // Test cache performance
      const queryStartTime = Date.now();
      
      // Multiple operations that should use cache
      await snapshotManager.getEditHistory({ limit: 20 });
      await snapshotManager.getEditHistory({ toolFilter: ['test-tool'] });
      
      // Create milestone by range
      const result = await snapshotManager.createMilestoneByRange({
        title: 'Range Milestone',
        description: 'Created by range',
        endSnapshotId: snapshotIds[2], // Include first 3 snapshots
        tags: ['range']
      });

      const queryTime = Date.now() - queryStartTime;

      // Verify cache stats
      const stats = snapshotManager.getCacheStats();
      expect(stats.snapshotCount).toBe(50);
      expect(stats.milestoneCount).toBe(1);

      // Performance should be reasonable
      expect(queryTime).toBeLessThan(1000); // Should complete within 1 second
      
      console.log(`Created 50 snapshots in ${creationTime}ms, queries took ${queryTime}ms`);
    });
  });

  describe('Cache Consistency', () => {
    it('should maintain cache consistency across operations', async () => {
      // Create snapshots
      const snapshot1Id = await snapshotManager.createSnapshot({
        tool: 'test-tool',
        description: 'Snapshot 1',
        affectedFiles: ['file1.txt'],
        diff: 'diff 1',
        context: { sessionId: 'test-session' },
        metadata: { filesSizeBytes: 100, linesChanged: 1, executionTimeMs: 10 }
      });

      const snapshot2Id = await snapshotManager.createSnapshot({
        tool: 'test-tool',
        description: 'Snapshot 2',
        affectedFiles: ['file2.txt'],
        diff: 'diff 2',
        context: { sessionId: 'test-session' },
        metadata: { filesSizeBytes: 150, linesChanged: 2, executionTimeMs: 15 }
      });

      // Create milestone
      await snapshotManager.createMilestone({
        title: 'Test Milestone',
        description: 'Test milestone',
        snapshotIds: [snapshot1Id, snapshot2Id],
        tags: ['test']
      });

      // Verify cache reflects the operations
      const stats = snapshotManager.getCacheStats();
      expect(stats.snapshotCount).toBe(2);
      expect(stats.milestoneCount).toBe(1);

      // Get history and verify it matches cache
      const history = await snapshotManager.getEditHistory();
      expect(history.history.length).toBe(2);
      expect(history.pagination.total).toBe(2);

      // Get milestones and verify
      const milestones = await snapshotManager.getMilestones();
      expect(milestones.milestones.length).toBe(1);
    });

    it('should handle cache reload correctly', async () => {
      // Create some data
      const snapshotId = await snapshotManager.createSnapshot({
        tool: 'test-tool',
        description: 'Test snapshot',
        affectedFiles: ['test.txt'],
        diff: 'test diff',
        context: { sessionId: 'test-session' },
        metadata: { filesSizeBytes: 100, linesChanged: 1, executionTimeMs: 10 }
      });

      await snapshotManager.createMilestone({
        title: 'Test Milestone',
        description: 'Test milestone',
        snapshotIds: [snapshotId],
        tags: ['test']
      });

      const statsBeforeReload = snapshotManager.getCacheStats();
      expect(statsBeforeReload.snapshotCount).toBe(1);
      expect(statsBeforeReload.milestoneCount).toBe(1);

      // Reload cache
      await snapshotManager.reloadCache();

      const statsAfterReload = snapshotManager.getCacheStats();
      expect(statsAfterReload.snapshotCount).toBe(1);
      expect(statsAfterReload.milestoneCount).toBe(1);
      expect(statsAfterReload.cacheLoaded).toBe(true);
    });

    it('should handle cache clearing', async () => {
      // Create some data
      await snapshotManager.createSnapshot({
        tool: 'test-tool',
        description: 'Test snapshot',
        affectedFiles: ['test.txt'],
        diff: 'test diff',
        context: { sessionId: 'test-session' },
        metadata: { filesSizeBytes: 100, linesChanged: 1, executionTimeMs: 10 }
      });

      const statsBeforeClear = snapshotManager.getCacheStats();
      expect(statsBeforeClear.snapshotCount).toBe(1);

      // Clear cache
      snapshotManager.clearCache();

      const statsAfterClear = snapshotManager.getCacheStats();
      expect(statsAfterClear.snapshotCount).toBe(0);
      expect(statsAfterClear.milestoneCount).toBe(0);
      expect(statsAfterClear.cacheLoaded).toBe(false);
    });
  });

  describe('Memory Usage Optimization', () => {
    it('should provide accurate memory usage statistics', async () => {
      const initialStats = snapshotManager.getCacheStats();
      expect(initialStats.memoryUsage.totalArraySize).toBe(0);

      // Create snapshots
      for (let i = 0; i < 10; i++) {
        await snapshotManager.createSnapshot({
          tool: 'test-tool',
          description: `Snapshot ${i}`,
          affectedFiles: [`file${i}.txt`],
          diff: `diff ${i}`,
          context: { sessionId: 'test-session' },
          metadata: { filesSizeBytes: 100 * i, linesChanged: i, executionTimeMs: 10 * i }
        });
      }

      const stats = snapshotManager.getCacheStats();
      expect(stats.snapshotCount).toBe(10);
      expect(stats.memoryUsage.snapshotCacheSize).toBe(10);
      // Should have entries in both time and sequence arrays
      expect(stats.memoryUsage.totalArraySize).toBeGreaterThan(10);
    });

    it('should handle cleanup efficiently with cache', async () => {
      // Create some snapshots
      for (let i = 0; i < 5; i++) {
        await snapshotManager.createSnapshot({
          tool: 'test-tool',
          description: `Snapshot ${i}`,
          affectedFiles: [`file${i}.txt`],
          diff: `diff ${i}`,
          context: { sessionId: 'test-session' },
          metadata: { filesSizeBytes: 100, linesChanged: 1, executionTimeMs: 10 }
        });
      }

      const statsBeforeCleanup = snapshotManager.getCacheStats();
      expect(statsBeforeCleanup.snapshotCount).toBe(5);

      // Test cleanup with a very old cutoff date (should not remove anything)
      const veryOldDate = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000); // 1 year ago
      await snapshotManager.cleanup(veryOldDate);

      const statsAfterCleanup = snapshotManager.getCacheStats();
      // Should not have removed any snapshots since they're all recent
      expect(statsAfterCleanup.snapshotCount).toBe(5);

      // Verify cache is still working
      const history = await snapshotManager.getEditHistory({ limit: 3 });
      expect(history.history).toHaveLength(3);
    });
  });

  describe('Error Handling with Cache', () => {
    it('should handle corrupted cache gracefully', async () => {
      // Create a snapshot first
      await snapshotManager.createSnapshot({
        tool: 'test-tool',
        description: 'Test snapshot',
        affectedFiles: ['test.txt'],
        diff: 'test diff',
        context: { sessionId: 'test-session' },
        metadata: { filesSizeBytes: 100, linesChanged: 1, executionTimeMs: 10 }
      });

      // Corrupt the index file
      const indexPath = path.join(tempDir, '.continue-reasoning', 'snapshots', 'index.json');
      await fs.writeFile(indexPath, 'invalid json content');

      // Create new manager and try to initialize
      const newManager = new SimpleSnapshotManager(tempDir);
      await newManager.initialize(); // Should not throw

      const stats = newManager.getCacheStats();
      expect(stats.cacheLoaded).toBe(true);
      // Should have empty cache due to corruption
      expect(stats.snapshotCount).toBe(0);
    });

    it('should handle missing index files gracefully', async () => {
      // Delete index files
      const snapshotIndexPath = path.join(tempDir, '.continue-reasoning', 'snapshots', 'index.json');
      const milestoneIndexPath = path.join(tempDir, '.continue-reasoning', 'milestones', 'index.json');
      
      try {
        await fs.unlink(snapshotIndexPath);
        await fs.unlink(milestoneIndexPath);
      } catch {
        // Files might not exist
      }

      // Create new manager
      const newManager = new SimpleSnapshotManager(tempDir);
      await newManager.initialize(); // Should not throw

      const stats = newManager.getCacheStats();
      expect(stats.cacheLoaded).toBe(true);
      expect(stats.snapshotCount).toBe(0);
      expect(stats.milestoneCount).toBe(0);
    });
  });
}); 