import { z } from 'zod';
import { createTool } from '../../../utils';
import { IAgent } from '../../../interfaces';
import { IRuntime } from '../runtime/interface';
import * as path from 'path';

// ReadFileTool
const ReadFileParamsSchema = z.object({
  path: z.string().describe("The path to the file to read."),
  start_line: z.number().int().optional().describe("The one-indexed line number to start reading from (inclusive)."),
  end_line: z.number().int().optional().describe("The one-indexed line number to end reading at (inclusive)."),
});

const ReadFileReturnsSchema = z.object({
  content: z.string().describe("The content of the file segment read."),
  lines_read: z.number().int().describe("The number of lines read."),
});

export const ReadFileTool = createTool({
  id: 'read_file_gemini', 
  name: 'ReadFile',
  description: 'Reads content from a specified file or a segment of it.',
  inputSchema: ReadFileParamsSchema,
  outputSchema: ReadFileReturnsSchema,
  async: true,
  execute: async (params, agent?: IAgent) => {
    // Get the coding context
    const codingContext = agent?.contextManager.findContextById('coding_gemini');
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
        startLine: params.start_line,
        endLine: params.end_line
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
        content,
        lines_read: linesRead
      };
    } catch (error: any) {
      console.error(`ReadFileTool error: ${error}`);
      throw new Error(`Failed to read file ${params.path}: ${error.message}`);
    }
  },
});

// WriteFileTool
const WriteFileParamsSchema = z.object({
  path: z.string().describe("The path to the file to write."),
  content: z.string().describe("The content to write to the file."),
  start_line: z.number().int().optional().describe("For 'overwrite_range' mode, the line to start overwriting."),
  end_line: z.number().int().optional().describe("For 'overwrite_range' mode, the line to end overwriting."),
  mode: z.enum(["overwrite", "append", "overwrite_range", "create_or_overwrite"])
    .optional()
    .describe("The mode of writing: 'overwrite', 'append', 'overwrite_range', 'create_or_overwrite' (default: 'create_or_overwrite' if not specified)."),
});

const WriteFileReturnsSchema = z.object({
  success: z.boolean().describe("Whether the write operation was successful."),
  message: z.string().optional().describe("An optional message about the operation."),
});

export const WriteFileTool = createTool({
  id: 'write_file_gemini', 
  name: 'WriteFile',
  description: 'Writes content to a specified file.',
  inputSchema: WriteFileParamsSchema,
  outputSchema: WriteFileReturnsSchema,
  async: true,
  execute: async (params, agent?: IAgent) => {
    // Get the coding context
    const codingContext = agent?.contextManager.findContextById('coding_gemini');
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
    
    // Handle default value for mode
    const mode = params.mode || "create_or_overwrite";
    
    console.log(`WriteFileTool: Writing to file ${filePath} in mode ${mode}`);
    
    try {
      // Use the runtime's writeFile method directly
      const result = await runtime.writeFile(filePath, params.content, {
        mode: mode as any, // The types should match
        startLine: params.start_line,
        endLine: params.end_line
      });
      
      if (!result.success) {
        throw new Error(result.message || `Failed to write to file ${params.path}`);
      }
      
      return {
        success: true,
        message: result.message || `Successfully wrote to ${params.path}`
      };
    } catch (error: any) {
      console.error(`WriteFileTool error: ${error}`);
      return {
        success: false,
        message: `Failed to write to ${params.path}: ${error.message}`
      };
    }
  },
});

// ListDirectoryTool
const ListDirectoryParamsSchema = z.object({
    path: z.string().describe("Path to the directory to list."),
    recursive: z.boolean().optional().describe("Whether to list recursively."),
    max_depth: z.number().int().optional().describe("Maximum depth for recursive listing."),
});

const ListDirectoryEntrySchema = z.object({
    name: z.string(),
    type: z.enum(["file", "dir"]),
});

const ListDirectoryReturnsSchema = z.object({
    entries: z.array(ListDirectoryEntrySchema).describe("List of files and directories."),
});

