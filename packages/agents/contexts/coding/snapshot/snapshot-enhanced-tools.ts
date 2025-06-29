/**
 * Snapshot-Enhanced Editing Tools
 * Simplified snapshot versions of editing tools with goal parameter and clean return values
 */

import { z } from 'zod';
import { createTool } from '@continue-reasoning/core';
import { IAgent } from '@continue-reasoning/core';
import { IRuntime } from '../runtime/interface';
import { ICodingContext } from '../coding-context';
import { generateUnifiedDiff } from '../runtime/diff';
import { formatDetailedError, logEnhancedError } from '../toolsets/error-utils';
import * as path from 'path';

/**
 * Get the shared SnapshotManager instance from CodingContext
 */
function getSnapshotManager(agent?: IAgent) {
  const codingContext = agent?.contextManager.findContextById('coding-context') as ICodingContext;
  if (!codingContext) {
    throw new Error('Coding context not found');
  }
  
  return codingContext.getSnapshotManager();
}

// Common schemas for snapshot tools
const SnapshotToolReturnSchema = z.object({
  success: z.boolean().describe("Whether the operation was successful"),
  message: z.string().describe("Descriptive message about the operation result"),
  snapshotId: z.string().optional().describe("ID of the created snapshot (if successful)"),
  diffPath: z.string().optional().describe("Path to the diff file (if diff files are enabled)")
});

// ApplyWholeFileEdit Snapshot Tool
const ApplyWholeFileEditSnapshotParamsSchema = z.object({
  path: z.string().describe("The path to the file to be edited"),
  content: z.string().describe("The new, entire content for the file"),
  goal: z.string().describe("Description of what this operation aims to achieve"),
  dryRun: z.boolean().optional().describe("If true, only preview without executing, defaults to false")
});

export const ApplyWholeFileEditTool = createTool({
  id: 'ApplyWholeFileEdit',
  name: 'ApplyWholeFileEdit',
  description: 'Creates or completely replaces file content with automatic snapshot creation. Returns simplified results with snapshot ID.',
  inputSchema: ApplyWholeFileEditSnapshotParamsSchema,
  outputSchema: SnapshotToolReturnSchema,
  async: true,
  execute: async (params, agent?: IAgent) => {
    const startTime = Date.now();
    
    try {
      const codingContext = agent?.contextManager.findContextById('coding-context') as ICodingContext;
      if (!codingContext) {
        throw new Error('Coding context not found');
      }

      const runtime = codingContext.getRuntime() as IRuntime;
      if (!runtime) {
        throw new Error('Runtime not found in the coding context');
      }

      const workspacePath = codingContext.getData()?.current_workspace || process.cwd();
      const filePath = path.isAbsolute(params.path) ? params.path : path.join(workspacePath, params.path);
      
      // Check if file exists
      let oldContent = '';
      let fileExists = false;
      
      try {
        const status = await runtime.getFileStatus(filePath);
        fileExists = status.exists && status.type === 'file';
        if (fileExists) {
          oldContent = await runtime.readFile(filePath);
        }
      } catch (e: any) {
        if (e?.code !== 'ENOENT') {
          throw new Error(e?.message || String(e));
        }
      }

      // Generate Git-format diff using diff.ts
      let diffString = '';
      if (fileExists && oldContent) {
        // File modification
        diffString = await generateUnifiedDiff(oldContent, params.content, {
          oldPath: `a/${params.path}`,
          newPath: `b/${params.path}`,
          gitOptions: {
            includeHash: true
          }
        });
      } else {
        // File creation
        diffString = await generateUnifiedDiff('', params.content, {
          oldPath: '/dev/null',
          newPath: `b/${params.path}`,
          gitOptions: {
            includeHash: true
          }
        });
      }

      // If dryRun, return preview
      if (params.dryRun) {
        return {
          success: true,
          message: `[DRY RUN] Would ${fileExists ? 'update' : 'create'} file: ${params.path}. Goal: ${params.goal}`
        };
      }

      // Execute the file write
      const writeResult = await runtime.writeFile(filePath, params.content, {
        mode: 'create_or_overwrite'
      });
      
      if (!writeResult.success) {
        throw new Error(writeResult.message || 'Failed to write file');
      }

      // Create snapshot
      const snapshotManager = getSnapshotManager(agent);
      const executionTime = Date.now() - startTime;
      
      const snapshotId = await snapshotManager.createSnapshot({
        tool: 'ApplyWholeFileEdit',
        description: params.goal,
        affectedFiles: [params.path],
        diff: diffString,
        context: {
          sessionId: 'default',
          toolParams: { path: params.path, contentLength: params.content.length }
        },
        metadata: {
          filesSizeBytes: params.content.length,
          linesChanged: diffString.split('\n').filter(line => line.startsWith('+') || line.startsWith('-')).length,
          executionTimeMs: executionTime
        }
      });

      // Get snapshot details to extract diffPath
      const snapshotResult = await snapshotManager.readSnapshotDiff(snapshotId);
      const diffPath = snapshotResult.snapshot?.diffPath;

      return {
        success: true,
        message: `Successfully ${fileExists ? 'updated' : 'created'} file: ${params.path}. Goal: ${params.goal}. ${diffPath ? `Diff available at: ${diffPath}` : 'Snapshot created: ' + snapshotId}`,
        snapshotId,
        diffPath
      };
    } catch (error: any) {
      logEnhancedError(error, 'ApplyWholeFileEdit');
      const detailedMessage = formatDetailedError(error, `ApplyWholeFileEdit - File: ${params.path}, ContentLength: ${params.content?.length || 0} chars, Goal: ${params.goal}`);
      return {
        success: false,
        message: detailedMessage
      };
    }
  }
});

