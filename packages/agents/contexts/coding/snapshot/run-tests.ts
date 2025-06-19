#!/usr/bin/env tsx

/**
 * Simple test runner to validate our production-level tests
 * This script manually runs key test scenarios to ensure they work correctly
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { SimpleSnapshotManager, SnapshotConfig } from './simple-snapshot-manager';

// Mock runtime for testing
class MockRuntime {
  async applyUnifiedDiff(diff: string, options?: any): Promise<{ success: boolean; message?: string; changesApplied?: number }> {
    return { success: true, changesApplied: 1 };
  }
  
  async calculateFileHash(filePath: string): Promise<string> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const crypto = await import('crypto');
      return crypto.createHash('sha256').update(content).digest('hex').substring(0, 8);
    } catch {
      return '';
    }
  }
}

async function runBasicSnapshotTest(): Promise<boolean> {
  console.log('🧪 Running basic snapshot test...');
  
  let testWorkspace: string | null = null;
  
  try {
    // Create test workspace
    testWorkspace = await fs.mkdtemp(path.join(os.tmpdir(), 'snapshot-test-'));
    
    const config: Partial<SnapshotConfig> = {
      enableUnknownChangeDetection: true,
      unknownChangeStrategy: 'warn',
      keepAllCheckpoints: false,
      maxCheckpointAge: 7,
      excludeFromChecking: ['*.log', '*.tmp', 'node_modules/**']
    };
    
    const snapshotManager = new SimpleSnapshotManager(testWorkspace, config);
    await snapshotManager.initialize();
    
    // Create a test file
    const fileName = 'test_file.py';
    const filePath = path.join(testWorkspace, fileName);
    const initialContent = `def hello_world():
    print("Hello, World!")
`;
    await fs.writeFile(filePath, initialContent);

    // Create first snapshot
    const snapshot1Id = await snapshotManager.createSnapshot({
      tool: 'ApplyWholeFileEdit',
      description: 'Create initial Python file',
      affectedFiles: [fileName],
      diff: `--- /dev/null
+++ b/${fileName}
@@ -0,0 +1,2 @@
+def hello_world():
+    print("Hello, World!")
`,
      context: { sessionId: 'test-session' },
      metadata: { filesSizeBytes: initialContent.length, linesChanged: 2, executionTimeMs: 10 }
    });

    console.log(`✅ Created snapshot: ${snapshot1Id}`);

    // Modify file externally (simulate the step-7 scenario)
    const modifiedContent = `def hello_world():
    print("Hello, World!")
    print("This line was added outside snapshot system!")
`;
    await fs.writeFile(filePath, modifiedContent);

    // Test unknown change detection
    const unknownChangeResult = await snapshotManager.detectUnknownModifications([fileName]);
    
    if (unknownChangeResult.hasUnknownChanges) {
      console.log(`✅ Detected ${unknownChangeResult.unknownChanges.length} unknown changes`);
      console.log(`✅ Change type: ${unknownChangeResult.unknownChanges[0].changeType}`);
      console.log(`✅ Affected file: ${unknownChangeResult.unknownChanges[0].filePath}`);
      
      if (unknownChangeResult.unknownChanges[0].diff?.includes('This line was added outside snapshot system!')) {
        console.log('✅ Diff contains expected content');
      } else {
        console.log('❌ Diff does not contain expected content');
        return false;
      }
    } else {
      console.log('❌ Failed to detect unknown changes');
      return false;
    }

    // Test checkpoint functionality
    const stats = snapshotManager.getCacheStats();
    console.log(`✅ Checkpoint info: hasLatest=${stats.checkpointInfo.hasLatestCheckpoint}, files=${stats.checkpointInfo.latestCheckpointFiles}`);

    return true;
  } catch (error) {
    console.error('❌ Test failed:', error);
    return false;
  } finally {
    // Cleanup
    if (testWorkspace) {
      try {
        await fs.rm(testWorkspace, { recursive: true, force: true });
        console.log('🧹 Cleaned up test workspace');
      } catch (error) {
        console.warn('⚠️  Failed to cleanup test workspace:', error);
      }
    }
  }
}

async function runAutoIntegrationTest(): Promise<boolean> {
  console.log('🧪 Running auto-integration test...');
  
  let testWorkspace: string | null = null;
  
  try {
    testWorkspace = await fs.mkdtemp(path.join(os.tmpdir(), 'snapshot-test-'));
    
    const config: Partial<SnapshotConfig> = {
      enableUnknownChangeDetection: true,
      unknownChangeStrategy: 'auto-integrate',
      keepAllCheckpoints: false,
      maxCheckpointAge: 7,
      excludeFromChecking: ['*.log', '*.tmp']
    };
    
    const snapshotManager = new SimpleSnapshotManager(testWorkspace, config);
    await snapshotManager.initialize();
    
    // Create initial file
    const fileName = 'complex_script.py';
    const filePath = path.join(testWorkspace, fileName);
    let content = `import requests

def fetch_data():
    url = 'https://api.example.com'
    return requests.get(url).text
`;

    await fs.writeFile(filePath, content);
    
    // First snapshot
    await snapshotManager.createSnapshot({
      tool: 'ApplyWholeFileEdit',
      description: 'Create initial script',
      affectedFiles: [fileName],
      diff: `--- /dev/null
+++ b/${fileName}
@@ -0,0 +1,5 @@
+import requests
+
+def fetch_data():
+    url = 'https://api.example.com'
+    return requests.get(url).text
`,
      context: { sessionId: 'test-session' },
      metadata: { filesSizeBytes: content.length, linesChanged: 5, executionTimeMs: 15 }
    });

    // Simulate external modification
    content += `
# Added by external tool
def parse_data(data):
    return data.upper()
`;
    await fs.writeFile(filePath, content);

    // Test validation with auto-integration
    const validation = await snapshotManager.validateFileStateBeforeSnapshot([fileName]);
    
    if (validation.success) {
      console.log('✅ Validation passed with auto-integration');
      
      if (validation.unknownChanges && validation.unknownChanges.length > 0) {
        console.log(`✅ Detected and will auto-integrate ${validation.unknownChanges.length} unknown changes`);
        
        // Handle the unknown changes explicitly
        const handleResult = await snapshotManager.handleUnknownChanges(
          validation.unknownChanges, 
          'auto-integrate'
        );
        
        if (!handleResult.success) {
          console.log(`❌ Failed to handle unknown changes: ${handleResult.message}`);
          return false;
        }
        
        console.log(`✅ Successfully handled unknown changes: ${handleResult.message}`);
      }
      
      // Now try to create another snapshot (should work after integration)
      const newContent = await fs.readFile(filePath, 'utf-8');
      const snapshot2Id = await snapshotManager.createSnapshot({
        tool: 'ApplyEditBlock',
        description: 'Add error handling',
        affectedFiles: [fileName],
        diff: `@@ -7,3 +7,5 @@
     url = 'https://api.example.com'
+    if not url:
+        raise ValueError("URL cannot be empty")
     return requests.get(url).text
`,
        context: { sessionId: 'test-session' },
        metadata: { filesSizeBytes: newContent.length + 50, linesChanged: 2, executionTimeMs: 8 }
      });
      
      console.log(`✅ Created second snapshot with auto-integration: ${snapshot2Id}`);
      return true;
    } else {
      console.log('❌ Validation failed');
      return false;
    }
  } catch (error) {
    console.error('❌ Auto-integration test failed:', error);
    return false;
  } finally {
    if (testWorkspace) {
      try {
        await fs.rm(testWorkspace, { recursive: true, force: true });
        console.log('🧹 Cleaned up test workspace');
      } catch (error) {
        console.warn('⚠️  Failed to cleanup test workspace:', error);
      }
    }
  }
}

async function runCheckpointTest(): Promise<boolean> {
  console.log('🧪 Running checkpoint system test...');
  
  let testWorkspace: string | null = null;
  
  try {
    testWorkspace = await fs.mkdtemp(path.join(os.tmpdir(), 'snapshot-test-'));
    
    const snapshotManager = new SimpleSnapshotManager(testWorkspace, {
      enableUnknownChangeDetection: true,
      unknownChangeStrategy: 'warn',
      keepAllCheckpoints: true
    });
    await snapshotManager.initialize();
    
    // Create file and snapshots
    const fileName = 'evolving_code.py';
    const filePath = path.join(testWorkspace, fileName);
    let content = `class Calculator:
    def add(self, a, b):
        return a + b
`;

    await fs.writeFile(filePath, content);

    const snapshotIds: string[] = [];
    
    // Create initial snapshot first
    const initialSnapshotId = await snapshotManager.createSnapshot({
      tool: 'ApplyWholeFileEdit',
      description: 'Create Calculator class',
      affectedFiles: [fileName],
      diff: `--- /dev/null
+++ b/${fileName}
@@ -0,0 +1,3 @@
+class Calculator:
+    def add(self, a, b):
+        return a + b
`,
      context: { sessionId: 'test-session' },
      metadata: { filesSizeBytes: content.length, linesChanged: 3, executionTimeMs: 5 }
    });
    
    snapshotIds.push(initialSnapshotId);

    for (let i = 0; i < 3; i++) {
      const newMethod = `
    def operation_${i}(self, x):
        return x * ${i + 1}`;
      content += newMethod;
      await fs.writeFile(filePath, content);

      const snapshotId = await snapshotManager.createSnapshot({
        tool: 'ApplyEditBlock',
        description: `Add operation_${i} method`,
        affectedFiles: [fileName],
        diff: `@@ -${2 + i * 2},0 +${2 + i * 2},2 @@
+    def operation_${i}(self, x):
+        return x * ${i + 1}`,
        context: { sessionId: 'test-session' },
        metadata: { filesSizeBytes: content.length, linesChanged: 2, executionTimeMs: 5 }
      });
      
      snapshotIds.push(snapshotId);
      
      // Verify checkpoint
      const stats = snapshotManager.getCacheStats();
      if (!stats.checkpointInfo.hasLatestCheckpoint) {
        console.log('❌ No checkpoint created');
        return false;
      }
    }

    console.log(`✅ Created ${snapshotIds.length} snapshots with checkpoints`);

    // Verify snapshots are accessible
    for (const snapshotId of snapshotIds) {
      const snapshot = await snapshotManager.readSnapshotDiff(snapshotId);
      if (!snapshot.success || snapshot.snapshot?.id !== snapshotId) {
        console.log(`❌ Failed to read snapshot ${snapshotId}`);
        return false;
      }
    }

    console.log('✅ All snapshots are accessible');
    return true;
  } catch (error) {
    console.error('❌ Checkpoint test failed:', error);
    return false;
  } finally {
    if (testWorkspace) {
      try {
        await fs.rm(testWorkspace, { recursive: true, force: true });
        console.log('🧹 Cleaned up test workspace');
      } catch (error) {
        console.warn('⚠️  Failed to cleanup test workspace:', error);
      }
    }
  }
}

async function main() {
  console.log('🚀 Starting Production-Level Snapshot Manager Tests');
  console.log('=' .repeat(60));
  
  const tests = [
    { name: 'Basic Snapshot & Unknown Change Detection', fn: runBasicSnapshotTest },
    { name: 'Auto-Integration Strategy', fn: runAutoIntegrationTest },
    { name: 'Checkpoint System', fn: runCheckpointTest }
  ];
  
  let passed = 0;
  let failed = 0;
  
  for (const test of tests) {
    console.log(`\n📋 Running: ${test.name}`);
    console.log('-'.repeat(40));
    
    const result = await test.fn();
    
    if (result) {
      console.log(`✅ PASSED: ${test.name}`);
      passed++;
    } else {
      console.log(`❌ FAILED: ${test.name}`);
      failed++;
    }
  }
  
  console.log('\n' + '='.repeat(60));
  console.log(`📊 Test Results: ${passed} passed, ${failed} failed`);
  
  if (failed === 0) {
    console.log('🎉 All tests passed! The snapshot manager is working correctly.');
    process.exit(0);
  } else {
    console.log('💥 Some tests failed. Please check the implementation.');
    process.exit(1);
  }
}

// Run if this file is executed directly
if (require.main === module) {
  main().catch(error => {
    console.error('💥 Test runner failed:', error);
    process.exit(1);
  });
}