export const ListDirectoryTool = createTool({
    id: 'list_directory_gemini',
    name: 'ListDirectory',
    description: 'Lists the contents of a directory.',
    inputSchema: ListDirectoryParamsSchema,
    outputSchema: ListDirectoryReturnsSchema,
    async: true,
    execute: async (params, agent?: IAgent) => {
      // Get the coding context
      const codingContext = agent?.contextManager.findContextById('coding_gemini');
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
      
      console.log(`ListDirectoryTool: Listing directory ${dirPath}`);
      
      try {
        // Use the runtime's listDirectory method directly
        const entries = await runtime.listDirectory(dirPath, {
          recursive: params.recursive,
          maxDepth: params.max_depth
        });
        
        // Convert to the expected output format
        const formattedEntries = entries.map(entry => ({
          name: entry.name,
          type: entry.type
        }));
        
        return { entries: formattedEntries };
      } catch (error: any) {
        console.error(`ListDirectoryTool error: ${error}`);
        throw new Error(`Failed to list directory ${params.path}: ${error.message}`);
      }
    },
});

// GetFileStatusTool
const GetFileStatusParamsSchema = z.object({
    path: z.string().describe("Path to the file or directory."),
});

const GetFileStatusReturnsSchema = z.object({
    size: z.number().int().describe("Size in bytes."),
    type: z.enum(["file", "dir"]).describe("Type of the entry."),
    modified_at: z.string().datetime().describe("Last modification timestamp (ISO 8601)."), 
    exists: z.boolean().describe("Whether the file or directory exists."),
});

export const GetFileStatusTool = createTool({
    id: 'get_file_status_gemini',
    name: 'GetFileStatus',
    description: 'Gets the status of a file or directory.',
    inputSchema: GetFileStatusParamsSchema,
    outputSchema: GetFileStatusReturnsSchema,
    async: true,
    execute: async (params, agent?: IAgent) => {
      // Get the coding context
      const codingContext = agent?.contextManager.findContextById('coding_gemini');
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
      
      console.log(`GetFileStatusTool: Getting status for ${filePath}`);
      
      try {
        // Use the runtime's getFileStatus method directly
        const status = await runtime.getFileStatus(filePath);
        
        return {
          size: status.size,
          type: status.type,
          modified_at: status.modifiedAt.toISOString(),
          exists: status.exists
        };
      } catch (error: any) {
        console.error(`GetFileStatusTool error: ${error}`);
        throw new Error(`Failed to get status for ${params.path}: ${error.message}`);
      }
    },
});

// DeleteFileTool
const DeleteFileParamsSchema = z.object({
    path: z.string().describe("Path to the file to delete."),
});
const DeleteFileReturnsSchema = z.object({
    success: z.boolean(),
});
export const DeleteFileTool = createTool({
    id: 'delete_file_gemini',
    name: 'DeleteFile',
    description: 'Deletes a file.',
    inputSchema: DeleteFileParamsSchema,
    outputSchema: DeleteFileReturnsSchema,
    async: true,
    execute: async (params, agent?: IAgent) => {
      // Get the coding context
      const codingContext = agent?.contextManager.findContextById('coding_gemini');
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
      
      console.log(`DeleteFileTool: Deleting ${filePath}`);
      
      try {
        // Use the runtime's deleteFile method directly
        const success = await runtime.deleteFile(filePath);
        return { success };
      } catch (error: any) {
        console.error(`DeleteFileTool error: ${error}`);
        return { success: false };
      }
    }
});

// CreateDirectoryTool
const CreateDirectoryParamsSchema = z.object({
    path: z.string().describe("Path for the new directory."),
    recursive: z.boolean().optional().describe("Create parent directories if they don't exist."),
});
const CreateDirectoryReturnsSchema = z.object({
    success: z.boolean(),
});
export const CreateDirectoryTool = createTool({
    id: 'create_directory_gemini',
    name: 'CreateDirectory',
    description: 'Creates a new directory.',
    inputSchema: CreateDirectoryParamsSchema,
    outputSchema: CreateDirectoryReturnsSchema,
    async: true,
    execute: async (params, agent?: IAgent) => {
      // Get the coding context
      const codingContext = agent?.contextManager.findContextById('coding_gemini');
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
        // Use the runtime's createDirectory method directly
        const success = await runtime.createDirectory(dirPath, {
          recursive: params.recursive
        });
        return { success };
      } catch (error: any) {
        console.error(`CreateDirectoryTool error: ${error}`);
        return { success: false };
      }
    }
});

export const FileSystemToolSet = [
  ReadFileTool,
  WriteFileTool,
  ListDirectoryTool,
  GetFileStatusTool,
  DeleteFileTool,
  CreateDirectoryTool,
]; 