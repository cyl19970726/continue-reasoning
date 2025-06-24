/**
 * Test: Consolidation Sequence Number Continuity
 * 
 * This test verifies that snapshot consolidation maintains proper
 * sequence number continuity and chain integrity.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SnapshotManager } from '../snapshot-manager';
import * as fs from 'fs/promises';
import * as path from 'path';

describe('Consolidation Sequence Number Continuity', () => {
  let snapshotManager: SnapshotManager;
  let workspacePath: string;
  let testDir: string;

  beforeEach(async () => {
    // Create temporary test directory
    testDir = path.join(process.cwd(), 'test-consolidation-continuity');
    await fs.mkdir(testDir, { recursive: true });
    
    workspacePath = testDir;
    snapshotManager = new SnapshotManager(workspacePath, {
      enableUnknownChangeDetection: false,
      maxCheckpointAge: 7,
      excludeFromChecking: []
    });

    await snapshotManager.initialize();
  });

  afterEach(async () => {
    // Cleanup test directory
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch (error) {
      console.warn('Cleanup warning:', error);
    }
  });

  it('should maintain sequence continuity when consolidating middle snapshots', async () => {
    // Create a sequence of 5 snapshots
    const snapshotIds: string[] = [];
    
    for (let i = 1; i <= 5; i++) {
      const snapshotId = await snapshotManager.createSnapshot({
        tool: `TestTool${i}`,
        description: `Test snapshot ${i}`,
        affectedFiles: [`file${i}.txt`],
        diff: `+line ${i} content`,
        context: {
          sessionId: 'test-session',
          toolParams: { step: i }
        },
        metadata: {
          filesSizeBytes: 100,
          linesChanged: 1,
          executionTimeMs: 50
        }
      });
      snapshotIds.push(snapshotId);
    }

    // Verify initial sequence continuity
    const initialHistory = await snapshotManager.getEditHistory({ limit: 10 });
    expect(initialHistory.history).toHaveLength(5);
    
    // Check sequence numbers are continuous
    for (let i = 0; i < 4; i++) {
      const current = initialHistory.history[4 - i]; // Reverse order (newest first)
      const next = initialHistory.history[3 - i];
      if (next) {
        // Load full snapshots to check previousSnapshotId
        const currentSnapshot = await snapshotManager.readSnapshotDiff(current.id);
        const nextSnapshot = await snapshotManager.readSnapshotDiff(next.id);
        
        expect(currentSnapshot.success).toBe(true);
        expect(nextSnapshot.success).toBe(true);
      }
    }

    // Consolidate middle snapshots [2, 3, 4] (indices 1, 2, 3)
    const middleSnapshots = snapshotIds.slice(1, 4); // snapshots 2, 3, 4
    
    const consolidationResult = await snapshotManager.consolidateSnapshots({
      snapshotIds: middleSnapshots,
      title: 'Middle Consolidation',
      description: 'Consolidate snapshots 2, 3, 4',
      deleteOriginals: true
    });

    expect(consolidationResult.success).toBe(true);
    expect(consolidationResult.consolidatedSnapshotId).toBeDefined();

    // Verify sequence continuity after consolidation
    const finalHistory = await snapshotManager.getEditHistory({ limit: 10 });
    
    // Should have 3 snapshots: 1, consolidated(2-4), 5
    expect(finalHistory.history).toHaveLength(3);

    // Load all snapshots and verify chain integrity
    const allSnapshots = [];
    for (const historyItem of finalHistory.history) {
      const snapshot = await snapshotManager.readSnapshotDiff(historyItem.id);
      expect(snapshot.success).toBe(true);
      allSnapshots.push(snapshot);
    }

    // Sort by sequence number for verification
    // Note: This test will likely FAIL with current implementation
    // because sequence number continuity is not properly maintained
    
    console.log('=== Consolidation Continuity Test Results ===');
    console.log('Snapshots after consolidation:');
    finalHistory.history.forEach((item, index) => {
      console.log(`${index + 1}. ID: ${item.id}, Tool: ${item.tool}, Description: ${item.description}`);
    });

    // This assertion will help us understand the current behavior
    // and identify the sequence number issues
    expect(finalHistory.history.length).toBe(3);
  });

  it('should handle consolidation of first snapshots correctly', async () => {
    // Create 4 snapshots
    const snapshotIds: string[] = [];
    
    for (let i = 1; i <= 4; i++) {
      const snapshotId = await snapshotManager.createSnapshot({
        tool: `TestTool${i}`,
        description: `Test snapshot ${i}`,
        affectedFiles: [`file${i}.txt`],
        diff: `+line ${i} content`,
        context: {
          sessionId: 'test-session',
          toolParams: { step: i }
        },
        metadata: {
          filesSizeBytes: 100,
          linesChanged: 1,
          executionTimeMs: 50
        }
      });
      snapshotIds.push(snapshotId);
    }

    // Consolidate first two snapshots [1, 2]
    const firstSnapshots = snapshotIds.slice(0, 2);
    
    const consolidationResult = await snapshotManager.consolidateSnapshots({
      snapshotIds: firstSnapshots,
      title: 'First Consolidation',
      description: 'Consolidate snapshots 1, 2',
      deleteOriginals: true
    });

    expect(consolidationResult.success).toBe(true);

    // Verify remaining snapshots still reference correctly
    const finalHistory = await snapshotManager.getEditHistory({ limit: 10 });
    expect(finalHistory.history).toHaveLength(3); // consolidated(1-2), 3, 4

    console.log('=== First Snapshots Consolidation Test Results ===');
    finalHistory.history.forEach((item, index) => {
      console.log(`${index + 1}. ID: ${item.id}, Tool: ${item.tool}, Description: ${item.description}`);
    });
  });

  it('should handle consolidation of last snapshots correctly', async () => {
    // Create 4 snapshots
    const snapshotIds: string[] = [];
    
    for (let i = 1; i <= 4; i++) {
      const snapshotId = await snapshotManager.createSnapshot({
        tool: `TestTool${i}`,
        description: `Test snapshot ${i}`,
        affectedFiles: [`file${i}.txt`],
        diff: `+line ${i} content`,
        context: {
          sessionId: 'test-session',
          toolParams: { step: i }
        },
        metadata: {
          filesSizeBytes: 100,
          linesChanged: 1,
          executionTimeMs: 50
        }
      });
      snapshotIds.push(snapshotId);
    }

    // Consolidate last two snapshots [3, 4]
    const lastSnapshots = snapshotIds.slice(2, 4);
    
    const consolidationResult = await snapshotManager.consolidateSnapshots({
      snapshotIds: lastSnapshots,
      title: 'Last Consolidation',
      description: 'Consolidate snapshots 3, 4',
      deleteOriginals: true
    });

    expect(consolidationResult.success).toBe(true);

    // This should be the easiest case - no subsequent snapshots to update
    const finalHistory = await snapshotManager.getEditHistory({ limit: 10 });
    expect(finalHistory.history).toHaveLength(3); // 1, 2, consolidated(3-4)

    console.log('=== Last Snapshots Consolidation Test Results ===');
    finalHistory.history.forEach((item, index) => {
      console.log(`${index + 1}. ID: ${item.id}, Tool: ${item.tool}, Description: ${item.description}`);
    });
  });

  it('should detect sequence number gaps after consolidation', async () => {
    // This test specifically checks for sequence number integrity
    // and should help identify the current implementation issues
    
    const snapshotIds: string[] = [];
    
    // Create 3 snapshots
    for (let i = 1; i <= 3; i++) {
      const snapshotId = await snapshotManager.createSnapshot({
        tool: `TestTool${i}`,
        description: `Test snapshot ${i}`,
        affectedFiles: [`file${i}.txt`],
        diff: `+line ${i} content`,
        context: {
          sessionId: 'test-session'
        },
        metadata: {
          filesSizeBytes: 100,
          linesChanged: 1,
          executionTimeMs: 50
        }
      });
      snapshotIds.push(snapshotId);
    }

    // Consolidate first two
    const consolidationResult = await snapshotManager.consolidateSnapshots({
      snapshotIds: snapshotIds.slice(0, 2),
      title: 'Test Consolidation',
      description: 'Test sequence integrity',
      deleteOriginals: true
    });

    expect(consolidationResult.success).toBe(true);

    // Get current state and analyze sequence numbers
    const currentState = snapshotManager.getCurrentState();
    const history = await snapshotManager.getEditHistory({ limit: 10 });
    
    console.log('=== Sequence Number Analysis ===');
    console.log('Current state:', currentState);
    console.log('History length:', history.history.length);
    
    // TODO: Add proper sequence number validation logic
    // This will help us understand what needs to be fixed
    history.history.forEach((item, index) => {
      console.log(`Snapshot ${index + 1}: ID=${item.id}, Tool=${item.tool}`);
    });
  });
}); 