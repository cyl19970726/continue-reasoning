/**
 * Diff utility functions for the runtime
 * This module provides utilities for generating, parsing, validating, and applying diffs
 */

import * as crypto from 'crypto';

export interface DiffParseResult {
  oldPath: string;
  newPath: string;
  diffContent: string;
}

export interface DiffValidationResult {
  isValid: boolean;
  errors: string[];
}

export interface PatchAnalysisResult {
  success: boolean;
  detailedError: string;
}

export interface ReverseDiffOptions {
  includeFiles?: string[];
  excludeFiles?: string[];
  dryRun?: boolean;
  checkConflicts?: boolean;
}

export interface ReverseDiffResult {
  success: boolean;
  reversedDiff: string;
  message?: string;
  affectedFiles: string[];
  conflicts?: string[];
}

export interface GitDiffOptions {
  includeHash?: boolean;
  useGitTimestamp?: boolean;
  oldHash?: string;
  newHash?: string;
}

/**
 * Interface for diff merge operations
 */
export interface DiffMergeOptions {
  preserveGitHeaders?: boolean;
  conflictResolution?: 'fail' | 'concatenate' | 'skip';
  validateContinuity?: boolean;
}

export interface DiffMergeResult {
  success: boolean;
  mergedDiff: string;
  conflicts?: DiffConflict[];
  warnings?: string[];
  filesProcessed: number;
}

export interface DiffConflict {
  filePath: string;
  type: 'overlapping_hunks' | 'inconsistent_headers' | 'sequence_gap';
  description: string;
  affectedHunks?: HunkInfo[];
}

export interface HunkInfo {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  content: string[];
}

export interface ParsedHunk {
  header: string;
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  lines: string[];
}

export interface FileDiffInfo {
  filePath: string;
  oldPath: string;
  newPath: string;
  gitHeader?: string;
  indexLine?: string;
  hunks: ParsedHunk[];
  isCreation: boolean;
  isDeletion: boolean;
}

/**
 * Calculate file hash using SHA1 (Git-compatible)
 */
export function calculateFileHash(content: string): string {
  return crypto.createHash('sha1').update(content).digest('hex').substring(0, 7);
}

/**
 * Generate Git-compatible timestamp
 */
export function getGitTimestamp(): string {
  const now = new Date();
  const timestamp = Math.floor(now.getTime() / 1000);
  const offset = -now.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  const hours = Math.floor(Math.abs(offset) / 60);
  const minutes = Math.abs(offset) % 60;
  return `${timestamp} ${sign}${hours.toString().padStart(2, '0')}${minutes.toString().padStart(2, '0')}`;
}

/**
 * Generate a unified diff between two strings with enhanced Git compatibility
 */
export async function generateUnifiedDiff(
  oldContent: string,
  newContent: string,
  options?: { oldPath?: string; newPath?: string; gitOptions?: GitDiffOptions }
): Promise<string> {
  const oldLines = oldContent ? oldContent.split('\n') : [];
  const newLines = newContent ? newContent.split('\n') : [];
  
  const oldPath = options?.oldPath || 'a/file';
  const newPath = options?.newPath || 'b/file';
  const gitOptions = options?.gitOptions;
  
  // Start with basic diff format
  let diff = '';
  
  // Add Git-style headers if requested
  if (gitOptions?.includeHash) {
    const oldHash = gitOptions.oldHash || calculateFileHash(oldContent);
    const newHash = gitOptions.newHash || calculateFileHash(newContent);
    
    // Add git diff header
    diff += `diff --git ${oldPath} ${newPath}\n`;
    diff += `index ${oldHash}..${newHash} 100644\n`;
  }
  
  // Add timestamp support
  if (gitOptions?.useGitTimestamp) {
    const timestamp = getGitTimestamp();
    diff += `--- ${oldPath}\t${timestamp}\n+++ ${newPath}\t${timestamp}\n`;
  } else {
    diff += `--- ${oldPath}\n+++ ${newPath}\n`;
  }
  
  // Simple implementation: show all lines as removed then added
  // A real implementation would use a diff algorithm like Myers' algorithm
  diff += `@@ -1,${oldLines.length} +1,${newLines.length} @@\n`;
  
  for (const line of oldLines) {
    diff += `-${line}\n`;
  }
  for (const line of newLines) {
    diff += `+${line}\n`;
  }
  
  return diff;
}

/**
 * Parse a multi-file unified diff and extract individual file patches
 */
