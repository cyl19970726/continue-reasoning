/**
 * Snapshot-Enhanced Editing Tools
 * Wraps existing editing tools to add automatic snapshot creation and dryRun support
 */

import { z } from 'zod';
import { createTool } from '../../../../core/utils';
import { IAgent } from '../../../../core/interfaces';
import { IRuntime } from '../runtime/interface';
import { SimpleSnapshotManager } from './simple-snapshot-manager';
import * as path from 'path';

// Helper function to create snapshot-enhanced tool
function createSnapshotEnhancedTool(originalTool: any, toolName: string) {
  // Extend the original schema with dryRun
  const enhancedInputSchema = originalTool.inputSchema.extend({
    dryRun: z.boolean().optional().describe("如果为true，只生成预览不实际执行操作，默认false"),
    description: z.string().optional().describe("操作描述，用于快照记录")
  });

  const enhancedOutputSchema = originalTool.outputSchema ? originalTool.outputSchema.extend({
    snapshotId: z.string().optional().describe("创建的快照ID (dryRun时为null)"),
    previewDiff: z.string().optional().describe("预览的diff内容 (dryRun时)")
  }) : z.object({
    success: z.boolean(),
    message: z.string().optional(),
    diff: z.string().optional(),
    snapshotId: z.string().optional(),
    previewDiff: z.string().optional()
  });

  return createTool({
    id: `${originalTool.id}Enhanced`,
    name: `${originalTool.name}Enhanced`,
    description: `${originalTool.description} Enhanced with snapshot creation and dryRun support.`,
    inputSchema: enhancedInputSchema,
    outputSchema: enhancedOutputSchema,
    async: true,
    execute: async (params, agent?: IAgent) => {
      const startTime = Date.now();
      
      try {
        const codingContext = agent?.contextManager.findContextById('coding-context');
        if (!codingContext) {
          throw new Error('Coding context not found');
        }

        const runtime = (codingContext as any).getRuntime() as IRuntime;
        if (!runtime) {
          throw new Error('Runtime not found in the coding context');
        }

        const workspacePath = codingContext.getData()?.current_workspace || process.cwd();
        const snapshotManager = new SimpleSnapshotManager(workspacePath);

        // If dryRun, we need to simulate the operation
        if (params.dryRun) {
          const previewResult = await simulateOperation(originalTool, params, runtime, workspacePath);
          return {
            success: true,
            message: `[DRY RUN] Preview of ${toolName} operation`,
            previewDiff: previewResult.diff,
            snapshotId: null
          };
        }

        // Execute the original tool
        const originalParams = { ...params };
        delete originalParams.dryRun;
        delete originalParams.description;
        
        const result = await originalTool.execute(originalParams, agent);

        // If the operation was successful and generated a diff, create a snapshot
        if (result.success && result.diff) {
          try {
            const executionTime = Date.now() - startTime;
            const affectedFiles = extractAffectedFiles(result, params);
            
            const snapshotId = await snapshotManager.createSnapshot({
              tool: toolName,
              description: params.description || generateDescription(toolName, params),
              affectedFiles,
              diff: result.diff,
              context: {
                sessionId: agent?.eventBus?.getActiveSessions()[0] || 'default',
                toolParams: originalParams
              },
              metadata: {
                filesSizeBytes: calculateFileSize(result),
                linesChanged: countLinesChanged(result.diff),
                executionTimeMs: executionTime
              }
            });

            return {
              ...result,
              snapshotId
            };
          } catch (snapshotError) {
            console.warn('Failed to create snapshot:', snapshotError);
            // Still return the original result even if snapshot creation failed
            return result;
          }
        }

        return result;
      } catch (error: any) {
        console.error(`${toolName}Enhanced error:`, error);
        return {
          success: false,
          message: `Failed to execute ${toolName}: ${error.message || 'Unknown error'}`
        };
      }
    }
  });
}

