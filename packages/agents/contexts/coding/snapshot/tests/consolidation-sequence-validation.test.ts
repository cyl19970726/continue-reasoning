/**
 * Test: Consolidation Sequence Validation (方案3)
 * 
 * 测试虚拟序列号方案的序列连续性和引用完整性
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SnapshotManager } from '../snapshot-manager';
import { ConsolidationManager } from '../core/consolidation-manager';
import * as fs from 'fs/promises';
import * as path from 'path';

describe('Consolidation Sequence Validation (方案3)', () => {
  let snapshotManager: SnapshotManager;
  let workspacePath: string;
  let testDir: string;

  beforeEach(async () => {
    // Create temporary test directory
    testDir = path.join(process.cwd(), 'test-sequence-validation');
    await fs.mkdir(testDir, { recursive: true });
    
    workspacePath = testDir;
    snapshotManager = new SnapshotManager(workspacePath, {
      enableUnknownChangeDetection: false
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

  it('should maintain sequence continuity with virtual sequence ranges', async () => {
    // 创建5个连续快照
    const snapshotIds: string[] = [];
    
    for (let i = 1; i <= 5; i++) {
      const snapshotId = await snapshotManager.createSnapshot({
        tool: `TestTool${i}`,
        description: `Test snapshot ${i}`,
        affectedFiles: [`file${i}.txt`],
        diff: `+line ${i} content\n`,
        context: {
          sessionId: 'test-session',
          toolParams: { step: i }
        },
        metadata: {
          filesSizeBytes: 20,
          linesChanged: 1,
          executionTimeMs: 50
        }
      });
      snapshotIds.push(snapshotId);
    }

    console.log('=== 初始快照序列 ===');
    const initialHistory = await snapshotManager.getEditHistory({ limit: 10 });
    initialHistory.history.reverse().forEach((item, index) => {
      console.log(`${index + 1}. ID: ${item.id.substring(0, 6)}, Tool: ${item.tool}`);
    });

    // 合并中间快照 [2, 3, 4]
    const middleSnapshots = snapshotIds.slice(1, 4);
    console.log(`\n=== 合并快照 ${middleSnapshots.map(id => id.substring(0, 6)).join(', ')} ===`);
    
    const consolidationResult = await snapshotManager.consolidateSnapshots({
      snapshotIds: middleSnapshots,
      title: 'Middle Consolidation',
      description: 'Test virtual sequence ranges',
      deleteOriginals: true
    });

    expect(consolidationResult.success).toBe(true);
    expect(consolidationResult.consolidatedSnapshotId).toBeDefined();

    console.log('Consolidation result:', consolidationResult.message);

    // 验证合并后的序列
    const finalHistory = await snapshotManager.getEditHistory({ limit: 10 });
    console.log('\n=== 合并后快照序列 ===');
    finalHistory.history.reverse().forEach((item, index) => {
      console.log(`${index + 1}. ID: ${item.id.substring(0, 6)}, Tool: ${item.tool}, Desc: ${item.description}`);
    });

    // 应该有3个快照：1, consolidated(2-4), 5
    expect(finalHistory.history).toHaveLength(3);

    // 验证合并快照的序列范围
    if (consolidationResult.consolidatedSnapshotId) {
      const consolidatedSnapshot = await snapshotManager.readSnapshotDiff(consolidationResult.consolidatedSnapshotId);
      expect(consolidatedSnapshot.success).toBe(true);
      
      // 加载完整快照数据来检查 sequenceRange
      const fullSnapshot = await snapshotManager['coreManager'].loadSnapshot(consolidationResult.consolidatedSnapshotId);
      expect(fullSnapshot).toBeTruthy();
      
      if (fullSnapshot && 'sequenceRange' in fullSnapshot) {
        console.log(`\n=== 合并快照序列范围 ===`);
        const consolidatedSnapshot = fullSnapshot as any; // Type assertion for consolidated snapshot
        console.log(`Sequence range: [${consolidatedSnapshot.sequenceRange[0]}, ${consolidatedSnapshot.sequenceRange[1]}]`);
        console.log(`Consolidated from: ${consolidatedSnapshot.consolidatedFrom.length} snapshots`);
        
        expect(consolidatedSnapshot.sequenceRange).toEqual([2, 4]);
        expect(consolidatedSnapshot.consolidatedFrom).toHaveLength(3);
      }
    }
  });

  it('should validate sequence continuity with consolidated snapshots', async () => {
    // 创建快照序列并合并
    const snapshotIds: string[] = [];
    
    for (let i = 1; i <= 4; i++) {
      const snapshotId = await snapshotManager.createSnapshot({
        tool: `TestTool${i}`,
        description: `Test snapshot ${i}`,
        affectedFiles: [`file${i}.txt`],
        diff: `+line ${i} content\n`,
        context: {
          sessionId: 'test-session'
        },
        metadata: {
          filesSizeBytes: 20,
          linesChanged: 1,
          executionTimeMs: 50
        }
      });
      snapshotIds.push(snapshotId);
    }

    // 合并前两个快照
    const consolidationResult = await snapshotManager.consolidateSnapshots({
      snapshotIds: snapshotIds.slice(0, 2),
      title: 'First Two Consolidation',
      description: 'Test sequence validation',
      deleteOriginals: true
    });

    expect(consolidationResult.success).toBe(true);

    // 使用新的验证方法检查序列连续性
    const consolidationManager = new ConsolidationManager(workspacePath, '');
    const allSnapshots = [];
    
    // 加载所有当前快照
    const history = await snapshotManager.getEditHistory({ limit: 10 });
    for (const item of history.history) {
      const snapshot = await snapshotManager['coreManager'].loadSnapshot(item.id);
      if (snapshot) {
        allSnapshots.push(snapshot);
      }
    }

    const validation = consolidationManager.validateSequenceContinuityWithConsolidation(allSnapshots);
    
    console.log('\n=== 序列连续性验证 ===');
    console.log(`Validation result: ${validation.isValid}`);
    if (validation.issues.length > 0) {
      console.log('Issues found:');
      validation.issues.forEach(issue => console.log(`  - ${issue}`));
    }

    // 方案3应该保持序列连续性
    expect(validation.isValid).toBe(true);
    expect(validation.issues).toHaveLength(0);
  });

  it('should handle consolidation at different positions', async () => {
    // 测试在不同位置进行合并的情况
    const testCases = [
      { name: '合并开头快照', range: [0, 2], expected: 'consolidated(1-2), 3, 4, 5' },
      { name: '合并结尾快照', range: [3, 5], expected: '1, 2, 3, consolidated(4-5)' },
      { name: '合并中间快照', range: [1, 3], expected: '1, consolidated(2-3), 4, 5' }
    ];

    for (const testCase of testCases) {
      console.log(`\n=== ${testCase.name} ===`);
      
      // 重新创建快照序列
      const snapshotIds: string[] = [];
      for (let i = 1; i <= 5; i++) {
        const snapshotId = await snapshotManager.createSnapshot({
          tool: `TestTool${i}`,
          description: `Test snapshot ${i}`,
          affectedFiles: [`file${i}.txt`],
          diff: `+line ${i} content\n`,
          context: {
            sessionId: `test-${testCase.name}`
          },
          metadata: {
            filesSizeBytes: 20,
            linesChanged: 1,
            executionTimeMs: 50
          }
        });
        snapshotIds.push(snapshotId);
      }

      // 执行合并
      const targetSnapshots = snapshotIds.slice(testCase.range[0], testCase.range[1]);
      const result = await snapshotManager.consolidateSnapshots({
        snapshotIds: targetSnapshots,
        title: testCase.name,
        description: testCase.expected,
        deleteOriginals: true
      });

      expect(result.success).toBe(true);
      console.log(`Result: ${result.message}`);

      // 验证结果
      const finalHistory = await snapshotManager.getEditHistory({ limit: 10 });
      const expectedCount = 5 - targetSnapshots.length + 1; // 原始数量 - 被合并数量 + 合并后数量
      expect(finalHistory.history).toHaveLength(expectedCount);

      // 清理快照目录以便下一个测试
      try {
        await fs.rm(path.join(testDir, '.continue-reasoning'), { recursive: true, force: true });
        // 重新初始化快照管理器
        snapshotManager = new SnapshotManager(testDir);
        await snapshotManager.initialize();
      } catch (error) {
        console.warn('Cleanup warning:', error);
      }
    }
  });
}); 