export function parseMultiFileDiff(diffContent: string): DiffParseResult[] {
  const fileDiffs: DiffParseResult[] = [];
  
  const lines = diffContent.split('\n');
  let currentFileDiff: string[] = [];
  let currentOldPath = '';
  let currentNewPath = '';
  let inFileDiff = false;
  let hasGitHeader = false;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const nextLine = lines[i + 1];
    
    // Check for git diff header
    if (line.startsWith('diff --git ')) {
      // If we were already processing a file diff, save it
      if (inFileDiff && currentFileDiff.length > 0) {
        // Important: preserve the trailing newline for each file diff
        fileDiffs.push({
          oldPath: currentOldPath,
          newPath: currentNewPath,
          diffContent: currentFileDiff.join('\n') + '\n'
        });
      }
      
      // Reset for new file
      currentFileDiff = [];
      currentOldPath = '';
      currentNewPath = '';
      inFileDiff = false;
      hasGitHeader = true;
      continue; // Skip the git header line itself
    } else if (line.startsWith('index ') && hasGitHeader) {
      // Skip index line
      continue;
    } else if (line.startsWith('--- ')) {
      // Check if this is the start of a new file diff within a multi-file diff
      // If the next line starts with +++, this is a new file header
      if (nextLine && nextLine.startsWith('+++ ')) {
        // If we were already processing a file diff, save it first
        if (inFileDiff && currentFileDiff.length > 0) {
          fileDiffs.push({
            oldPath: currentOldPath,
            newPath: currentNewPath,
            diffContent: currentFileDiff.join('\n') + '\n'
          });
        }
        
        // Start of actual diff content
        currentOldPath = line.substring(4).trim();
        currentFileDiff = [line];
        inFileDiff = false; // Wait for the +++ line
        hasGitHeader = false;
      } else if (inFileDiff) {
        // This is part of the current diff content (e.g., a line that happens to start with ---)
        currentFileDiff.push(line);
      }
    } else if (line.startsWith('+++ ')) {
      currentNewPath = line.substring(4).trim();
      currentFileDiff.push(line);
      inFileDiff = true;
    } else if (inFileDiff || (currentFileDiff.length > 0 && !inFileDiff)) {
      // Include all lines that are part of the diff, including empty lines
      currentFileDiff.push(line);
    }
  }
  
  // Don't forget the last file diff
  if (currentFileDiff.length > 0 && currentOldPath && currentNewPath) {
    // Ensure the last diff also has proper newline ending
    fileDiffs.push({
      oldPath: currentOldPath,
      newPath: currentNewPath,
      diffContent: currentFileDiff.join('\n') + '\n'
    });
  }
  
  return fileDiffs;
}

/**
 * Validate diff format and identify potential issues
 */
