import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SimpleSnapshotManager } from './simple-snapshot-manager';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

describe('Git Diff Format Validation', () => {
  let tempDir: string;
  let snapshotManager: SimpleSnapshotManager;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'git-diff-test-'));
    snapshotManager = new SimpleSnapshotManager(tempDir);
    await snapshotManager.initialize();
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      console.warn('Failed to cleanup temp directory:', error);
    }
  });

  describe('Git Diff Format', () => {
    it('should store diffs in Git format', async () => {
      // Create a snapshot with a simple diff
      const gitDiff = `diff --git a/test.js b/test.js
index 1234567..abcdefg 100644
--- a/test.js
+++ b/test.js
@@ -1,3 +1,4 @@
 console.log('hello');
+console.log('world');
 // end of file`;

      const snapshotId = await snapshotManager.createSnapshot({
        tool: 'TestTool',
        description: 'Test Git diff format',
        affectedFiles: ['test.js'],
        diff: gitDiff,
        context: {
          sessionId: 'test'
        },
        metadata: {
          filesSizeBytes: 100,
          linesChanged: 1,
          executionTimeMs: 10
        }
      });

      // Read the snapshot diff
      const result = await snapshotManager.readSnapshotDiff(snapshotId);
      
      expect(result.success).toBe(true);
      expect(result.diff).toBeDefined();
      expect(result.diff).toContain('diff --git');
      expect(result.diff).toContain('index 1234567..abcdefg');
      expect(result.diff).toContain('--- a/test.js');
      expect(result.diff).toContain('+++ b/test.js');
      expect(result.diff).toContain('@@');
      expect(result.diff).toContain('+console.log(\'world\');');
    });

    it('should preserve Git format headers', async () => {
      const gitDiff = `diff --git a/package.json b/package.json
index abc123..def456 100644
--- a/package.json
+++ b/package.json
@@ -1,5 +1,6 @@
 {
   "name": "test-package",
+  "version": "1.0.0",
   "dependencies": {}
 }`;

      const snapshotId = await snapshotManager.createSnapshot({
        tool: 'TestTool',
        description: 'Test Git headers preservation',
        affectedFiles: ['package.json'],
        diff: gitDiff,
        context: {
          sessionId: 'test'
        },
        metadata: {
          filesSizeBytes: 150,
          linesChanged: 1,
          executionTimeMs: 15
        }
      });

      const result = await snapshotManager.readSnapshotDiff(snapshotId);
      
      expect(result.success).toBe(true);
      expect(result.diff).toBe(gitDiff); // Should be exactly the same
    });

    it('should handle multiple file Git diffs', async () => {
      const multiFileGitDiff = `diff --git a/file1.js b/file1.js
index 111111..222222 100644
--- a/file1.js
+++ b/file1.js
@@ -1,2 +1,3 @@
 const a = 1;
+const b = 2;
 module.exports = { a };
diff --git a/file2.js b/file2.js
index 333333..444444 100644
--- a/file2.js
+++ b/file2.js
@@ -1,2 +1,3 @@
 const x = 10;
+const y = 20;
 module.exports = { x };`;

      const snapshotId = await snapshotManager.createSnapshot({
        tool: 'TestTool',
        description: 'Test multi-file Git diff',
        affectedFiles: ['file1.js', 'file2.js'],
        diff: multiFileGitDiff,
        context: {
          sessionId: 'test'
        },
        metadata: {
          filesSizeBytes: 300,
          linesChanged: 2,
          executionTimeMs: 20
        }
      });

      const result = await snapshotManager.readSnapshotDiff(snapshotId);
      
      expect(result.success).toBe(true);
      expect(result.diff).toContain('diff --git a/file1.js b/file1.js');
      expect(result.diff).toContain('diff --git a/file2.js b/file2.js');
      expect(result.diff).toContain('+const b = 2;');
      expect(result.diff).toContain('+const y = 20;');
    });
  });
}); 