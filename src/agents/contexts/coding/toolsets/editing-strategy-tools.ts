// src/core/contexts/coding/toolsets/editing-strategy-tools.ts
import { z } from 'zod';
import { createTool } from '../../../../core/utils';
import { IAgent } from '../../../../core/interfaces';
import { IRuntime } from '../runtime/interface';
import { reverseDiff } from '../runtime/diff';
import * as path from 'path';
// For diff generation, we might need a library or a utility function.
// For now, we'll return a placeholder diff.
// import { diffLines } from 'diff'; // Example if using 'diff' library

const ApplyWholeFileEditParamsSchema = z.object({
  path: z.string().describe("The path to the file to be edited."),
  content: z.string().describe("The new, entire content for the file."),
});

const ApplyWholeFileEditReturnsSchema = z.object({
  success: z.boolean().describe("Whether the file edit was successfully applied."),
  message: z.string().optional().describe("A descriptive message about the operation."),
  diff: z.string().optional().describe("The diff showing changes made to the file."),
});

export const ApplyWholeFileEditTool = createTool({
  id: 'ApplyWholeFileEdit',
  name: 'ApplyWholeFileEdit',
  description: 'Primary tool for creating new files or completely replacing existing file content. Generates a diff showing the changes and handles directory creation automatically.',
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
        throw new Error(writeResult.message || 'Failed to write file');
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
      
      // Update context with file changes
      const contextData = codingContext.getData();
      const activeDiffs = { ...contextData.active_diffs };
      activeDiffs[params.path] = diffString;
      
      const openFiles = { ...contextData.open_files };
      openFiles[params.path] = {
        content_hash: String(Date.now()), // Simple hash based on time
        last_read_content: params.content
      };
      
      codingContext.setData({
        ...contextData,
        active_diffs: activeDiffs,
        open_files: openFiles
      });
      
      // Publish file operation event
      if (agent?.eventBus) {
        const eventType = fileExists ? 'file_modified' : 'file_created';
        await agent.eventBus.publish({
          type: eventType,
          source: 'agent',
          sessionId: agent.eventBus.getActiveSessions()[0] || 'default',
          payload: fileExists ? {
            path: params.path,
            tool: 'whole_file',
            changesApplied: 1,
            diff: diffString
          } : {
            path: params.path,
            size: params.content.length,
            diff: diffString
          }
        });
      }
      
      return {
        success: true,
        message: fileExists 
          ? `File ${params.path} updated successfully.` 
          : `File ${params.path} created successfully.`,
        diff: diffString
      };
    } catch (error: any) {
      console.error(`ApplyWholeFileEditTool error: ${error.message || error}`);
      return {
        success: false,
        message: `Failed to write to file ${params.path}: ${error.message || 'Unknown error'}`
      };
    }
  },
});

const ApplyUnifiedDiffParamsSchema = z.object({
  diffContent: z.string().describe("The unified diff content to apply. Supports both single-file and multi-file diffs. File paths are automatically extracted from diff headers."),
  baseDir: z.string().optional().describe("Base directory for resolving relative file paths in the diff. Defaults to current workspace."),
  saveDiffPath: z.string().optional().describe("Path where to save the diff content for later reference or reversal. If provided, the diff will be saved to this exact path."),
  dryRun: z.boolean().optional().describe("If true, validates the diff without actually applying changes. Useful for testing. Defaults to false."),
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
});

