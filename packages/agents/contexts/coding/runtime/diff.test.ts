import { describe, it, expect } from 'vitest';
import {
  generateUnifiedDiff,
  parseMultiFileDiff,
  validateDiffFormat,
  analyzePatchResult,
  cleanDiffTimestamps,
  extractFilePathFromDiff,
  isFileCreation,
  isFileDeletion,
  countDiffChanges,
  ensureDiffLineEnding,
  reverseDiff,
  calculateFileHash,
  getGitTimestamp,
  addFileHashesToDiff,
  mergeDiffs
} from './diff.js';

describe('Diff Utilities', () => {
  describe('generateUnifiedDiff', () => {
    it('should generate a simple diff for two different strings', async () => {
      const oldContent = 'Hello World';
      const newContent = 'Hello Universe';
      
      const diff = await generateUnifiedDiff(oldContent, newContent);
      
      expect(diff).toContain('--- a/file');
      expect(diff).toContain('+++ b/file');
      expect(diff).toContain('-Hello World');
      expect(diff).toContain('+Hello Universe');
    });

    it('should use custom paths when provided', async () => {
      const oldContent = 'Line 1';
      const newContent = 'Line 2';
      
      const diff = await generateUnifiedDiff(oldContent, newContent, {
        oldPath: 'custom/old.txt',
        newPath: 'custom/new.txt'
      });
      
      expect(diff).toContain('--- custom/old.txt');
      expect(diff).toContain('+++ custom/new.txt');
    });

    it('should handle empty content correctly', async () => {
      const diff = await generateUnifiedDiff('', 'New content');
      
      expect(diff).toContain('@@ -1,0 +1,1 @@');
      expect(diff).toContain('+New content');
    });

    it('should handle multiline content', async () => {
      const oldContent = 'Line 1\nLine 2\nLine 3';
      const newContent = 'Line 1\nModified Line 2\nLine 3';
      
      const diff = await generateUnifiedDiff(oldContent, newContent);
      
      expect(diff).toContain('-Line 1\n-Line 2\n-Line 3');
      expect(diff).toContain('+Line 1\n+Modified Line 2\n+Line 3');
    });
  });

  describe('parseMultiFileDiff', () => {
    it('should parse a single file diff', () => {
      const singleDiff = `--- a/file.txt
+++ b/file.txt
@@ -1,2 +1,2 @@
 Line 1
-Old Line 2
+New Line 2
`;
      
      const results = parseMultiFileDiff(singleDiff);
      
      expect(results).toHaveLength(1);
      expect(results[0].oldPath).toBe('a/file.txt');
      expect(results[0].newPath).toBe('b/file.txt');
      expect(results[0].diffContent).toContain('Line 1');
      expect(results[0].diffContent.endsWith('\n')).toBe(true);
    });

    it('should parse multi-file diffs correctly', () => {
      const multiDiff = `--- a/file1.txt
+++ b/file1.txt
@@ -1 +1 @@
-Old content 1
+New content 1
--- a/file2.txt
+++ b/file2.txt
@@ -1 +1 @@
-Old content 2
+New content 2
`;
      
      const results = parseMultiFileDiff(multiDiff);
      
      expect(results).toHaveLength(2);
      expect(results[0].oldPath).toBe('a/file1.txt');
      expect(results[0].diffContent).toContain('Old content 1');
      expect(results[1].oldPath).toBe('a/file2.txt');
      expect(results[1].diffContent).toContain('Old content 2');
      
      // Ensure each diff ends with newline
      results.forEach(result => {
        expect(result.diffContent.endsWith('\n')).toBe(true);
      });
    });

    it('should handle git diff headers', () => {
      const gitDiff = `diff --git a/file.txt b/file.txt
index 1234567..abcdefg 100644
--- a/file.txt
+++ b/file.txt
@@ -1 +1 @@
-Old
+New
`;
      
      const results = parseMultiFileDiff(gitDiff);
      
      expect(results).toHaveLength(1);
      expect(results[0].diffContent).not.toContain('diff --git');
      expect(results[0].diffContent).not.toContain('index');
      expect(results[0].diffContent).toContain('--- a/file.txt');
    });

    it('should preserve trailing newlines for each file diff', () => {
      const multiDiff = `--- a/file1.txt
+++ b/file1.txt
@@ -1 +1 @@
-Content 1
+Updated 1
--- a/file2.txt
+++ b/file2.txt
@@ -1 +1 @@
-Content 2
+Updated 2`;
      
      const results = parseMultiFileDiff(multiDiff);
      
      expect(results).toHaveLength(2);
      // Each file diff should end with a newline
      expect(results[0].diffContent.endsWith('\n')).toBe(true);
      expect(results[1].diffContent.endsWith('\n')).toBe(true);
    });
  });

  describe('validateDiffFormat', () => {
    it('should validate a correct diff format', () => {
      const validDiff = `--- a/file.txt
+++ b/file.txt
@@ -1,3 +1,3 @@
 Line 1
-Line 2 Old
+Line 2 New
 Line 3
`;
      
      const result = validateDiffFormat(validDiff);
      
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect missing newline at end', () => {
      const diffWithoutNewline = `--- a/file.txt
+++ b/file.txt
@@ -1 +1 @@
-Old
+New`;
      
      const result = validateDiffFormat(diffWithoutNewline);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Diff does not end with a newline character');
    });

    it('should detect missing +++ header', () => {
      const invalidDiff = `--- a/file.txt
@@ -1 +1 @@
-Old
+New
`;
      
      const result = validateDiffFormat(invalidDiff);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Missing +++ header after --- header');
    });

    it('should detect malformed hunk header', () => {
      const invalidDiff = `--- a/file.txt
+++ b/file.txt
@@ malformed @@
-Old
+New
`;
      
      const result = validateDiffFormat(invalidDiff);
      
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('Malformed hunk header'))).toBe(true);
    });

    it('should detect hunk line count mismatch', () => {
      const invalidDiff = `--- a/file.txt
+++ b/file.txt
@@ -1,2 +1,2 @@
-Only one line
+Also one line
`;
      
      const result = validateDiffFormat(invalidDiff);
      
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('Hunk line count mismatch'))).toBe(true);
    });

    it('should accept "No newline at end of file" marker', () => {
      const validDiff = `--- a/file.txt
+++ b/file.txt
@@ -1 +1 @@
-Old
\\ No newline at end of file
+New
\\ No newline at end of file
`;
      
      const result = validateDiffFormat(validDiff);
      
      expect(result.isValid).toBe(true);
    });

    it('should detect Windows line endings', () => {
      const diffWithCRLF = `--- a/file.txt\r\n+++ b/file.txt\r\n@@ -1 +1 @@\r\n-Old\r\n+New\r\n`;
      
      const result = validateDiffFormat(diffWithCRLF);
      
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('Windows line endings'))).toBe(true);
    });
  });

  describe('analyzePatchResult', () => {
    it('should return success for exit code 0', () => {
      const result = analyzePatchResult(0, 'Success', '', 'diff content', 'file.txt');
      
      expect(result.success).toBe(true);
      expect(result.detailedError).toBe('');
    });

    it('should handle null exit code', () => {
      const result = analyzePatchResult(null, '', 'Error', 'diff content', 'file.txt');
      
      expect(result.success).toBe(false);
      expect(result.detailedError).toContain('Process was terminated or killed');
    });

    it('should detect malformed patch errors', () => {
      const stderr = 'patch: malformed patch at line 5: invalid line';
      const result = analyzePatchResult(1, '', stderr, 'line1\nline2\nline3\nline4\ninvalid\nline6', 'file.txt');
      
      expect(result.success).toBe(false);
      expect(result.detailedError).toContain('Malformed patch at line 5');
      expect(result.detailedError).toContain('invalid');
    });

    it('should detect file not found errors', () => {
      const stderr = 'No such file or directory';
      const result = analyzePatchResult(1, '', stderr, 'diff', 'file.txt');
      
      expect(result.success).toBe(false);
      expect(result.detailedError).toContain('Target file or directory does not exist');
    });

    it('should detect failed hunks', () => {
      const stdout = '2 out of 3 hunks failed';
      const result = analyzePatchResult(1, stdout, '', 'diff', 'file.txt');
      
      expect(result.success).toBe(false);
      expect(result.detailedError).toContain('2 out of 3 hunks failed to apply');
    });

    it('should include diff context information', () => {
      const diff = `--- a/file.txt
+++ b/file.txt
@@ -1 +1 @@
-Old
+New
@@ -5 +5 @@
-Another
+Change
`;
      const result = analyzePatchResult(1, 'Error', '', diff, 'file.txt');
      
      expect(result.detailedError).toContain('9 lines, 2 hunks');
    });
  });

  describe('cleanDiffTimestamps', () => {
    it('should remove timestamps from diff headers', () => {
      const diffWithTimestamps = `--- a/file.txt\t2025-01-29 12:34:56
+++ b/file.txt\t2025-01-29 12:35:00
@@ -1 +1 @@
-Old
+New
`;
      
      const cleaned = cleanDiffTimestamps(diffWithTimestamps);
      
      expect(cleaned).not.toContain('2025-01-29');
      expect(cleaned).toContain('--- a/file.txt\n');
      expect(cleaned).toContain('+++ b/file.txt\n');
    });

    it('should not modify diffs without timestamps', () => {
      const normalDiff = `--- a/file.txt
+++ b/file.txt
@@ -1 +1 @@
-Old
+New
`;
      
      const cleaned = cleanDiffTimestamps(normalDiff);
      
      expect(cleaned).toBe(normalDiff);
    });
  });

  describe('extractFilePathFromDiff', () => {
    it('should extract path for file modification', () => {
      const path = extractFilePathFromDiff('a/src/file.js', 'b/src/file.js');
      
      expect(path).toBe('src/file.js');
    });

    it('should handle file creation', () => {
      const path = extractFilePathFromDiff('/dev/null', 'b/new-file.txt');
      
      expect(path).toBe('new-file.txt');
    });

    it('should handle file deletion', () => {
      const path = extractFilePathFromDiff('a/old-file.txt', '/dev/null');
      
      expect(path).toBe('old-file.txt');
    });

    it('should handle paths without a/b prefixes', () => {
      const path = extractFilePathFromDiff('file.txt', 'file.txt');
      
      expect(path).toBe('file.txt');
    });
  });

  describe('isFileCreation and isFileDeletion', () => {
    it('should identify file creation', () => {
      expect(isFileCreation('/dev/null')).toBe(true);
      expect(isFileCreation('a/file.txt')).toBe(false);
    });

    it('should identify file deletion', () => {
      expect(isFileDeletion('/dev/null')).toBe(true);
      expect(isFileDeletion('b/file.txt')).toBe(false);
    });
  });

  describe('countDiffChanges', () => {
    it('should count added and removed lines', () => {
      const diff = `--- a/file.txt
+++ b/file.txt
@@ -1,3 +1,4 @@
 Context line
-Removed line
+Added line 1
+Added line 2
 Another context
`;
      
      const count = countDiffChanges(diff);
      
      expect(count).toBe(3); // 1 removed + 2 added
    });

    it('should not count headers or context lines', () => {
      const diff = `--- a/file.txt
+++ b/file.txt
@@ -1,2 +1,2 @@
 Context line 1
 Context line 2
`;
      
      const count = countDiffChanges(diff);
      
      expect(count).toBe(0);
    });
  });

  describe('ensureDiffLineEnding', () => {
    it('should add newline if missing', () => {
      const diff = 'line1\nline2';
      const result = ensureDiffLineEnding(diff);
      expect(result).toBe('line1\nline2\n');
    });

    it('should not add newline if present', () => {
      const diff = 'line1\nline2\n';
      const result = ensureDiffLineEnding(diff);
      expect(result).toBe('line1\nline2\n');
    });

    it('should handle empty string', () => {
      const result = ensureDiffLineEnding('');
      expect(result).toBe('\n');
    });
  });

  describe('Git Integration Enhancements', () => {
    describe('calculateFileHash', () => {
      it('should generate consistent SHA1 hashes', () => {
        const content = 'Hello World';
        const hash = calculateFileHash(content);
        
        expect(hash).toHaveLength(7);
        expect(hash).toMatch(/^[a-f0-9]{7}$/);
        
        // Same content should produce same hash
        const hash2 = calculateFileHash(content);
        expect(hash).toBe(hash2);
      });

      it('should handle empty content', () => {
        const hash = calculateFileHash('');
        expect(hash).toHaveLength(7);
        expect(hash).toMatch(/^[a-f0-9]{7}$/);
      });

      it('should produce different hashes for different content', () => {
        const hash1 = calculateFileHash('content1');
        const hash2 = calculateFileHash('content2');
        expect(hash1).not.toBe(hash2);
      });
    });

    describe('getGitTimestamp', () => {
      it('should generate git-compatible timestamp format', () => {
        const timestamp = getGitTimestamp();
        
        // Should match format: "1234567890 +0800"
        expect(timestamp).toMatch(/^\d{10} [+-]\d{4}$/);
      });

      it('should include timezone offset', () => {
        const timestamp = getGitTimestamp();
        
        // Should have timezone part
        const parts = timestamp.split(' ');
        expect(parts).toHaveLength(2);
        expect(parts[1]).toMatch(/^[+-]\d{4}$/);
      });
    });

    describe('generateUnifiedDiff with Git options', () => {
      it('should generate diff with Git headers when includeHash is true', async () => {
        const oldContent = 'Hello World';
        const newContent = 'Hello Universe';
        
        const diff = await generateUnifiedDiff(oldContent, newContent, {
          oldPath: 'a/test.txt',
          newPath: 'b/test.txt',
          gitOptions: {
            includeHash: true
          }
        });
        
        expect(diff).toContain('diff --git a/test.txt b/test.txt');
        expect(diff).toMatch(/index [a-f0-9]{7}\.\.[a-f0-9]{7} 100644/);
        expect(diff).toContain('--- a/test.txt');
        expect(diff).toContain('+++ b/test.txt');
      });

      it('should generate diff with custom hashes', async () => {
        const oldContent = 'Hello World';
        const newContent = 'Hello Universe';
        
        const diff = await generateUnifiedDiff(oldContent, newContent, {
          oldPath: 'a/test.txt',
          newPath: 'b/test.txt',
          gitOptions: {
            includeHash: true,
            oldHash: 'abc1234',
            newHash: 'def5678'
          }
        });
        
        expect(diff).toContain('index abc1234..def5678 100644');
      });

      it('should generate diff with Git timestamps when useGitTimestamp is true', async () => {
        const oldContent = 'Hello World';
        const newContent = 'Hello Universe';
        
        const diff = await generateUnifiedDiff(oldContent, newContent, {
          oldPath: 'a/test.txt',
          newPath: 'b/test.txt',
          gitOptions: {
            useGitTimestamp: true
          }
        });
        
        // Should contain timestamp in both file headers
        const lines = diff.split('\n');
        const oldLine = lines.find(line => line.startsWith('--- '));
        const newLine = lines.find(line => line.startsWith('+++ '));
        
        expect(oldLine).toMatch(/--- a\/test\.txt\t\d{10} [+-]\d{4}/);
        expect(newLine).toMatch(/\+\+\+ b\/test\.txt\t\d{10} [+-]\d{4}/);
      });

      it('should generate standard diff when no Git options are provided', async () => {
        const oldContent = 'Hello World';
        const newContent = 'Hello Universe';
        
        const diff = await generateUnifiedDiff(oldContent, newContent, {
          oldPath: 'a/test.txt',
          newPath: 'b/test.txt'
        });
        
        expect(diff).not.toContain('diff --git');
        expect(diff).not.toContain('index');
        expect(diff).toContain('--- a/test.txt\n');
        expect(diff).toContain('+++ b/test.txt\n');
      });
    });

    describe('addFileHashesToDiff', () => {
      it('should add Git headers to existing diff', () => {
        const originalDiff = `--- a/test.txt
+++ b/test.txt
@@ -1 +1 @@
-Old content
+New content
`;
        
        const oldContent = 'Old content';
        const newContent = 'New content';
        
        const enhancedDiff = addFileHashesToDiff(originalDiff, oldContent, newContent);
        
        expect(enhancedDiff).toContain('diff --git a/test.txt b/test.txt');
        expect(enhancedDiff).toMatch(/index [a-f0-9]{7}\.\.[a-f0-9]{7} 100644/);
        expect(enhancedDiff).toContain('--- a/test.txt');
        expect(enhancedDiff).toContain('+++ b/test.txt');
      });

      it('should handle multi-file diffs', () => {
        const multiDiff = `--- a/file1.txt
+++ b/file1.txt
@@ -1 +1 @@
-Old 1
+New 1
--- a/file2.txt
+++ b/file2.txt
@@ -1 +1 @@
-Old 2
+New 2
`;
        
        const enhancedDiff = addFileHashesToDiff(multiDiff);
        
        // Should have two git headers
        const gitHeaders = enhancedDiff.split('\n').filter(line => line.startsWith('diff --git'));
        expect(gitHeaders).toHaveLength(2);
        
        expect(enhancedDiff).toContain('diff --git a/file1.txt b/file1.txt');
        expect(enhancedDiff).toContain('diff --git a/file2.txt b/file2.txt');
      });

      it('should use default hashes when content is not provided', () => {
        const originalDiff = `--- a/test.txt
+++ b/test.txt
@@ -1 +1 @@
-Old
+New
`;
        
        const enhancedDiff = addFileHashesToDiff(originalDiff);
        
        expect(enhancedDiff).toContain('index 0000000..0000000 100644');
      });
    });
  });

  describe('reverseDiff', () => {
    it('should reverse a simple file modification', () => {
      const originalDiff = `--- a/config.js
+++ b/config.js
@@ -1,3 +1,3 @@
 const config = {
-  debug: false,
+  debug: true,
 };
`;

      const result = reverseDiff(originalDiff);

      expect(result.success).toBe(true);
      expect(result.affectedFiles).toEqual(['config.js']);
      expect(result.reversedDiff).toContain('--- a/config.js');
      expect(result.reversedDiff).toContain('+++ b/config.js');
      expect(result.reversedDiff).toContain('-  debug: true,');
      expect(result.reversedDiff).toContain('+  debug: false,');
    });

    it('should reverse file creation into file deletion', () => {
      const originalDiff = `--- /dev/null
+++ b/new-file.js
@@ -0,0 +1,3 @@
+function hello() {
+  return "world";
+}
`;

      const result = reverseDiff(originalDiff);

      expect(result.success).toBe(true);
      expect(result.affectedFiles).toEqual(['new-file.js']);
      expect(result.reversedDiff).toContain('--- a/new-file.js');
      expect(result.reversedDiff).toContain('+++ /dev/null');
      expect(result.reversedDiff).toContain('-function hello() {');
      expect(result.reversedDiff).toContain('-  return "world";');
      expect(result.reversedDiff).toContain('-}');
    });

    it('should reverse file deletion into file creation', () => {
      const originalDiff = `--- a/old-file.js
+++ /dev/null
@@ -1,3 +0,0 @@
-function goodbye() {
-  return "farewell";
-}
`;

      const result = reverseDiff(originalDiff);

      expect(result.success).toBe(true);
      expect(result.affectedFiles).toEqual(['old-file.js']);
      expect(result.reversedDiff).toContain('--- /dev/null');
      expect(result.reversedDiff).toContain('+++ b/old-file.js');
      expect(result.reversedDiff).toContain('+function goodbye() {');
      expect(result.reversedDiff).toContain('+  return "farewell";');
      expect(result.reversedDiff).toContain('+}');
    });

    it('should reverse multi-file diff', () => {
      const originalDiff = `--- a/file1.js
+++ b/file1.js
@@ -1,3 +1,3 @@
 const value = {
-  old: "value",
+  new: "value",
 };
--- a/file2.js
+++ b/file2.js
@@ -1,3 +1,3 @@
 function test() {
-  return false;
+  return true;
 }
`;

      const result = reverseDiff(originalDiff);

      expect(result.success).toBe(true);
      expect(result.affectedFiles).toEqual(['file1.js', 'file2.js']);
      
      // Check first file reversal
      expect(result.reversedDiff).toContain('-  new: "value",');
      expect(result.reversedDiff).toContain('+  old: "value",');
      
      // Check second file reversal
      expect(result.reversedDiff).toContain('-  return true;');
      expect(result.reversedDiff).toContain('+  return false;');
    });

    it('should handle complex multi-file diff with creation and modification', () => {
      const originalDiff = `--- a/existing.js
+++ b/existing.js
@@ -1,2 +1,3 @@
 function existing() {
-  return "old";
+  console.log("modified");
+  return "new";
 }
--- /dev/null
+++ b/created.js
@@ -0,0 +1,3 @@
+function created() {
+  return "fresh";
+}
`;

      const result = reverseDiff(originalDiff);

      expect(result.success).toBe(true);
      expect(result.affectedFiles).toEqual(['existing.js', 'created.js']);
      
      // Check modification reversal
      expect(result.reversedDiff).toContain('--- a/existing.js');
      expect(result.reversedDiff).toContain('+++ b/existing.js');
      expect(result.reversedDiff).toContain('-  console.log("modified");');
      expect(result.reversedDiff).toContain('-  return "new";');
      expect(result.reversedDiff).toContain('+  return "old";');
      
      // Check creation reversal (becomes deletion)
      expect(result.reversedDiff).toContain('--- a/created.js');
      expect(result.reversedDiff).toContain('+++ /dev/null');
      expect(result.reversedDiff).toContain('-function created() {');
    });

    it('should handle includeFiles filter', () => {
      const originalDiff = `--- a/include-me.js
+++ b/include-me.js
@@ -1 +1 @@
-old content
+new content
--- a/exclude-me.js
+++ b/exclude-me.js
@@ -1 +1 @@
-old content
+new content
`;

      const result = reverseDiff(originalDiff, {
        includeFiles: ['include-me.js']
      });

      expect(result.success).toBe(true);
      expect(result.affectedFiles).toEqual(['include-me.js']);
      expect(result.reversedDiff).toContain('include-me.js');
      expect(result.reversedDiff).not.toContain('exclude-me.js');
    });

    it('should handle excludeFiles filter', () => {
      const originalDiff = `--- a/keep-me.js
+++ b/keep-me.js
@@ -1 +1 @@
-old content
+new content
--- a/exclude-me.js
+++ b/exclude-me.js
@@ -1 +1 @@
-old content
+new content
`;

      const result = reverseDiff(originalDiff, {
        excludeFiles: ['exclude-me.js']
      });

      expect(result.success).toBe(true);
      expect(result.affectedFiles).toEqual(['keep-me.js']);
      expect(result.reversedDiff).toContain('keep-me.js');
      expect(result.reversedDiff).not.toContain('exclude-me.js');
    });

    it('should reverse hunk headers correctly', () => {
      const originalDiff = `--- a/test.js
+++ b/test.js
@@ -5,3 +5,4 @@ function test() {
   line1();
-  oldLine();
+  newLine();
+  addedLine();
   line3();
`;

      const result = reverseDiff(originalDiff);

      expect(result.success).toBe(true);
      // Original: @@ -5,3 +5,4 @@
      // Reversed should be: @@ -5,4 +5,3 @@
      expect(result.reversedDiff).toContain('@@ -5,4 +5,3 @@');
      expect(result.reversedDiff).toContain('-  newLine();');
      expect(result.reversedDiff).toContain('-  addedLine();');
      expect(result.reversedDiff).toContain('+  oldLine();');
    });

    it('should handle empty diff content', () => {
      const result = reverseDiff('');

      expect(result.success).toBe(false);
      expect(result.message).toContain('No valid file diffs found');
      expect(result.affectedFiles).toEqual([]);
    });

    it('should handle malformed diff content', () => {
      const malformedDiff = `This is not a valid diff
Just some random text
Without proper diff headers`;

      const result = reverseDiff(malformedDiff);

      expect(result.success).toBe(false);
      expect(result.affectedFiles).toEqual([]);
    });

    it('should preserve context lines', () => {
      const originalDiff = `--- a/context.js
+++ b/context.js
@@ -1,5 +1,5 @@
 // This is a comment
 function test() {
-  return "old";
+  return "new";
 }
 // End comment
`;

      const result = reverseDiff(originalDiff);

      expect(result.success).toBe(true);
      expect(result.reversedDiff).toContain(' // This is a comment');
      expect(result.reversedDiff).toContain(' function test() {');
      expect(result.reversedDiff).toContain('-  return "new";');
      expect(result.reversedDiff).toContain('+  return "old";');
      expect(result.reversedDiff).toContain(' }');
      expect(result.reversedDiff).toContain(' // End comment');
    });

    it('should handle diffs with no modifications filter correctly', () => {
      const originalDiff = `--- a/file1.js
+++ b/file1.js
@@ -1 +1 @@
-old
+new
--- a/file2.js
+++ b/file2.js
@@ -1 +1 @@
-old
+new
`;

      const result = reverseDiff(originalDiff, {
        includeFiles: ['nonexistent.js']
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('No file diffs matched the filter criteria');
      expect(result.affectedFiles).toEqual([]);
    });

    it('should ensure proper line endings', () => {
      const originalDiff = `--- a/test.js
+++ b/test.js
@@ -1 +1 @@
-old
+new
`;

      const result = reverseDiff(originalDiff);

      expect(result.success).toBe(true);
      expect(result.reversedDiff.endsWith('\n')).toBe(true);
    });
  });
}); 