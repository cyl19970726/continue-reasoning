import { describe, it, expect } from 'vitest';
import { mergeDiffs } from './diff.js';

describe('Diff Merge Functionality', () => {
  describe('mergeDiffs', () => {
    it('should handle empty diff array', () => {
      const result = mergeDiffs([]);
      
      expect(result.success).toBe(true);
      expect(result.mergedDiff).toBe('');
      expect(result.filesProcessed).toBe(0);
      expect(result.conflicts).toBeUndefined();
      expect(result.warnings).toBeUndefined();
    });

    it('should return single diff unchanged', () => {
      const singleDiff = `--- a/test.js
+++ b/test.js
@@ -1,3 +1,3 @@
 function test() {
-  return "old";
+  return "new";
 }
`;
      
      const result = mergeDiffs([singleDiff]);
      
      expect(result.success).toBe(true);
      expect(result.mergedDiff).toBe(singleDiff);
      expect(result.filesProcessed).toBe(1);
    });

    it('should merge diffs for different files', () => {
      const diff1 = `--- a/file1.js
+++ b/file1.js
@@ -1,2 +1,2 @@
 const value = {
-  old: "value1",
+  new: "value1",
 };
`;

      const diff2 = `--- a/file2.js
+++ b/file2.js
@@ -1,2 +1,2 @@
 const config = {
-  debug: false,
+  debug: true,
 };
`;

      const result = mergeDiffs([diff1, diff2]);
      
      expect(result.success).toBe(true);
      expect(result.mergedDiff).toContain('--- a/file1.js');
      expect(result.mergedDiff).toContain('+++ b/file1.js');
      expect(result.mergedDiff).toContain('--- a/file2.js');
      expect(result.mergedDiff).toContain('+++ b/file2.js');
      expect(result.mergedDiff).toContain('new: "value1"');
      expect(result.mergedDiff).toContain('debug: true');
      expect(result.filesProcessed).toBe(2);
    });

    it('should merge multiple diffs for the same file without conflicts', () => {
      const diff1 = `--- a/config.js
+++ b/config.js
@@ -1,3 +1,3 @@
 const config = {
-  debug: false,
+  debug: true,
 };
`;

      const diff2 = `--- a/config.js
+++ b/config.js
@@ -10,3 +10,4 @@
   other: "value",
+  verbose: true,
 };
`;

      const result = mergeDiffs([diff1, diff2]);
      
      expect(result.success).toBe(true);
      expect(result.mergedDiff).toContain('--- a/config.js');
      expect(result.mergedDiff).toContain('+++ b/config.js');
      expect(result.mergedDiff).toContain('debug: true');
      expect(result.mergedDiff).toContain('verbose: true');
      expect(result.filesProcessed).toBe(2);
    });

    it('should detect overlapping hunks and handle conflicts', () => {
      const diff1 = `--- a/config.js
+++ b/config.js
@@ -1,3 +1,3 @@
 const config = {
-  debug: false,
+  debug: true,
 };
`;

      const diff2 = `--- a/config.js
+++ b/config.js
@@ -2,3 +2,3 @@
   debug: false,
-  mode: "production",
+  mode: "development",
 };
`;

      const result = mergeDiffs([diff1, diff2], { conflictResolution: 'fail' });
      
      expect(result.success).toBe(false);
      expect(result.conflicts).toBeDefined();
      expect(result.conflicts![0].type).toBe('overlapping_hunks');
      expect(result.conflicts![0].filePath).toBe('config.js');
      expect(result.filesProcessed).toBe(2);
    });

    it('should handle file creation and deletion', () => {
      const creationDiff = `--- /dev/null
+++ b/new-file.js
@@ -0,0 +1,3 @@
+function newFunction() {
+  return "created";
+}
`;

      const deletionDiff = `--- a/old-file.js
+++ /dev/null
@@ -1,3 +0,0 @@
-function oldFunction() {
-  return "deleted";
-}
`;

      const result = mergeDiffs([creationDiff, deletionDiff]);
      
      expect(result.success).toBe(true);
      expect(result.mergedDiff).toContain('--- /dev/null');
      expect(result.mergedDiff).toContain('+++ b/new-file.js');
      expect(result.mergedDiff).toContain('--- a/old-file.js');
      expect(result.mergedDiff).toContain('+++ /dev/null');
      expect(result.mergedDiff).toContain('+function newFunction()');
      expect(result.mergedDiff).toContain('-function oldFunction()');
      expect(result.filesProcessed).toBe(2);
    });

    it('should preserve Git headers when requested', () => {
      const gitDiff = `diff --git a/test.js b/test.js
index 1234567..abcdefg 100644
--- a/test.js
+++ b/test.js
@@ -1,3 +1,3 @@
 function test() {
-  return "old";
+  return "new";
 }
`;

      const result = mergeDiffs([gitDiff], { preserveGitHeaders: true });
      
      expect(result.success).toBe(true);
      expect(result.mergedDiff).toContain('diff --git a/test.js b/test.js');
      expect(result.mergedDiff).toContain('index 1234567..abcdefg 100644');
      expect(result.mergedDiff).toContain('--- a/test.js');
      expect(result.mergedDiff).toContain('+++ b/test.js');
    });

    it('should skip Git headers when not requested', () => {
      const gitDiff = `diff --git a/test.js b/test.js
index 1234567..abcdefg 100644
--- a/test.js
+++ b/test.js
@@ -1,3 +1,3 @@
 function test() {
-  return "old";
+  return "new";
 }
`;

      const result = mergeDiffs([gitDiff], { preserveGitHeaders: false });
      
      expect(result.success).toBe(true);
      expect(result.mergedDiff).not.toContain('diff --git');
      expect(result.mergedDiff).not.toContain('index');
      expect(result.mergedDiff).toContain('--- a/test.js');
      expect(result.mergedDiff).toContain('+++ b/test.js');
    });

    it('should handle malformed diffs with concatenate resolution', () => {
      const validDiff = `--- a/valid.js
+++ b/valid.js
@@ -1 +1 @@
-old
+new
`;

      const malformedDiff = `This is not a valid diff
Just some random text`;

      const result = mergeDiffs([validDiff, malformedDiff], { conflictResolution: 'concatenate' });
      
      expect(result.success).toBe(true);
      expect(result.mergedDiff).toContain('--- a/valid.js');
      expect(result.mergedDiff).toContain('+new');
      expect(result.warnings).toBeDefined();
      expect(result.warnings![0]).toContain('Failed to parse diff');
    });

    it('should fail on malformed diffs with fail resolution', () => {
      const malformedDiff = `This is not a valid diff`;

      const result = mergeDiffs([malformedDiff], { conflictResolution: 'fail' });
      
      expect(result.success).toBe(false);
      expect(result.conflicts).toBeDefined();
      expect(result.conflicts![0].type).toBe('inconsistent_headers');
    });

    it('should skip conflicted files with skip resolution', () => {
      const diff1 = `--- a/config.js
+++ b/config.js
@@ -1,3 +1,3 @@
 const config = {
-  debug: false,
+  debug: true,
 };
`;

      const diff2 = `--- a/config.js
+++ b/config.js
@@ -2,3 +2,3 @@
   debug: false,
-  mode: "production",
+  mode: "development",
 };
`;

      const validDiff = `--- a/other.js
+++ b/other.js
@@ -1 +1 @@
-old
+new
`;

      const result = mergeDiffs([diff1, diff2, validDiff], { conflictResolution: 'skip' });
      
      expect(result.success).toBe(true);
      expect(result.mergedDiff).toContain('--- a/other.js');
      expect(result.mergedDiff).not.toContain('--- a/config.js');
      expect(result.warnings).toBeDefined();
      expect(result.warnings![0]).toContain('Skipped file config.js due to merge conflicts');
    });

    it('should handle complex multi-file scenario with mixed operations', () => {
      const modificationDiff = `--- a/existing.js
+++ b/existing.js
@@ -1,2 +1,3 @@
 function existing() {
-  return "old";
+  console.log("modified");
+  return "new";
 }
`;

      const creationDiff = `--- /dev/null
+++ b/created.js
@@ -0,0 +1,3 @@
+function created() {
+  return "fresh";
+}
`;

      const deletionDiff = `--- a/deleted.js
+++ /dev/null
@@ -1,3 +0,0 @@
-function deleted() {
-  return "gone";
-}
`;

      const result = mergeDiffs([modificationDiff, creationDiff, deletionDiff]);
      
      expect(result.success).toBe(true);
      expect(result.filesProcessed).toBe(3);
      
      // Check modification
      expect(result.mergedDiff).toContain('--- a/existing.js');
      expect(result.mergedDiff).toContain('+++ b/existing.js');
      expect(result.mergedDiff).toContain('+  console.log("modified");');
      
      // Check creation
      expect(result.mergedDiff).toContain('--- /dev/null');
      expect(result.mergedDiff).toContain('+++ b/created.js');
      expect(result.mergedDiff).toContain('+function created() {');
      
      // Check deletion
      expect(result.mergedDiff).toContain('--- a/deleted.js');
      expect(result.mergedDiff).toContain('+++ /dev/null');
      expect(result.mergedDiff).toContain('-function deleted() {');
    });

    it('should ensure proper line endings in merged result', () => {
      const diff1 = `--- a/test1.js
+++ b/test1.js
@@ -1 +1 @@
-old1
+new1
`;

      const diff2 = `--- a/test2.js
+++ b/test2.js
@@ -1 +1 @@
-old2
+new2
`;

      const result = mergeDiffs([diff1, diff2]);
      
      expect(result.success).toBe(true);
      expect(result.mergedDiff.endsWith('\n')).toBe(true);
    });
  });
}); 