// ApplyUnifiedDiff Snapshot Tool
const ApplyUnifiedDiffSnapshotParamsSchema = z.object({
  diffContent: z.string().describe("The unified diff content to apply"),
  goal: z.string().describe("Description of what this operation aims to achieve"),
  baseDir: z.string().optional().describe("Base directory for resolving relative file paths"),
  dryRun: z.boolean().optional().describe("If true, only preview without executing, defaults to false")
});

export const ApplyUnifiedDiffTool = createTool({
  id: 'ApplyUnifiedDiff',
  name: 'ApplyUnifiedDiff',
  description: 'Applies unified diff content with automatic snapshot creation. Handles partial application gracefully.',
  inputSchema: ApplyUnifiedDiffSnapshotParamsSchema,
  outputSchema: SnapshotToolReturnSchema,
  async: true,
  execute: async (params, agent?: IAgent) => {
    const startTime = Date.now();
    
    try {
      const codingContext = agent?.contextManager.findContextById('coding-context') as ICodingContext;
      if (!codingContext) {
        throw new Error('Coding context not found');
      }

      const runtime = codingContext.getRuntime() as IRuntime;
      if (!runtime) {
        throw new Error('Runtime not found in the coding context');
      }

      const workspacePath = codingContext.getData()?.current_workspace || process.cwd();
      const baseDir = params.baseDir || workspacePath;
      
      // If dryRun, return preview
      if (params.dryRun) {
        return {
          success: true,
          message: `[DRY RUN] Would apply unified diff. Goal: ${params.goal}`
        };
      }

      // Apply the unified diff
      const result = await runtime.applyUnifiedDiff(params.diffContent, {
        baseDir: baseDir,
        dryRun: false
      });
      
      if (!result.success) {
        return {
          success: false,
          message: `Failed to apply diff: ${result.message}. Goal: ${params.goal}`
        };
      }

      // Create snapshot with the original diff (which should already be in Git format)
      const snapshotManager = getSnapshotManager(agent);
      const executionTime = Date.now() - startTime;
      
      const snapshotId = await snapshotManager.createSnapshot({
        tool: 'ApplyUnifiedDiff',
        description: params.goal,
        affectedFiles: result.affectedFiles || [],
        diff: result.diff || params.diffContent, // Use the result diff if available, otherwise original
        context: {
          sessionId: 'default',
          toolParams: { baseDir }
        },
        metadata: {
          filesSizeBytes: (result.diff || params.diffContent).length,
          linesChanged: result.changesApplied || 0,
          executionTimeMs: executionTime
        }
      });

      // Check for partial application
      const isPartialApplication = result.multiFileResults && 
        result.multiFileResults.some((r: any) => !r.success);

      // Get snapshot details to extract diffPath
      const snapshotResult = await snapshotManager.readSnapshotDiff(snapshotId);
      const diffPath = snapshotResult.snapshot?.diffPath;

      let message = `Successfully applied unified diff. Goal: ${params.goal}`;
      if (isPartialApplication) {
        message = `Partially applied unified diff - some changes failed. Goal: ${params.goal}. Check snapshot ${snapshotId} for actual applied changes.`;
      }
      
      // Add diff path info to message
      if (diffPath) {
        message += ` Diff available at: ${diffPath}`;
      }

      return {
        success: true,
        message,
        snapshotId,
        diffPath
      };
    } catch (error: any) {
      logEnhancedError(error, 'ApplyUnifiedDiff');
      const detailedMessage = formatDetailedError(error, `ApplyUnifiedDiff - DiffLength: ${params.diffContent?.length || 0} chars, BaseDir: ${params.baseDir || 'default'}, Goal: ${params.goal}`);
      return {
        success: false,
        message: detailedMessage
      };
    }
  }
});

