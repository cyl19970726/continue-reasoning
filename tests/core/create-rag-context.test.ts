import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CreateRAGContext } from '../../src/core/contexts/rag/createRagContext';
import { ContextManager } from '../../src/core/context';
import { IAgent } from '../../src/core/interfaces';
import { Logger, LogLevel } from '../../src/core/utils/logger';

// Silence logger for tests
Logger.setLevel(LogLevel.ERROR);

describe('CreateRAGContext Tool Tests', () => {
    // Mock agent setup
    let mockAgent: IAgent;
    
    beforeEach(() => {
        // Create a base mock agent with minimum required properties
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
            // Add other required properties with mock implementations
            listToolSets: vi.fn().mockReturnValue([]),
            activateToolSets: vi.fn(),
            deactivateToolSets: vi.fn(),
            memoryManager: {} as any,
            clients: [],
            llm: {} as any,
            maxSteps: 10,
            setup: vi.fn(),
            start: vi.fn(),
            stop: vi.fn(),
            clientSendfn: vi.fn()
        };
        
        // Spy on contextManager's registerContext method
        mockAgent.contextManager.registerContext = vi.fn();
        
        // Reset mocks
        vi.clearAllMocks();
    });
    
    it('should create a new RAG-enabled context with MCP server configuration', async () => {
        // Test parameters
        const params = {
            contextId: 'test-dynamic-context',
            contextDescription: 'A test dynamic context with MCP server',
            mcpServer: {
                name: 'test-server',
                type: 'stdio' as const,
                command: 'npx',
                args: ['test-mcp-package'],
                autoActivate: false
            },
            initialData: {
                testProperty: 'test-value'
            }
        };
        
        // Execute the tool
        const result = await CreateRAGContext.execute(params, mockAgent);
        
        // Check result
        expect(result.success).toBe(true);
        expect(result.contextId).toBe('test-dynamic-context');
        
        // Verify context was registered
        expect(mockAgent.contextManager.registerContext).toHaveBeenCalledTimes(1);
        
        // Get the context that was registered (first argument of the first call)
        const registeredContext = (mockAgent.contextManager.registerContext as any).mock.calls[0][0];
        
        // Verify context properties
        expect(registeredContext.id).toBe('test-dynamic-context');
        expect(registeredContext.description).toBe('A test dynamic context with MCP server');
        expect(registeredContext.mcpServers).toHaveLength(1);
        expect(registeredContext.mcpServers[0].name).toBe('test-server');
        
        // Verify context has the correct data including history
        expect(registeredContext.data.testProperty).toBe('test-value');
        expect(registeredContext.data.history).toBeDefined();
        expect(registeredContext.data.history.length).toBeGreaterThan(0);
        
        // Verify toolSet is properly defined
        const toolSet = registeredContext.toolSet();
        expect(toolSet.name).toBe('test-dynamic-context');
        expect(toolSet.tools).toHaveLength(0); // Empty initially
        expect(toolSet.active).toBe(true);
    });
    
    it('should fail when trying to create a context with an existing ID', async () => {
        // Create a mock existing context
        const existingContextId = 'existing-context';
        mockAgent.contextManager.findContextById = vi.fn().mockImplementation((id) => {
            if (id === existingContextId) {
                return { id: existingContextId };
            }
            return undefined;
        });
        
        // Test parameters with existing ID
        const params = {
            contextId: existingContextId,
            contextDescription: 'Attempt to create duplicate context',
            mcpServer: {
                name: 'test-server',
                type: 'stdio' as const,
                command: 'npx',
                args: ['test-mcp-package']
            }
        };
        
        // Execute the tool
        const result = await CreateRAGContext.execute(params, mockAgent);
        
        // Check result
        expect(result.success).toBe(false);
        expect(result.error).toContain('already exists');
        
        // Verify no context was registered
        expect(mockAgent.contextManager.registerContext).not.toHaveBeenCalled();
    });
    
    it('should support auto-activation of MCP server', async () => {
        // Mock context with install method
        const mockInstall = vi.fn().mockResolvedValue(undefined);
        
        // We need to capture the context to add the spy
        let capturedContext: any;
        mockAgent.contextManager.registerContext = vi.fn().mockImplementation((context) => {
            capturedContext = context;
            // Add the install spy after registration
            capturedContext.install = mockInstall;
            return true;
        });
        
        // Test parameters with autoActivate:true
        const params = {
            contextId: 'auto-activate-context',
            contextDescription: 'Context with auto-activated MCP server',
            mcpServer: {
                name: 'auto-server',
                type: 'stdio' as const,
                command: 'npx',
                args: ['test-mcp-package'],
                autoActivate: true
            }
        };
        
        // Execute the tool
        const result = await CreateRAGContext.execute(params, mockAgent);
        
        // Check result
        expect(result.success).toBe(true);
        
        // Verify context was registered
        expect(mockAgent.contextManager.registerContext).toHaveBeenCalledTimes(1);
        
        // Verify install was called due to autoActivate
        expect(mockInstall).toHaveBeenCalledTimes(1);
        expect(mockInstall).toHaveBeenCalledWith(mockAgent);
    });
    
    it('should update history when onToolCall is triggered', async () => {
        // Test parameters
        const params = {
            contextId: 'tool-call-context',
            contextDescription: 'Context that tracks tool calls',
            mcpServer: {
                name: 'test-server',
                type: 'stdio' as const,
                command: 'npx',
                args: ['test-mcp-package']
            }
        };
        
        // Execute the tool to create the context
        const result = await CreateRAGContext.execute(params, mockAgent);
        expect(result.success).toBe(true);
        
        // Get the context that was registered
        const registeredContext = (mockAgent.contextManager.registerContext as any).mock.calls[0][0];
        
        // Setup spy on setData
        const setDataSpy = vi.spyOn(registeredContext, 'setData');
        
        // Initially the history should have only the creation entry
        const initialHistoryLength = registeredContext.data.history.length;
        
        // Trigger onToolCall with a mock tool call result
        const mockToolCall = {
            type: 'function',
            name: 'mcp_0_test_tool',
            call_id: 'test-call-id',
            result: { success: true, data: 'test-data' }
        };
        
        registeredContext.onToolCall(mockToolCall);
        
        // Verify setData was called
        expect(setDataSpy).toHaveBeenCalled();
        
        // Verify history was updated
        expect(registeredContext.data.history.length).toBeGreaterThan(initialHistoryLength);
        
        // Verify the new history entry
        const lastHistoryEntry = registeredContext.data.history[registeredContext.data.history.length - 1];
        expect(lastHistoryEntry.action).toContain('Tool Call');
        expect(lastHistoryEntry.action).toContain('mcp_0_test_tool');
    });
}); 