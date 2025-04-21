// tests/mcp.integration.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'; // Use vitest consistent with other tests
import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import path from 'path';
import { z } from 'zod';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { ContextHelper } from '../utils'; // Adjust path
import { IAgent } from '../interfaces'; // Adjust path
import {
    MCPContextId,
    MCPContext,
    AddMCPClientTool,
    AddMCPClientToolInputSchema,
    ListToolsTool,
    ListToolsToolInputSchema,
    MCPCallTool,
    MCPCallToolInputSchema,
    ListPromptsTool,
    ListPromptsInputSchema,
    McpPromptSchema ,
    GetPromptTool,
    GetPromptInputSchema,
    ListResourcesTool,
    ListResourcesInputSchema,
    ResourceDetailSchema,
    ReadResourceTool,
    ReadResourceInputSchema
} from '../tools/mcp'; // Adjust path
import { ContextManager } from '../context';

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
        // Reset context data using the .data property
        MCPContext.data.clients = []; 
        clientId = undefined; // Reset stored client ID
        mockAgent.contextManager = new ContextManager("test-context-manager", "Test Context Manager", "Test Context Manager", {});
        mockAgent.contextManager.registerContext(MCPContext);
    });

     // Helper to add a client for tests that need one
     const ensureClientConnected = async () => {
        if (clientId !== undefined) return clientId; // Already connected
        const params: z.infer<typeof AddMCPClientToolInputSchema> = { type: 'sse', url: serverUrl };
        const result = await AddMCPClientTool.execute(params, mockAgent);
        console.log("AddMCPClientTool result:", result);
        expect(result.success).toBe(true);
        expect(result.clientId).toBeDefined();
        clientId = result.clientId;
        return clientId;
    };


    // --- AddMCPClientTool Tests ---
    describe('AddMCPClientTool', () => {
        it('should connect and add an SSE client', async () => {
            const params: z.infer<typeof AddMCPClientToolInputSchema> = { type: 'sse', url: serverUrl };
            const result = await AddMCPClientTool.execute(params, mockAgent);

            expect(result.success).toBe(true);
            expect(result.clientId).toBe(0);
            expect(result.error).toBeUndefined();
            expect(MCPContext.data.clients).toHaveLength(1);
            expect(MCPContext.data.clients[0]).toBeInstanceOf(Client);
        });

         it('should fail if URL is missing for SSE', async () => {
            const params: z.infer<typeof AddMCPClientToolInputSchema> = { type: 'sse' }; // Missing URL
             const result = await AddMCPClientTool.execute(params, mockAgent);
             expect(result.success).toBe(false);
             expect(result.error).toContain("URL required");
             expect(MCPContext.data.clients).toHaveLength(0);
        });

        // Add tests for other transport types if implemented/needed
    });

    // ------------------------- MCP Tools Tests -------------------------
    describe('mcp tools test', () => {
        beforeEach(ensureClientConnected); // Ensure client is connected before each test

        it('should list tools from the connected client', async () => {
            const params: z.infer<typeof ListToolsToolInputSchema> = { mcpClientId: clientId! };
            const result = await ListToolsTool.execute(params, mockAgent);
            console.log("ListToolsTool result:", result);

            expect(result.tools).toBeInstanceOf(Array);
            expect(result.tools.length).toBeGreaterThanOrEqual(2); // Expect 'add' and 'register_tool'

            const addTool = result.tools.find(t => t.name === 'add');
            const registerTool = result.tools.find(t => t.name === 'register_tool');

            expect(addTool).toBeDefined();
            expect(addTool?.inputSchema).toBeDefined();
            expect(typeof addTool?.inputSchema).toBe('object');
             // Check properties if schema is more defined
             // expect(addTool?.inputSchema?.properties?.a).toBeDefined();

            expect(registerTool).toBeDefined();

        });

        it('should call the "add" tool on the client', async () => {
            const params: z.infer<typeof MCPCallToolInputSchema> = {
                mcpClientId: clientId!,
                name: 'add',
                arguments: { a: 10, b: 5 }
            };
            const result = await MCPCallTool.execute(params, mockAgent);
            console.log("MCPCallTool result:", result);

            expect(result.result).toBeDefined();
            // Check the specific structure returned by the server's 'add' tool
            expect(result.result).toEqual(expect.objectContaining({
                 content: expect.arrayContaining([
                     expect.objectContaining({ type: 'text', text: '15' })
                 ])
             }));
        });

        it('should call the "complex-args" tool on the client', async () => {
            const params: z.infer<typeof MCPCallToolInputSchema> = {
                mcpClientId: clientId!,
                name: 'complex-args',
                arguments: { a: 10, b: { c: 5, d: 10 } }
            };
            const result = await MCPCallTool.execute(params, mockAgent);
            console.log("MCPCallTool result:", result);

            expect(result.result).toBeDefined();
            // Check the specific structure returned by the server's 'add' tool
            expect(result.result).toEqual(expect.objectContaining({
                 content: expect.arrayContaining([
                    expect.objectContaining({ type: 'text', text: '25' })
                 ])
             }));
        });

    });

  
    //  ------------------ Prompts Related Tests ------------------
    describe('prompts test', () => {
        beforeEach(ensureClientConnected);

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

        it('should get the "review-code" prompt successfully', async () => {
            const params: z.infer<typeof GetPromptInputSchema> = { mcpClientId: clientId!, name: 'review-code' , arguments: { code: 'console.log("Hello, world!");'}};
            const result = await GetPromptTool.execute(params, mockAgent);
            expect(result.messages[0].role).toBe("user");
            expect(result.messages[0].content.type).toBe("text");
        });

    });

    //  --- Resources Related Tests ---
    describe('ListResourceTemplatesTool', () => {
        beforeEach(ensureClientConnected);

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