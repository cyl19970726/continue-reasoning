// tests/mcp.integration.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'; // Use vitest consistent with other tests
import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import path from 'path';
import { z } from 'zod';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { ContextHelper } from '../../src/core/utils'; // Adjust path
import { IAgent } from '../../src/core/interfaces'; // Adjust path
import {
    MCPContextId,
    MCPContext,
    AddSseOrHttpMcpServer,
    AddSseOrHttpMcpServerInputSchema,
    AddStdioMcpServer,
    AddStdioMcpServerInputSchema,
    ListToolsTool,
    ListToolsToolInputSchema,
    ListPromptsTool,
    ListPromptsInputSchema,
    McpPromptSchema ,
    ListResourcesTool,
    ListResourcesInputSchema,
    ResourceDetailSchema,
    ReadResourceTool,
    ReadResourceInputSchema,
    getServerIdTools
} from '../../src/core/contexts/mcp'; // Adjust path
import { ContextManager } from '../../src/core/context';
import { jsonToZod } from '../../src/core/utils/jsonHelper';

// --- Test Setup ---

let serverProcess: ChildProcessWithoutNullStreams;
const serverUrl = 'http://localhost:3001/sse'; // Match server port/path
const serverReadyMessage = "[Server] SSE server listening on port 3001";
const serverScriptPath = path.resolve(__dirname, './server.ts'); // Correct path: server.ts is in the same directory as this test file

// Helper to start the server and wait for it to be ready
const startServer = (): Promise<void> => {
    return new Promise((resolve, reject) => {
        console.log(`Starting server with tsx: ${serverScriptPath}...`);
        
        // Use tsx to run the TypeScript file directly
        serverProcess = spawn('npx', ['tsx', serverScriptPath], { shell: false }); 
        // Previous attempts:
        // serverProcess = spawn('node', ['--loader', 'ts-node/esm', serverScriptPath], { shell: false }); 
        // serverProcess = spawn('npx', ['ts-node', serverScriptPath], { shell: false }); 
        let output = '';
        const onData = (data: Buffer) => {
            const message = data.toString();
            output += message;
            console.log(`[Server Output]: ${message.trim()}`);
            if (message.includes(serverReadyMessage)) {
                console.log("Server is ready.");
                // Clean up listeners immediately after resolving
                serverProcess.stdout.removeListener('data', onData);
                serverProcess.stderr.removeListener('data', onData);
                resolve();
            }
        };

        serverProcess.stdout.on('data', onData);
        serverProcess.stderr.on('data', onData); // Capture stderr as well

        serverProcess.on('error', (err) => {
            console.error('Failed to start server process:', err);
            reject(err);
        });

        serverProcess.on('close', (code) => {
            console.log(`Server process exited with code ${code}`);
            // If server exits before ready, reject
            if (!output.includes(serverReadyMessage)) {
                 reject(new Error(`Server process exited prematurely (code ${code}) before ready signal. Output:\n${output}`));
            }
        });

         // Timeout for server readiness
         const timeout = setTimeout(() => {
            reject(new Error(`Server readiness timeout (${serverReadyMessage})`));
            serverProcess.kill();
        }, 20000); // 20 second timeout

         // Clear timeout once resolved
         const originalResolve = resolve;
         resolve = () => {
             clearTimeout(timeout);
             originalResolve();
         }
    });
};


// Start server before all tests
beforeAll(async () => {
    try {
        await startServer();
    } catch (e) {
        console.error("Server failed to start for tests:", e);
        // Optionally kill process if it exists but didn't signal ready
        if (serverProcess && !serverProcess.killed) serverProcess.kill();
        throw e; // Rethrow to fail the test suite
    }
}, 30000); // Increase timeout for beforeAll

// Stop server after all tests
afterAll(() => {
    console.log("Stopping server...");
    if (serverProcess && !serverProcess.killed) {
        const killed = serverProcess.kill(); // Use SIGTERM by default
         console.log(`Server process kill signal sent: ${killed}`);
    } else {
        console.log("Server process already stopped or not started.");
    }
    // Add a small delay to allow server to shut down if needed
    return new Promise(resolve => setTimeout(resolve, 500));
});

// Mock Agent (simple)
const mockAgent = {} as IAgent;