export function validateDiffFormat(diffContent: string): DiffValidationResult {
  const errors: string[] = [];
  const lines = diffContent.split('\n');
  
  let hasOldFileHeader = false;
  let hasNewFileHeader = false;
  let hasHunkHeader = false;
  let inHunk = false;
  let hunkLineCount = 0;
  let expectedOldLines = 0;
  let expectedNewLines = 0;
  let actualOldLines = 0;
  let actualNewLines = 0;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;
    
    // Check for required headers
    if (line.startsWith('--- ')) {
      hasOldFileHeader = true;
      // Reset counters for new file
      hasNewFileHeader = false;
      hasHunkHeader = false;
      inHunk = false;
      continue;
    }
    
    if (line.startsWith('+++ ')) {
      if (!hasOldFileHeader) {
        errors.push(`Line ${lineNum}: Found +++ header without preceding --- header`);
      }
      hasNewFileHeader = true;
      continue;
    }
    
    // Check for hunk headers
    if (line.startsWith('@@')) {
      if (!hasOldFileHeader || !hasNewFileHeader) {
        errors.push(`Line ${lineNum}: Found hunk header without proper file headers`);
      }
      
      // Parse hunk header: @@ -oldStart,oldCount +newStart,newCount @@
      const hunkMatch = line.match(/^@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s+@@/);
      if (!hunkMatch) {
        errors.push(`Line ${lineNum}: Malformed hunk header: ${line}`);
      } else {
        expectedOldLines = parseInt(hunkMatch[2] || '1');
        expectedNewLines = parseInt(hunkMatch[4] || '1');
        actualOldLines = 0;
        actualNewLines = 0;
        hasHunkHeader = true;
        inHunk = true;
        hunkLineCount = 0;
      }
      continue;
    }
    
    // Check hunk content
    if (inHunk && line.length > 0) {
      const firstChar = line[0];
      if (firstChar === ' ') {
        // Context line
        actualOldLines++;
        actualNewLines++;
      } else if (firstChar === '-') {
        // Removed line
        actualOldLines++;
      } else if (firstChar === '+') {
        // Added line
        actualNewLines++;
      } else if (firstChar === '\\') {
        // "No newline at end of file" marker - this is valid
        continue;
      } else if (line.trim() === '') {
        // Empty line might be end of hunk
        if (hasHunkHeader && actualOldLines === expectedOldLines && actualNewLines === expectedNewLines) {
          inHunk = false;
        }
        continue;
      } else {
        errors.push(`Line ${lineNum}: Invalid hunk line format (should start with ' ', '-', or '+'): ${line}`);
      }
      hunkLineCount++;
    }
  }
  
  // Final validation
  if (hasOldFileHeader && !hasNewFileHeader) {
    errors.push('Missing +++ header after --- header');
  }
  
  if (hasNewFileHeader && !hasHunkHeader) {
    errors.push('Missing hunk header (@@) after file headers');
  }
  
  if (inHunk && (actualOldLines !== expectedOldLines || actualNewLines !== expectedNewLines)) {
    errors.push(`Hunk line count mismatch: expected ${expectedOldLines}/-${expectedNewLines}/+ lines, got ${actualOldLines}/-${actualNewLines}/+ lines`);
  }
  
  // Check for common formatting issues
  if (diffContent.includes('\r\n')) {
    errors.push('Diff contains Windows line endings (\\r\\n), which may cause issues');
  }
  
  if (!diffContent.endsWith('\n') && diffContent.trim().length > 0) {
    errors.push('Diff does not end with a newline character');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Analyze patch command result and provide detailed error information
 */
export function analyzePatchResult(
  exitCode: number | null,
  stdout: string,
  stderr: string,
  diffContent: string,
  filePath: string
): PatchAnalysisResult {
  // Handle null exitCode (process was killed)
  const actualExitCode = exitCode ?? -1;
  
  // Check if patch was successful
  const patchFailed = stdout.includes('failed') || stderr.includes('failed');
  const patchSucceeded = (actualExitCode === 0) || (actualExitCode === 1 && !patchFailed);
  
  if (patchSucceeded && actualExitCode === 0 && !stderr && !stdout.includes('failed')) {
    return { success: true, detailedError: '' };
  }
  
  // Analyze specific error patterns
  let detailedError = `Failed to apply patch to ${filePath}. Exit code: ${actualExitCode}.`;
  
  if (exitCode === null) {
    detailedError += '\n  → Process was terminated or killed.';
  }
  
  // Parse stderr for specific error patterns
  if (stderr.includes('malformed patch')) {
    const malformedMatch = stderr.match(/malformed patch at line (\d+):/);
    if (malformedMatch) {
      const errorLine = parseInt(malformedMatch[1]);
      const diffLines = diffContent.split('\n');
      const problematicLine = diffLines[errorLine - 1] || 'Line not found';
      detailedError += `\n  → Malformed patch at line ${errorLine}: "${problematicLine}"`;
      
      // Provide suggestions based on common issues
      if (problematicLine.trim() === '') {
        detailedError += '\n  → Suggestion: Empty line detected. Ensure diff ends with proper newline.';
      } else if (!problematicLine.match(/^[@ +-\\]/)) {
        detailedError += '\n  → Suggestion: Line should start with "@", " ", "+", "-", or "\\" character.';
      }
    } else {
      detailedError += '\n  → Malformed patch format detected.';
    }
  }
  
  if (stderr.includes('No such file or directory')) {
    detailedError += '\n  → Target file or directory does not exist.';
  }
  
  if (stdout.includes('hunks failed')) {
    const hunkMatch = stdout.match(/(\d+) out of (\d+) hunks? failed/);
    if (hunkMatch) {
      detailedError += `\n  → ${hunkMatch[1]} out of ${hunkMatch[2]} hunks failed to apply.`;
    }
    
    // Extract reject information
    const rejectLines = stdout.split('\n').filter(line => line.includes('@@'));
    if (rejectLines.length > 0) {
      detailedError += '\n  → Failed hunks:';
      rejectLines.forEach(line => {
        detailedError += `\n    - ${line.trim()}`;
      });
    }
  }
  
  if (stderr.includes('Reversed (or previously applied) patch detected')) {
    detailedError += '\n  → Patch appears to be already applied or reversed.';
  }
  
  if (stderr.includes('patch: **** ')) {
    const errorMatch = stderr.match(/patch: \*\*\*\* (.+)/);
    if (errorMatch) {
      detailedError += `\n  → Patch error: ${errorMatch[1]}`;
    }
  }
  
  // Add context about the diff content
  const diffLines = diffContent.split('\n');
  const totalLines = diffLines.length;
  const hunkHeaders = diffLines.filter(line => line.startsWith('@@')).length;
  
  detailedError += `\n  → Diff context: ${totalLines} lines, ${hunkHeaders} hunks`;
  
  // Include original output for debugging
  detailedError += `\n  → Stdout: ${stdout}`;
  detailedError += `\n  → Stderr: ${stderr}`;
  
  return { success: false, detailedError };
}

/**
 * Clean diff timestamps
 * Removes timestamps from diff headers that are added by some diff generators
 */
export function cleanDiffTimestamps(diff: string): string {
  // Remove timestamps in the format: \t2025-01-29 12:34:56
  return diff.replace(/(\t\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})/g, '');
}

/**
 * Extract file path from diff header
 * Handles different path formats and returns the clean file path
 */
