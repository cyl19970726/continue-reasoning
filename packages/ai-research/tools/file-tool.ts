import { ITool, ToolCallDefinition } from '../interfaces.js';
import { z } from 'zod';
import fs from 'fs';
import path from 'path';

export function createFileTool(): ITool {
  const paramsSchema = z.object({
    operation: z.enum(['read', 'write', 'list', 'exists']).describe('要执行的文件操作类型'),
    path: z.string().describe('文件或目录路径'),
    content: z.string().optional().describe('写入文件的内容（仅在write操作时需要）')
  });

  return {
    name: 'file_operations',
    description: '文件操作工具，支持读取、写入和列出文件',
    params: paramsSchema,
    
    async execute_func(params: { 
      operation: 'read' | 'write' | 'list' | 'exists';
      path: string;
      content?: string;
    }) {
      const { operation, path: filePath, content } = params;
      
      try {
        switch (operation) {
          case 'read':
            if (!fs.existsSync(filePath)) {
              return { success: false, error: `文件不存在: ${filePath}` };
            }
            const fileContent = fs.readFileSync(filePath, 'utf-8');
            return { 
              success: true, 
              content: fileContent,
              size: fileContent.length
            };
            
          case 'write':
            if (!content) {
              return { success: false, error: '写入操作需要提供content参数' };
            }
            // 确保目录存在
            const dir = path.dirname(filePath);
            if (!fs.existsSync(dir)) {
              fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(filePath, content, 'utf-8');
            return { 
              success: true, 
              message: `文件已写入: ${filePath}`,
              size: content.length
            };
            
          case 'list':
            if (!fs.existsSync(filePath)) {
              return { success: false, error: `目录不存在: ${filePath}` };
            }
            const files = fs.readdirSync(filePath).map(file => {
              const fullPath = path.join(filePath, file);
              const stats = fs.statSync(fullPath);
              return {
                name: file,
                isDirectory: stats.isDirectory(),
                size: stats.size,
                modified: stats.mtime.toISOString()
              };
            });
            return { success: true, files };
            
          case 'exists':
            return { 
              success: true, 
              exists: fs.existsSync(filePath),
              path: filePath
            };
            
          default:
            return { success: false, error: `不支持的操作: ${operation}` };
        }
      } catch (error) {
        return { 
          success: false, 
          error: error instanceof Error ? error.message : String(error)
        };
      }
    },
    
    toCallDefinition(): ToolCallDefinition {
      return {
        type: 'function',
        name: this.name,
        description: this.description,
        paramSchema: paramsSchema,
        strict: false
      };
    }
  };
} 