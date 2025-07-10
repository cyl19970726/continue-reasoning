// src/core/contexts/coding/toolsets/editing-strategy-tools.ts
import { z } from 'zod';
import { createTool } from '@continue-reasoning/core';
import { IAgent } from '@continue-reasoning/core';
import { IRuntime } from '../runtime/interface.js';
import { reverseDiff } from '../runtime/diff.js';
import { formatDetailedError, logEnhancedError, createErrorResponse } from './error-utils.js';
import * as path from 'path';
// For diff generation, we might need a library or a utility function.
// For now, we'll return a placeholder diff.
// import { diffLines } from 'diff'; // Example if using 'diff' library

const ApplyWholeFileEditParamsSchema = z.object({
  path: z.string().describe("The path to the file to be edited."),
  content: z.string().describe("The new, entire content for the file."),
});

export const ApplyWholeFileEditTool = createTool({
  id: 'ApplyWholeFileEdit',
  name: 'ApplyWholeFileEdit',
  description: `
  Create a new file or completely replace existing file content. Best for: new files, complete file rewrites, major refactoring. Generates Git-format diffs and handles directory creation automatically.
  
  Usage:
  - **Create New File**: Use when you need to create a completely new file with initial content
  - **Replace Entire File**: Use when you need to completely rewrite an existing file
  - **Major Refactoring**: Use when making extensive changes that affect most of the file
  
  Example:
  - **Create File**: 
    - Path: "src/utils/helpers.js"
    - Content: "export function formatDate(date) { return date.toISOString(); }"
    - Result: Creates new file with Git-format diff showing addition
  
  - **Replace File**:
    - Path: "config/settings.json" 
    - Content: "{ \"version\": \"2.0\", \"features\": [\"auth\", \"logging\"] }"
    - Result: Completely replaces existing file content with Git-format diff
  `,
  inputSchema: ApplyWholeFileEditParamsSchema,
  async: true,
  execute: async (params, agent?: IAgent) => {
    // Get the coding context
    const codingContext = agent?.contextManager.findContextById('coding-context');
    if (!codingContext) {
      throw new Error('Coding context not found');
    }
    
    // Get the runtime instance from the context
    const runtime = (codingContext as any).getRuntime() as IRuntime;
    if (!runtime) {
      throw new Error('Runtime not found in the coding context');
    }

    const workspacePath = codingContext.getData()?.current_workspace || process.cwd();
    const filePath = path.isAbsolute(params.path) ? params.path : path.join(workspacePath, params.path);
    
    console.log(`ApplyWholeFileEditTool: Writing to ${filePath} with new content.`);
    
    try {
      // Check if file exists to determine if we're creating a new file
      let oldContent = '';
      let fileExists = false;
      
      try {
        // Try to read the existing file
        const status = await runtime.getFileStatus(filePath);
        fileExists = status.exists && status.type === 'file';
        
        if (fileExists) {
          // Read the old content to generate a diff
          oldContent = await runtime.readFile(filePath);
        }
      } catch (e: any) {
        // If the error indicates the file does not exist, continue as a create operation.
        // Node runtimes usually throw ENOENT for non-existent files.
        if (e?.code === 'ENOENT') {
          fileExists = false;
        } else {
          // Propagate other runtime errors so the caller can handle them.
          throw new Error(e?.message || String(e));
        }
      }
      
      // Write the file with the new content
      const writeResult = await runtime.writeFile(filePath, params.content, {
        mode: 'create_or_overwrite'
      });
      
      if (!writeResult.success) {
        return writeResult;
      }
      
      // Generate a diff
      let diffString = '';
      if (fileExists && oldContent) {
        // Use the runtime's generateDiff method
        diffString = await runtime.generateDiff(oldContent, params.content, {
          oldPath: `a/${params.path}`,
          newPath: `b/${params.path}`
        });
      } else {
        // For new files, create a simple diff
        const lines = params.content.split('\n');
        diffString = `--- /dev/null\n+++ b/${params.path}\n@@ -0,0 +1,${lines.length} @@\n`;
        for (const line of lines) {
          diffString += `+${line}\n`;
        }
      }
    
      
      return {
        success: true,
        message: fileExists 
          ? `File ${params.path} updated successfully.` 
          : `File ${params.path} created successfully.`,
        diff: diffString
      };
    } catch (error: any) {
      logEnhancedError(error, 'ApplyWholeFileEditTool');
      const detailedMessage = formatDetailedError(error, `ApplyWholeFileEdit - File: ${params.path}, ContentLength: ${params.content?.length || 0} chars`);
      return {
        success: false,
        message: detailedMessage
      };
    }
  },
});

