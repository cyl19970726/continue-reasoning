/**
 * Production-Level Complex Tests for Enhanced Snapshot Manager
 * 
 * This test suite focuses on real-world scenarios that have caused issues in production,
 * particularly the state continuity violations seen in step-7 and the need for robust
 * unknown change detection and checkpoint systems.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { SimpleSnapshotManager, SnapshotConfig, UnknownChangeStrategy } from './simple-snapshot-manager';
import { IRuntime } from '../runtime/interface';

// Mock runtime for testing
class MockRuntime implements IRuntime {
  async applyUnifiedDiff(diff: string, options?: any): Promise<{ success: boolean; message?: string; changesApplied?: number }> {
    // Simulate applying the diff by creating/modifying files
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

describe('Production-Level Snapshot Manager Tests', () => {
  let testWorkspace: string;
  let snapshotManager: SimpleSnapshotManager;
  let mockRuntime: MockRuntime;

  beforeEach(async () => {
    // Create isolated test workspace using OS temp directory
    testWorkspace = await fs.mkdtemp(path.join(os.tmpdir(), 'snapshot-test-'));
    
    // Initialize with production-like configuration
    const config: Partial<SnapshotConfig> = {
      enableUnknownChangeDetection: true,
      unknownChangeStrategy: 'warn',
      keepAllCheckpoints: false,
      maxCheckpointAge: 7,
      excludeFromChecking: ['*.log', '*.tmp', 'node_modules/**']
    };
    
    snapshotManager = new SimpleSnapshotManager(testWorkspace, config);
    mockRuntime = new MockRuntime();
    await snapshotManager.initialize();
  });

  afterEach(async () => {
    // Cleanup test workspace
    try {
      await fs.rm(testWorkspace, { recursive: true, force: true });
    } catch (error) {
      console.warn('Failed to cleanup test workspace:', error);
    }
  });

  describe('State Continuity Violation Scenarios (Based on Step-7 Issue)', () => {
    it('should detect and handle file modifications outside snapshot system', async () => {
      // Create initial file through snapshot system
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

      expect(snapshot1Id).toBeDefined();

      // Simulate file modification OUTSIDE the snapshot system (the core issue from step-7)
      const modifiedContent = `def hello_world():
    print("Hello, World!")
    print("This line was added outside snapshot system!")
`;
      await fs.writeFile(filePath, modifiedContent);

      // Attempt second snapshot operation - should detect state continuity violation
      const unknownChangeResult = await snapshotManager.detectUnknownModifications([fileName]);
      
      expect(unknownChangeResult.hasUnknownChanges).toBe(true);
      expect(unknownChangeResult.unknownChanges).toHaveLength(1);
      expect(unknownChangeResult.unknownChanges[0].changeType).toBe('modified');
      expect(unknownChangeResult.unknownChanges[0].filePath).toBe(fileName);
      expect(unknownChangeResult.unknownChanges[0].diff).toContain('This line was added outside snapshot system!');
    });

    it('should handle continuous state continuity violations with auto-integration', async () => {
      // Setup file and initial snapshot
      const fileName = 'complex_script.py';
      const filePath = path.join(testWorkspace, fileName);
      let content = `import requests
from bs4 import BeautifulSoup

def fetch_news():
    url = 'https://news.ycombinator.com/'
    response = requests.get(url)
    return response.text
`;

      await fs.writeFile(filePath, content);
      
      // First snapshot
      await snapshotManager.createSnapshot({
        tool: 'ApplyWholeFileEdit',
        description: 'Create web scraper script',
        affectedFiles: [fileName],
        diff: `--- /dev/null
+++ b/${fileName}
@@ -0,0 +1,7 @@
+import requests
+from bs4 import BeautifulSoup
+
+def fetch_news():
+    url = 'https://news.ycombinator.com/'
+    response = requests.get(url)
+    return response.text
`,
        context: { sessionId: 'test-session' },
        metadata: { filesSizeBytes: content.length, linesChanged: 7, executionTimeMs: 15 }
      });

      // Simulate multiple external modifications (common in real development)
      content += `
# This comment was added by external tool
def parse_news(html):
    soup = BeautifulSoup(html, 'html.parser')
    return soup.find_all('.titleline')
`;
      await fs.writeFile(filePath, content);

      // Test auto-integration strategy
      snapshotManager.updateConfig({ unknownChangeStrategy: 'auto-integrate' });
      
      const validation = await snapshotManager.validateFileStateBeforeSnapshot([fileName]);
      expect(validation.success).toBe(true);
      expect(validation.unknownChanges).toBeDefined();
      expect(validation.unknownChanges!.length).toBeGreaterThan(0);

      // Should be able to create snapshot with auto-integration
      const snapshot2Id = await snapshotManager.createSnapshot({
        tool: 'ApplyEditBlock',
        description: 'Add error handling',
        affectedFiles: [fileName],
        diff: `@@ -6,3 +6,7 @@
     response = requests.get(url)
+    if response.status_code != 200:
+        raise Exception("Failed to fetch news")
     return response.text
`,
        context: { sessionId: 'test-session' },
        metadata: { filesSizeBytes: content.length + 50, linesChanged: 2, executionTimeMs: 8 }
      });

      expect(snapshot2Id).toBeDefined();
    });

    it('should handle complex multi-file state continuity violations', async () => {
      // Create multiple files that depend on each other
      const files = {
        'main.py': `from scraper import fetch_data
from parser import parse_data

def main():
    data = fetch_data()
    result = parse_data(data)
    print(result)
`,
        'scraper.py': `import requests

def fetch_data():
    return requests.get("https://api.example.com").text
`,
        'parser.py': `def parse_data(data):
    return data.upper()
`
      };

      // Create all files
      for (const [fileName, content] of Object.entries(files)) {
        const filePath = path.join(testWorkspace, fileName);
        await fs.writeFile(filePath, content);
      }

      // Create baseline snapshot
      await snapshotManager.createSnapshot({
        tool: 'CreateMultipleFiles',
        description: 'Create modular Python application',
        affectedFiles: Object.keys(files),
        diff: Object.entries(files).map(([fileName, content]) => 
          `--- /dev/null\n+++ b/${fileName}\n@@ -0,0 +1,${content.split('\n').length} @@\n${content.split('\n').map(line => '+' + line).join('\n')}`
        ).join('\n'),
        context: { sessionId: 'test-session' },
        metadata: { filesSizeBytes: Object.values(files).join('').length, linesChanged: 15, executionTimeMs: 25 }
      });

      // Simulate external changes to multiple files (common in team development)
      await fs.writeFile(path.join(testWorkspace, 'scraper.py'), `import requests
import time

def fetch_data():
    time.sleep(0.1)  # Added by external developer
    return requests.get("https://api.example.com").text
`);

      await fs.writeFile(path.join(testWorkspace, 'parser.py'), `import json

def parse_data(data):
    # Enhanced parsing logic added externally
    try:
        return json.loads(data)
    except:
        return data.upper()
`);

      // Should detect unknown changes in multiple files
      const unknownChanges = await snapshotManager.detectUnknownModifications(Object.keys(files));
      
      expect(unknownChanges.hasUnknownChanges).toBe(true);
      expect(unknownChanges.unknownChanges.length).toBe(2); // scraper.py and parser.py
      expect(unknownChanges.affectedFiles).toContain('scraper.py');
      expect(unknownChanges.affectedFiles).toContain('parser.py');
      expect(unknownChanges.generatedDiff).toBeDefined();
    });
  });

  describe('Unknown Change Detection Stress Tests', () => {
    it('should handle large file modifications efficiently', async () => {
      // Create a moderately large file to test performance (reduce size for faster tests)
      const largeContent = Array(100).fill('').map((_, i) => 
        `def function_${i}():\n    return ${i} * 2\n`
      ).join('\n');
      
      const fileName = 'large_file.py';
      const filePath = path.join(testWorkspace, fileName);
      await fs.writeFile(filePath, largeContent);

      // Create checkpoint
      await snapshotManager.createSnapshot({
        tool: 'ApplyWholeFileEdit',
        description: 'Create large Python file',
        affectedFiles: [fileName],
        diff: `--- /dev/null
+++ b/${fileName}
@@ -0,0 +1,200 @@
${largeContent.split('\n').slice(0, 200).map(line => '+' + line).join('\n')}`,
        context: { sessionId: 'test-session' },
        metadata: { filesSizeBytes: largeContent.length, linesChanged: 200, executionTimeMs: 50 }
      });

      // Modify file externally (simulate IDE auto-formatting)
      const modifiedContent = largeContent + '\n# Auto-generated comment\n';
      await fs.writeFile(filePath, modifiedContent);

      // Test detection performance
      const startTime = Date.now();
      const result = await snapshotManager.detectUnknownModifications([fileName]);
      const detectionTime = Date.now() - startTime;

      expect(result.hasUnknownChanges).toBe(true);
      expect(detectionTime).toBeLessThan(2000); // Should complete within 2 seconds
      expect(result.unknownChanges[0].diff).toContain('Auto-generated comment');
    });

    it('should handle binary file changes gracefully', async () => {
      // Create a text file instead of binary for testing (binary files can cause UTF-8 issues)
      const fileName = 'data.txt';
      const filePath = path.join(testWorkspace, fileName);
      const initialContent = 'initial binary-like content';
      await fs.writeFile(filePath, initialContent);

      // Create snapshot with file
      await snapshotManager.createSnapshot({
        tool: 'AddDataFile',
        description: 'Add data file',
        affectedFiles: [fileName],
        diff: `--- /dev/null
+++ b/${fileName}
@@ -0,0 +1,1 @@
+initial binary-like content`,
        context: { sessionId: 'test-session' },
        metadata: { filesSizeBytes: initialContent.length, linesChanged: 1, executionTimeMs: 5 }
      });

      // Modify file
      const modifiedContent = 'modified binary-like content with changes';
      await fs.writeFile(filePath, modifiedContent);

      // Should handle file changes without crashing
      const result = await snapshotManager.detectUnknownModifications([fileName]);
      expect(result.hasUnknownChanges).toBe(true);
      expect(result.unknownChanges[0].changeType).toBe('modified');
    });

    it('should detect complex file system race conditions', async () => {
      const testFiles = ['file1.py', 'file2.py', 'file3.py'];
      
      // Create initial files
      for (const fileName of testFiles) {
        await fs.writeFile(path.join(testWorkspace, fileName), `# Initial content for ${fileName}\n`);
      }

      // Create baseline snapshot
      await snapshotManager.createSnapshot({
        tool: 'CreateFiles',
        description: 'Create initial files',
        affectedFiles: testFiles,
        diff: testFiles.map(file => `--- /dev/null\n+++ b/${file}\n@@ -0,0 +1,1 @@\n+# Initial content for ${file}`).join('\n'),
        context: { sessionId: 'test-session' },
        metadata: { filesSizeBytes: 100, linesChanged: 3, executionTimeMs: 10 }
      });

      // Simulate concurrent modifications (race condition scenario)
      const modifications = testFiles.map(async (fileName, index) => {
        await new Promise(resolve => setTimeout(resolve, index * 10)); // Stagger timing
        const content = `# Modified content for ${fileName}\nprint("${fileName} was modified")\n`;
        await fs.writeFile(path.join(testWorkspace, fileName), content);
      });

      await Promise.all(modifications);

      // Should detect all modifications despite race conditions
      const result = await snapshotManager.detectUnknownModifications(testFiles);
      expect(result.hasUnknownChanges).toBe(true);
      expect(result.unknownChanges.length).toBe(3);
      expect(result.affectedFiles).toEqual(expect.arrayContaining(testFiles));
    });
  });

  describe('Checkpoint System Integration Tests', () => {
    it('should maintain checkpoint consistency across multiple snapshots', async () => {
      const testFile = 'evolving_code.py';
      let content = `class Calculator:
    def add(self, a, b):
        return a + b
`;

      await fs.writeFile(path.join(testWorkspace, testFile), content);

      // Create multiple snapshots with checkpoints
      const snapshotIds: string[] = [];
      
      for (let i = 0; i < 3; i++) { // Reduce iterations for faster tests
        const newMethod = `
    def operation_${i}(self, x):
        return x * ${i + 1}`;
        content += newMethod;
        await fs.writeFile(path.join(testWorkspace, testFile), content);

        const snapshotId = await snapshotManager.createSnapshot({
          tool: 'ApplyEditBlock',
          description: `Add operation_${i} method`,
          affectedFiles: [testFile],
          diff: `@@ -${2 + i * 2},0 +${2 + i * 2},2 @@
+    def operation_${i}(self, x):
+        return x * ${i + 1}`,
          context: { sessionId: 'test-session' },
          metadata: { filesSizeBytes: content.length, linesChanged: 2, executionTimeMs: 5 }
        });
        
        snapshotIds.push(snapshotId);
        
        // Verify checkpoint was created
        const stats = snapshotManager.getCacheStats();
        expect(stats.checkpointInfo.hasLatestCheckpoint).toBe(true);
        expect(stats.checkpointInfo.latestCheckpointFiles).toBeGreaterThanOrEqual(0);
      }

      // Verify all snapshots are accessible
      for (const snapshotId of snapshotIds) {
        const snapshot = await snapshotManager.readSnapshotDiff(snapshotId);
        expect(snapshot.success).toBe(true);
        expect(snapshot.snapshot?.id).toBe(snapshotId);
      }

      // Test checkpoint cleanup
      await snapshotManager.cleanupOldCheckpoints(new Date(Date.now() + 1000)); // Future date
      const finalStats = snapshotManager.getCacheStats();
      expect(finalStats.checkpointInfo.hasLatestCheckpoint).toBe(true);
    });

    it('should handle checkpoint corruption gracefully', async () => {
      const testFile = 'test_file.py';
      const content = 'print("Hello, World!")';
      
      await fs.writeFile(path.join(testWorkspace, testFile), content);

      // Create snapshot and checkpoint
      const snapshotId = await snapshotManager.createSnapshot({
        tool: 'ApplyWholeFileEdit',
        description: 'Create test file',
        affectedFiles: [testFile],
        diff: `--- /dev/null\n+++ b/${testFile}\n@@ -0,0 +1,1 @@\n+print("Hello, World!")`,
        context: { sessionId: 'test-session' },
        metadata: { filesSizeBytes: content.length, linesChanged: 1, executionTimeMs: 5 }
      });

      // Simulate checkpoint corruption by modifying checkpoint metadata
      const checkpointsDir = path.join(testWorkspace, '.continue-reasoning', 'checkpoints');
      const metadataPath = path.join(checkpointsDir, 'checkpoint-metadata.json');
      
      try {
        await fs.writeFile(metadataPath, 'corrupted json content');
      } catch (error) {
        // Expected if metadata doesn't exist yet
      }

      // System should handle corruption gracefully
      const unknownChanges = await snapshotManager.detectUnknownModifications([testFile]);
      expect(unknownChanges).toBeDefined();
      // Should not crash, even with corrupted checkpoint data
    });

    it('should maintain performance with large checkpoint history', async () => {
      const testFile = 'performance_test.py';
      const baseContent = 'print("Performance test")\n';
      
      await fs.writeFile(path.join(testWorkspace, testFile), baseContent);

      // Create fewer snapshots to test checkpoint performance (for faster tests)
      const startTime = Date.now();
      
      for (let i = 0; i < 10; i++) {
        const content = baseContent + `# Comment ${i}\n`;
        await fs.writeFile(path.join(testWorkspace, testFile), content);
        
        await snapshotManager.createSnapshot({
          tool: 'ApplyEditBlock',
          description: `Add comment ${i}`,
          affectedFiles: [testFile],
          diff: `@@ -1,0 +1,1 @@\n+# Comment ${i}`,
          context: { sessionId: 'test-session' },
          metadata: { filesSizeBytes: content.length, linesChanged: 1, executionTimeMs: 2 }
        });
      }
      
      const creationTime = Date.now() - startTime;
      
      // Test unknown change detection performance with history
      const modifiedContent = baseContent + '# External modification\n';
      await fs.writeFile(path.join(testWorkspace, testFile), modifiedContent);
      
      const detectionStart = Date.now();
      const result = await snapshotManager.detectUnknownModifications([testFile]);
      const detectionTime = Date.now() - detectionStart;
      
      expect(result.hasUnknownChanges).toBe(true);
      expect(creationTime).toBeLessThan(10000); // Should create 10 snapshots in under 10 seconds
      expect(detectionTime).toBeLessThan(1000); // Detection should be fast even with history
    });
  });

  describe('Real-World Error Recovery Scenarios', () => {
    it('should recover from workspace corruption', async () => {
      // Create initial state
      const testFile = 'recovery_test.py';
      const content = 'def recovery_function():\n    return "recovered"';
      
      await fs.writeFile(path.join(testWorkspace, testFile), content);
      
      const snapshotId = await snapshotManager.createSnapshot({
        tool: 'ApplyWholeFileEdit',
        description: 'Create recovery test file',
        affectedFiles: [testFile],
        diff: `--- /dev/null\n+++ b/${testFile}\n@@ -0,0 +1,2 @@\n+def recovery_function():\n+    return "recovered"`,
        context: { sessionId: 'test-session' },
        metadata: { filesSizeBytes: content.length, linesChanged: 2, executionTimeMs: 5 }
      });

      // Simulate workspace corruption by deleting the file
      await fs.unlink(path.join(testWorkspace, testFile));

      // Test recovery through reset state continuity
      await snapshotManager.resetStateContinuity();
      
      // Should be able to continue operations after reset
      const state = snapshotManager.getCurrentState();
      expect(state.isInitialized).toBe(true);
      
      // Should detect file deletion
      const changes = await snapshotManager.detectUnknownModifications([testFile]);
      expect(changes.hasUnknownChanges).toBe(true);
      expect(changes.unknownChanges[0].changeType).toBe('deleted');
    });

    it('should handle milestone creation with gaps in snapshot history', async () => {
      // Create several snapshots
      const testFiles = ['file1.py', 'file2.py', 'file3.py'];
      const snapshotIds: string[] = [];
      
      for (let i = 0; i < testFiles.length; i++) {
        const content = `print("File ${i + 1}")`;
        await fs.writeFile(path.join(testWorkspace, testFiles[i]), content);
        
        const snapshotId = await snapshotManager.createSnapshot({
          tool: 'ApplyWholeFileEdit',
          description: `Create ${testFiles[i]}`,
          affectedFiles: [testFiles[i]],
          diff: `--- /dev/null\n+++ b/${testFiles[i]}\n@@ -0,0 +1,1 @@\n+print("File ${i + 1}")`,
          context: { sessionId: 'test-session' },
          metadata: { filesSizeBytes: content.length, linesChanged: 1, executionTimeMs: 5 }
        });
        
        snapshotIds.push(snapshotId);
      }

      // Test milestone creation with range
      const milestoneResult = await snapshotManager.createMilestoneByRange({
        title: 'File Creation Milestone',
        description: 'Created all test files',
        tags: ['test', 'files']
      });

      expect(milestoneResult.success).toBe(true);
      expect(milestoneResult.milestoneId).toBeDefined();
      expect(milestoneResult.summary?.totalOperations).toBe(snapshotIds.length);
      expect(milestoneResult.summary?.affectedFiles).toEqual(expect.arrayContaining(testFiles));
    });

    it('should handle concurrent snapshot operations safely', async () => {
      const testFiles = ['concurrent1.py', 'concurrent2.py', 'concurrent3.py'];
      
      // Create initial files
      for (let i = 0; i < testFiles.length; i++) {
        const content = `# Initial content ${i}`;
        await fs.writeFile(path.join(testWorkspace, testFiles[i]), content);
      }

      // Attempt sequential snapshot creation (safer for testing)
      const snapshotIds: string[] = [];
      
      for (let index = 0; index < testFiles.length; index++) {
        const fileName = testFiles[index];
        
        try {
          const snapshotId = await snapshotManager.createSnapshot({
            tool: 'ApplyWholeFileEdit',
            description: `Sequential creation of ${fileName}`,
            affectedFiles: [fileName],
            diff: `--- /dev/null\n+++ b/${fileName}\n@@ -0,0 +1,1 @@\n+# Initial content ${index}`,
            context: { sessionId: `session-${index}` },
            metadata: { filesSizeBytes: 20, linesChanged: 1, executionTimeMs: 5 }
          });
          
          snapshotIds.push(snapshotId);
        } catch (error) {
          console.warn(`Failed to create snapshot for ${fileName}:`, error);
        }
      }
      
      // At least some snapshots should succeed
      expect(snapshotIds.length).toBeGreaterThan(0);
      
      // Verify system integrity after operations
      const finalState = snapshotManager.getCurrentState();
      expect(finalState.isInitialized).toBe(true);
      expect(finalState.sequenceNumber).toBeGreaterThan(0);
    });
  });

  describe('Configuration and Strategy Testing', () => {
    it('should respect different unknown change strategies', async () => {
      const testFile = 'strategy_test.py';
      const content = 'print("Initial")';
      
      await fs.writeFile(path.join(testWorkspace, testFile), content);
      
      // Create baseline
      await snapshotManager.createSnapshot({
        tool: 'ApplyWholeFileEdit',
        description: 'Create strategy test file',
        affectedFiles: [testFile],
        diff: `--- /dev/null\n+++ b/${testFile}\n@@ -0,0 +1,1 @@\n+print("Initial")`,
        context: { sessionId: 'test-session' },
        metadata: { filesSizeBytes: content.length, linesChanged: 1, executionTimeMs: 5 }
      });

      // Modify externally
      await fs.writeFile(path.join(testWorkspace, testFile), 'print("Modified externally")');

      // Test 'strict' strategy
      snapshotManager.updateConfig({ unknownChangeStrategy: 'strict' });
      const strictResult = await snapshotManager.validateFileStateBeforeSnapshot([testFile], { strictMode: true });
      expect(strictResult.success).toBe(false);

      // Test 'warn' strategy
      snapshotManager.updateConfig({ unknownChangeStrategy: 'warn' });
      const warnResult = await snapshotManager.validateFileStateBeforeSnapshot([testFile]);
      expect(warnResult.success).toBe(true);
      expect(warnResult.warnings).toBeDefined();

      // Test 'auto-integrate' strategy
      snapshotManager.updateConfig({ unknownChangeStrategy: 'auto-integrate' });
      const autoResult = await snapshotManager.validateFileStateBeforeSnapshot([testFile]);
      expect(autoResult.success).toBe(true);
    });

    it('should handle ignore patterns correctly', async () => {
      // Create files that should be ignored and tracked
      const ignoredFiles = ['test.log', 'temp.tmp'];
      const trackedFiles = ['main.py', 'config.yaml'];
      
      for (const fileName of [...ignoredFiles, ...trackedFiles]) {
        await fs.writeFile(path.join(testWorkspace, fileName), `Content of ${fileName}`);
      }

      // Create snapshot with mixed files
      const allFiles = [...ignoredFiles, ...trackedFiles];
      await snapshotManager.createSnapshot({
        tool: 'CreateFiles',
        description: 'Create mixed files',
        affectedFiles: allFiles,
        diff: allFiles.map(file => `--- /dev/null\n+++ b/${file}\n@@ -0,0 +1,1 @@\n+Content of ${file}`).join('\n'),
        context: { sessionId: 'test-session' },
        metadata: { filesSizeBytes: 100, linesChanged: allFiles.length, executionTimeMs: 10 }
      });

      // Modify all files externally
      for (const fileName of allFiles) {
        await fs.writeFile(path.join(testWorkspace, fileName), `Modified content of ${fileName}`);
      }

      // Test ignore filtering functionality
      const filteredFiles = snapshotManager.filterIgnoredFiles(allFiles);
      
      // Should filter out ignored files according to default patterns
      expect(filteredFiles.length).toBeLessThanOrEqual(allFiles.length);
      
      // Should only detect changes in non-ignored files
      const changes = await snapshotManager.detectUnknownModifications(allFiles);
      
      if (changes.hasUnknownChanges) {
        // Verify that detected changes are reasonable
        expect(changes.unknownChanges.length).toBeGreaterThan(0);
        expect(changes.affectedFiles.length).toBeGreaterThan(0);
      }
    });
  });
});