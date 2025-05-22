import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ContextManager } from '../../src/core/context';
import { ContextHelper } from '../../src/core/utils';
import { z } from 'zod';
import { Logger, LogLevel } from '../../src/core/utils/logger';

// Silence logger for tests
Logger.setLevel(LogLevel.ERROR);

describe('ContextManager Tests', () => {
    let contextManager: ContextManager;
    let mockAgent: any;
    
    beforeEach(() => {
        // Initialize a fresh ContextManager for each test
        contextManager = new ContextManager(
            'test-manager',
            'Test Manager',
            'A test context manager',
            {}
        );
        
        // Create a simple mock agent
        mockAgent = {
            id: 'test-agent',
            description: 'Test Agent',
            contextManager,
            toolSets: [],
            listToolSets: vi.fn().mockReturnValue([])
        };
        
        // Reset mocks
        vi.clearAllMocks();
    });
    
    describe('installAllContexts Method', () => {
        it('should install MCP servers for contexts with mcpServers', async () => {
            // Create test contexts with mcpServers
            const contextWithServers = ContextHelper.createContext({
                id: 'context-with-servers',
                description: 'A context with MCP servers',
                dataSchema: z.object({ test: z.string().optional() }),
                initialData: { test: 'value' },
                mcpServers: [
                    {
                        name: 'test-server',
                        type: 'stdio',
                        command: 'test-command',
                        args: ['arg1', 'arg2']
                    }
                ],
                toolSetFn: () => ({
                    name: 'TestTools',
                    description: 'Test tools',
                    tools: [],
                    active: true
                })
            });
            
            // Mock the install method 
            const installSpy = vi.fn().mockResolvedValue(undefined);
            contextWithServers.install = installSpy;
            
            // Create a context without servers
            const contextWithoutServers = ContextHelper.createContext({
                id: 'context-without-servers',
                description: 'A context without MCP servers',
                dataSchema: z.object({ test: z.string().optional() }),
                initialData: { test: 'value' },
                toolSetFn: () => ({
                    name: 'EmptyTools',
                    description: 'Empty tools',
                    tools: [],
                    active: true
                })
            });
            
            // Register both contexts
            contextManager.registerContext(contextWithServers);
            contextManager.registerContext(contextWithoutServers);
            
            // Call installAllContexts 
            const result = await contextManager.installAllContexts(mockAgent);
            
            // Check the results
            expect(result.totalContexts).toBe(2);
            expect(result.installedCount).toBe(1); // Only the one with servers should be installed
            expect(result.skippedCount).toBe(1);   // The one without servers should be skipped
            expect(result.failedCount).toBe(0);    // None should fail
            
            // Verify the install method was called only for the context with servers
            expect(installSpy).toHaveBeenCalledTimes(1);
            expect(installSpy).toHaveBeenCalledWith(mockAgent);
            
            // Check details contain the right information
            const withServersDetail = result.details.find(d => d.contextId === 'context-with-servers');
            expect(withServersDetail).toBeDefined();
            expect(withServersDetail?.status).toBe('installed');
            expect(withServersDetail?.mcpServersCount).toBe(1);
            
            const withoutServersDetail = result.details.find(d => d.contextId === 'context-without-servers');
            expect(withoutServersDetail).toBeDefined();
            expect(withoutServersDetail?.status).toBe('skipped');
            expect(withoutServersDetail?.mcpServersCount).toBe(0);
        });
        
        it('should handle installation failures gracefully', async () => {
            // Create test context with mcpServers but that will fail to install
            const failingContext = ContextHelper.createContext({
                id: 'failing-context',
                description: 'A context that will fail to install',
                dataSchema: z.object({ test: z.string().optional() }),
                initialData: { test: 'value' },
                mcpServers: [
                    {
                        name: 'failing-server',
                        type: 'stdio',
                        command: 'fail-command',
                        args: []
                    }
                ],
                toolSetFn: () => ({
                    name: 'FailingTools',
                    description: 'Failing tools',
                    tools: [],
                    active: true
                })
            });
            
            // Mock the install method to throw an error
            const errorMessage = 'Simulated installation failure';
            const installSpy = vi.fn().mockRejectedValue(new Error(errorMessage));
            failingContext.install = installSpy;
            
            // Register the context
            contextManager.registerContext(failingContext);
            
            // Call installAllContexts 
            const result = await contextManager.installAllContexts(mockAgent);
            
            // Check the results
            expect(result.totalContexts).toBe(1);
            expect(result.installedCount).toBe(0); 
            expect(result.skippedCount).toBe(0);  
            expect(result.failedCount).toBe(1);   // Should report the failure
            
            // Verify the install method was called but failed
            expect(installSpy).toHaveBeenCalledTimes(1);
            
            // Check details contain the right information
            const failingDetail = result.details[0];
            expect(failingDetail.contextId).toBe('failing-context');
            expect(failingDetail.status).toBe('failed');
            expect(failingDetail.error).toBe(errorMessage);
            expect(failingDetail.mcpServersCount).toBe(1);
        });
        
        it('should skip contexts without install method', async () => {
            // Create test context with mcpServers but without an install method
            const noInstallContext = ContextHelper.createContext({
                id: 'no-install-context',
                description: 'A context without install method',
                dataSchema: z.object({ test: z.string().optional() }),
                initialData: { test: 'value' },
                mcpServers: [
                    {
                        name: 'test-server',
                        type: 'stdio',
                        command: 'test-command',
                        args: []
                    }
                ],
                toolSetFn: () => ({
                    name: 'NoInstallTools',
                    description: 'No install tools',
                    tools: [],
                    active: true
                })
            });
            
            // Delete the install method
            delete noInstallContext.install;
            
            // Register the context
            contextManager.registerContext(noInstallContext);
            
            // Call installAllContexts 
            const result = await contextManager.installAllContexts(mockAgent);
            
            // Check the results - should be skipped because there's no install method
            expect(result.totalContexts).toBe(1);
            expect(result.installedCount).toBe(0); 
            expect(result.skippedCount).toBe(1);  
            expect(result.failedCount).toBe(0);   
            
            // Check details contain the right information
            const noInstallDetail = result.details[0];
            expect(noInstallDetail.contextId).toBe('no-install-context');
            expect(noInstallDetail.status).toBe('skipped');
            expect(noInstallDetail.mcpServersCount).toBe(1); // The test expects 1 since we added one server config
        });
    });
}); 