const ApplyUnifiedDiffParamsSchema = z.object({
  diffContent: z.string().describe("The unified diff content to apply. Supports both single-file and multi-file diffs. File paths are automatically extracted from diff headers."),
  baseDir: z.string().optional().describe("Base directory for resolving relative file paths in the diff. Defaults to current workspace."),
});

const ApplyUnifiedDiffReturnsSchema = z.object({
  success: z.boolean().describe("Whether the diff was successfully applied."),
  message: z.string().optional().describe("A descriptive message about the operation results."),
  diff: z.string().optional().describe("The diff content that was applied."),
  changesApplied: z.number().optional().describe("Total number of changes applied across all files."),
  affectedFiles: z.array(z.string()).optional().describe("List of file paths that were affected by the diff."),
  isMultiFile: z.boolean().optional().describe("Whether this was a multi-file diff operation."),
  savedDiffPath: z.string().optional().describe("Path where the diff was saved (if saveDiffPath was provided)."),
  multiFileResults: z.array(z.object({
    filePath: z.string().describe("Path of the affected file."),
    success: z.boolean().describe("Whether the change to this file was successful."),
    message: z.string().optional().describe("Message about this file's operation."),
    changesApplied: z.number().optional().describe("Number of changes applied to this file."),
  })).optional().describe("Results for each file in a multi-file diff."),
  error: z.string().optional().describe("Error message if the operation failed."),
});

export const ApplyUnifiedDiffTool = createTool({
  id: 'ApplyUnifiedDiff',
  name: 'ApplyUnifiedDiff',
  description: `
  Apply unified diff patches to multiple files. Automatically detects single/multi-file diffs and extracts file paths from diff headers. Supports file creation, modification, and deletion.
  
  Usage:
  - **Apply Single File Diff**: Use when you have a diff for one file
  - **Apply Multi-File Diff**: Use when you have a diff affecting multiple files
  - **Complex Refactoring**: Use when applying comprehensive changes across multiple files
  
  Diff Format:
  Multi-file diffs contain multiple file changes in a single diff:
  \`\`\`diff
  --- a/src/api.js
  +++ b/src/api.js
  @@ -1,5 +1,6 @@
  import axios from 'axios';
  +import { config } from './config';
  
  -const API_URL = 'https://api.example.com';
  +const API_URL = config.apiUrl;
  
  export async function fetchData() {
  --- /dev/null
  +++ b/src/config.js
  @@ -0,0 +1,5 @@
  +export const config = {
  +  apiUrl: process.env.API_URL || 'https://api.example.com',
  +  timeout: 5000,
  +  retries: 3
  +};
  \`\`\`
  `,
  inputSchema: ApplyUnifiedDiffParamsSchema,
  outputSchema: ApplyUnifiedDiffReturnsSchema,
  async: true,
  execute: async (params, agent?: IAgent) => {
    // Get the coding context
    const codingContext = agent?.contextManager.findContextById('coding-context');
    if (!codingContext) {
      throw new Error('Coding context not found');
    }
    
    // Get the runtime instance from the context
    const runtime = (codingContext as any).getRuntime() as IRuntime;
    if (!runtime) {
      throw new Error('Runtime not found in the coding context');
    }

    const workspacePath = codingContext.getData()?.current_workspace || process.cwd();
    const baseDir = params.baseDir || workspacePath;
    
    console.log(`ApplyUnifiedDiffTool: Applying diff in base directory ${baseDir}`);
    
    try {
      // Apply the unified diff using the runtime method
      const result = await runtime.applyUnifiedDiff(params.diffContent, {
        baseDir: baseDir,
        dryRun: false,
      });
      
      return result;
    } catch (error: any) {
      logEnhancedError(error, 'ApplyUnifiedDiffTool');
      const detailedMessage = formatDetailedError(error, `ApplyUnifiedDiff - BaseDir: ${baseDir}, DiffLength: ${params.diffContent?.length || 0} chars`);
      return {
        success: false,
        message: detailedMessage
      };
    }
  },
});

