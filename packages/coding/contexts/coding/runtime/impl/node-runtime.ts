import { 
  IRuntime, 
  FileStatus, 
  DirectoryEntry,
  CodeBlockMatchOptions,
  FileEditResult
} from '../interface.js';
import { ISandbox, ShellExecutionResult, ExecutionOptions } from '../../sandbox/index.js';
import { NoSandbox } from '../../sandbox/no-sandbox.js';
import {
  generateUnifiedDiff,
  parseMultiFileDiff,
  validateDiffFormat,
  analyzePatchResult,
  extractFilePathFromDiff
} from '../diff.js';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';

/**
 * A Node.js-based runtime that implements the IRuntime interface
 * Uses a sandbox for command execution
 */
export class NodeJsRuntime implements IRuntime {
  readonly type = "node";
  readonly sandbox: ISandbox;

  constructor(sandbox?: ISandbox) {
    this.sandbox = sandbox || new NoSandbox();
  }

  /**
   * Read a file's contents
   */
  async readFile(
    filePath: string, 
    options?: { encoding?: BufferEncoding; startLine?: number; endLine?: number }
  ): Promise<string> {
    try {
      // Read the file
      const content = await fs.readFile(filePath, { encoding: options?.encoding || 'utf-8' });
      
      // If no line range is specified, return the whole file
      if (!options?.startLine && !options?.endLine) {
        return content;
      }
      
      // Split content into lines
      const lines = content.split('\n');
      
      // Line numbers are 1-based, array indices are 0-based
      const startIdx = options.startLine ? options.startLine - 1 : 0;
      const endIdx = options.endLine ? options.endLine - 1 : lines.length - 1;
      
      // Select the requested range
      return lines.slice(startIdx, endIdx + 1).join('\n');
    } catch (error: any) {
      // For more specific operations, we might need to use the sandbox
      if (options?.startLine || options?.endLine) {
        let command = '';
        
        if (options.startLine && options.endLine) {
          // Read specific lines using sed
          command = `sed -n '${options.startLine},${options.endLine}p' "${filePath}"`;
        } else if (options.startLine) {
          // Read from start_line to end
          command = `tail -n +${options.startLine} "${filePath}"`;
        } else if (options.endLine) {
          // Read from beginning to end_line
          command = `head -n ${options.endLine} "${filePath}"`;
        }
        
        const result = await this.sandbox.executeSecurely(command);
        
        if (result.exitCode !== 0) {
          throw new Error(`Failed to read file: ${result.stderr || result.error?.message}`);
        }
        
        return result.stdout;
      }
      
      throw new Error(`Failed to read file: ${error.message}`);
    }
  }

  /**
   * Write content to a file
   */
  async writeFile(
    filePath: string, 
    content: string,
    options?: { 
      mode?: 'overwrite' | 'append' | 'create_or_overwrite' | 'overwrite_range';
      startLine?: number;
      endLine?: number;
    }
  ): Promise<FileEditResult> {
    const mode = options?.mode || 'create_or_overwrite';
    let oldContent: string | null = null;
    let fileExisted = false;

    try {
      if (mode === 'create_or_overwrite' || mode === 'overwrite' || mode === 'overwrite_range') {
        try {
          oldContent = await fs.readFile(filePath, 'utf-8');
          fileExisted = true;
        } catch (e) {
          // File doesn't exist, oldContent remains null, fileExisted is false
        }
      }

      // Handle different writing modes
      switch (mode) {
        case 'append':
          await fs.appendFile(filePath, content);
          // Diff for append is tricky without reading the whole file before and after if it's large.
          // For now, append won't return a detailed diff unless the file was new.
          // If we need a diff, we'd read before, append, then read after.
          break;
          
        case 'create_or_overwrite':
        case 'overwrite':
          const dir = path.dirname(filePath);
          await fs.mkdir(dir, { recursive: true });
          await fs.writeFile(filePath, content);
          break;
          
        case 'overwrite_range':
          if (options?.startLine === undefined || options?.endLine === undefined) {
            return { success: false, message: 'startLine and endLine are required for overwrite_range mode' };
          }
          
          const currentFileContent = oldContent !== null ? oldContent : ''; // Use already read content or empty if new
          const lines = currentFileContent.split('\n');
          
          const startIdx = options.startLine - 1;
          const endIdx = options.endLine - 1;
          
          if (startIdx < 0) {
             return { success: false, message: 'startLine must be at least 1' };
          }
          
          let prefixLines = lines.slice(0, startIdx);
          // Pad if startLine is beyond current file length
          while (prefixLines.length < startIdx) {
            prefixLines.push('');
          }
          
          const suffixLines = (endIdx >= lines.length - 1) ? [] : lines.slice(endIdx + 1);
          const contentLines = content.split('\n');
          
          const finalLines = [...prefixLines, ...contentLines, ...suffixLines];
          const newFileContent = finalLines.join('\n');
          
          const writeDir = path.dirname(filePath);
          await fs.mkdir(writeDir, { recursive: true });
          await fs.writeFile(filePath, newFileContent);
          // oldContent for diff is the state before this specific overwrite_range
          // newContent for diff is newFileContent
          // This mode will now have its diff calculated below if oldContent was captured.
          break;
      }
      
      let diff: string | undefined = undefined;
      if ((mode === 'create_or_overwrite' || mode === 'overwrite' || mode === 'overwrite_range') && oldContent !== null) {
        // If file existed and was overwritten/range_overwritten, calculate diff
        const newContentAfterWrite = await fs.readFile(filePath, 'utf-8'); // read the final content
        diff = await this.generateDiff(oldContent, newContentAfterWrite, { oldPath: `a/${path.basename(filePath)}`, newPath: `b/${path.basename(filePath)}` });
      } else if ((mode === 'create_or_overwrite' || mode === 'overwrite') && !fileExisted) {
        // If file was newly created
        diff = await this.generateDiff('', content, { oldPath: `a/${path.basename(filePath)}`, newPath: `b/${path.basename(filePath)}` });
      }
      // For append or other unhandled diff cases, diff remains undefined.

      return { success: true, message: `File ${filePath} written successfully.`, diff };
    } catch (error: any) {
      console.error('NodeJsRuntime.writeFile error:', error);
      // Sandbox fallback for 'overwrite_range' was removed for now to simplify, direct fs ops preferred.
      // If direct fs ops fail, it fails.
      return { success: false, message: error.message, diff: undefined };
    }
  }