// Helper function to simulate operations for dryRun
async function simulateOperation(originalTool: any, params: any, runtime: IRuntime, workspacePath: string) {
  try {
    // For file operations, we can simulate by reading current content and generating diff
    if (params.path) {
      const filePath = path.isAbsolute(params.path) ? params.path : path.join(workspacePath, params.path);
      
      let oldContent = '';
      let fileExists = false;
      
      try {
        const status = await runtime.getFileStatus(filePath);
        fileExists = status.exists && status.type === 'file';
        if (fileExists) {
          oldContent = await runtime.readFile(filePath);
        }
      } catch (e) {
        // File doesn't exist
      }

      // Generate preview diff based on tool type
      let newContent = '';
      
      if (originalTool.id === 'ApplyWholeFileEdit') {
        newContent = params.content;
      } else if (originalTool.id === 'ApplyEditBlock') {
        if (fileExists) {
          newContent = oldContent.replace(params.searchBlock, params.replaceBlock);
        } else {
          newContent = params.replaceBlock;
        }
      } else if (originalTool.id === 'ApplyRangedEdit') {
        if (fileExists) {
          const lines = oldContent.split('\n');
          if (params.startLine === -1 && params.endLine === -1) {
            // Append mode
            newContent = oldContent + '\n' + params.content;
          } else {
            // Replace lines
            const newLines = [...lines];
            const startIdx = params.startLine - 1;
            const endIdx = params.endLine - 1;
            newLines.splice(startIdx, endIdx - startIdx + 1, ...params.content.split('\n'));
            newContent = newLines.join('\n');
          }
        } else {
          newContent = params.content;
        }
      }

      // Generate diff
      const { generateUnifiedDiff } = await import('../runtime/diff');
      const diff = await generateUnifiedDiff(oldContent, newContent, {
        oldPath: fileExists ? `a/${params.path}` : '/dev/null',
        newPath: `b/${params.path}`
      });

      return { diff };
    }

    return { diff: 'No preview available for this operation type' };
  } catch (error) {
    return { diff: `Preview error: ${error instanceof Error ? error.message : 'Unknown error'}` };
  }
}

// Helper functions
function extractAffectedFiles(result: any, params: any): string[] {
  if (result.affectedFiles) {
    return result.affectedFiles;
  }
  if (params.path) {
    return [params.path];
  }
  if (result.multiFileResults) {
    return result.multiFileResults.map((r: any) => r.filePath);
  }
  return [];
}

function generateDescription(toolName: string, params: any): string {
  switch (toolName) {
    case 'ApplyWholeFileEdit':
      return `Update entire file: ${params.path}`;
    case 'ApplyEditBlock':
      return `Edit code block in: ${params.path}`;
    case 'ApplyRangedEdit':
      return `Edit lines ${params.startLine}-${params.endLine} in: ${params.path}`;
    case 'ApplyUnifiedDiff':
      return 'Apply unified diff changes';
    case 'Delete':
      return `Delete: ${params.path}`;
    case 'CreateDirectory':
      return `Create directory: ${params.path}`;
    default:
      return `${toolName} operation`;
  }
}

function calculateFileSize(result: any): number {
  // Simple heuristic - could be improved
  if (result.diff) {
    return result.diff.length;
  }
  return 0;
}

function countLinesChanged(diff: string): number {
  const lines = diff.split('\n');
  return lines.filter(line => line.startsWith('+') || line.startsWith('-')).length;
}

// Import original tools (we'll need to import these from the actual file)
// For now, we'll create a placeholder that can be used once the tools are available

export async function createSnapshotEnhancedTools() {
  try {
    // Import original tools
    const originalTools = await import('../toolsets/editing-strategy-tools');
    
    return [
      createSnapshotEnhancedTool(originalTools.ApplyWholeFileEditTool, 'ApplyWholeFileEdit'),
      createSnapshotEnhancedTool(originalTools.ApplyEditBlockTool, 'ApplyEditBlock'),
      createSnapshotEnhancedTool(originalTools.ApplyRangedEditTool, 'ApplyRangedEdit'),
      createSnapshotEnhancedTool(originalTools.ApplyUnifiedDiffTool, 'ApplyUnifiedDiff'),
      createSnapshotEnhancedTool(originalTools.DeleteTool, 'Delete'),
      createSnapshotEnhancedTool(originalTools.CreateDirectoryTool, 'CreateDirectory'),
      // Note: We exclude ReverseDiff as it's replaced by ReverseOp
      // Note: ReadFile and CompareFiles don't need snapshots as they don't modify files
    ];
  } catch (error) {
    console.error('Failed to create snapshot-enhanced tools:', error);
    return [];
  }
}