// ApplyEditBlock Snapshot Tool
const ApplyEditBlockSnapshotParamsSchema = z.object({
  path: z.string().describe("The path to the file to be edited"),
  searchBlock: z.string().describe("The exact code block to search for and replace"),
  replaceBlock: z.string().describe("The new code block to replace the search block with"),
  goal: z.string().describe("Description of what this operation aims to achieve"),
  ignoreWhitespace: z.boolean().optional().describe("Whether to ignore whitespace differences when matching"),
  dryRun: z.boolean().optional().describe("If true, only preview without executing, defaults to false")
});

export const ApplyEditBlockTool = createTool({
  id: 'ApplyEditBlock',
  name: 'ApplyEditBlock',
  description: 'Applies edit block by searching for exact code and replacing it with automatic snapshot creation.',
  inputSchema: ApplyEditBlockSnapshotParamsSchema,
  outputSchema: SnapshotToolReturnSchema,
  async: true,
  execute: async (params, agent?: IAgent) => {
    const startTime = Date.now();
    
    try {
      const codingContext = agent?.contextManager.findContextById('coding-context') as ICodingContext;
      if (!codingContext) {
        throw new Error('Coding context not found');
      }

      const runtime = codingContext.getRuntime() as IRuntime;
      if (!runtime) {
        throw new Error('Runtime not found in the coding context');
      }

      const workspacePath = codingContext.getData()?.current_workspace || process.cwd();
      const filePath = path.isAbsolute(params.path) ? params.path : path.join(workspacePath, params.path);
      
      // If dryRun, return preview
      if (params.dryRun) {
        return {
          success: true,
          message: `[DRY RUN] Would apply edit block to: ${params.path}. Goal: ${params.goal}`
        };
      }

      // Apply the edit block
      const result = await runtime.applyEditBlock(
        filePath,
        params.searchBlock,
        params.replaceBlock,
        {
          ignoreWhitespace: params.ignoreWhitespace
        }
      );
      
      if (!result.success) {
        return {
          success: false,
          message: `Failed to apply edit block: ${result.message}. Goal: ${params.goal}`
        };
      }

      // Create snapshot with Git-format diff
      const snapshotManager = getSnapshotManager(agent);
      const executionTime = Date.now() - startTime;
      
      // If the result doesn't have a diff, we need to generate one
      let diffString = result.diff || '';
      if (!diffString) {
        // Read the file before and after to generate diff
        // This is a fallback case - ideally the runtime should provide the diff
        console.warn('ApplyEditBlock did not return a diff, this may indicate an issue with the runtime implementation');
      }
      
      const snapshotId = await snapshotManager.createSnapshot({
        tool: 'ApplyEditBlock',
        description: params.goal,
        affectedFiles: [params.path],
        diff: diffString,
        context: {
          sessionId: 'default',
          toolParams: { path: params.path, ignoreWhitespace: params.ignoreWhitespace }
        },
        metadata: {
          filesSizeBytes: diffString.length,
          linesChanged: result.changesApplied || 0,
          executionTimeMs: executionTime
        }
      });

      // Get snapshot details to extract diffPath
      const snapshotResult = await snapshotManager.readSnapshotDiff(snapshotId);
      const diffPath = snapshotResult.snapshot?.diffPath;

      return {
        success: true,
        message: `Successfully applied edit block to: ${params.path}. Goal: ${params.goal}. ${diffPath ? `Diff available at: ${diffPath}` : 'Snapshot created: ' + snapshotId}`,
        snapshotId,
        diffPath
      };
    } catch (error: any) {
      logEnhancedError(error, 'ApplyEditBlock');
      const detailedMessage = formatDetailedError(error, `ApplyEditBlock - File: ${params.path}, SearchBlock: ${params.searchBlock?.length || 0} chars, ReplaceBlock: ${params.replaceBlock?.length || 0} chars, Goal: ${params.goal}`);
      return {
        success: false,
        message: detailedMessage
      };
    }
  }
});

