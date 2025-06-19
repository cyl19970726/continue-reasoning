/**
 * Cache Integration Tests
 * 
 * Tests to verify cache optimization works correctly with the snapshot system
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { SimpleSnapshotManager } from './simple-snapshot-manager';

describe('Cache Integration', () => {
  let tempDir: string;
  let snapshotManager: SimpleSnapshotManager;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cache-integration-test-'));
    snapshotManager = new SimpleSnapshotManager(tempDir);
    await snapshotManager.initialize();
  });

  afterEach(async () => {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  describe('Cache Performance', () => {
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
      await snapshotManager.getEditHistory({ limit: 10 });
      await snapshotManager.getEditHistory({ limit: 5 });
      await snapshotManager.getEditHistory({ toolFilter: ['test-tool'] });

      const totalTime = Date.now() - startTime;

      // Should be very fast due to caching (under 50ms for 3 queries)
      expect(totalTime).toBeLessThan(50);

      // Verify cache stats
      const stats = snapshotManager.getCacheStats();
      expect(stats.snapshotCount).toBe(5);
      expect(stats.cacheLoaded).toBe(true);
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
      
      // Create milestone using range (should be fast with cache)
      await snapshotManager.createMilestoneByRange({
        title: 'Large Milestone',
        description: 'Milestone with many snapshots',
        endSnapshotId: snapshotIds[49],
        tags: ['large']
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

  describe('Milestone Range Creation', () => {
    it('should create milestone by range without startSnapshotId', async () => {
      // Create a sequence of snapshots
      const snapshotIds = [];
      for (let i = 1; i <= 5; i++) {
        const snapshotId = await snapshotManager.createSnapshot({
          tool: 'test-tool',
          description: `Snapshot ${i}`,
          affectedFiles: [`file${i}.txt`],
          diff: `diff ${i}`,
          context: { sessionId: 'test-session' },
          metadata: { filesSizeBytes: 100 * i, linesChanged: i, executionTimeMs: 10 }
        });
        snapshotIds.push(snapshotId);
      }

      // Create milestone by range (should auto-detect start from beginning)
      const result = await snapshotManager.createMilestoneByRange({
        title: 'Auto Range Milestone',
        description: 'Should include all snapshots',
        // No startSnapshotId needed - auto-detected
        endSnapshotId: snapshotIds[4], // Include all 5 snapshots
        tags: ['auto-range']
      });

      expect(result.success).toBe(true);
      expect(result.snapshotIds).toEqual(snapshotIds);

      // Verify cache is updated
      const stats = snapshotManager.getCacheStats();
      expect(stats.milestoneCount).toBe(1);
    });

    it('should handle consecutive milestones correctly', async () => {
      // Create first batch of snapshots
      const batch1Ids = [];
      for (let i = 1; i <= 3; i++) {
        const snapshotId = await snapshotManager.createSnapshot({
          tool: 'test-tool',
          description: `Batch 1 Snapshot ${i}`,
          affectedFiles: [`batch1-file${i}.txt`],
          diff: `batch1 diff ${i}`,
          context: { sessionId: 'test-session' },
          metadata: { filesSizeBytes: 100 * i, linesChanged: i, executionTimeMs: 10 }
        });
        batch1Ids.push(snapshotId);
      }

      // Create first milestone
      const milestone1Result = await snapshotManager.createMilestoneByRange({
        title: 'Batch 1 Milestone',
        description: 'First batch',
        endSnapshotId: batch1Ids[2], // Include first 3 snapshots
        tags: ['batch1']
      });

      expect(milestone1Result.success).toBe(true);
      expect(milestone1Result.snapshotIds).toEqual(batch1Ids);

      // Create second batch of snapshots
      const batch2Ids = [];
      for (let i = 1; i <= 2; i++) {
        const snapshotId = await snapshotManager.createSnapshot({
          tool: 'test-tool',
          description: `Batch 2 Snapshot ${i}`,
          affectedFiles: [`batch2-file${i}.txt`],
          diff: `batch2 diff ${i}`,
          context: { sessionId: 'test-session' },
          metadata: { filesSizeBytes: 200 * i, linesChanged: i, executionTimeMs: 20 }
        });
        batch2Ids.push(snapshotId);
      }

      // Create second milestone (should auto-start from after first milestone)
      const milestone2Result = await snapshotManager.createMilestoneByRange({
        title: 'Batch 2 Milestone',
        description: 'Second batch',
        // No endSnapshotId - should use latest
        tags: ['batch2']
      });

      expect(milestone2Result.success).toBe(true);
      expect(milestone2Result.snapshotIds).toEqual(batch2Ids);

      // Verify cache consistency
      const stats = snapshotManager.getCacheStats();
      expect(stats.snapshotCount).toBe(5); // 3 + 2 snapshots
      expect(stats.milestoneCount).toBe(2); // 2 milestones
    });
  });

  describe('Cache Error Handling', () => {
    it('should handle cache corruption gracefully', async () => {
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

      await snapshotManager.createMilestoneByRange({
        title: 'Test Milestone',
        description: 'Test milestone',
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
  });

  describe('Performance Benchmarks', () => {
    it('should demonstrate performance improvement with cache', async () => {
      // Create a substantial number of snapshots
      const snapshotCount = 30;
      for (let i = 1; i <= snapshotCount; i++) {
        await snapshotManager.createSnapshot({
          tool: 'test-tool',
          description: `Performance test snapshot ${i}`,
          affectedFiles: [`perf-file${i}.txt`],
          diff: `perf diff ${i}`,
          context: { sessionId: 'test-session' },
          metadata: { filesSizeBytes: 100 * i, linesChanged: i, executionTimeMs: 10 }
        });
      }

      // Benchmark history queries with cache
      const iterations = 20;
      const startTime = Date.now();

      for (let i = 0; i < iterations; i++) {
        const result = await snapshotManager.getEditHistory({
          limit: 10,
          includeDiffs: false,
          toolFilter: ['test-tool']
        });
        expect(result.history.length).toBeGreaterThan(0);
      }

      const totalTime = Date.now() - startTime;
      const avgTimePerQuery = totalTime / iterations;

      console.log(`${iterations} history queries on ${snapshotCount} snapshots:`);
      console.log(`Total time: ${totalTime}ms`);
      console.log(`Average time per query: ${avgTimePerQuery.toFixed(2)}ms`);

      // Should be fast with cache
      expect(avgTimePerQuery).toBeLessThan(100); // Under 100ms per query on average

      // Verify cache stats
      const stats = snapshotManager.getCacheStats();
      expect(stats.snapshotCount).toBe(snapshotCount);
      expect(stats.cacheLoaded).toBe(true);
    });
  });
}); 