// ApplyEditBlock Tool - Aider-style search and replace
const ApplyEditBlockParamsSchema = z.object({
  path: z.string().describe("The path to the file to be edited."),
  searchBlock: z.string().describe("The exact code block to search for and replace. Use empty string to create a new file."),
  replaceBlock: z.string().describe("The new code block to replace the search block with."),
  ignoreWhitespace: z.boolean().optional().describe("Whether to ignore whitespace differences when matching. Defaults to false."),
});


export const ApplyEditBlockTool = createTool({
  id: 'ApplyEditBlock',
  name: 'ApplyEditBlock',
  description: `
  Find and replace exact code blocks within a file. Perfect for targeted code modifications when you know the exact code to change. Supports Aider-style search and replace operations.
  
  Usage:
  - **Replace Code Block**: Use when you need to replace a specific section of code
  - **Add Code**: Use with empty searchBlock to create new files or append to existing files
  - **Targeted Modifications**: Use when you know exactly what code needs to be changed
  
  Examples:
  - **Function Modification**:
    - SearchBlock: "function calculateTotal(items) { return items.reduce((sum, item) => sum + item.price, 0); }"
    - ReplaceBlock: "function calculateTotal(items) { const total = items.reduce((sum, item) => sum + item.price, 0); return Math.round(total * 100) / 100; }"
    - Result: Replaces the exact function with improved version
  
  - **Create New File**:
    - SearchBlock: "" (empty)
    - ReplaceBlock: "const config = { apiUrl: 'https://api.example.com', timeout: 5000 }; module.exports = config;"
    - Result: Creates new file with specified content
  `,
  inputSchema: ApplyEditBlockParamsSchema,
  async: true,
  execute: async (params, agent?: IAgent) => {
    // Get the coding context
    const codingContext = agent?.contextManager.findContextById('coding-context');
    if (!codingContext) {
      throw new Error('Coding context not found');
    }
    
    // Get the runtime instance from the context
    const runtime = (codingContext as any).getRuntime() as IRuntime;
    if (!runtime) {
      throw new Error('Runtime not found in the coding context');
    }

    const workspacePath = codingContext.getData()?.current_workspace || process.cwd();
    const filePath = path.isAbsolute(params.path) ? params.path : path.join(workspacePath, params.path);
    
    console.log(`ApplyEditBlockTool: Applying edit block to ${filePath}`);
    
    try {
      // Apply the edit block using the runtime method
      const result = await runtime.applyEditBlock(
        filePath,
        params.searchBlock,
        params.replaceBlock,
        {
          ignoreWhitespace: params.ignoreWhitespace
        }
      );
      
      return result;
    } catch (error: any) {
      logEnhancedError(error, 'ApplyEditBlockTool');
      const detailedMessage = formatDetailedError(error, `ApplyEditBlock - File: ${filePath}`);
      return {
        success: false,
        message: detailedMessage,
        changesApplied: 0
      };
    }
  },
});

// ApplyRangedEdit Tool - OpenHands-style line range editing
const ApplyRangedEditParamsSchema = z.object({
  path: z.string().describe("The path to the file to be edited."),
  content: z.string().describe("The content to apply to the specified line range."),
  startLine: z.number().int().describe("The starting line number (1-indexed). Use -1 for append mode."),
  endLine: z.number().int().describe("The ending line number (1-indexed, inclusive). Use -1 for append mode or end-of-file."),
});

