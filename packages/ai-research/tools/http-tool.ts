import { ITool, ToolCallDefinition } from '../interfaces.js';
import { z } from 'zod';

export function createHttpTool(): ITool {
  const paramsSchema = z.object({
    url: z.string().describe('请求的URL'),
    method: z.enum(['GET', 'POST', 'PUT', 'DELETE']).describe('HTTP方法'),
    headers: z.string().optional().describe('请求头JSON字符串，如: {"Content-Type": "application/json"}'),
    body: z.string().optional().describe('请求体（JSON字符串）'),
    timeout: z.number().optional().describe('超时时间（毫秒）')
  });

  return {
    name: 'http_request',
    description: '发送HTTP请求获取数据',
    params: paramsSchema,
    
    async execute_func(params: {
      url: string;
      method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
      headers?: string;
      body?: string;
      timeout?: number;
    }) {
      const { url, method = 'GET', headers, body, timeout = 10000 } = params;
      
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);
        
        // 解析headers字符串
        let parsedHeaders: Record<string, string> = {
          'Content-Type': 'application/json'
        };
        
        if (headers) {
          try {
            const headerObj = JSON.parse(headers);
            parsedHeaders = { ...parsedHeaders, ...headerObj };
          } catch (error) {
            return {
              success: false,
              error: `无效的headers JSON格式: ${error}`
            };
          }
        }
        
        const response = await fetch(url, {
          method,
          headers: parsedHeaders,
          body: body ? body : undefined,
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        const responseText = await response.text();
        let responseData;
        
        try {
          responseData = JSON.parse(responseText);
        } catch {
          responseData = responseText;
        }
        
        return {
          success: response.ok,
          status: response.status,
          statusText: response.statusText,
          headers: Object.fromEntries(response.headers.entries()),
          data: responseData,
          url: response.url
        };
        
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          return {
            success: false,
            error: `请求超时 (${timeout}ms): ${url}`
          };
        }
        
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
          url
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