// Simpler version that creates enhanced versions of specific tools
export function createEnhancedWholeFileEditTool() {
  const ApplyWholeFileEditParamsSchema = z.object({
    path: z.string().describe("The path to the file to be edited."),
    content: z.string().describe("The new, entire content for the file."),
    dryRun: z.boolean().optional().describe("如果为true，只生成预览不实际执行操作，默认false"),
    description: z.string().optional().describe("操作描述，用于快照记录")
  });

  const ApplyWholeFileEditReturnsSchema = z.object({
    success: z.boolean().describe("Whether the file edit was successfully applied."),
    message: z.string().optional().describe("A descriptive message about the operation."),
    diff: z.string().optional().describe("The diff showing changes made to the file."),
    snapshotId: z.string().optional().describe("创建的快照ID (dryRun时为null)"),
    previewDiff: z.string().optional().describe("预览的diff内容 (dryRun时)")
  });

  return createTool({
    id: 'ApplyWholeFileEditEnhanced',
    name: 'ApplyWholeFileEditEnhanced',
    description: 'Primary tool for creating new files or completely replacing existing file content. Enhanced with snapshot creation and dryRun support.',
    inputSchema: ApplyWholeFileEditParamsSchema,
    outputSchema: ApplyWholeFileEditReturnsSchema,
    async: true,
    execute: async (params, agent?: IAgent) => {
      const startTime = Date.now();
      
      try {
        const codingContext = agent?.contextManager.findContextById('coding-context');
        if (!codingContext) {
          throw new Error('Coding context not found');
        }

        const runtime = (codingContext as any).getRuntime() as IRuntime;
        if (!runtime) {
          throw new Error('Runtime not found in the coding context');
        }

        const workspacePath = codingContext.getData()?.current_workspace || process.cwd();
        const filePath = path.isAbsolute(params.path) ? params.path : path.join(workspacePath, params.path);
        
        // Check if file exists to determine if we're creating a new file
        let oldContent = '';
        let fileExists = false;
        
        try {
          const status = await runtime.getFileStatus(filePath);
          fileExists = status.exists && status.type === 'file';
          
          if (fileExists) {
            oldContent = await runtime.readFile(filePath);
          }
        } catch (e: any) {
          if (e?.code === 'ENOENT') {
            fileExists = false;
          } else {
            throw new Error(e?.message || String(e));
          }
        }

        // Generate diff for preview or actual operation
        let diffString = '';
        if (fileExists && oldContent) {
          diffString = await runtime.generateDiff(oldContent, params.content, {
            oldPath: `a/${params.path}`,
            newPath: `b/${params.path}`
          });
        } else {
          const lines = params.content.split('\n');
          diffString = `--- /dev/null\n+++ b/${params.path}\n@@ -0,0 +1,${lines.length} @@\n`;
          for (const line of lines) {
            diffString += `+${line}\n`;
          }
        }

        // If dryRun, return preview without making changes
        if (params.dryRun) {
          return {
            success: true,
            message: `[DRY RUN] Preview of file ${fileExists ? 'update' : 'creation'}: ${params.path}`,
            previewDiff: diffString,
            snapshotId: null
          };
        }

        // Execute the actual file write
        const writeResult = await runtime.writeFile(filePath, params.content, {
          mode: 'create_or_overwrite'
        });
        
        if (!writeResult.success) {
          throw new Error(writeResult.message || 'Failed to write file');
        }

        // Update context with file changes
        const contextData = codingContext.getData();
        const activeDiffs = { ...contextData.active_diffs };
        activeDiffs[params.path] = diffString;
        
        const openFiles = { ...contextData.open_files };
        openFiles[params.path] = {
          content_hash: String(Date.now()),
          last_read_content: params.content
        };
        
        codingContext.setData({
          ...contextData,
          active_diffs: activeDiffs,
          open_files: openFiles
        });

        // Create snapshot
        let snapshotId: string | undefined;
        try {
          const snapshotManager = new SimpleSnapshotManager(workspacePath);
          const executionTime = Date.now() - startTime;
          
          snapshotId = await snapshotManager.createSnapshot({
            tool: 'ApplyWholeFileEdit',
            description: params.description || `${fileExists ? 'Update' : 'Create'} file: ${params.path}`,
            affectedFiles: [params.path],
            diff: diffString,
            context: {
              sessionId: agent?.eventBus?.getActiveSessions()[0] || 'default',
              toolParams: { path: params.path, contentLength: params.content.length }
            },
            metadata: {
              filesSizeBytes: params.content.length,
              linesChanged: countLinesChanged(diffString),
              executionTimeMs: executionTime
            }
          });
        } catch (snapshotError) {
          console.warn('Failed to create snapshot:', snapshotError);
        }

        // Publish event
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
          diff: diffString,
          snapshotId
        };
      } catch (error: any) {
        console.error(`ApplyWholeFileEditEnhanced error: ${error.message || error}`);
        return {
          success: false,
          message: `Failed to write to file ${params.path}: ${error.message || 'Unknown error'}`
        };
      }
    }
  });
}

export const SnapshotEnhancedApplyWholeFileEditTool = createEnhancedWholeFileEditTool();