export const ApplyRangedEditTool = createTool({
  id: 'ApplyRangedEdit',
  name: 'ApplyRangedEdit',
  description: `
  Replace content within specific line ranges. Best for: precise line-based edits, inserting/updating specific sections. Use when you know exact line numbers to modify.
  
  Usage:
  - **Replace Line Range**: Use with specific startLine and endLine to replace content in those lines
  - **Append to File**: Use with startLine=-1 and endLine=-1 to append content to the end of the file
  - **Insert at Beginning**: Use with startLine=1 and endLine=0 to insert content at the beginning
  - **Precise Edits**: Use when you need to modify specific lines without affecting other parts
  
  Examples:
  - **Replace Specific Lines**:
    - Path: "package.json"
    - Content: "  \"version\": \"2.0.0\",\n  \"description\": \"Updated package with new features\","
    - StartLine: 3, EndLine: 4
    - Result: Replaces lines 3-4 with new content
  
  - **Append to File**:
    - Path: "README.md"
    - Content: "\n## Changelog\n\n- v2.0.0: Added new features\n- v1.0.0: Initial release"
    - StartLine: -1, EndLine: -1
    - Result: Appends content to end of file
  `,
  inputSchema: ApplyRangedEditParamsSchema,
  async: true,
  execute: async (params, agent?: IAgent) => {
    // Get the coding context
    const codingContext = agent?.contextManager.findContextById('coding-context');
    if (!codingContext) {
      throw new Error('Coding context not found');
    }
    
    // Get the runtime instance from the context
    const runtime = (codingContext as any).getRuntime() as IRuntime;
    if (!runtime) {
      throw new Error('Runtime not found in the coding context');
    }

    const workspacePath = codingContext.getData()?.current_workspace || process.cwd();
    const filePath = path.isAbsolute(params.path) ? params.path : path.join(workspacePath, params.path);
    
    console.log(`ApplyRangedEditTool: Applying ranged edit to ${filePath} (lines ${params.startLine}-${params.endLine})`);
    
    try {
      // Apply the ranged edit using the runtime method
      const result = await runtime.applyRangedEdit(
        filePath,
        params.content,
        params.startLine,
        params.endLine,
        {
          preserveUnchangedMarkers: false
        }
      );
      
      return result;
    } catch (error: any) {
      logEnhancedError(error, 'ApplyRangedEditTool');
      const detailedMessage = formatDetailedError(error, `ApplyRangedEdit - File: ${filePath}, Lines: ${params.startLine}-${params.endLine}, ContentLength: ${params.content?.length || 0} chars`);
      return {
        success: false,
        message: detailedMessage,
        changesApplied: 0
      };
    }
  },
});

// Delete Tool - with diff generation for files and non-empty directories
const DeleteParamsSchema = z.object({
  path: z.string().describe("The path to the file or directory to delete."),
  recursive: z.boolean().optional().describe("Whether to delete directories recursively. Required for non-empty directories. Defaults to false."),
});

export const DeleteTool = createTool({
  id: 'Delete',
  name: 'Delete',
  description: `
  Delete files or directories safely with diff generation for tracking changes. Generates deletion diffs for files and non-empty directories to enable rollback.
  
  Usage:
  - **Delete File**: Use to delete a single file and generate its deletion diff
  - **Delete Empty Directory**: Use to delete an empty directory (no diff generated)
  - **Delete Directory Recursively**: Use with recursive=true to delete non-empty directories and generate diffs for all files
  
  Examples:
  - **Delete Single File**:
    - Path: "temp/cache.tmp"
    - Result: Deletes file and generates diff showing all removed content
  
  - **Delete Directory with Contents**:
    - Path: "old-feature/"
    - Recursive: true
    - Result: Deletes directory and all contents, generates combined diff for all files
  `,
  inputSchema: DeleteParamsSchema,
  async: true,
  execute: async (params, agent?: IAgent) => {
    // Get the coding context
    const codingContext = agent?.contextManager.findContextById('coding-context');
    if (!codingContext) {
      throw new Error('Coding context not found');
    }
    
    // Get the runtime instance from the context
    const runtime = (codingContext as any).getRuntime() as IRuntime;
    if (!runtime) {
      throw new Error('Runtime not found in the coding context');
    }

    const workspacePath = codingContext.getData()?.current_workspace || process.cwd();
    const targetPath = path.isAbsolute(params.path) ? params.path : path.join(workspacePath, params.path);
    
    console.log(`DeleteTool: Deleting ${targetPath}`);
    
    try {
      // First, check what we're dealing with
      let targetStatus;
      try {
        targetStatus = await runtime.getFileStatus(targetPath);
        if (!targetStatus.exists) {
          return {
            success: false,
            message: `Path ${params.path} does not exist`,
            changesApplied: 0
          };
        }
      } catch (e: any) {
        return {
          success: false,
          message: `Path ${params.path} does not exist or cannot be accessed`,
          changesApplied: 0
        };
      }

      if (targetStatus.type === 'file') {
        // Handle file deletion
        return await deleteFileWithDiff(runtime, targetPath, params.path, codingContext, agent);
      } else if (targetStatus.type === 'dir') {
        // Handle directory deletion
        return await deleteDirectoryWithDiff(runtime, targetPath, params.path, codingContext, params.recursive, agent);
      } else {
        return {
          success: false,
          message: `Unknown type for path ${params.path}`,
          changesApplied: 0
        };
      }
    } catch (error: any) {
      console.error(`DeleteTool error: ${error.message || error}`);
      return {
        success: false,
        message: `Failed to delete ${params.path}: ${error.message || 'Unknown error'}`,
        changesApplied: 0
      };
    }
  },
});