// ApplyRangedEdit Snapshot Tool
const ApplyRangedEditSnapshotParamsSchema = z.object({
  path: z.string().describe("The path to the file to be edited"),
  content: z.string().describe("The content to apply to the specified line range"),
  startLine: z.number().int().describe("The starting line number (1-indexed). Use -1 for append mode"),
  endLine: z.number().int().describe("The ending line number (1-indexed, inclusive). Use -1 for append mode"),
  goal: z.string().describe("Description of what this operation aims to achieve"),
  preserveUnchangedMarkers: z.boolean().optional().describe("Whether to preserve unchanged markers in the content"),
  dryRun: z.boolean().optional().describe("If true, only preview without executing, defaults to false")
});

export const ApplyRangedEditTool = createTool({
  id: 'ApplyRangedEdit',
  name: 'ApplyRangedEdit',
  description: 'Applies content to a specific line range with automatic snapshot creation.',
  inputSchema: ApplyRangedEditSnapshotParamsSchema,
  outputSchema: SnapshotToolReturnSchema,
  async: true,
  execute: async (params, agent?: IAgent) => {
    const startTime = Date.now();
    
    try {
      const codingContext = agent?.contextManager.findContextById('coding-context') as ICodingContext;
      if (!codingContext) {
        throw new Error('Coding context not found');
      }

      const runtime = codingContext.getRuntime() as IRuntime;
      if (!runtime) {
        throw new Error('Runtime not found in the coding context');
      }

      const workspacePath = codingContext.getData()?.current_workspace || process.cwd();
      const filePath = path.isAbsolute(params.path) ? params.path : path.join(workspacePath, params.path);
      
      // If dryRun, return preview
      if (params.dryRun) {
        return {
          success: true,
          message: `[DRY RUN] Would apply ranged edit to: ${params.path} (lines ${params.startLine}-${params.endLine}). Goal: ${params.goal}`
        };
      }

      // Apply the ranged edit
      const result = await runtime.applyRangedEdit(
        filePath,
        params.content,
        params.startLine,
        params.endLine,
        {
          preserveUnchangedMarkers: params.preserveUnchangedMarkers
        }
      );
      
      if (!result.success) {
        return {
          success: false,
          message: `Failed to apply ranged edit: ${result.message}. Goal: ${params.goal}`
        };
      }

      // Create snapshot with Git-format diff
      const snapshotManager = getSnapshotManager(agent);
      const executionTime = Date.now() - startTime;
      
      // If the result doesn't have a diff, we need to generate one
      let diffString = result.diff || '';
      if (!diffString) {
        // Read the file before and after to generate diff
        // This is a fallback case - ideally the runtime should provide the diff
        console.warn('ApplyRangedEdit did not return a diff, this may indicate an issue with the runtime implementation');
      }
      
      const snapshotId = await snapshotManager.createSnapshot({
        tool: 'ApplyRangedEdit',
        description: params.goal,
        affectedFiles: [params.path],
        diff: diffString,
        context: {
          sessionId: 'default',
          toolParams: { 
            path: params.path, 
            startLine: params.startLine, 
            endLine: params.endLine 
          }
        },
        metadata: {
          filesSizeBytes: diffString.length,
          linesChanged: result.changesApplied || 0,
          executionTimeMs: executionTime
        }
      });

      // Get snapshot details to extract diffPath
      const snapshotResult = await snapshotManager.readSnapshotDiff(snapshotId);
      const diffPath = snapshotResult.snapshot?.diffPath;

      return {
        success: true,
        message: `Successfully applied ranged edit to: ${params.path} (lines ${params.startLine}-${params.endLine}). Goal: ${params.goal}. ${diffPath ? `Diff available at: ${diffPath}` : 'Snapshot created: ' + snapshotId}`,
        snapshotId,
        diffPath
      };
    } catch (error: any) {
      logEnhancedError(error, 'ApplyRangedEdit');
      const detailedMessage = formatDetailedError(error, `ApplyRangedEdit - File: ${params.path}, Lines: ${params.startLine}-${params.endLine}, ContentLength: ${params.content?.length || 0} chars, Goal: ${params.goal}`);
      return {
        success: false,
        message: detailedMessage
      };
    }
  }
});

