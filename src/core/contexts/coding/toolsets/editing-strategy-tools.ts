// src/core/contexts/coding/toolsets/editing-strategy-tools.ts
import { z } from 'zod';
import { createTool } from '../../../utils';
import { IAgent } from '../../../interfaces';
import { IRuntime } from '../runtime/interface';
import * as path from 'path';
// For diff generation, we might need a library or a utility function.
// For now, we'll return a placeholder diff.
// import { diffLines } from 'diff'; // Example if using 'diff' library

const ApplyWholeFileEditParamsSchema = z.object({
  path: z.string().describe("The path to the file to be edited."),
  content: z.string().describe("The new, entire content for the file."),
});

const ApplyWholeFileEditReturnsSchema = z.object({
  success: z.boolean().describe("Whether the file was successfully written."),
  message: z.string().optional().describe("An optional message about the operation."),
});

export const ApplyWholeFileEditTool = createTool({
  id: 'apply_whole_file_edit_gemini',
  name: 'ApplyWholeFileEdit',
  description: 'Overwrites or creates a file with the provided new content. Returns a diff of the changes.',
  inputSchema: ApplyWholeFileEditParamsSchema,
  outputSchema: ApplyWholeFileEditReturnsSchema,
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
      
      return {
        success: true,
        message: fileExists 
          ? `File ${params.path} updated successfully.` 
          : `File ${params.path} created successfully.`
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

export const EditingStrategyToolSet = [
    ApplyWholeFileEditTool,
]; 