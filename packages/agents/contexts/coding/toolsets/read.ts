// src/core/contexts/coding/toolsets/editing-strategy-tools.ts
import { z } from 'zod';
import { createTool } from '@continue-reasoning/core';
import { IAgent } from '@continue-reasoning/core';
import { IRuntime } from '../runtime/interface.js';
import * as path from 'path';

// ReadFile Tool - for completeness in the diff-driven system
const ReadFileParamsSchema = z.object({
    path: z.string().describe("The path to the file to read."),
    startLine: z.number().int().optional().describe("The one-indexed line number to start reading from (inclusive)."),
    endLine: z.number().int().optional().describe("The one-indexed line number to end reading at (inclusive)."),
});
  
export const ReadFileTool = createTool({
id: 'ReadFile',
name: 'ReadFile',
description: `Reads content from a specified file or a segment of it.

Example:
- **Read File Segment**:
  - **Path**: "existing_file.txt"
  - **Start Line**: 1
  - **End Line**: 10

- **Read Whole File**:
  - **Goal**: Read the content of "existing_file.txt"
  - **Path**: "existing_file.txt"
`,
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