// Delete Snapshot Tool
const DeleteSnapshotParamsSchema = z.object({
  path: z.string().describe("The path to the file or directory to delete"),
  goal: z.string().describe("Description of what this operation aims to achieve"),
  recursive: z.boolean().optional().describe("Whether to delete directories recursively"),
  dryRun: z.boolean().optional().describe("If true, only preview without executing, defaults to false")
});

export const DeleteTool = createTool({
  id: 'Delete',
  name: 'Delete',
  description: 'Deletes a file or directory with automatic snapshot creation for tracking.',
  inputSchema: DeleteSnapshotParamsSchema,
  outputSchema: SnapshotToolReturnSchema,
  async: true,
  execute: async (params, agent?: IAgent) => {
    const startTime = Date.now();
    
    try {
      const codingContext = agent?.contextManager.findContextById('coding-context') as ICodingContext;
      if (!codingContext) {
        throw new Error('Coding context not found');
      }

      const runtime = codingContext.getRuntime() as IRuntime;
      if (!runtime) {
        throw new Error('Runtime not found in the coding context');
      }

      const workspacePath = codingContext.getData()?.current_workspace || process.cwd();
      const targetPath = path.isAbsolute(params.path) ? params.path : path.join(workspacePath, params.path);
      
      // Check what we're dealing with
      let targetStatus;
      try {
        targetStatus = await runtime.getFileStatus(targetPath);
        if (!targetStatus.exists) {
          return {
            success: false,
            message: `Path ${params.path} does not exist. Goal: ${params.goal}`
          };
        }
      } catch (e: any) {
        return {
          success: false,
          message: `Path ${params.path} does not exist or cannot be accessed. Goal: ${params.goal}`
        };
      }

      // If dryRun, return preview
      if (params.dryRun) {
        return {
          success: true,
          message: `[DRY RUN] Would delete ${targetStatus.type}: ${params.path}. Goal: ${params.goal}`
        };
      }

      // Generate Git-format diff for the deletion
      let diffString = '';
      let deletedFiles: string[] = [];

      if (targetStatus.type === 'file') {
        // Read file content for diff
        const oldContent = await runtime.readFile(targetPath);
        
        diffString = await generateUnifiedDiff(oldContent, '', {
          oldPath: `a/${params.path}`,
          newPath: '/dev/null',
          gitOptions: {
            includeHash: true
          }
        });
        deletedFiles = [params.path];
        
        // Delete the file
        const deleteSuccess = await runtime.deleteFile(targetPath);
        if (!deleteSuccess) {
          return {
            success: false,
            message: `Failed to delete file ${params.path}. Goal: ${params.goal}`
          };
        }
      } else if (targetStatus.type === 'dir') {
        // Handle directory deletion
        const entries = await runtime.listDirectory(targetPath, { recursive: true });
        const fileEntries = entries.filter(entry => entry.type === 'file');
        
        if (fileEntries.length > 0 && !params.recursive) {
          return {
            success: false,
            message: `Directory ${params.path} is not empty. Use recursive=true to delete non-empty directories. Goal: ${params.goal}`
          };
        }

        // Generate combined Git-format diff for all files
        const diffParts: string[] = [];
        for (const entry of fileEntries) {
          try {
            const fileContent = await runtime.readFile(entry.path);
            const relativeFilePath = path.relative(workspacePath, entry.path);
            
            const fileDiff = await generateUnifiedDiff(fileContent, '', {
              oldPath: `a/${relativeFilePath}`,
              newPath: '/dev/null',
              gitOptions: {
                includeHash: true
              }
            });
            
            diffParts.push(fileDiff);
            deletedFiles.push(relativeFilePath);
          } catch (error: any) {
            console.warn(`Failed to read file ${entry.path} for diff generation: ${error.message}`);
          }
        }
        
        diffString = diffParts.join('');
        
        // Delete the directory
        const command = params.recursive ? `rm -rf "${targetPath}"` : `rmdir "${targetPath}"`;
        const result = await runtime.execute(command);
        
        if (result.exitCode !== 0) {
          return {
            success: false,
            message: `Failed to delete directory ${params.path}: ${result.stderr}. Goal: ${params.goal}`
          };
        }
      }

      // Create snapshot
      const snapshotManager = getSnapshotManager(agent);
      const executionTime = Date.now() - startTime;
      
      const snapshotId = await snapshotManager.createSnapshot({
        tool: 'Delete',
        description: params.goal,
        affectedFiles: deletedFiles,
        diff: diffString,
        context: {
          sessionId: 'default',
          toolParams: { path: params.path, recursive: params.recursive }
        },
        metadata: {
          filesSizeBytes: diffString.length,
          linesChanged: diffString.split('\n').filter(line => line.startsWith('-')).length,
          executionTimeMs: executionTime
        }
      });

      // Get snapshot details to extract diffPath
      const snapshotResult = await snapshotManager.readSnapshotDiff(snapshotId);
      const diffPath = snapshotResult.snapshot?.diffPath;

      return {
        success: true,
        message: `Successfully deleted ${targetStatus.type} ${params.path} (${deletedFiles.length} files). Goal: ${params.goal}. ${diffPath ? `Diff available at: ${diffPath}` : 'Snapshot created: ' + snapshotId}`,
        snapshotId,
        diffPath
      };
    } catch (error: any) {
      logEnhancedError(error, 'Delete');
      const detailedMessage = formatDetailedError(error, `Delete - Path: ${params.path}, Recursive: ${params.recursive || false}, Goal: ${params.goal}`);
      return {
        success: false,
        message: detailedMessage
      };
    }
  }
});

// Export all snapshot tools
export const SnapshotEditingToolSet = [
  ApplyWholeFileEditTool,
  ApplyUnifiedDiffTool,
  ApplyEditBlockTool,
  ApplyRangedEditTool,
  DeleteTool
];