// Helper function to delete a file with diff generation
async function deleteFileWithDiff(
  runtime: IRuntime, 
  filePath: string, 
  relativePath: string, 
  codingContext: any,
  agent?: IAgent
) {
  try {
    // Read file content for diff generation
    const oldContent = await runtime.readFile(filePath);
    
    // Delete the file
    const deleteSuccess = await runtime.deleteFile(filePath);
    
    if (!deleteSuccess) {
      return {
        success: false,
        message: `Failed to delete file ${relativePath}`,
        changesApplied: 0
      };
    }
    
    // Generate deletion diff
    const diffString = await runtime.generateDiff(oldContent, '', {
      oldPath: `a/${relativePath}`,
      newPath: '/dev/null'
    });
    
    return {
      success: true,
      message: `File ${relativePath} deleted successfully`,
      diff: diffString,
      changesApplied: 1,
      deletedFiles: [relativePath]
    };
  } catch (error: any) {
    return {
      success: false,
      message: `Failed to delete file ${relativePath}: ${error.message}`,
      changesApplied: 0
    };
  }
}

// Helper function to delete a directory with appropriate diff generation
async function deleteDirectoryWithDiff(
  runtime: IRuntime,
  dirPath: string,
  relativePath: string,
  codingContext: any,
  recursive?: boolean,
  agent?: IAgent
) {
  try {
    // List directory contents to check if it's empty
    const entries = await runtime.listDirectory(dirPath, { recursive: true });
    const fileEntries = entries.filter(entry => entry.type === 'file');
    
    if (fileEntries.length === 0) {
      // Empty directory - delete without generating diff
      const command = recursive ? `rm -rf "${dirPath}"` : `rmdir "${dirPath}"`;
      const result = await runtime.execute(command);
      
      if (result.exitCode === 0) {
        
        return {
          success: true,
          message: `Empty directory ${relativePath} deleted successfully`,
          changesApplied: 1,
          deletedFiles: []
        };
      } else {
        return {
          success: false,
          message: `Failed to delete directory ${relativePath}: ${result.stderr}`,
          changesApplied: 0
        };
      }
    } else {
      // Non-empty directory - generate diffs for all files
      if (!recursive) {
        return {
          success: false,
          message: `Directory ${relativePath} is not empty. Use recursive=true to delete non-empty directories.`,
          changesApplied: 0
        };
      }

      const diffParts: string[] = [];
      const deletedFiles: string[] = [];
      const workspacePath = codingContext.getData()?.current_workspace || process.cwd();

      // Generate diffs for all files in the directory
      for (const entry of fileEntries) {
        try {
          const fileContent = await runtime.readFile(entry.path);
          const relativeFilePath = path.relative(workspacePath, entry.path);
          
          const fileDiff = await runtime.generateDiff(fileContent, '', {
            oldPath: `a/${relativeFilePath}`,
            newPath: '/dev/null'
          });
          
          diffParts.push(fileDiff);
          deletedFiles.push(relativeFilePath);
        } catch (error: any) {
          console.warn(`Failed to read file ${entry.path} for diff generation: ${error.message}`);
        }
      }

      // Delete the entire directory
      const result = await runtime.execute(`rm -rf "${dirPath}"`);
      
      if (result.exitCode === 0) {
        // Combine all file diffs into one multi-file diff
        const combinedDiff = diffParts.join('');

        return {
          success: true,
          message: `Directory ${relativePath} and ${deletedFiles.length} files deleted successfully`,
          diff: combinedDiff,
          changesApplied: 1,
          deletedFiles
        };
      } else {
        return {
          success: false,
          message: `Failed to delete directory ${relativePath}: ${result.stderr}`,
          changesApplied: 0
        };
      }
    }
  } catch (error: any) {
    return {
      success: false,
      message: `Failed to delete directory ${relativePath}: ${error.message}`,
      changesApplied: 0
    };
  }
}