export function extractFilePathFromDiff(oldPath: string, newPath: string): string {
  // Handle file deletion - use old path
  if (newPath === '/dev/null') {
    return oldPath.replace(/^[ab]\//, '');
  }
  
  // Handle file creation - use new path
  if (oldPath === '/dev/null') {
    return newPath.replace(/^[ab]\//, '');
  }
  
  // Handle file modification - use new path (should be same as old path)
  return newPath.replace(/^[ab]\//, '');
}

/**
 * Check if a diff represents a file creation
 */
export function isFileCreation(oldPath: string): boolean {
  return oldPath === '/dev/null';
}

/**
 * Check if a diff represents a file deletion
 */
export function isFileDeletion(newPath: string): boolean {
  return newPath === '/dev/null';
}

/**
 * Count the number of changes in a diff
 */
export function countDiffChanges(diffContent: string): number {
  const lines = diffContent.split('\n');
  let changes = 0;
  
  for (const line of lines) {
    if (line.startsWith('+') && !line.startsWith('+++')) {
      changes++;
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      changes++;
    }
  }
  
  return changes;
}

/**
 * Ensure a diff ends with a newline character
 */
export function ensureDiffLineEnding(diff: string): string {
  if (diff === '') {
    return '\n';
  }
  return diff.endsWith('\n') ? diff : diff + '\n';
}

/**
 * Reverse (invert) a unified diff to undo the changes
 */
export function reverseDiff(diffContent: string, options?: ReverseDiffOptions): ReverseDiffResult {
  try {
    // Parse the diff into individual file diffs
    const fileDiffs = parseMultiFileDiff(diffContent);
    
    if (fileDiffs.length === 0) {
      return {
        success: false,
        reversedDiff: '',
        message: 'No valid file diffs found in the provided content',
        affectedFiles: []
      };
    }

    const reversedFileDiffs: string[] = [];
    const affectedFiles: string[] = [];
    const conflicts: string[] = [];

    for (const fileDiff of fileDiffs) {
      // Apply file filtering if specified
      const filePath = extractFilePathFromDiff(fileDiff.oldPath, fileDiff.newPath);
      
      if (options?.includeFiles && !options.includeFiles.some(f => filePath.includes(f))) {
        continue; // Skip files not in include list
      }
      
      if (options?.excludeFiles && options.excludeFiles.some(f => filePath.includes(f))) {
        continue; // Skip files in exclude list
      }

      const reversedFileDiff = reverseFileDiff(fileDiff);
      if (reversedFileDiff) {
        reversedFileDiffs.push(reversedFileDiff);
        affectedFiles.push(filePath);
      }
    }

    if (reversedFileDiffs.length === 0) {
      return {
        success: false,
        reversedDiff: '',
        message: 'No file diffs matched the filter criteria',
        affectedFiles: []
      };
    }

    const reversedDiff = reversedFileDiffs.join('');

    return {
      success: true,
      reversedDiff,
      message: `Successfully reversed ${reversedFileDiffs.length} file diff(s)`,
      affectedFiles,
      conflicts: conflicts.length > 0 ? conflicts : undefined
    };
  } catch (error: any) {
    return {
      success: false,
      reversedDiff: '',
      message: `Failed to reverse diff: ${error.message}`,
      affectedFiles: []
    };
  }
}

/**
 * Reverse a single file diff
 */
function reverseFileDiff(fileDiff: DiffParseResult): string {
  const lines = fileDiff.diffContent.split('\n');
  const reversedLines: string[] = [];
  
  let i = 0;
  
  // Process the diff line by line
  while (i < lines.length) {
    const line = lines[i];
    
    // Handle file headers
    if (line.startsWith('---')) {
      const nextLine = lines[i + 1];
      if (nextLine && nextLine.startsWith('+++')) {
        // Reverse file headers
        const oldPath = fileDiff.oldPath;
        const newPath = fileDiff.newPath;
        
        // Handle file creation/deletion reversal
        if (oldPath === '/dev/null') {
          // Original was file creation, reverse is file deletion
          const filePath = extractFilePathFromDiff('', newPath);
          reversedLines.push(`--- a/${filePath}`);
          reversedLines.push(`+++ /dev/null`);
        } else if (newPath === '/dev/null') {
          // Original was file deletion, reverse is file creation
          const filePath = extractFilePathFromDiff(oldPath, newPath); // Use the deletion logic
          reversedLines.push(`--- /dev/null`);
          reversedLines.push(`+++ b/${filePath}`);
        } else {
          // Regular file modification - just swap old and new
          reversedLines.push(`--- ${newPath.replace('b/', 'a/')}`);
          reversedLines.push(`+++ ${oldPath.replace('a/', 'b/')}`);
        }
        
        i += 2; // Skip both header lines
        continue;
      }
    }
    
    // Handle hunk headers
    if (line.startsWith('@@')) {
      const hunkHeader = reverseHunkHeader(line);
      if (hunkHeader) {
        reversedLines.push(hunkHeader);
      }
      i++;
      continue;
    }
    
    // Handle content lines
    if (line.startsWith('+')) {
      // Addition becomes deletion
      reversedLines.push('-' + line.substring(1));
    } else if (line.startsWith('-')) {
      // Deletion becomes addition
      reversedLines.push('+' + line.substring(1));
    } else if (line.startsWith(' ') || line === '') {
      // Context lines and empty lines remain unchanged
      reversedLines.push(line);
    } else {
      // Unknown line type, keep as is
      reversedLines.push(line);
    }
    
    i++;
  }
  
  // Ensure the diff ends with a newline
  const result = reversedLines.join('\n');
  return result.endsWith('\n') ? result : result + '\n';
}

/**
 * Reverse a hunk header by swapping old and new line counts
 */
function reverseHunkHeader(hunkLine: string): string {
  // Pattern: @@ -oldStart,oldCount +newStart,newCount @@
  const hunkMatch = hunkLine.match(/^@@\s*-(\d+)(?:,(\d+))?\s*\+(\d+)(?:,(\d+))?\s*@@(.*)$/);
  
  if (!hunkMatch) {
    return hunkLine; // Return as-is if we can't parse it
  }
  
  const [, oldStart, oldCount = '1', newStart, newCount = '1', context] = hunkMatch;
  
  // Swap old and new positions
  return `@@ -${newStart},${newCount} +${oldStart},${oldCount} @@${context}`;
}

/**
 * Add file hashes to an existing diff (for Git compatibility)
 */
export function addFileHashesToDiff(diffContent: string, oldContent?: string, newContent?: string): string {
  const lines = diffContent.split('\n');
  const result: string[] = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Check for file headers
    if (line.startsWith('--- ') && i + 1 < lines.length && lines[i + 1].startsWith('+++ ')) {
      const oldPath = line.substring(4);
      const newPath = lines[i + 1].substring(4);
      
      // Generate hashes if content is provided
      let oldHash = '0000000';
      let newHash = '0000000';
      
      if (oldContent !== undefined && newContent !== undefined) {
        oldHash = calculateFileHash(oldContent);
        newHash = calculateFileHash(newContent);
      }
      
      // Add git diff header
      result.push(`diff --git ${oldPath} ${newPath}`);
      result.push(`index ${oldHash}..${newHash} 100644`);
      result.push(line); // --- line
      result.push(lines[i + 1]); // +++ line
      
      i++; // Skip the +++ line since we already processed it
    } else {
      result.push(line);
    }
  }
  
  return result.join('\n');
}

/**
 * Merge multiple diffs into a single unified diff
 * This is the main entry point for diff merging operations
 */
export function mergeDiffs(diffs: string[], options: DiffMergeOptions = {}): DiffMergeResult {
  if (diffs.length === 0) {
    return {
      success: true,
      mergedDiff: '',
      filesProcessed: 0
    };
  }

  if (diffs.length === 1) {
    // 🆕 即使是单个 diff，也要通过解析和重构来处理 Git headers
    try {
      const fileDiffs = parseDetailedMultiFileDiff(diffs[0]);
      if (fileDiffs.length === 0) {
        return {
          success: false,
          mergedDiff: '',
          conflicts: [{
            filePath: 'unknown',
            type: 'inconsistent_headers',
            description: 'Failed to parse diff: No valid file diffs found'
          }],
          filesProcessed: 0
        };
      }
      
      const mergedFileDiffs = fileDiffs.map(fileDiff => reconstructFileDiff(fileDiff, options));
      return {
        success: true,
        mergedDiff: ensureDiffLineEnding(mergedFileDiffs.join('')),
        filesProcessed: fileDiffs.length
      };
    } catch (error) {
      return {
        success: false,
        mergedDiff: '',
        conflicts: [{
          filePath: 'unknown',
          type: 'inconsistent_headers',
          description: `Failed to parse diff: ${error instanceof Error ? error.message : 'Unknown error'}`
        }],
        filesProcessed: 0
      };
    }
  }

  try {
    // Parse all diffs and group by file
    const fileGroups = new Map<string, FileDiffInfo[]>();
    const conflicts: DiffConflict[] = [];
    const warnings: string[] = [];
    let totalFilesProcessed = 0;

    for (const diff of diffs) {
      if (!diff.trim()) continue;

      try {
        const fileDiffs = parseDetailedMultiFileDiff(diff);
        
        // 🆕 如果解析失败（没有找到有效的文件 diff），处理为 malformed diff
        if (fileDiffs.length === 0) {
          warnings.push(`Failed to parse diff: No valid file diffs found`);
          
          if (options.conflictResolution === 'fail') {
            conflicts.push({
              filePath: 'unknown',
              type: 'inconsistent_headers',
              description: 'Failed to parse diff: No valid file diffs found'
            });
          } else if (options.conflictResolution === 'concatenate') {
            // 在 concatenate 模式下，将原始 diff 作为 fallback
            // 但这里我们跳过，因为无法正确解析
            continue;
          }
          continue;
        }
        
        totalFilesProcessed += fileDiffs.length;

        for (const fileDiff of fileDiffs) {
          if (!fileGroups.has(fileDiff.filePath)) {
            fileGroups.set(fileDiff.filePath, []);
          }
          fileGroups.get(fileDiff.filePath)!.push(fileDiff);
        }
      } catch (error) {
        warnings.push(`Failed to parse diff: ${error instanceof Error ? error.message : 'Unknown error'}`);
        
        if (options.conflictResolution === 'fail') {
          conflicts.push({
            filePath: 'unknown',
            type: 'inconsistent_headers',
            description: `Failed to parse diff: ${error instanceof Error ? error.message : 'Unknown error'}`
          });
        }
      }
    }

    // 🆕 如果有 conflicts 且是 fail 模式，立即返回失败
    if (conflicts.length > 0 && options.conflictResolution === 'fail') {
      return {
        success: false,
        mergedDiff: '',
        conflicts,
        warnings: warnings.length > 0 ? warnings : undefined,
        filesProcessed: totalFilesProcessed
      };
    }

    // Merge diffs for each file
    const mergedFileDiffs: string[] = [];

    for (const [filePath, fileDiffs] of fileGroups) {
      if (fileDiffs.length === 1) {
        // Single diff for this file, use as-is
        mergedFileDiffs.push(reconstructFileDiff(fileDiffs[0], options));
      } else {
        // Multiple diffs for the same file, need to merge
        const mergeResult = mergeFileDiffs(filePath, fileDiffs, options);
        
        if (!mergeResult.success) {
          conflicts.push(...(mergeResult.conflicts || []));
          
          if (options.conflictResolution === 'fail') {
            return {
              success: false,
              mergedDiff: '',
              conflicts,
              warnings,
              filesProcessed: totalFilesProcessed
            };
          } else if (options.conflictResolution === 'skip') {
            warnings.push(`Skipped file ${filePath} due to merge conflicts`);
            continue;
          }
          // 'concatenate' mode falls through to add the result anyway
        }
        
        mergedFileDiffs.push(mergeResult.mergedDiff);
      }
    }

    const finalDiff = mergedFileDiffs.join('');
    
    return {
      success: conflicts.length === 0 || options.conflictResolution !== 'fail',
      mergedDiff: ensureDiffLineEnding(finalDiff),
      conflicts: conflicts.length > 0 ? conflicts : undefined,
      warnings: warnings.length > 0 ? warnings : undefined,
      filesProcessed: totalFilesProcessed
    };

  } catch (error) {
    return {
      success: false,
      mergedDiff: '',
      conflicts: [{
        filePath: 'unknown',
        type: 'inconsistent_headers',
        description: `Merge operation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      }],
      filesProcessed: 0
    };
  }
}

/**
 * Parse a multi-file diff with detailed information extraction
 */
function parseDetailedMultiFileDiff(diffContent: string): FileDiffInfo[] {
  const fileDiffs: FileDiffInfo[] = [];
  const lines = diffContent.split('\n');
  
  let i = 0;
  // 🆕 添加安全计数器防止无限循环
  let safetyCounter = 0;
  const maxIterations = lines.length + 10; // 安全上限
  
  while (i < lines.length && safetyCounter < maxIterations) {
    safetyCounter++;
    const previousIndex = i; // 记录之前的索引
    
    const fileDiff = parseFileDiff(lines, i);
    if (fileDiff.fileDiff) {
      fileDiffs.push(fileDiff.fileDiff);
    }
    i = fileDiff.nextIndex;
    
    // 🆕 确保索引有前进，防止无限循环
    if (i <= previousIndex) {
      console.warn(`parseDetailedMultiFileDiff: Index not advancing at line ${i}, forcing increment`);
      i = previousIndex + 1;
    }
  }
  
  // 🆕 如果达到安全计数器上限，记录警告
  if (safetyCounter >= maxIterations) {
    console.warn(`parseDetailedMultiFileDiff: Safety counter reached. Possible infinite loop prevented.`);
  }
  
  return fileDiffs;
}

/**
 * Parse a single file diff starting from a given line index
 */
function parseFileDiff(lines: string[], startIndex: number): { fileDiff: FileDiffInfo | null; nextIndex: number } {
  let i = startIndex;
  let gitHeader: string | undefined;
  let indexLine: string | undefined;
  let oldPath = '';
  let newPath = '';
  const hunks: ParsedHunk[] = [];
  
  // Skip empty lines
  while (i < lines.length && lines[i].trim() === '') {
    i++;
  }
  
  if (i >= lines.length) {
    return { fileDiff: null, nextIndex: i };
  }
  
  // Check for git header
  if (lines[i].startsWith('diff --git ')) {
    gitHeader = lines[i];
    i++;
    
    // Check for index line
    if (i < lines.length && lines[i].startsWith('index ')) {
      indexLine = lines[i];
      i++;
    }
  }
  
  // Look for file headers
  if (i < lines.length && lines[i].startsWith('--- ')) {
    oldPath = lines[i].substring(4).trim();
    i++;
    
    if (i < lines.length && lines[i].startsWith('+++ ')) {
      newPath = lines[i].substring(4).trim();
      i++;
    } else {
      // Invalid diff format
      return { fileDiff: null, nextIndex: i };
    }
  } else {
    // No file headers found
    return { fileDiff: null, nextIndex: i };
  }
  
  // Parse hunks
  // 🆕 添加安全计数器防止无限循环
  let safetyCounter = 0;
  const maxIterations = lines.length + 10; // 安全上限
  
  while (i < lines.length && safetyCounter < maxIterations) {
    safetyCounter++;
    const previousIndex = i; // 记录之前的索引
    
    if (lines[i].startsWith('@@')) {
      const hunkResult = parseHunk(lines, i);
      if (hunkResult.hunk) {
        hunks.push(hunkResult.hunk);
      }
      i = hunkResult.nextIndex;
    } else if (lines[i].startsWith('diff --git ') || 
               (lines[i].startsWith('--- ') && i + 1 < lines.length && lines[i + 1].startsWith('+++ '))) {
      // Start of next file diff
      break;
    } else {
      i++;
    }
    
    // 🆕 确保索引有前进，防止无限循环
    if (i <= previousIndex) {
      console.warn(`parseFileDiff: Index not advancing at line ${i}, forcing increment`);
      i = previousIndex + 1;
    }
  }
  
  // 🆕 如果达到安全计数器上限，记录警告
  if (safetyCounter >= maxIterations) {
    console.warn(`parseFileDiff: Safety counter reached. Possible infinite loop prevented.`);
  }
  
  const filePath = extractFilePathFromDiff(oldPath, newPath);
  const isCreation = isFileCreation(oldPath);
  const isDeletion = isFileDeletion(newPath);
  
  const fileDiff: FileDiffInfo = {
    filePath,
    oldPath,
    newPath,
    gitHeader,
    indexLine,
    hunks,
    isCreation,
    isDeletion
  };
  
  return { fileDiff, nextIndex: i };
}

/**
 * Parse a single hunk starting from a given line index
 */
function parseHunk(lines: string[], startIndex: number): { hunk: ParsedHunk | null; nextIndex: number } {
  let i = startIndex;
  
  if (i >= lines.length || !lines[i].startsWith('@@')) {
    return { hunk: null, nextIndex: i };
  }
  
  const header = lines[i];
  const hunkMatch = header.match(/^@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s+@@/);
  
  if (!hunkMatch) {
    return { hunk: null, nextIndex: i + 1 };
  }
  
  const oldStart = parseInt(hunkMatch[1]);
  const oldCount = parseInt(hunkMatch[2] || '1');
  const newStart = parseInt(hunkMatch[3]);
  const newCount = parseInt(hunkMatch[4] || '1');
  
  i++; // Move past hunk header
  
  const hunkLines: string[] = [];
  let processedOldLines = 0;
  let processedNewLines = 0;
  
  // 🆕 添加安全计数器防止无限循环
  let safetyCounter = 0;
  const maxIterations = lines.length * 2; // 安全上限
  
  while (i < lines.length && safetyCounter < maxIterations) {
    safetyCounter++;
    
    // 🆕 改进退出条件：如果已经处理完所有预期的行，就退出
    if (processedOldLines >= oldCount && processedNewLines >= newCount) {
      break;
    }
    
    const line = lines[i];
    
    if (line.startsWith(' ')) {
      // Context line
      processedOldLines++;
      processedNewLines++;
      hunkLines.push(line);
    } else if (line.startsWith('-')) {
      // Removed line
      processedOldLines++;
      hunkLines.push(line);
    } else if (line.startsWith('+')) {
      // Added line
      processedNewLines++;
      hunkLines.push(line);
    } else if (line.startsWith('\\')) {
      // "No newline at end of file" marker
      hunkLines.push(line);
    } else if (line.startsWith('@@') || line.startsWith('diff --git ') || 
               (line.startsWith('--- ') && i + 1 < lines.length && lines[i + 1].startsWith('+++ '))) {
      // Start of next hunk or file
      break;
    } else if (line.trim() === '') {
      // Empty line might indicate end of hunk
      if (processedOldLines >= oldCount && processedNewLines >= newCount) {
        break;
      }
      hunkLines.push(line);
    } else {
      // 🆕 改进未知行处理：如果已经处理了足够的行，就停止
      if (processedOldLines >= oldCount && processedNewLines >= newCount) {
        break;
      }
      // Unknown line, include it but continue
      hunkLines.push(line);
    }
    
    i++;
  }
  
  // 🆕 如果达到安全计数器上限，记录警告
  if (safetyCounter >= maxIterations) {
    console.warn(`parseHunk: Safety counter reached for hunk starting at line ${startIndex}. Possible infinite loop prevented.`);
  }
  
  const hunk: ParsedHunk = {
    header,
    oldStart,
    oldCount,
    newStart,
    newCount,
    lines: hunkLines
  };
  
  return { hunk, nextIndex: i };
}

/**
 * Merge multiple diffs for the same file
 */
function mergeFileDiffs(filePath: string, fileDiffs: FileDiffInfo[], options: DiffMergeOptions): DiffMergeResult {
  if (fileDiffs.length === 0) {
    return {
      success: true,
      mergedDiff: '',
      filesProcessed: 0
    };
  }

  if (fileDiffs.length === 1) {
    return {
      success: true,
      mergedDiff: reconstructFileDiff(fileDiffs[0], options),
      filesProcessed: 1
    };
  }

  const conflicts: DiffConflict[] = [];
  const warnings: string[] = [];

  // Validate file path consistency
  const firstDiff = fileDiffs[0];
  for (let i = 1; i < fileDiffs.length; i++) {
    if (fileDiffs[i].filePath !== firstDiff.filePath) {
      conflicts.push({
        filePath,
        type: 'inconsistent_headers',
        description: `File path mismatch: ${firstDiff.filePath} vs ${fileDiffs[i].filePath}`
      });
    }
  }

  // Collect all hunks and sort by position
  const allHunks: { hunk: ParsedHunk; sourceIndex: number }[] = [];
  
  for (let i = 0; i < fileDiffs.length; i++) {
    for (const hunk of fileDiffs[i].hunks) {
      allHunks.push({ hunk, sourceIndex: i });
    }
  }

  // Sort hunks by old file position
  allHunks.sort((a, b) => a.hunk.oldStart - b.hunk.oldStart);

  // Detect overlapping hunks
  for (let i = 0; i < allHunks.length - 1; i++) {
    const current = allHunks[i].hunk;
    const next = allHunks[i + 1].hunk;
    
    const currentEnd = current.oldStart + current.oldCount - 1;
    const nextStart = next.oldStart;
    
    if (currentEnd >= nextStart) {
      conflicts.push({
        filePath,
        type: 'overlapping_hunks',
        description: `Overlapping hunks detected: lines ${current.oldStart}-${currentEnd} and ${nextStart}-${next.oldStart + next.oldCount - 1}`,
        affectedHunks: [
          {
            oldStart: current.oldStart,
            oldCount: current.oldCount,
            newStart: current.newStart,
            newCount: current.newCount,
            content: current.lines
          },
          {
            oldStart: next.oldStart,
            oldCount: next.oldCount,
            newStart: next.newStart,
            newCount: next.newCount,
            content: next.lines
          }
        ]
      });
    }
  }

  // If we have conflicts and strict mode, fail
  if (conflicts.length > 0 && options.conflictResolution === 'fail') {
    return {
      success: false,
      mergedDiff: '',
      conflicts,
      warnings,
      filesProcessed: 0
    };
  }

  // Build merged diff
  const mergedDiff: FileDiffInfo = {
    filePath: firstDiff.filePath,
    oldPath: firstDiff.oldPath,
    newPath: firstDiff.newPath,
    gitHeader: options.preserveGitHeaders ? firstDiff.gitHeader : undefined,
    indexLine: options.preserveGitHeaders ? firstDiff.indexLine : undefined,
    hunks: allHunks.map(item => item.hunk),
    isCreation: firstDiff.isCreation,
    isDeletion: firstDiff.isDeletion
  };

  return {
    success: conflicts.length === 0,
    mergedDiff: reconstructFileDiff(mergedDiff, options),
    conflicts: conflicts.length > 0 ? conflicts : undefined,
    warnings: warnings.length > 0 ? warnings : undefined,
    filesProcessed: 1
  };
}

/**
 * Reconstruct a diff string from parsed FileDiffInfo
 */
function reconstructFileDiff(fileDiff: FileDiffInfo, options: DiffMergeOptions): string {
  const lines: string[] = [];
  
  // Add Git headers if requested and available
  if (options.preserveGitHeaders && fileDiff.gitHeader) {
    lines.push(fileDiff.gitHeader);
    
    if (fileDiff.indexLine) {
      lines.push(fileDiff.indexLine);
    }
  }
  
  // Add file headers
  lines.push(`--- ${fileDiff.oldPath}`);
  lines.push(`+++ ${fileDiff.newPath}`);
  
  // Add hunks
  for (const hunk of fileDiff.hunks) {
    lines.push(hunk.header);
    lines.push(...hunk.lines);
  }
  
  return lines.join('\n') + '\n';
} 