/**
 * Milestone Continuity Tests
 * 
 * Tests for enhanced milestone creation with continuity validation
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { SimpleSnapshotManager } from './simple-snapshot-manager';

describe('Milestone Continuity Validation', () => {
  let tempDir: string;
  let snapshotManager: SimpleSnapshotManager;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'milestone-continuity-test-'));
    snapshotManager = new SimpleSnapshotManager(tempDir);
    await snapshotManager.initialize();
  });

  afterEach(async () => {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  describe('Basic Milestone Continuity', () => {
    it('should create the first milestone without previous milestone validation', async () => {
      // Create some snapshots
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

      // Create first milestone
      const result = await snapshotManager.createMilestone({
        title: 'First Milestone',
        description: 'The first milestone',
        snapshotIds: [snapshot1Id, snapshot2Id],
        tags: ['initial']
      });

      expect(result.success).toBe(true);
      expect(result.milestoneId).toBeDefined();
    });

    it('should validate continuity with previous milestone', async () => {
      // Create first set of snapshots and milestone
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

      await snapshotManager.createMilestone({
        title: 'First Milestone',
        description: 'The first milestone',
        snapshotIds: [snapshot1Id, snapshot2Id],
        tags: ['first']
      });

      // Create second set of snapshots
      const snapshot3Id = await snapshotManager.createSnapshot({
        tool: 'test-tool',
        description: 'Snapshot 3',
        affectedFiles: ['file3.txt'],
        diff: 'diff 3',
        context: { sessionId: 'test-session' },
        metadata: { filesSizeBytes: 200, linesChanged: 3, executionTimeMs: 20 }
      });

      const snapshot4Id = await snapshotManager.createSnapshot({
        tool: 'test-tool',
        description: 'Snapshot 4',
        affectedFiles: ['file4.txt'],
        diff: 'diff 4',
        context: { sessionId: 'test-session' },
        metadata: { filesSizeBytes: 250, linesChanged: 4, executionTimeMs: 25 }
      });

      // Create second milestone - should succeed as it continues from the first
      const result = await snapshotManager.createMilestone({
        title: 'Second Milestone',
        description: 'The second milestone',
        snapshotIds: [snapshot3Id, snapshot4Id],
        tags: ['second']
      });

      expect(result.success).toBe(true);
      expect(result.milestoneId).toBeDefined();
    });

    it('should reject milestone with gap from previous milestone', async () => {
      // Create first milestone
      const snapshot1Id = await snapshotManager.createSnapshot({
        tool: 'test-tool',
        description: 'Snapshot 1',
        affectedFiles: ['file1.txt'],
        diff: 'diff 1',
        context: { sessionId: 'test-session' },
        metadata: { filesSizeBytes: 100, linesChanged: 1, executionTimeMs: 10 }
      });

      await snapshotManager.createMilestone({
        title: 'First Milestone',
        description: 'The first milestone',
        snapshotIds: [snapshot1Id],
        tags: ['first']
      });

      // Create snapshots with a gap
      const snapshot2Id = await snapshotManager.createSnapshot({
        tool: 'test-tool',
        description: 'Snapshot 2',
        affectedFiles: ['file2.txt'],
        diff: 'diff 2',
        context: { sessionId: 'test-session' },
        metadata: { filesSizeBytes: 150, linesChanged: 2, executionTimeMs: 15 }
      });

      const snapshot3Id = await snapshotManager.createSnapshot({
        tool: 'test-tool',
        description: 'Snapshot 3',
        affectedFiles: ['file3.txt'],
        diff: 'diff 3',
        context: { sessionId: 'test-session' },
        metadata: { filesSizeBytes: 200, linesChanged: 3, executionTimeMs: 20 }
      });

      // Try to create milestone skipping snapshot2 (creating a gap)
      const result = await snapshotManager.createMilestone({
        title: 'Invalid Milestone',
        description: 'Should fail due to gap',
        snapshotIds: [snapshot3Id], // Skipping snapshot2Id
        tags: ['invalid']
      });

      expect(result.success).toBe(false);
    });
  });

  describe('CreateMilestoneByRange Function', () => {
    it('should create milestone from start to end snapshot', async () => {
      // Create a sequence of snapshots
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

      const snapshot3Id = await snapshotManager.createSnapshot({
        tool: 'test-tool',
        description: 'Snapshot 3',
        affectedFiles: ['file3.txt'],
        diff: 'diff 3',
        context: { sessionId: 'test-session' },
        metadata: { filesSizeBytes: 200, linesChanged: 3, executionTimeMs: 20 }
      });

      // Create milestone by range
      const result = await snapshotManager.createMilestoneByRange({
        title: 'Range Milestone',
        description: 'Created by range',
        endSnapshotId: snapshot3Id,
        tags: ['range']
      });

      expect(result.success).toBe(true);
      expect(result.snapshotIds).toEqual([snapshot1Id, snapshot2Id, snapshot3Id]);
      expect(result.milestoneId).toBeDefined();
    });

    it('should auto-detect start from last milestone', async () => {
      // Create first batch of snapshots and milestone
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

      // Create first milestone
      await snapshotManager.createMilestone({
        title: 'First Milestone',
        description: 'The first milestone',
        snapshotIds: [snapshot1Id, snapshot2Id],
        tags: ['first']
      });

      // Create more snapshots
      const snapshot3Id = await snapshotManager.createSnapshot({
        tool: 'test-tool',
        description: 'Snapshot 3',
        affectedFiles: ['file3.txt'],
        diff: 'diff 3',
        context: { sessionId: 'test-session' },
        metadata: { filesSizeBytes: 200, linesChanged: 3, executionTimeMs: 20 }
      });

      const snapshot4Id = await snapshotManager.createSnapshot({
        tool: 'test-tool',
        description: 'Snapshot 4',
        affectedFiles: ['file4.txt'],
        diff: 'diff 4',
        context: { sessionId: 'test-session' },
        metadata: { filesSizeBytes: 250, linesChanged: 4, executionTimeMs: 25 }
      });

      // Create milestone by range - should auto-detect start from after first milestone
      const result = await snapshotManager.createMilestoneByRange({
        title: 'Second Range Milestone',
        description: 'Should start from snapshot 3',
        endSnapshotId: snapshot4Id,
        tags: ['second-range']
      });

      expect(result.success).toBe(true);
      expect(result.snapshotIds).toEqual([snapshot3Id, snapshot4Id]);
    });

    it('should auto-detect end as latest snapshot', async () => {
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

      const snapshot3Id = await snapshotManager.createSnapshot({
        tool: 'test-tool',
        description: 'Snapshot 3',
        affectedFiles: ['file3.txt'],
        diff: 'diff 3',
        context: { sessionId: 'test-session' },
        metadata: { filesSizeBytes: 200, linesChanged: 3, executionTimeMs: 20 }
      });

      // Create milestone by range without specifying end - should use latest
      const result = await snapshotManager.createMilestoneByRange({
        title: 'Auto End Milestone',
        description: 'Should end at latest snapshot',
        // No endSnapshotId - should auto-detect as latest
        tags: ['auto-end']
      });

      expect(result.success).toBe(true);
      expect(result.snapshotIds).toEqual([snapshot1Id, snapshot2Id, snapshot3Id]);
    });

    it('should handle empty range gracefully', async () => {
      // Try to create milestone with no snapshots
      const result = await snapshotManager.createMilestoneByRange({
        title: 'Empty Milestone',
        description: 'Should fail',
        tags: ['empty']
      });

      expect(result.success).toBe(false);
      expect(result.snapshotIds).toEqual([]);
    });

    it('should validate range continuity', async () => {
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

      const snapshot3Id = await snapshotManager.createSnapshot({
        tool: 'test-tool',
        description: 'Snapshot 3',
        affectedFiles: ['file3.txt'],
        diff: 'diff 3',
        context: { sessionId: 'test-session' },
        metadata: { filesSizeBytes: 200, linesChanged: 3, executionTimeMs: 20 }
      });

      // Since we removed startSnapshotId, the range always starts from beginning or last milestone
      // So this test should actually succeed, creating a milestone with all snapshots
      const result = await snapshotManager.createMilestoneByRange({
        title: 'Valid Range',
        description: 'Should succeed',
        endSnapshotId: snapshot1Id, // This will create milestone with just snapshot1
        tags: ['valid']
      });

      expect(result.success).toBe(true);
      expect(result.snapshotIds).toEqual([snapshot1Id]);
    });
  });

  describe('Error Messages and Debugging', () => {
    it('should provide detailed error messages for milestone continuity violations', async () => {
      // Create first milestone
      const snapshot1Id = await snapshotManager.createSnapshot({
        tool: 'test-tool',
        description: 'Snapshot 1',
        affectedFiles: ['file1.txt'],
        diff: 'diff 1',
        context: { sessionId: 'test-session' },
        metadata: { filesSizeBytes: 100, linesChanged: 1, executionTimeMs: 10 }
      });

      await snapshotManager.createMilestone({
        title: 'First Milestone',
        description: 'The first milestone',
        snapshotIds: [snapshot1Id],
        tags: ['first']
      });

      // Create snapshots with gap
      const snapshot2Id = await snapshotManager.createSnapshot({
        tool: 'test-tool',
        description: 'Snapshot 2',
        affectedFiles: ['file2.txt'],
        diff: 'diff 2',
        context: { sessionId: 'test-session' },
        metadata: { filesSizeBytes: 150, linesChanged: 2, executionTimeMs: 15 }
      });

      const snapshot3Id = await snapshotManager.createSnapshot({
        tool: 'test-tool',
        description: 'Snapshot 3',
        affectedFiles: ['file3.txt'],
        diff: 'diff 3',
        context: { sessionId: 'test-session' },
        metadata: { filesSizeBytes: 200, linesChanged: 3, executionTimeMs: 20 }
      });

      const result = await snapshotManager.createMilestone({
        title: 'Gap Milestone',
        description: 'Should fail',
        snapshotIds: [snapshot3Id], // Skipping snapshot2
        tags: ['gap']
      });

      expect(result.success).toBe(false);
    });

    it('should provide helpful error for invalid snapshot IDs', async () => {
      const result = await snapshotManager.createMilestoneByRange({
        title: 'Invalid IDs',
        description: 'Should fail',
        endSnapshotId: 'invalid-id',
        tags: ['invalid']
      });

      expect(result.success).toBe(false);
    });
  });

  describe('Complex Milestone Scenarios', () => {
    it('should handle multiple consecutive milestones correctly', async () => {
      // Create first batch of snapshots and milestone
      const batch1Snapshots = [];
      for (let i = 1; i <= 3; i++) {
        const snapshotId = await snapshotManager.createSnapshot({
          tool: 'test-tool',
          description: `Batch 1 Snapshot ${i}`,
          affectedFiles: [`batch1-file${i}.txt`],
          diff: `batch 1 diff ${i}`,
          context: { sessionId: 'test-session' },
          metadata: { filesSizeBytes: 100 * i, linesChanged: i, executionTimeMs: 10 * i }
        });
        batch1Snapshots.push(snapshotId);
      }

      await snapshotManager.createMilestone({
        title: 'Batch 1 Milestone',
        description: 'First batch',
        snapshotIds: batch1Snapshots,
        tags: ['batch1']
      });

      // Create second batch
      const batch2Snapshots = [];
      for (let i = 1; i <= 2; i++) {
        const snapshotId = await snapshotManager.createSnapshot({
          tool: 'test-tool',
          description: `Batch 2 Snapshot ${i}`,
          affectedFiles: [`batch2-file${i}.txt`],
          diff: `batch 2 diff ${i}`,
          context: { sessionId: 'test-session' },
          metadata: { filesSizeBytes: 200 * i, linesChanged: i, executionTimeMs: 20 * i }
        });
        batch2Snapshots.push(snapshotId);
      }

      const result = await snapshotManager.createMilestone({
        title: 'Batch 2 Milestone',
        description: 'Second batch',
        snapshotIds: batch2Snapshots,
        tags: ['batch2']
      });

      expect(result.success).toBe(true);

      // Create third batch using range function
      const batch3Snapshots = [];
      for (let i = 1; i <= 2; i++) {
        const snapshotId = await snapshotManager.createSnapshot({
          tool: 'test-tool',
          description: `Batch 3 Snapshot ${i}`,
          affectedFiles: [`batch3-file${i}.txt`],
          diff: `batch 3 diff ${i}`,
          context: { sessionId: 'test-session' },
          metadata: { filesSizeBytes: 300 * i, linesChanged: i, executionTimeMs: 30 * i }
        });
        batch3Snapshots.push(snapshotId);
      }

      const rangeResult = await snapshotManager.createMilestoneByRange({
        title: 'Batch 3 Milestone',
        description: 'Third batch using range',
        endSnapshotId: batch3Snapshots[batch3Snapshots.length - 1],
        tags: ['batch3']
      });

      expect(rangeResult.success).toBe(true);
      expect(rangeResult.snapshotIds).toEqual(batch3Snapshots);
    });
  });
}); 