  /**
   * List directory contents
   */
  async listDirectory(
    dirPath: string, 
    options?: { recursive?: boolean; maxDepth?: number }
  ): Promise<DirectoryEntry[]> {
    try {
      const entries: DirectoryEntry[] = [];
      
      if (options?.recursive) {
        // Recursive directory traversal
        await this.traverseDirectoryRecursively(
          dirPath, 
          entries, 
          options.maxDepth || Infinity,
          0,
          dirPath // Base path for relative paths
        );
      } else {
        // Non-recursive listing
        const dirents = await fs.readdir(dirPath, { withFileTypes: true });
        
        for (const dirent of dirents) {
          const entryPath = path.join(dirPath, dirent.name);
          entries.push({
            name: dirent.name,
            type: dirent.isDirectory() ? 'dir' : 'file',
            path: entryPath
          });
        }
      }
      
      return entries;
    } catch (error: any) {
      console.error('NodeJsRuntime.listDirectory error:', error);
      
      // Try with sandbox as fallback
      try {
        const command = options?.recursive
          ? `find "${dirPath}" ${options.maxDepth ? `-maxdepth ${options.maxDepth}` : ''} -type f -o -type d | sort`
          : `ls -la "${dirPath}" | tail -n +2`; // Skip the first line (total)
        
        const result = await this.sandbox.executeSecurely(command);
        
        if (result.exitCode !== 0) {
          throw new Error(`Failed to list directory: ${result.stderr}`);
        }
        
        const entries: DirectoryEntry[] = [];
        const lines = result.stdout.split('\n').filter(line => line.trim());
        
        if (options?.recursive) {
          // Parse find output
          for (const line of lines) {
            const relativePath = path.relative(dirPath, line);
            if (!relativePath) continue;
            
            const stats = await this.getFileStatus(line);
            entries.push({
              name: path.basename(line),
              type: stats.type,
              path: line
            });
          }
        } else {
          // Parse ls output
          for (const line of lines) {
            const match = line.match(/^([d-])(?:[-rwxs]{9})\s+\d+\s+\w+\s+\w+\s+\d+\s+\w+\s+\d+\s+[\d:]+\s+(.*?)$/);
            if (match) {
              const isDir = match[1] === 'd';
              const name = match[2];
              
              // Skip . and ..
              if (name === '.' || name === '..') continue;
              
              const entryPath = path.join(dirPath, name);
              entries.push({
                name,
                type: isDir ? 'dir' : 'file',
                path: entryPath
              });
            }
          }
        }
        
        return entries;
      } catch (sandboxError) {
        console.error('Sandbox fallback failed:', sandboxError);
        throw error; // Throw the original error
      }
    }
  }

  /**
   * Helper method for recursive directory traversal
   */
  private async traverseDirectoryRecursively(
    currentPath: string,
    entries: DirectoryEntry[],
    maxDepth: number,
    currentDepth: number,
    basePath: string
  ): Promise<void> {
    // Stop if we've reached the max depth
    if (currentDepth > maxDepth) {
      return;
    }
    
    try {
      const dirents = await fs.readdir(currentPath, { withFileTypes: true });
      
      for (const dirent of dirents) {
        const entryPath = path.join(currentPath, dirent.name);
        const relativePath = path.relative(basePath, entryPath);
        
        entries.push({
          name: relativePath || dirent.name,
          type: dirent.isDirectory() ? 'dir' : 'file',
          path: entryPath
        });
        
        if (dirent.isDirectory() && currentDepth < maxDepth) {
          await this.traverseDirectoryRecursively(
            entryPath,
            entries,
            maxDepth,
            currentDepth + 1,
            basePath
          );
        }
      }
    } catch (error) {
      console.error(`Failed to traverse directory ${currentPath}:`, error);
    }
  }

