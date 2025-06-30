import { SnapshotManager } from '../packages/agents/contexts/coding/snapshot/snapshot-manager';
import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * 测试修复后的checkpoint功能
 */
async function testCheckpointFix() {
  console.log('🧪 Testing Fixed Checkpoint Functionality\n');
  
  // 创建临时测试目录
  const testDir = path.join(process.cwd(), 'test-checkpoint-workspace');
  
  try {
    // 清理并创建测试目录
    await fs.rm(testDir, { recursive: true, force: true });
    await fs.mkdir(testDir, { recursive: true });
    
    // 创建一些测试文件
    await fs.writeFile(path.join(testDir, 'test1.txt'), 'Hello World');
    await fs.writeFile(path.join(testDir, 'test2.js'), 'console.log("test");');
    await fs.mkdir(path.join(testDir, 'subdir'), { recursive: true });
    await fs.writeFile(path.join(testDir, 'subdir', 'nested.md'), '# Test');
    
    console.log('📁 Created test workspace with files');
    
    // 创建SnapshotManager实例
    const snapshotManager = new SnapshotManager(testDir, {
      enableUnknownChangeDetection: true,
      unknownChangeStrategy: 'warn',
      keepAllCheckpoints: false,
      maxCheckpointAge: 7,
      excludeFromChecking: ['*.log', '*.tmp']
    });
    
    console.log('🔧 Initializing SnapshotManager...');
    
    // 初始化 - 应该创建初始checkpoint
    await snapshotManager.initialize();
    
    console.log('✅ SnapshotManager initialized');
    
    // 检查checkpoint信息
    const stats = snapshotManager.getCacheStats();
    console.log('📊 Cache Stats:', {
      checkpointInfo: stats.checkpointInfo,
      isInitialized: stats.config
    });
    
    // 测试创建snapshot（不应该有unknown changes）
    console.log('\n📸 Creating test snapshot...');
    
    // 修改一个文件
    await fs.writeFile(path.join(testDir, 'test1.txt'), 'Hello World Updated');
    
    const snapshotId = await snapshotManager.createSnapshot({
      tool: 'TestTool',
      description: 'Test snapshot creation',
      affectedFiles: ['test1.txt'],
      diff: '--- a/test1.txt\n+++ b/test1.txt\n@@ -1 +1 @@\n-Hello World\n+Hello World Updated',
      context: {
        sessionId: 'test-session',
        toolParams: {}
      },
      metadata: {
        filesSizeBytes: 100,
        linesChanged: 1,
        executionTimeMs: 50
      }
    });
    
    console.log(`✅ Created snapshot: ${snapshotId}`);
    
    // 获取编辑历史
    const history = await snapshotManager.getEditHistory({ limit: 10 });
    console.log(`📚 Edit history: ${history.history.length} items`);
    
    // 显示状态
    const currentState = snapshotManager.getCurrentState();
    console.log('🎯 Current State:', {
      sequenceNumber: currentState.sequenceNumber,
      lastSnapshotId: currentState.lastSnapshotId,
      isInitialized: currentState.isInitialized,
      fileHashCount: Object.keys(currentState.currentFileHashes).length
    });
    
    console.log('\n🎉 Checkpoint fix test completed successfully!');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    // 清理测试目录
    try {
      await fs.rm(testDir, { recursive: true, force: true });
      console.log('🧹 Cleaned up test workspace');
    } catch (error) {
      console.warn('⚠️ Failed to clean up test workspace:', error);
    }
  }
}

// 运行测试
if (require.main === module) {
  testCheckpointFix().catch(console.error);
}

export { testCheckpointFix }; 