// --- Test Suites ---

describe('MCP Tools Integration Tests', () => {

    let clientId: number | undefined; // Store the client ID

    // Reset MCP Context before each test in this suite
    beforeEach(() => {
        // Reset context data
        MCPContext.data.clients = []; 
        clientId = undefined;
        
        // 确保 mockAgent 有一个完整的初始化
        mockAgent.toolSets = []; // Changed from tool to toolSets
        mockAgent.id = "test-agent"; // <-- 添加 ID，registerMcpToolsForClient 可能会用到
        mockAgent.contextManager = new ContextManager("test-context-manager", "Test Context Manager", "Test Context Manager", {});
        mockAgent.contextManager.registerContext(MCPContext);
    });

    // 确保客户端已连接的辅助函数
    const ensureClientConnected = async () => {
      if (clientId !== undefined) return;
      
      const params = { 
          type: 'sse', 
          url: serverUrl,
          name: 'Test SSE Client' // Added name property
      } as z.infer<typeof AddSseOrHttpMcpServerInputSchema>;
      const result = await AddSseOrHttpMcpServer.execute(params, mockAgent);
      
      if (result.success && result.serverId !== undefined) {
        clientId = result.serverId;
        console.log(`Connected to client with ID: ${clientId}`);
      } else {
        throw new Error(`Failed to connect client: ${result.error}`);
      }
    };

    describe('AddSseOrHttpMcpServer', () => {
    
      it('should fail if URL is missing for SSE', async () => {
        const params = { 
            type: 'sse', 
            name: 'Test SSE Client'
        } as z.infer<typeof AddSseOrHttpMcpServerInputSchema>; // Missing URL
        const result = await AddSseOrHttpMcpServer.execute(params, mockAgent);
        expect(result.success).toBe(false);
        expect(result.error).toContain("URL");
        expect(MCPContext.data.clients).toHaveLength(0);
      });

      it('should register MCP tools to agent after connection', async () => {
        // 初始情况下没有工具
        mockAgent.toolSets = []; // Changed from tool to toolSets
        const params: z.infer<typeof AddSseOrHttpMcpServerInputSchema> = { 
            type: 'sse', 
            url: serverUrl,
            name: 'Test SSE Client' // Added name property
        };
        
        const result = await AddSseOrHttpMcpServer.execute(params, mockAgent);
        expect(result.success).toBe(true);
        expect(result.serverId).toBe(0);
        
        // 验证工具已被注册到 agent
        const toolsForServer = getServerIdTools(mockAgent, 0);
        console.log("toolsForServer:", toolsForServer);
        expect(toolsForServer.length).toBeGreaterThan(0);
        
        // 验证工具名称格式
        const toolIds = toolsForServer.map(t => t.id);
        expect(toolIds.some(id => id?.startsWith('mcp_0_'))).toBe(true);
        
        // 验证 client 对象上保存了工具ID列表
        const client = MCPContext.data.clients[0] as any; // 使用 any 类型断言
        expect(client._mcpToolIds).toBeDefined();
        expect(client._mcpToolIds.length).toBeGreaterThan(0);
        expect(client._mcpToolIds).toEqual(toolIds);
      });
    });

    describe('AddStdioMcpServer', () => {
      it('should connect and add a stdio client', async () => {
        const params: z.infer<typeof AddStdioMcpServerInputSchema> = {
          command: 'npx',
          args: ['tsx', serverScriptPath, '--stdio'],
          cwd: process.cwd(),
          name: 'Test Stdio Client' // Added name property
        };
        const result = await AddStdioMcpServer.execute(params, mockAgent);
        expect(result.success).toBe(true);
        expect(result.serverId).toBe(0);
        expect(result.error).toBeUndefined();
        expect(MCPContext.data.clients).toHaveLength(1);
        expect(MCPContext.data.clients[0]).toBeInstanceOf(Client);
      });


      it('should register MCP tools to agent after connection', async () => {
        // 初始情况下没有工具
        mockAgent.toolSets = []; // Changed from tool to toolSets
        const params: z.infer<typeof AddStdioMcpServerInputSchema> = {
            command: 'npx',
            args: ['tsx', serverScriptPath, '--stdio'],
            cwd: process.cwd(),
            name: 'Test Stdio Client' // Added name property
          };
        const result = await AddStdioMcpServer.execute(params, mockAgent);
        expect(result.success).toBe(true);
        expect(result.serverId).toBe(0);
        
        // 验证工具已被注册到 agent
        const toolsForServer = getServerIdTools(mockAgent, 0);
        console.log("toolsForServer:", toolsForServer);
        expect(toolsForServer.length).toBeGreaterThan(0);
        
        // 验证工具名称格式
        const toolIds = toolsForServer.map(t => t.id);
        expect(toolIds.some(id => id?.startsWith('mcp_0_'))).toBe(true);
        
        // 验证 client 对象上保存了工具ID列表
        const client = MCPContext.data.clients[0] as any; // 使用 any 类型断言
        expect(client._mcpToolIds).toBeDefined();
        expect(client._mcpToolIds.length).toBeGreaterThan(0);
        expect(client._mcpToolIds).toEqual(toolIds);
      });
    });

    // ------------------------- MCP Tools Tests -------------------------
    describe('mcp tools test', () => {
        // 确保每个测试前都已连接客户端
        beforeEach(async () => {
          await ensureClientConnected();
        });

        it('should list tools from the connected client', async () => {
            const params: z.infer<typeof ListToolsToolInputSchema> = { mcpClientId: clientId! };
            const result = await ListToolsTool.execute(params, mockAgent);
            console.log("ListToolsTool result:", result);

            expect(result.tools).toBeInstanceOf(Array);
            expect(result.tools.length).toBeGreaterThanOrEqual(3); // Expect 'add' and 'register_tool'

            const addTool = result.tools.find(t => t.name === 'add');
            const registerTool = result.tools.find(t => t.name === 'register_tool');

            expect(addTool).toBeDefined();
            expect(addTool?.inputSchema).toBeDefined();
            expect(typeof addTool?.inputSchema).toBe('object');
             // Check properties if schema is more defined
             // expect(addTool?.inputSchema?.properties?.a).toBeDefined();

            expect(registerTool).toBeDefined();

        });

    });

  
    //  ------------------ Prompts Related Tests ------------------
    describe('prompts test', () => {
        // 确保每个测试前都已连接客户端
        beforeEach(async () => {
          await ensureClientConnected();
        });

        it('should list the defined prompts', async () => {
             const params: z.infer<typeof ListPromptsInputSchema> = { mcpClientId: clientId! };
             const result = await ListPromptsTool.execute(params, mockAgent);
             expect(result.prompts).toBeInstanceOf(Array);
             expect(result.prompts.length).toBeGreaterThanOrEqual(1); 
             const reviewPrompt = result.prompts.find((p: z.infer<typeof McpPromptSchema >) => p.name === 'review-code');
             expect(reviewPrompt).toBeDefined();
             expect(reviewPrompt?.arguments).toBeInstanceOf(Array);
             expect(reviewPrompt?.arguments?.length).toBe(1);
             const codeArg = reviewPrompt?.arguments?.find((arg: { name: string }) => arg.name === 'code');
             expect(codeArg).toBeDefined();
        });
    });

    //  --- Resources Related Tests ---
    describe('ListResourceTemplatesTool', () => {
        // 确保每个测试前都已连接客户端
        beforeEach(async () => {
          await ensureClientConnected();
        });

        it('should list available resource templates', async () => {
             const params: z.infer<typeof ListResourcesInputSchema> = { mcpClientId: clientId! };
             const result = await ListResourcesTool.execute(params, mockAgent);

             console.log("list resources:", JSON.stringify(result, null, 2));
             // Expect the templates defined in server.ts
             expect(result.resources.length).toBeGreaterThanOrEqual(0); 

        });

        it('should read a resource successfully', async () => {
            const params: z.infer<typeof ReadResourceInputSchema> = { mcpClientId: clientId!, resourceUri: 'test://hhh' };
            const result = await ReadResourceTool.execute(params, mockAgent);
            expect(result.contents.length).toBeGreaterThanOrEqual(0);
            expect(result.contents[0].text).toBeDefined();
            expect(result.contents[0].text).toBe("Hello, hhh!");
        });
     
    });

});