export const ApplyUnifiedDiffTool = createTool({
  id: 'ApplyUnifiedDiff',
  name: 'ApplyUnifiedDiff',
  description: 'Applies unified diff content to files. Automatically detects single/multi-file diffs and extracts file paths from diff headers. Supports file creation, modification, and deletion.',
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
        saveDiffPath: params.saveDiffPath,
        dryRun: params.dryRun || false,
      });
      
      if (result.success) {
        // Update context with file changes for each affected file
        const contextData = codingContext.getData();
        const activeDiffs = { ...contextData.active_diffs };
        const openFiles = { ...contextData.open_files };
        
        // Process each affected file
        if (result.affectedFiles) {
          for (const filePath of result.affectedFiles) {
            // Convert absolute path to relative path for context storage
            const relativePath = path.relative(workspacePath, filePath);
            
            // Store the diff content
            activeDiffs[relativePath] = params.diffContent;
            
            // Try to read the updated file content for context (unless it's a dry run)
            if (!params.dryRun) {
              try {
                const updatedContent = await runtime.readFile(filePath);
                openFiles[relativePath] = {
                  content_hash: String(Date.now()),
                  last_read_content: updatedContent
                };
              } catch (e) {
                // File might have been deleted, remove from open files
                delete openFiles[relativePath];
              }
            }
          }
        }
        
        // Update the context
        codingContext.setData({
          ...contextData,
          active_diffs: activeDiffs,
          open_files: openFiles
        });
      }
      
      return {
        success: result.success,
        message: result.message,
        diff: result.diff,
        changesApplied: result.changesApplied,
        affectedFiles: result.affectedFiles,
        isMultiFile: result.isMultiFile,
        savedDiffPath: result.savedDiffPath,
        multiFileResults: result.multiFileResults,
        error: result.success ? undefined : result.message
      };
    } catch (error: any) {
      console.error(`ApplyUnifiedDiffTool error: ${error.message || error}`);
      return {
        success: false,
        message: `Failed to apply diff: ${error.message || 'Unknown error'}`
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

const ApplyEditBlockReturnsSchema = z.object({
  success: z.boolean().describe("Whether the edit block was successfully applied."),
  message: z.string().optional().describe("A descriptive message about the operation."),
  diff: z.string().optional().describe("The diff showing changes made to the file."),
  changesApplied: z.number().optional().describe("Number of changes applied (0 or 1 for edit blocks)."),
});

export const ApplyEditBlockTool = createTool({
  id: 'ApplyEditBlock',
  name: 'ApplyEditBlock',
  description: 'Applies an edit block by searching for exact code and replacing it. Perfect for targeted code modifications. Use empty searchBlock to create new files.',
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
      
      if (result.success && result.diff) {
        // Update context with file changes
        const contextData = codingContext.getData();
        const activeDiffs = { ...contextData.active_diffs };
        activeDiffs[params.path] = result.diff;
        
        const openFiles = { ...contextData.open_files };
        
        // Try to read the updated file content for context
        try {
          const updatedContent = await runtime.readFile(filePath);
          openFiles[params.path] = {
            content_hash: String(Date.now()),
            last_read_content: updatedContent
          };
        } catch (e) {
          // File might have been deleted, remove from open files
          delete openFiles[params.path];
        }
        
        // Update the context
        codingContext.setData({
          ...contextData,
          active_diffs: activeDiffs,
          open_files: openFiles
        });
        
        // Publish file modified event
        if (agent?.eventBus) {
          await agent.eventBus.publish({
            type: 'file_modified',
            source: 'agent',
            sessionId: agent.eventBus.getActiveSessions()[0] || 'default',
            payload: {
              path: params.path,
              tool: 'edit_block',
              changesApplied: result.changesApplied || 0,
              diff: result.diff
            }
          });
        }
      }
      
      return {
        success: result.success,
        message: result.message,
        diff: result.diff,
        changesApplied: result.changesApplied || 0
      };
    } catch (error: any) {
      console.error(`ApplyEditBlockTool error: ${error.message || error}`);
      return {
        success: false,
        message: `Failed to apply edit block: ${error.message || 'Unknown error'}`,
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
  preserveUnchangedMarkers: z.boolean().optional().describe("Whether to preserve unchanged markers in the content. Defaults to false."),
});

const ApplyRangedEditReturnsSchema = z.object({
  success: z.boolean().describe("Whether the ranged edit was successfully applied."),
  message: z.string().optional().describe("A descriptive message about the operation."),
  diff: z.string().optional().describe("The diff showing changes made to the file."),
  changesApplied: z.number().optional().describe("Number of changes applied (always 1 for ranged edits)."),
});

export const ApplyRangedEditTool = createTool({
  id: 'ApplyRangedEdit',
  name: 'ApplyRangedEdit',
  description: 'Applies content to a specific line range in a file. Perfect for precise line-based modifications. Use -1 for both start and end to append to file.',
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
          preserveUnchangedMarkers: params.preserveUnchangedMarkers
        }
      );
      
      if (result.success && result.diff) {
        // Update context with file changes
        const contextData = codingContext.getData();
        const activeDiffs = { ...contextData.active_diffs };
        activeDiffs[params.path] = result.diff;
        
        const openFiles = { ...contextData.open_files };
        
        // Try to read the updated file content for context
        try {
          const updatedContent = await runtime.readFile(filePath);
          openFiles[params.path] = {
            content_hash: String(Date.now()),
            last_read_content: updatedContent
          };
        } catch (e) {
          // File might have been deleted, remove from open files
          delete openFiles[params.path];
        }
        
        // Update the context
        codingContext.setData({
          ...contextData,
          active_diffs: activeDiffs,
          open_files: openFiles
        });
      }
      
      return {
        success: result.success,
        message: result.message,
        diff: result.diff,
        changesApplied: result.changesApplied || 0
      };
    } catch (error: any) {
      console.error(`ApplyRangedEditTool error: ${error.message || error}`);
      return {
        success: false,
        message: `Failed to apply ranged edit: ${error.message || 'Unknown error'}`,
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

const DeleteReturnsSchema = z.object({
  success: z.boolean().describe("Whether the file or directory was successfully deleted."),
  message: z.string().optional().describe("A descriptive message about the operation."),
  diff: z.string().optional().describe("The diff showing the deletion. Generated for files and non-empty directories."),
  changesApplied: z.number().optional().describe("Number of changes applied (1 if file/directory was deleted)."),
  deletedFiles: z.array(z.string()).optional().describe("List of files that were deleted (for directory deletions)."),
});

export const DeleteTool = createTool({
  id: 'delete',
  name: 'Delete',
  description: 'Deletes a file or directory. Generates diffs for files and non-empty directories. Empty directory deletion does not generate diffs.',
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
    
    // Update context with file changes
    const contextData = codingContext.getData();
    const activeDiffs = { ...contextData.active_diffs };
    activeDiffs[relativePath] = diffString;
    
    const openFiles = { ...contextData.open_files };
    // Remove from open files since it's deleted
    delete openFiles[relativePath];
    
    codingContext.setData({
      ...contextData,
      active_diffs: activeDiffs,
      open_files: openFiles
    });
    
    // Publish file deleted event
    if (agent?.eventBus) {
      await agent.eventBus.publish({
        type: 'file_deleted',
        source: 'agent',
        sessionId: agent.eventBus.getActiveSessions()[0] || 'default',
        payload: {
          path: relativePath,
          isDirectory: false,
          filesDeleted: [relativePath],
          diff: diffString
        }
      });
    }
    
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
        // Publish directory deleted event
        if (agent?.eventBus) {
          await agent.eventBus.publish({
            type: 'file_deleted',
            source: 'agent',
            sessionId: agent.eventBus.getActiveSessions()[0] || 'default',
            payload: {
              path: relativePath,
              isDirectory: true,
              filesDeleted: []
            }
          });
        }
        
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
        
        // Update context with file deletions
        const contextData = codingContext.getData();
        const activeDiffs = { ...contextData.active_diffs };
        const openFiles = { ...contextData.open_files };
        
        // Add the combined diff and remove deleted files from open files
        activeDiffs[relativePath] = combinedDiff;
        for (const deletedFile of deletedFiles) {
          delete openFiles[deletedFile];
        }
        
        codingContext.setData({
          ...contextData,
          active_diffs: activeDiffs,
          open_files: openFiles
        });
        
        // Publish directory deleted event
        if (agent?.eventBus) {
          await agent.eventBus.publish({
            type: 'file_deleted',
            source: 'agent',
            sessionId: agent.eventBus.getActiveSessions()[0] || 'default',
            payload: {
              path: relativePath,
              isDirectory: true,
              filesDeleted: deletedFiles,
              diff: combinedDiff
            }
          });
        }
        
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

// CreateDirectory Tool - with diff-like tracking
const CreateDirectoryParamsSchema = z.object({
  path: z.string().describe("The path for the new directory."),
  recursive: z.boolean().optional().describe("Create parent directories if they don't exist. Defaults to true."),
});

const CreateDirectoryReturnsSchema = z.object({
  success: z.boolean().describe("Whether the directory was successfully created."),
  message: z.string().optional().describe("A descriptive message about the operation."),
  changesApplied: z.number().optional().describe("Number of changes applied (1 if directory was created)."),
});

export const CreateDirectoryTool = createTool({
  id: 'CreateDirectory',
  name: 'CreateDirectory',
  description: 'Creates a new directory. Part of the diff-driven development system, but directory creation does not generate diffs.',
  inputSchema: CreateDirectoryParamsSchema,
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
    const dirPath = path.isAbsolute(params.path) ? params.path : path.join(workspacePath, params.path);
    
    console.log(`CreateDirectoryTool: Creating directory ${dirPath}`);
    
    try {
      // Check if directory already exists
      try {
        const status = await runtime.getFileStatus(dirPath);
        if (status.exists && status.type === 'dir') {
          return {
            success: true,
            message: `Directory ${params.path} already exists`,
            changesApplied: 0
          };
        } else if (status.exists && status.type === 'file') {
          return {
            success: false,
            message: `Path ${params.path} exists but is a file, not a directory`,
            changesApplied: 0
          };
        }
      } catch (e) {
        // Directory doesn't exist, which is what we want
      }
      
      // Create the directory
      const createSuccess = await runtime.createDirectory(dirPath, {
        recursive: params.recursive !== false // Default to true
      });
      
      if (!createSuccess) {
        return {
          success: false,
          message: `Failed to create directory ${params.path}`,
          changesApplied: 0
        };
      }
      
      // Publish directory created event
      if (agent?.eventBus) {
        await agent.eventBus.publish({
          type: 'directory_created',
          source: 'agent',
          sessionId: agent.eventBus.getActiveSessions()[0] || 'default',
          payload: {
            path: params.path,
            recursive: params.recursive !== false
          }
        });
      }
      
      // No diff generation for directory creation, just update context if needed
      return {
        success: true,
        message: `Directory ${params.path} created successfully`,
        changesApplied: 1
      };
    } catch (error: any) {
      console.error(`CreateDirectoryTool error: ${error.message || error}`);
      return {
        success: false,
        message: `Failed to create directory ${params.path}: ${error.message || 'Unknown error'}`,
        changesApplied: 0
      };
    }
  },
});

// ReadFile Tool - for completeness in the diff-driven system
const ReadFileParamsSchema = z.object({
  path: z.string().describe("The path to the file to read."),
  startLine: z.number().int().optional().describe("The one-indexed line number to start reading from (inclusive)."),
  endLine: z.number().int().optional().describe("The one-indexed line number to end reading at (inclusive)."),
});

const ReadFileReturnsSchema = z.object({
  success: z.boolean().describe("Whether the read operation was successful."),
  message: z.string().optional().describe("A message about the read operation."),
  content: z.string().describe("The content of the file segment read."),
  linesRead: z.number().int().describe("The number of lines read."),
});

export const ReadFileTool = createTool({
  id: 'ReadFile',
  name: 'ReadFile',
  description: 'Reads content from a specified file or a segment of it. Part of the diff-driven development system.',
  inputSchema: ReadFileParamsSchema,
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
    
    console.log(`ReadFileTool: Reading file ${filePath}`);
    
    try {
      // Use the runtime's readFile method directly
      const content = await runtime.readFile(filePath, {
        startLine: params.startLine,
        endLine: params.endLine
      });
      
      const linesRead = content ? content.split('\n').length : 0;
      
      // Update the coding context with the read file
      const contextData = codingContext.getData();
      const openFiles = { ...contextData.open_files };
      
      openFiles[params.path] = {
        content_hash: String(Date.now()), // Simple hash based on time
        last_read_content: content
      };
      
      codingContext.setData({
        ...contextData,
        open_files: openFiles
      });
      
      return {
        success: true,
        content,
        linesRead
      };
    } catch (error: any) {
      return {
        success: false,
        message: error.message || 'Unknown error',
        content: '',
        linesRead: 0
      };
    }
  },
});

const CompareFilesParamsSchema = z.object({
  oldFilePath: z.string().describe("The path to the old/original file."),
  newFilePath: z.string().describe("The path to the new/modified file."),
  oldPath: z.string().optional().describe("Custom path label for the old file in diff header (defaults to a/filename)."),
  newPath: z.string().optional().describe("Custom path label for the new file in diff header (defaults to b/filename)."),
});

const CompareFilesReturnsSchema = z.object({
  success: z.boolean().describe("Whether the comparison was successful."),
  message: z.string().optional().describe("A message about the comparison operation."),
  diff: z.string().optional().describe("The unified diff between the two files."),
  identical: z.boolean().optional().describe("Whether the files are identical."),
});

export const CompareFilesTool = createTool({
  id: 'CompareFiles',
  name: 'CompareFiles',
  description: 'Compares two files and generates a unified diff showing the differences between them.',
  inputSchema: CompareFilesParamsSchema,
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
    const oldFilePath = path.isAbsolute(params.oldFilePath) ? params.oldFilePath : path.join(workspacePath, params.oldFilePath);
    const newFilePath = path.isAbsolute(params.newFilePath) ? params.newFilePath : path.join(workspacePath, params.newFilePath);
    
    console.log(`CompareFilesTool: Comparing ${oldFilePath} with ${newFilePath}`);
    
    try {
      const diff = await runtime.compareFiles(oldFilePath, newFilePath, {
        oldPath: params.oldPath,
        newPath: params.newPath
      });
      
      // Check if files are identical (empty diff or only header lines)
      const diffLines = diff.split('\n').filter(line => line.startsWith('+') || line.startsWith('-'));
      const identical = diffLines.length === 0;
      
      return {
        success: true,
        diff: diff,
        identical: identical
      };
    } catch (error: any) {
      console.error(`CompareFilesTool error: ${error.message || error}`);
      return {
        success: false,
        message: error.message || 'Unknown error'
      };
    }
  },
});

const ReverseDiffParamsSchema = z.object({
  diffContent: z.string().describe("The unified diff content to reverse/undo. Supports both single-file and multi-file diffs."),
  baseDir: z.string().optional().describe("Base directory for resolving relative file paths. Defaults to current workspace."),
  includeFiles: z.array(z.string()).optional().describe("Only reverse changes for files that match these patterns."),
  excludeFiles: z.array(z.string()).optional().describe("Skip reversing changes for files that match these patterns."),
  dryRun: z.boolean().optional().describe("If true, generates the reversed diff without applying it. Defaults to false."),
  saveDiffPath: z.string().optional().describe("Path where to save the reversed diff content for reference."),
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
});

export const ReverseDiffTool = createTool({
  id: 'ReverseDiff',
  name: 'ReverseDiff',
  description: 'Reverses (undoes) a unified diff to rollback changes. Perfect for error recovery, feature toggling, and A/B testing workflows.',
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
    const baseDir = params.baseDir || workspacePath;
    
    console.log(`ReverseDiffTool: Reversing diff in base directory ${baseDir}`);
    
    try {
      // Generate the reversed diff using the diff utility
      const reverseResult = reverseDiff(params.diffContent, {
        includeFiles: params.includeFiles,
        excludeFiles: params.excludeFiles,
        dryRun: params.dryRun,
        checkConflicts: params.checkConflicts
      });
      
      if (!reverseResult.success) {
        return {
          success: false,
          message: reverseResult.message || 'Failed to reverse diff',
          changesApplied: 0
        };
      }
      
      let savedDiffPath: string | undefined;
      
      // Save the reversed diff if requested
      if (params.saveDiffPath) {
        const savePath = path.isAbsolute(params.saveDiffPath) 
          ? params.saveDiffPath 
          : path.join(baseDir, params.saveDiffPath);
        
        try {
          await runtime.writeFile(savePath, reverseResult.reversedDiff, {
            mode: 'create_or_overwrite'
          });
          savedDiffPath = savePath;
        } catch (saveError: any) {
          console.warn(`Failed to save reversed diff: ${saveError.message}`);
        }
      }
      
      // If not dry run, apply the reversed diff
      let applyResult;
      if (!params.dryRun) {
        applyResult = await runtime.applyUnifiedDiff(reverseResult.reversedDiff, {
          baseDir: baseDir
        });
        
        if (!applyResult.success) {
          return {
            success: false,
            message: `Failed to apply reversed diff: ${applyResult.message}`,
            reversedDiff: reverseResult.reversedDiff,
            changesApplied: 0,
            savedDiffPath
          };
        }
        
        // Update context with the rollback changes
        const contextData = codingContext.getData();
        const activeDiffs = { ...contextData.active_diffs };
        const openFiles = { ...contextData.open_files };
        
        // Process each affected file
        if (applyResult.affectedFiles) {
          for (const filePath of applyResult.affectedFiles) {
            const relativePath = path.relative(workspacePath, filePath);
            
            // Store the reversed diff as the active diff
            activeDiffs[relativePath] = reverseResult.reversedDiff;
            
            // Update file content if file still exists
            try {
              const updatedContent = await runtime.readFile(filePath);
              openFiles[relativePath] = {
                content_hash: String(Date.now()),
                last_read_content: updatedContent
              };
            } catch (e) {
              // File might have been deleted by the reversal
              delete openFiles[relativePath];
            }
          }
        }
        
        // Update the context
        codingContext.setData({
          ...contextData,
          active_diffs: activeDiffs,
          open_files: openFiles
        });
        
        // Publish diff reversed event
        if (agent?.eventBus) {
          await agent.eventBus.publish({
            type: 'diff_reversed',
            source: 'agent',
            sessionId: agent.eventBus.getActiveSessions()[0] || 'default',
            payload: {
              affectedFiles: reverseResult.affectedFiles,
              changesReverted: applyResult.changesApplied || 0,
              reason: 'User requested rollback'
            }
          });
        }
        
        return {
          success: true,
          message: `Successfully reversed and applied diff affecting ${applyResult.changesApplied} file(s)`,
          reversedDiff: reverseResult.reversedDiff,
          changesApplied: applyResult.changesApplied,
          affectedFiles: reverseResult.affectedFiles,
          conflicts: reverseResult.conflicts,
          savedDiffPath
        };
      } else {
        // Dry run mode - just return the reversed diff
        return {
          success: true,
          message: `[DRY RUN] Generated reversed diff affecting ${reverseResult.affectedFiles.length} file(s)`,
          reversedDiff: reverseResult.reversedDiff,
          changesApplied: 0,
          affectedFiles: reverseResult.affectedFiles,
          conflicts: reverseResult.conflicts,
          savedDiffPath
        };
      }
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

// Tool Usage Examples for better LLM understanding
export const EditingStrategyToolExamples = `
## Diff-Driven Development Tools - Comprehensive Guide

This is a complete diff-driven development system where every file operation generates a corresponding diff for snapshot tracking.

### ApplyEditBlock Tool - Aider-Style Search and Replace

Perfect for targeted code modifications by searching for exact code blocks.

#### Example 1: Function Modification
\`\`\`
Tool: ApplyEditBlock
Input: {
  "path": "src/utils.js",
  "searchBlock": "function calculateTotal(items) {\\n  return items.reduce((sum, item) => sum + item.price, 0);\\n}",
  "replaceBlock": "function calculateTotal(items) {\\n  const total = items.reduce((sum, item) => sum + item.price, 0);\\n  return Math.round(total * 100) / 100; // Round to 2 decimal places\\n}"
}
Result: Modifies the function and returns a diff showing the exact changes
\`\`\`

#### Example 2: Adding New Code (Empty Search Block)
\`\`\`
Tool: ApplyEditBlock
Input: {
  "path": "src/config.js",
  "searchBlock": "",
  "replaceBlock": "const config = {\\n  apiUrl: 'https://api.example.com',\\n  timeout: 5000\\n};\\n\\nmodule.exports = config;"
}
Result: Creates a new file with the specified content and generates creation diff
\`\`\`

#### Example 3: Whitespace-Insensitive Matching
\`\`\`
Tool: ApplyEditBlock
Input: {
  "path": "src/component.jsx",
  "searchBlock": "const Component = () => {\\nreturn <div>Hello</div>;\\n};",
  "replaceBlock": "const Component = () => {\\n  return (\\n    <div className=\\"greeting\\">\\n      Hello World!\\n    </div>\\n  );\\n};",
  "ignoreWhitespace": true
}
Result: Matches despite whitespace differences and applies the replacement
\`\`\`

### ApplyRangedEdit Tool - OpenHands-Style Line Range Editing

Perfect for precise line-based modifications when you know exact line numbers.

#### Example 1: Replace Specific Lines
\`\`\`
Tool: ApplyRangedEdit
Input: {
  "path": "package.json",
  "content": "  \\"version\\": \\"2.0.0\\",\\n  \\"description\\": \\"Updated package with new features\\",",
  "startLine": 3,
  "endLine": 4
}
Result: Replaces lines 3-4 with new content and generates diff
\`\`\`

#### Example 2: Append to File
\`\`\`
Tool: ApplyRangedEdit
Input: {
  "path": "README.md",
  "content": "\\n## Changelog\\n\\n- v2.0.0: Added new features\\n- v1.0.0: Initial release",
  "startLine": -1,
  "endLine": -1
}
Result: Appends content to end of file and generates diff
\`\`\`

#### Example 3: Insert at Beginning
\`\`\`
Tool: ApplyRangedEdit
Input: {
  "path": "script.py",
  "content": "#!/usr/bin/env python3\\n# -*- coding: utf-8 -*-\\n",
  "startLine": 1,
  "endLine": 0
}
Result: Inserts content at the beginning of the file
\`\`\`

### DeleteFile Tool - Diff-Tracked File Deletion

Deletes files while generating diffs for complete change tracking.

#### Example 1: Delete Temporary File
\`\`\`
Tool: DeleteFile
Input: {
  "path": "temp/cache.tmp"
}
Result: Deletes file and generates diff showing all removed content
\`\`\`

### CreateDirectory Tool - Diff-Tracked Directory Creation

Creates directories with diff-like tracking for the development system.

#### Example 1: Create Project Structure
\`\`\`
Tool: CreateDirectory
Input: {
  "path": "src/components",
  "recursive": true
}
Result: Creates directory structure and generates diff-like representation
\`\`\`

### ApplyUnifiedDiff Tool - Standard Unified Diff Application

Handles standard unified diff format for complex multi-file operations.

#### Example 1: Multi-File Refactoring
\`\`\`
Tool: ApplyUnifiedDiff
Input: {
  "diffContent": "--- a/src/api.js\\n+++ b/src/api.js\\n@@ -1,5 +1,7 @@\\n const axios = require('axios');\\n+const config = require('./config');\\n \\n-const API_URL = 'https://api.example.com';\\n+const API_URL = config.apiUrl;\\n \\n async function fetchData() {\\n   return axios.get(API_URL);\\n }",
  "saveDiffPath": "diffs/api-refactor.patch"
}
Result: Applies multi-file changes and saves diff for potential reversal
\`\`\`

### ReadFile Tool - Content Reading for Context

Reads file content to maintain context in the diff-driven system.

#### Example 1: Read Specific Lines
\`\`\`
Tool: ReadFile
Input: {
  "path": "src/main.js",
  "startLine": 10,
  "endLine": 20
}
Result: Returns content of lines 10-20 and updates context
\`\`\`

### CompareFiles Tool - Diff Generation Between Files

Generates diffs between two files for analysis.

#### Example 1: Compare Versions
\`\`\`
Tool: CompareFiles
Input: {
  "oldFilePath": "config/production.json",
  "newFilePath": "config/staging.json"
}
Result: Returns unified diff showing differences between configurations
\`\`\`

## Key Features of the Diff-Driven System:

1. **Complete Change Tracking**: Every operation generates a diff
2. **Snapshot Capability**: All diffs are stored for rollback/analysis
3. **Multiple Edit Strategies**: Choose the best tool for each task
4. **Context Awareness**: Tools update the coding context automatically
5. **Unified Interface**: Consistent return format across all tools
6. **Error Handling**: Graceful failure with descriptive messages

## Best Practices:

1. **Use ApplyEditBlock** for targeted code changes when you know the exact code
2. **Use ApplyRangedEdit** for line-based edits when you know line numbers
3. **Use ApplyUnifiedDiff** for complex multi-file operations or when you have existing diffs
4. **Always save important diffs** using saveDiffPath for potential reversal
5. **Use dry run mode** to test complex changes before applying
6. **Read files first** to understand context before making changes
`;

// Export the complete toolset
export const EditingStrategyToolSet = [
  ReadFileTool,
  ApplyWholeFileEditTool,
  ApplyEditBlockTool,
  ApplyRangedEditTool,
  ApplyUnifiedDiffTool,
  ReverseDiffTool,
  DeleteTool,
  CreateDirectoryTool,
  CompareFilesTool,
];