const ReverseDiffParamsSchema = z.object({
  diffContent: z.string().describe("The unified diff content to reverse/undo. Supports both single-file and multi-file diffs."),
  includeFiles: z.array(z.string()).optional().describe("Only reverse changes for files that match these patterns."),
  excludeFiles: z.array(z.string()).optional().describe("Skip reversing changes for files that match these patterns."),
  checkConflicts: z.boolean().optional().describe("If true, checks for potential conflicts before applying the reverse. Defaults to false."),
});

const ReverseDiffReturnsSchema = z.object({
  success: z.boolean().describe("Whether the diff reversal was successful."),
  message: z.string().optional().describe("A descriptive message about the reversal operation."),
  reversedDiff: z.string().optional().describe("The generated reversed diff content."),
  changesApplied: z.number().optional().describe("Number of files affected by the reversal."),
  affectedFiles: z.array(z.string()).optional().describe("List of file paths that were affected by the reversal."),
  conflicts: z.array(z.string()).optional().describe("List of potential conflicts detected (if checkConflicts was enabled)."),
  savedDiffPath: z.string().optional().describe("Path where the reversed diff was saved (if saveDiffPath was provided)."),
  error: z.string().optional().describe("Error message if the operation failed."),
});

export const ReverseDiffTool = createTool({
  id: 'ReverseDiff',
  name: 'ReverseDiff',
  description: `
  Reverse (undo) a unified diff to rollback changes. Perfect for error recovery, feature toggling, and A/B testing workflows. Generates and optionally applies the reversed diff.
  
  Usage:
  - **Rollback Changes**: Use to undo recently applied changes when issues are discovered
  - **Feature Toggle**: Use to temporarily disable features by reversing their implementation
  - **A/B Testing**: Use to switch between implementations by reversing diffs
  - **Dry Run Testing**: Use with dryRun=true to preview what would be reversed
  
  Examples:
  - **Simple Rollback**:
    - DiffContent: (unified diff to reverse)
    - Result: Generates and applies the reversed diff, restoring original state
  
  - **Selective Reversal**:
    - DiffContent: (multi-file diff)
    - IncludeFiles: ["src/api.js", "src/config.js"]
    - Result: Only reverses changes to specified files
  
  - **Preview Reversal**:
    - DiffContent: (diff to analyze)
    - DryRun: true
    - SaveDiffPath: "rollback.patch"
    - Result: Generates reversed diff without applying, saves for review
  `,
  inputSchema: ReverseDiffParamsSchema,
  outputSchema: ReverseDiffReturnsSchema,
  async: true,
  execute: async (params, agent?: IAgent) => {
    // Get the coding context
    const codingContext = agent?.contextManager.findContextById('coding-context');
    if (!codingContext) {
      throw new Error('Coding context not found');
    }
    
    // Get the runtime instance from the context
    const runtime = (codingContext as any).getRuntime() as IRuntime;
    if (!runtime) {
      throw new Error('Runtime not found in the coding context');
    }

    const workspacePath = codingContext.getData()?.current_workspace || process.cwd();

    try {
      // Generate the reversed diff using the diff utility
      const reverseResult = reverseDiff(params.diffContent, {
        includeFiles: params.includeFiles,
        excludeFiles: params.excludeFiles,
        dryRun: false,
        checkConflicts: true,
      });
      
      if (!reverseResult.success) {
        return {
          success: false,
          message: reverseResult.message || 'Failed to reverse diff',
          changesApplied: 0
        };
      }
      
      let savedDiffPath: string | undefined;
      
      // If not dry run, apply the reversed diff

        let applyResult = await runtime.applyUnifiedDiff(reverseResult.reversedDiff, {
          baseDir: workspacePath
        });

        return applyResult;
        
      
    } catch (error: any) {
      console.error(`ReverseDiffTool error: ${error.message || error}`);
      return {
        success: false,
        message: `Failed to reverse diff: ${error.message || 'Unknown error'}`,
        changesApplied: 0
      };
    }
  },
});

// Export the complete toolset
export const EditingStrategyToolSet = [
  ApplyWholeFileEditTool,
  ApplyEditBlockTool,
  ApplyRangedEditTool,
  ApplyUnifiedDiffTool,
  DeleteTool,
  ReverseDiffTool
];