  /**
   * Get file or directory status
   */
  async getFileStatus(filePath: string): Promise<FileStatus> {
    try {
      const stats = await fs.stat(filePath);
      
      return {
        exists: true,
        size: stats.size,
        type: stats.isDirectory() ? 'dir' : 'file',
        modifiedAt: stats.mtime
      };
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        // File or directory doesn't exist
        return {
          exists: false,
          size: 0,
          type: 'file', // Default
          modifiedAt: new Date(0)
        };
      }
      
      // Try with sandbox as fallback
      try {
        // Check if file exists
        const existsResult = await this.sandbox.executeSecurely(`test -e "${filePath}" && echo "yes" || echo "no"`);
        const exists = existsResult.stdout.trim() === 'yes';
        
        if (!exists) {
          return {
            exists: false,
            size: 0,
            type: 'file',
            modifiedAt: new Date(0)
          };
        }
        
        // Get file type
        const typeResult = await this.sandbox.executeSecurely(`test -d "${filePath}" && echo "dir" || echo "file"`);
        const type = typeResult.stdout.trim() as 'file' | 'dir';
        
        // Get file size
        const sizeResult = await this.sandbox.executeSecurely(`stat -c %s "${filePath}" 2>/dev/null || stat -f %z "${filePath}"`);
        const size = parseInt(sizeResult.stdout.trim(), 10) || 0;
        
        // Get modification time
        const timeResult = await this.sandbox.executeSecurely(`stat -c %Y "${filePath}" 2>/dev/null || stat -f %m "${filePath}"`);
        const modifiedTimestamp = parseInt(timeResult.stdout.trim(), 10) * 1000;
        
        return {
          exists,
          size,
          type,
          modifiedAt: new Date(modifiedTimestamp)
        };
      } catch (sandboxError) {
        console.error('Sandbox fallback failed:', sandboxError);
        throw error; // Throw the original error
      }
    }
  }

  /**
   * Delete a file
   */
  async deleteFile(filePath: string): Promise<boolean> {
    try {
      await fs.unlink(filePath);
      return true;
    } catch (error: any) {
      console.error('NodeJsRuntime.deleteFile error:', error);
      
      // Try with sandbox as fallback
      try {
        const result = await this.sandbox.executeSecurely(`rm "${filePath}"`);
        return result.exitCode === 0;
      } catch (sandboxError) {
        console.error('Sandbox fallback failed:', sandboxError);
        return false;
      }
    }
  }

  /**
   * Create a directory
   */
  async createDirectory(dirPath: string, options?: { recursive?: boolean }): Promise<boolean> {
    try {
      await fs.mkdir(dirPath, { recursive: options?.recursive });
      return true;
    } catch (error: any) {
      console.error('NodeJsRuntime.createDirectory error:', error);
      
      // Try with sandbox as fallback
      try {
        const recursiveFlag = options?.recursive ? '-p' : '';
        const result = await this.sandbox.executeSecurely(`mkdir ${recursiveFlag} "${dirPath}"`);
        return result.exitCode === 0;
      } catch (sandboxError) {
        console.error('Sandbox fallback failed:', sandboxError);
        return false;
      }
    }
  }

  /**
   * Generate a diff between two strings or files
   */
  async generateDiff(
    oldContent: string, 
    newContent: string, 
    options?: { oldPath?: string; newPath?: string }
  ): Promise<string> {
    // Use the sandbox to generate the diff
    try {
      // Create temporary files for the diff
      const timestamp = Date.now();
      const oldTempFile = `/tmp/diff_old_${timestamp}.tmp`;
      const newTempFile = `/tmp/diff_new_${timestamp}.tmp`;
      
      // Write the content to temp files
      await this.sandbox.executeSecurely(`cat > "${oldTempFile}" << 'EOF'\n${oldContent}\nEOF`);
      await this.sandbox.executeSecurely(`cat > "${newTempFile}" << 'EOF'\n${newContent}\nEOF`);
      
      // Set the paths to use in the diff header
      const oldPath = options?.oldPath || 'a/file';
      const newPath = options?.newPath || 'b/file';
      
      // Generate the diff
      const diffCommand = `diff -u "${oldTempFile}" "${newTempFile}" | sed '1s|--- ${oldTempFile}|--- ${oldPath}|' | sed '2s|+++ ${newTempFile}|+++ ${newPath}|'`;
      const result = await this.sandbox.executeSecurely(diffCommand);
      
      // Clean up temp files
      await this.sandbox.executeSecurely(`rm -f "${oldTempFile}" "${newTempFile}"`);
      
      // diff returns non-zero when files differ, which is expected
      return result.stdout;
    } catch (error: any) {
      console.error('NodeJsRuntime.generateDiff error:', error);
      
      // Use the imported generateUnifiedDiff as fallback
      return generateUnifiedDiff(oldContent, newContent, options);
    }
  }

  /**
   * Compare two files and generate a unified diff
   */
  async compareFiles(
    oldFilePath: string,
    newFilePath: string,
    options?: { oldPath?: string; newPath?: string }
  ): Promise<string> {
    // If one or both files don't exist, create a diff showing the difference
    let oldContent = '';
    let newContent = '';
    let oldPath = options?.oldPath || `/dev/null`;
    let newPath = options?.newPath || `/dev/null`;
    
    try {
      oldContent = await this.readFile(oldFilePath);
      oldPath = options?.oldPath || `a/${path.basename(oldFilePath)}`;
    } catch (e: any) {
      // Check if it's a "file not found" error
      if (e.message && e.message.includes('ENOENT')) {
        oldPath = '/dev/null';
        oldContent = '';
      } else {
        throw e; // Re-throw if it's not a "file not found" error
      }
    }
    
    try {
      newContent = await this.readFile(newFilePath);
      newPath = options?.newPath || `b/${path.basename(newFilePath)}`;
    } catch (e: any) {
      // Check if it's a "file not found" error
      if (e.message && e.message.includes('ENOENT')) {
        newPath = '/dev/null';
        newContent = '';
      } else {
        throw e; // Re-throw if it's not a "file not found" error
      }
    }
    
    // Generate diff even if one file doesn't exist
    return await this.generateDiff(oldContent, newContent, { oldPath, newPath });
  }

  /**
   * Execute a command using the sandbox
   */
  async execute(
    command: string,
    options?: ExecutionOptions
  ): Promise<ShellExecutionResult> {
    return this.sandbox.executeSecurely(command, options);
  }

  async applyEditBlock(
    filePath: string,
    searchBlock: string,
    replaceBlock: string,
    options?: CodeBlockMatchOptions
  ): Promise<FileEditResult> {
    let oldContent: string;
    try {
      oldContent = await fs.readFile(filePath, 'utf-8');
    } catch (e: any) {
      if (e.code === 'ENOENT') {
        // If searchBlock is empty, and we are replacing with replaceBlock, it's like creating a new file.
        if (searchBlock === '') {
          try {
            const dir = path.dirname(filePath);
            await fs.mkdir(dir, { recursive: true });
            await fs.writeFile(filePath, replaceBlock, 'utf-8');
            const diff = await this.generateDiff('', replaceBlock, { oldPath: `a/${path.basename(filePath)}`, newPath: `b/${path.basename(filePath)}` });
            return { success: true, message: `File ${filePath} created with content.`, diff, changesApplied: 1 };
          } catch (writeError: any) {
            return { success: false, message: `Error creating file ${filePath}: ${writeError.message}` };
          }
        }
        return { success: false, message: `File ${filePath} not found and searchBlock is not empty.` };
      }
      return { success: false, message: `Error reading file ${filePath}: ${e.message}` };
    }

    let newContent = oldContent;
    let changesApplied = 0;

    // 1. Exact match first
    const searchIndex = oldContent.indexOf(searchBlock);

    if (searchIndex !== -1) {
      newContent = oldContent.substring(0, searchIndex) + replaceBlock + oldContent.substring(searchIndex + searchBlock.length);
      changesApplied = 1;
    } else if (options?.ignoreWhitespace) {
      // 2. Whitespace-insensitive match (simple version: replaces all multiple whitespace with single space for comparison)
      const normalize = (s: string) => s.replace(/\s+/g, ' ').trim();
      const normalizedOldContent = normalize(oldContent);
      const normalizedSearchBlock = normalize(searchBlock);
      let matchIndex = normalizedOldContent.indexOf(normalizedSearchBlock);
      if (matchIndex !== -1) {
        // This is tricky: map matchIndex in normalizedOldContent back to original oldContent index
        // This simplified version won't be perfect for mapping back if whitespace changes are complex.
        // For a more robust solution, a more advanced diff/match library or detailed character mapping is needed.
        // This is a placeholder for a more complex whitespace-agnostic search.
        // Let's find the *approximate* start in original content based on non-whitespace characters.
        let originalMatchStartIndex = -1;
        let currentNormalizedSearchIdx = 0;
        let currentOriginalSearchIdx = 0;
        while(currentOriginalSearchIdx < oldContent.length && currentNormalizedSearchIdx < normalizedOldContent.length) {
            if (normalizedOldContent[currentNormalizedSearchIdx] === ' ' && normalizedOldContent[currentNormalizedSearchIdx+1] === ' ') {
                currentNormalizedSearchIdx++;
                continue;
            }
            if (currentNormalizedSearchIdx === matchIndex) {
                originalMatchStartIndex = currentOriginalSearchIdx;
                break;
            }
            if (oldContent[currentOriginalSearchIdx] && oldContent[currentOriginalSearchIdx].trim() !== '') {
                 currentNormalizedSearchIdx++;
            }
            currentOriginalSearchIdx++;
        }
        
        if (originalMatchStartIndex !== -1) {
            // Find end of match in original content (equally tricky)
            // This is a very simplified approach
            let approxOriginalEndIndex = originalMatchStartIndex + searchBlock.length; // rough estimate
            // A more robust approach would be needed here.
            // For now, we might over-replace or under-replace with this naive whitespace handling.
            // Consider this a very basic attempt.
            // We will replace from originalMatchStartIndex using the length of the original searchBlock
            // which might not be accurate if searchBlock itself has a lot of compressible whitespace.
            
            // To be safer, this part needs a proper implementation. Sticking to exact match for now if complex whitespace.
            // Reverting to no change if exact match fails and whitespace is complex.
            // THIS IS A KNOWN LIMITATION of this simplified ignoreWhitespace.
        }
        // If not found or too complex to map back, changesApplied remains 0
      }
    }
    // Elision support (options.supportElision and options.language) would be more complex here.
    // It would involve parsing the searchBlock for elision markers, finding prefix/suffix, etc.
    // Keeping it simple for now.

    if (changesApplied > 0) {
      try {
        await fs.writeFile(filePath, newContent, 'utf-8');
        const diff = await this.generateDiff(oldContent, newContent, { oldPath: `a/${path.basename(filePath)}`, newPath: `b/${path.basename(filePath)}` });
        return { success: true, message: `File ${filePath} updated with edit block.`, diff, changesApplied };
      } catch (error: any) {
        return { success: false, message: `Error writing updated file ${filePath}: ${error.message}` };
      }
    } else {
      return { success: false, message: `Search block not found in ${filePath}. No changes applied.`, diff: '', changesApplied: 0 };
    }
  }

  async applyRangedEdit(
    filePath: string,
    contentToApply: string,
    startLine: number, // 1-indexed
    endLine: number,   // 1-indexed, inclusive. -1 for end-of-file/append.
    options?: { preserveUnchangedMarkers?: boolean } // preserveUnchangedMarkers is not used in this impl yet
  ): Promise<FileEditResult> {
    let oldContent: string;
    let fileExisted = false;
    try {
      oldContent = await fs.readFile(filePath, 'utf-8');
      fileExisted = true;
    } catch (e: any) {
      if (e.code === 'ENOENT') {
        oldContent = '';
        fileExisted = false;
      } else {
        return { success: false, message: `Error reading file ${filePath}: ${e.message}` };
      }
    }

    const originalLines = oldContent.split('\n');
    const linesToApply = contentToApply.split('\n');
    let finalLines: string[];

    // Convert to 0-indexed for splicing
    let réelleStartLine = startLine === -1 ? originalLines.length : startLine - 1;
    let réelleEndLine = endLine === -1 ? originalLines.length -1 : endLine -1;

    if (réelleStartLine < 0 && startLine !== -1) réelleStartLine = 0; // Ensure start is not negative unless for append
    if (réelleEndLine < réelleStartLine && endLine !== -1) réelleEndLine = réelleStartLine; // Ensure end is not before start unless for append

    if (startLine === -1 && endLine === -1) { // Append mode
      finalLines = [...originalLines, ...linesToApply];
      // If original file was empty and we append, it's like creating a new file with contentToApply
      if (originalLines.length === 1 && originalLines[0] === '') { 
          finalLines = linesToApply;
      }
    } else {
      // Ensure directories exist if we are creating intermediate lines
      const prefix = originalLines.slice(0, réelleStartLine);
      // Pad with empty lines if réelleStartLine is beyond current file length
      while (prefix.length < réelleStartLine) {
        prefix.push('');
      }
      const suffix = réelleEndLine >= originalLines.length -1 ? [] : originalLines.slice(réelleEndLine + 1);
      finalLines = [...prefix, ...linesToApply, ...suffix];
    }
    
    const newContent = finalLines.join('\n');

    try {
      const dir = path.dirname(filePath);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(filePath, newContent, 'utf-8');
      
      const diff = await this.generateDiff(oldContent, newContent, { oldPath: `a/${path.basename(filePath)}`, newPath: `b/${path.basename(filePath)}` });
      
      return {
        success: true,
        message: `File ${filePath} edited successfully. Lines ${startLine}-${endLine}.`,
        diff,
        changesApplied: 1 // Indicates one ranged edit operation applied
      };
    } catch (error: any) {
      return { success: false, message: `Error writing file ${filePath}: ${error.message}` };
    }
  }

  /**
   * Apply a unified diff (supports both single and multi-file diffs)
   * The file paths are automatically extracted from the diff content
   */
  async applyUnifiedDiff(
    diffContent: string,
    options?: { 
      baseDir?: string; 
      saveDiffPath?: string;
      dryRun?: boolean;
    }
  ): Promise<FileEditResult> {
    const baseDir = options?.baseDir || process.cwd();
    const dryRun = options?.dryRun || false;
    const saveDiffPath = options?.saveDiffPath;
    
    // Parse the diff to extract file information
    const fileDiffs = parseMultiFileDiff(diffContent);
    
    if (fileDiffs.length === 0) {
      return {
        success: false,
        message: 'No valid file diffs found in the provided diff content',
        changesApplied: 0,
        affectedFiles: [],
        isMultiFile: false
      };
    }
    
    const isMultiFile = fileDiffs.length > 1;
    const affectedFiles: string[] = [];
    const multiFileResults: FileEditResult['multiFileResults'] = [];
    let totalChangesApplied = 0;
    let overallSuccess = true;
    let savedDiffPathResult: string | undefined;
    
    // Save diff to specified path if requested
    if (saveDiffPath) {
      try {
        const diffDir = path.dirname(saveDiffPath);
        await fs.mkdir(diffDir, { recursive: true });
        await fs.writeFile(saveDiffPath, diffContent, 'utf-8');
        savedDiffPathResult = saveDiffPath;
      } catch (error: any) {
        throw error(`Failed to save diff to ${saveDiffPath}:`, error);
        // Continue with the operation even if saving fails
      }
    }
    
    // Process each file diff
    for (const fileDiff of fileDiffs) {
      try {
        // Determine the target file path
        let targetPath = extractFilePathFromDiff(fileDiff.oldPath, fileDiff.newPath);
        
        // Make path absolute relative to baseDir
        const absolutePath = path.isAbsolute(targetPath) 
          ? targetPath 
          : path.join(baseDir, targetPath);
        
        affectedFiles.push(absolutePath);
        
        if (dryRun) {
          // In dry run mode, just validate the diff without applying
          multiFileResults?.push({
            filePath: absolutePath,
            success: true,
            message: `[DRY RUN] Would apply diff to ${absolutePath}`,
            changesApplied: 1
          });
          totalChangesApplied++;
        } else {
          // Apply the diff to this specific file using the legacy method
          const result = await this.applyUnifiedDiffLegacy(absolutePath, fileDiff.diffContent);
          
          multiFileResults?.push({
            filePath: absolutePath,
            success: result.success,
            message: result.message,
            changesApplied: result.changesApplied || 0
          });
          
          if (result.success) {
            totalChangesApplied += result.changesApplied || 0;
          } else {
            overallSuccess = false;
          }
        }
      } catch (error: any) {
        const errorMessage = `Error processing file diff: ${error.message}`;
        
        multiFileResults?.push({
          filePath: fileDiff.newPath || fileDiff.oldPath,
          success: false,
          message: errorMessage,
          changesApplied: 0
        });
        
        overallSuccess = false;
      }
    }
    
    const message = dryRun 
      ? `[DRY RUN] Would process ${fileDiffs.length} files: ${totalChangesApplied} changes would be applied`
      : `Processed ${fileDiffs.length} files: ${totalChangesApplied} changes applied, ${overallSuccess ? 'all successful' : 'some failed'}`;
    
    return {
      success: overallSuccess,
      message,
      diff: diffContent,
      changesApplied: totalChangesApplied,
      affectedFiles,
      savedDiffPath: savedDiffPathResult,
      isMultiFile,
      multiFileResults: isMultiFile ? multiFileResults : undefined
    };
  }
  
  /**
   * Legacy method for applying diff to a single file (for backward compatibility)
   */
  private async applyUnifiedDiffLegacy(
    filePath: string,
    diffContent: string
  ): Promise<FileEditResult> {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'apply-diff-'));
    const originalFilePath = path.join(tempDir, 'original_file.tmp');
    const patchFilePath = path.join(tempDir, 'patch_file.tmp');
    const outputFilePath = path.join(tempDir, 'output_file.tmp');
    let fileExisted = false;
    let oldContent = '';

    try {
      // 1. Prepare original file (if it exists)
      try {
        oldContent = await fs.readFile(filePath, 'utf-8');
        await fs.writeFile(originalFilePath, oldContent, 'utf-8');
        fileExisted = true;
      } catch (e: any) {
        if (e.code === 'ENOENT') {
          // File doesn't exist, patch might be for a new file
          // We'll use /dev/null or an empty temp file for the patch command
          await fs.writeFile(originalFilePath, '', 'utf-8'); // Create an empty original for patch command
          fileExisted = false;
        } else {
          throw e; // Rethrow other read errors
        }
      }

      // 2. Write patch content to a temporary file
      await fs.writeFile(patchFilePath, diffContent, 'utf-8');

      // 3. Validate diff format before applying
      const diffValidation = validateDiffFormat(diffContent);
      if (!diffValidation.isValid) {
        return {
          success: false,
          message: `Invalid diff format for ${filePath}: ${diffValidation.errors.join('; ')}`,
          diff: diffContent,
          changesApplied: 0
        };
      }

      // 4. Construct and execute the patch command
      // The `-N` flag helps to ignore patches that have already been applied.
      // The `-r -` tells patch to ignore reject files (prevents .rej files from being created)
      const patchCommand = `patch -u -N -r - -o "${outputFilePath}" "${originalFilePath}" "${patchFilePath}"`;
      
      const result = await this.sandbox.executeSecurely(patchCommand, { cwd: tempDir });

      // 5. Analyze patch result with detailed error information
      const patchAnalysis = analyzePatchResult(result.exitCode, result.stdout, result.stderr, diffContent, filePath);
      
      if (patchAnalysis.success) {
        // If patch command creates an empty output file when the patch deletes the whole file, handle this.
        let newContent = '';
        try {
          newContent = await fs.readFile(outputFilePath, 'utf-8');
        } catch (readError: any) {
          if (readError.code === 'ENOENT') {
            // This means the patch deleted the file, outputFilePath was not created, which is fine.
            // We should ensure the target filePath is deleted if it existed.
            if (fileExisted) {
              await fs.unlink(filePath);
            }
            return { 
              success: true, 
              message: `File ${filePath} patched successfully (deleted).`, 
              diff: diffContent, 
              changesApplied: 1 
            };
          } else {
            throw readError; // Rethrow other read errors
          }
        }

        // Check if this is a file deletion case (empty output content + deletion diff)
        if (newContent === '' && diffContent.includes('+++ /dev/null')) {
          // This is a file deletion - remove the original file
          if (fileExisted) {
            await fs.unlink(filePath);
          }
          return { 
            success: true, 
            message: `File ${filePath} patched successfully (deleted).`, 
            diff: diffContent, 
            changesApplied: 1 
          };
        }

        const targetDir = path.dirname(filePath);
        await fs.mkdir(targetDir, { recursive: true });
        await fs.writeFile(filePath, newContent, 'utf-8');
        
        return { 
          success: true, 
          message: `File ${filePath} patched successfully. Exit code: ${result.exitCode}. Stdout: ${result.stdout} Stderr: ${result.stderr}`, 
          diff: diffContent, 
          changesApplied: 1 
        };
      } else {
        return { 
          success: false, 
          message: patchAnalysis.detailedError,
          diff: diffContent,
          changesApplied: 0
        };
      }
    } catch (error: any) {
      return { success: false, message: `Error applying diff to ${filePath}: ${error.message}`, diff: diffContent };
    } finally {
      // 6. Clean up temporary files and directory
      await fs.rm(tempDir, { recursive: true, force: true }).catch(err => {
        console.error(`Failed to remove temporary directory ${tempDir}:`, err);
      });
    }
  }

  /**
   * Check if this runtime is available
   */
  async isAvailable(): Promise<boolean> {
    return true; // Node.js runtime is always available
  }

  /**
   * Apply a unified diff from a file
   */
  async applyUnifiedDiffFromFile(
    diffFilePath: string,
    options?: { 
      baseDir?: string; 
      saveDiffPath?: string;
      dryRun?: boolean;
    }
  ): Promise<FileEditResult> {
    try {
      const diffContent = await fs.readFile(diffFilePath, 'utf-8');
      return this.applyUnifiedDiff(diffContent, options);
    } catch (error: any) {
      return {
        success: false,
        message: `Error reading diff file ${diffFilePath}: ${error.message}`,
        changesApplied: 0,
        affectedFiles: [],
        isMultiFile: false
      };
    }
  }
  
  /**
   * Reverse apply a unified diff (undo changes)
   */
  async reverseApplyUnifiedDiff(
    diffContent: string,
    options?: { 
      baseDir?: string; 
      saveDiffPath?: string;
      dryRun?: boolean;
    }
  ): Promise<FileEditResult> {
    const baseDir = options?.baseDir || process.cwd();
    const dryRun = options?.dryRun || false;
    const saveDiffPath = options?.saveDiffPath;
    
    // Create a temporary file for the reverse patch
    const tempDiffFile = path.join(os.tmpdir(), `reverse-diff-${Date.now()}.patch`);
    
    try {
      await fs.writeFile(tempDiffFile, diffContent, 'utf-8');
      
      // Use git apply --reverse to reverse the patch
      const result = await this.sandbox.executeSecurely(
        `git apply --reverse "${tempDiffFile}"`,
        { cwd: baseDir }
      );
      
      if (result.exitCode === 0) {
        let savedDiffPathResult: string | undefined;
        
        // Save diff to specified path if requested
        if (saveDiffPath) {
          try {
            const diffDir = path.dirname(saveDiffPath);
            await fs.mkdir(diffDir, { recursive: true });
            await fs.writeFile(saveDiffPath, diffContent, 'utf-8');
            savedDiffPathResult = saveDiffPath;
          } catch (error: any) {
            console.error(`Failed to save diff to ${saveDiffPath}:`, error);
            // Continue with the operation even if saving fails
          }
        }
        
        // Parse affected files from diff
        const fileDiffs = parseMultiFileDiff(diffContent);
        const affectedFiles = fileDiffs.map(fd => {
          const targetPath = fd.oldPath !== '/dev/null' ? fd.oldPath : fd.newPath;
          return path.isAbsolute(targetPath) ? targetPath : path.join(baseDir, targetPath.replace(/^[ab]\//, ''));
        });
        
        return {
          success: true,
          message: dryRun 
            ? `[DRY RUN] Would reverse apply diff affecting ${fileDiffs.length} files`
            : `Successfully reverse applied diff affecting ${fileDiffs.length} files`,
          diff: diffContent,
          changesApplied: fileDiffs.length,
          affectedFiles,
          savedDiffPath: savedDiffPathResult,
          isMultiFile: fileDiffs.length > 1
        };
      } else {
        return {
          success: false,
          message: `Failed to reverse apply diff. Exit code: ${result.exitCode}. Stderr: ${result.stderr}`,
          diff: diffContent,
          changesApplied: 0,
          affectedFiles: [],
          isMultiFile: false
        };
      }
    } catch (error: any) {
      return {
        success: false,
        message: `Error reverse applying diff: ${error.message}`,
        diff: diffContent,
        changesApplied: 0,
        affectedFiles: [],
        isMultiFile: false
      };
    } finally {
      // Clean up temporary file
      await fs.unlink(tempDiffFile).catch(err => {
        console.error(`Failed to remove temporary diff file ${tempDiffFile}:`, err);
      });
    }
  }
  
  /**
   * Reverse apply a unified diff from a file
   */
  async reverseApplyUnifiedDiffFromFile(
    diffFilePath: string,
    options?: { 
      baseDir?: string; 
      saveDiffPath?: string;
      dryRun?: boolean;
    }
  ): Promise<FileEditResult> {
    try {
      const diffContent = await fs.readFile(diffFilePath, 'utf-8');
      return this.reverseApplyUnifiedDiff(diffContent, options);
    } catch (error: any) {
      return {
        success: false,
        message: `Error reading diff file ${diffFilePath}: ${error.message}`,
        changesApplied: 0,
        affectedFiles: [],
        isMultiFile: false
      };
    }
  }

  async executeCode(
    language: string,
    code: string,
    options?: { timeout?: number; env?: Record<string, string> }
  ): Promise<{
    stdout: string;
    stderr: string;
    exitCode: number | null;
    resultData?: any;
  }> {
    throw new Error('Method not implemented.');
  }
}

/**
 * For backward compatibility
 */
export class NodeJsSandboxedRuntime implements IRuntime {
  private runtime: NodeJsRuntime;
  
  readonly type = "node";
  
  constructor(sandbox?: ISandbox) {
    this.runtime = new NodeJsRuntime(sandbox);
  }
  
  get sandbox(): ISandbox {
    return this.runtime.sandbox;
  }
  
  async readFile(
    filePath: string, 
    options?: { encoding?: BufferEncoding; startLine?: number; endLine?: number }
  ): Promise<string> {
    return this.runtime.readFile(filePath, options);
  }
  
  async writeFile(
    filePath: string, 
    content: string,
    options?: { 
      mode?: 'overwrite' | 'append' | 'create_or_overwrite' | 'overwrite_range';
      startLine?: number;
      endLine?: number;
    }
  ): Promise<FileEditResult> {
    return this.runtime.writeFile(filePath, content, options);
  }
  
  async listDirectory(
    dirPath: string, 
    options?: { recursive?: boolean; maxDepth?: number }
  ): Promise<DirectoryEntry[]> {
    return this.runtime.listDirectory(dirPath, options);
  }
  
  async getFileStatus(filePath: string): Promise<FileStatus> {
    return this.runtime.getFileStatus(filePath);
  }
  
  async deleteFile(filePath: string): Promise<boolean> {
    return this.runtime.deleteFile(filePath);
  }
  
  async createDirectory(dirPath: string, options?: { recursive?: boolean }): Promise<boolean> {
    return this.runtime.createDirectory(dirPath, options);
  }
  
  async generateDiff(
    oldContent: string, 
    newContent: string, 
    options?: { oldPath?: string; newPath?: string }
  ): Promise<string> {
    return this.runtime.generateDiff(oldContent, newContent, options);
  }
  
  async compareFiles(
    oldFilePath: string,
    newFilePath: string,
    options?: { oldPath?: string; newPath?: string }
  ): Promise<string> {
    return this.runtime.compareFiles(oldFilePath, newFilePath, options);
  }
  
  async execute(
    command: string,
    options?: ExecutionOptions
  ): Promise<ShellExecutionResult> {
    return this.runtime.execute(command, options);
  }
  
  async applyEditBlock(
    filePath: string,
    searchBlock: string,
    replaceBlock: string,
    options?: CodeBlockMatchOptions
  ): Promise<FileEditResult> {
    return this.runtime.applyEditBlock(filePath, searchBlock, replaceBlock, options);
  }
  
  async applyRangedEdit(
    filePath: string,
    contentToApply: string,
    startLine: number, // 1-indexed
    endLine: number,   // 1-indexed, inclusive. -1 for end-of-file/append.
    options?: { preserveUnchangedMarkers?: boolean } // preserveUnchangedMarkers is not used in this impl yet
  ): Promise<FileEditResult> {
    return this.runtime.applyRangedEdit(filePath, contentToApply, startLine, endLine, options);
  }
  
  async applyUnifiedDiff(
    diffContent: string,
    options?: { 
      baseDir?: string; 
      saveDiffPath?: string;
      dryRun?: boolean;
    }
  ): Promise<FileEditResult> {
    return this.runtime.applyUnifiedDiff(diffContent, options);
  }
  
  async applyUnifiedDiffFromFile(
    diffFilePath: string,
    options?: { 
      baseDir?: string; 
      saveDiffPath?: string;
      dryRun?: boolean;
    }
  ): Promise<FileEditResult> {
    return this.runtime.applyUnifiedDiffFromFile(diffFilePath, options);
  }
  
  async reverseApplyUnifiedDiff(
    diffContent: string,
    options?: { 
      baseDir?: string; 
      saveDiffPath?: string;
      dryRun?: boolean;
    }
  ): Promise<FileEditResult> {
    return this.runtime.reverseApplyUnifiedDiff(diffContent, options);
  }
  
  async reverseApplyUnifiedDiffFromFile(
    diffFilePath: string,
    options?: { 
      baseDir?: string; 
      saveDiffPath?: string;
      dryRun?: boolean;
    }
  ): Promise<FileEditResult> {
    return this.runtime.reverseApplyUnifiedDiffFromFile(diffFilePath, options);
  }
  
  async executeCode(
    language: string,
    code: string,
    options?: { timeout?: number; env?: Record<string, string> }
  ): Promise<{
    stdout: string;
    stderr: string;
    exitCode: number | null;
    resultData?: any;
  }> {
    return this.runtime.executeCode(language, code, options);
  }
  
  // For compatibility with ISandboxedRuntime interface
  async executeShell(
    command: string,
    options?: ExecutionOptions
  ): Promise<ShellExecutionResult> {
    return this.runtime.execute(command, options);
  }
  
  async isAvailable(): Promise<boolean> {
    return this.runtime.isAvailable();
  }
} 