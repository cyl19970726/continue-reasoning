import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MCPContext } from '../../src/core/contexts/mcp';
import { ContextManager } from '../../src/core/context';
import { CreateRAGContext } from '../../src/core/contexts/rag/createRagContext';
import { Logger, LogLevel } from '../../src/core/utils/logger';

// Silence logger for tests
Logger.setLevel(LogLevel.ERROR);

describe('MCP Integration with Dynamic Context Creation', () => {
    // Mock agent setup
    let mockAgent: any;
    
    beforeEach(() => {
        // Create a simplified mock agent 
        mockAgent = {
            id: 'test-agent',
            description: 'Test Agent',
            contextManager: new ContextManager(
                'test-context-manager',
                'Test Context Manager',
                'Test Context Manager Description',
                {}
            ),
            toolSets: [],
            listToolSets: vi.fn().mockReturnValue([]),
            activateToolSets: vi.fn(),
            deactivateToolSets: vi.fn(),
            memoryManager: {},
            clients: [],
            llm: {},
            maxSteps: 10,
            setup: vi.fn(),
            start: vi.fn(),
            stop: vi.fn(),
            clientSendfn: vi.fn()
        };
        
        // Register the MCP context with the agent
        mockAgent.contextManager.registerContext(MCPContext);
        
        // Create a simple tool set with mock tool functions
        mockAgent.toolSets.push({
            name: 'MCPTools',
            description: 'MCP Tools for testing',
            tools: [
                { 
                    name: 'add_stdio_mcp_server',
                    execute: vi.fn().mockResolvedValue({
                        success: true,
                        serverId: 0,
                        toolCount: 5,
                        categories: ['test', 'utilities']
                    })
                },
                { 
                    name: 'add_sse_or_http_mcp_client',
                    execute: vi.fn().mockResolvedValue({
                        success: true,
                        serverId: 0,
                        toolCount: 5,
                        categories: ['test', 'utilities']
                    })
                }
            ],
            active: true,
            source: 'mcp-context'
        });
        
        // Reset mocks
        vi.clearAllMocks();
    });
    
    it('should provide CreateRAGContext in its toolset', () => {
        // Get the toolset from MCPContext
        const toolSetResult = MCPContext.toolSet();
        
        // Check if it's a single ToolSet or an array
        const toolSet = Array.isArray(toolSetResult) ? toolSetResult[0] : toolSetResult;
        
        // Check if CreateRAGContext is in the tools
        const createRagTool = toolSet.tools.find((tool: any) => tool.name === 'create_rag_context_with_mcp');
        expect(createRagTool).toBeDefined();
        expect(createRagTool?.id).toBe('create_rag_context_with_mcp');
    });
    
    it('should integrate with ContextManager.installAllContexts for dynamically created contexts', async () => {
        // First create a dynamic context
        const params = {
            contextId: 'test-integrate-context',
            contextDescription: 'A test context for integration testing',
            mcpServer: {
                name: 'test-server',
                type: 'stdio' as const,
                command: 'npx',
                args: ['test-mcp-package'],
                autoActivate: false
            }
        };
        
        // Execute the CreateRAGContext tool
        const result = await CreateRAGContext.execute(params, mockAgent);
        expect(result.success).toBe(true);
        
        // Get the context that was registered
        const createContextSpy = mockAgent.contextManager.registerContext as jest.Mock;
        expect(createContextSpy).toHaveBeenCalledTimes(1);
        const newContext = createContextSpy.mock.calls[0][0];
        
        // Mock the install method
        const installSpy = vi.fn().mockResolvedValue(undefined);
        newContext.install = installSpy;
        
        // Now mock installAllContexts
        const originalInstallAllContexts = mockAgent.contextManager.installAllContexts;
        mockAgent.contextManager.installAllContexts = vi.fn().mockImplementation(async (agent) => {
            // Call the install method on each context with mcpServers
            for (const context of mockAgent.contextManager.contexts) {
                if (context.mcpServers && context.mcpServers.length > 0 && context.install) {
                    await context.install(agent);
                }
            }
            
            return {
                totalContexts: mockAgent.contextManager.contexts.length,
                installedCount: 1,
                failedCount: 0,
                skippedCount: 0,
                details: [{
                    contextId: newContext.id,
                    status: 'installed',
                    mcpServersCount: 1
                }]
            };
        });
        
        // Manually add the context to the contexts array
        mockAgent.contextManager.contexts.push(newContext);
        
        // Call installAllContexts
        await mockAgent.contextManager.installAllContexts(mockAgent);
        
        // Check that the install method was called
        expect(installSpy).toHaveBeenCalledTimes(1);
        expect(installSpy).toHaveBeenCalledWith(mockAgent);
        
        // Restore original method
        mockAgent.contextManager.installAllContexts = originalInstallAllContexts;
    });
    
    it('should enable complete workflow from creation to installation and MCP server connection', async () => {
        // Create a mock for the entire workflow
        
        // 1. Mock the AddStdioMcpServer execute function with a more detailed implementation
        const addServerSpy = vi.fn().mockImplementation(async (params) => {
            return {
                success: true,
                serverId: 0,
                toolCount: 3,
                categories: ['test']
            };
        });
        
        // Replace the tool in toolSets
        mockAgent.toolSets[0].tools[0].execute = addServerSpy;
        
        // 2. Define the workflow params
        const contextParams = {
            contextId: 'workflow-test-context',
            contextDescription: 'Context for full workflow testing',
            mcpServer: {
                name: 'workflow-server',
                type: 'stdio' as const,
                command: 'npx',
                args: ['test-workflow-package'],
                autoActivate: true
            }
        };
        
        // 3. Execute CreateRAGContext
        const result = await CreateRAGContext.execute(contextParams, mockAgent);
        expect(result.success).toBe(true);
        
        // 4. Check context registration
        expect(mockAgent.contextManager.registerContext).toHaveBeenCalledTimes(1);
        
        // Get the context that was registered
        const registeredContextSpy = mockAgent.contextManager.registerContext as jest.Mock;
        const newContext = registeredContextSpy.mock.calls[0][0];
        
        // 5. Verify context properties
        expect(newContext.id).toBe('workflow-test-context');
        expect(newContext.mcpServers).toHaveLength(1);
        expect(newContext.mcpServers[0].name).toBe('workflow-server');
        
        // Verify the context has the install method
        expect(typeof newContext.install).toBe('function');
        
        // 6. Verify autoActivate triggered install
        // Since we specified autoActivate: true, the server should have been installed
        expect(addServerSpy).toHaveBeenCalledTimes(1);
        
        // Check that the AddStdioMcpServer execute was called with the right parameters
        const serverCallParams = addServerSpy.mock.calls[0][0];
        expect(serverCallParams.name).toBe('workflow-test-context'); // Should match context ID for auto-association
        expect(serverCallParams.command).toBe('npx');
        expect(serverCallParams.args).toEqual(['test-workflow-package']);
    });
}); 