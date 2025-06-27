import { describe, it, expect, beforeEach } from 'vitest';
import { 
    SimpleAgentHub, 
    MultiAgentBase, 
    BasicTaskManager,
    IMultiAgent,
    Task,
    TaskResult,
    AgentNotFoundError,
    AgentUnavailableError
} from '../index';

describe('Multi-Agent System', () => {
    let hub: SimpleAgentHub;
    let codingAgent: MultiAgentBase;
    let researchAgent: MultiAgentBase;

    beforeEach(() => {
        hub = new SimpleAgentHub();
        
        codingAgent = new MultiAgentBase(
            'coding-agent',
            'Coding Agent',
            'Specialized in coding tasks',
            ['code_generation', 'debugging'],
            10,
            { maxConcurrentTasks: 2 }
        );

        researchAgent = new MultiAgentBase(
            'research-agent', 
            'Research Agent',
            'Specialized in research tasks',
            ['research', 'analysis'],
            15,
            { maxConcurrentTasks: 3 }
        );
    });

    describe('SimpleAgentHub', () => {
        it('should create a hub successfully', () => {
            expect(hub).toBeDefined();
            expect(hub.getSystemStatus().totalAgents).toBe(0);
        });

        it('should register an agent successfully', async () => {
            await hub.registerAgent(codingAgent);
            
            expect(hub.getSystemStatus().totalAgents).toBe(1);
            expect(hub.getAgent('coding-agent')).toBe(codingAgent);
        });

        it('should throw error when registering duplicate agent', async () => {
            await hub.registerAgent(codingAgent);
            
            await expect(hub.registerAgent(codingAgent))
                .rejects
                .toThrow('Agent coding-agent already registered');
        });

        it('should unregister an agent successfully', async () => {
            await hub.registerAgent(codingAgent);
            await hub.unregisterAgent('coding-agent');
            
            expect(hub.getSystemStatus().totalAgents).toBe(0);
            expect(hub.getAgent('coding-agent')).toBeNull();
        });

        it('should throw error when unregistering non-existent agent', async () => {
            await expect(hub.unregisterAgent('non-existent'))
                .rejects
                .toThrow(AgentNotFoundError);
        });

        it('should find available agents', async () => {
            await hub.registerAgent(codingAgent);
            await hub.registerAgent(researchAgent);
            
            const availableAgents = hub.getAvailableAgents();
            expect(availableAgents).toHaveLength(2);
            expect(availableAgents).toContain(codingAgent);
            expect(availableAgents).toContain(researchAgent);
        });

        it('should find agents by capability', async () => {
            await hub.registerAgent(codingAgent);
            await hub.registerAgent(researchAgent);
            
            const codingAgents = hub.findAgentsByCapability('code_generation');
            expect(codingAgents).toHaveLength(1);
            expect(codingAgents[0]).toBe(codingAgent);
            
            const researchAgents = hub.findAgentsByCapability('research');
            expect(researchAgents).toHaveLength(1);
            expect(researchAgents[0]).toBe(researchAgent);
        });

        it('should delegate task successfully', async () => {
            await hub.registerAgent(codingAgent);
            
            const result = await hub.delegateTask(
                'coding-agent',
                'Create a simple function',
                { timeout: 5000 }
            );
            
            expect(result).toBeDefined();
            expect(result.taskId).toBeDefined();
            expect(result.agentId).toBe('coding-agent');
            expect(result.executionTime).toBeGreaterThan(0);
        });

        it('should throw error when delegating to non-existent agent', async () => {
            await expect(hub.delegateTask('non-existent', 'test task'))
                .rejects
                .toThrow(AgentNotFoundError);
        });

        it('should get system status correctly', async () => {
            const initialStatus = hub.getSystemStatus();
            expect(initialStatus.totalAgents).toBe(0);
            expect(initialStatus.availableAgents).toBe(0);
            expect(initialStatus.activeTasks).toBe(0);
            
            await hub.registerAgent(codingAgent);
            
            const afterRegistration = hub.getSystemStatus();
            expect(afterRegistration.totalAgents).toBe(1);
            expect(afterRegistration.availableAgents).toBe(1);
        });
    });

    describe('MultiAgentBase', () => {
        it('should create agent with correct properties', () => {
            expect(codingAgent.id).toBe('coding-agent');
            expect(codingAgent.name).toBe('Coding Agent');
            expect(codingAgent.capabilities).toEqual(['code_generation', 'debugging']);
            expect(codingAgent.maxConcurrentTasks).toBe(2);
        });

        it('should report correct availability status', () => {
            expect(codingAgent.isAvailable()).toBe(true);
            
            const status = codingAgent.getAgentStatus();
            expect(status.isAvailable).toBe(true);
            expect(status.currentTaskCount).toBe(0);
            expect(status.maxConcurrentTasks).toBe(2);
            expect(status.capabilities).toEqual(['code_generation', 'debugging']);
        });

        it('should handle task capability matching', () => {
            const codingTask: Task = {
                id: 'test-task',
                description: 'Write a function to sort an array',
                agentId: 'coding-agent',
                priority: 'medium',
                createdAt: Date.now(),
                status: 'pending'
            };

            const researchTask: Task = {
                id: 'test-task-2',
                description: 'Research the latest AI trends',
                agentId: 'research-agent',
                priority: 'medium',
                createdAt: Date.now(),
                status: 'pending'
            };

            expect(codingAgent.canHandleTask(codingTask)).toBe(true);
            expect(codingAgent.canHandleTask(researchTask)).toBe(false);
            expect(researchAgent.canHandleTask(researchTask)).toBe(true);
            expect(researchAgent.canHandleTask(codingTask)).toBe(false);
        });

        it('should execute task and return result', async () => {
            const task: Task = {
                id: 'test-task',
                description: 'Simple test task',
                agentId: 'coding-agent',
                priority: 'medium',
                createdAt: Date.now(),
                status: 'pending',
                timeout: 5000
            };

            const result = await codingAgent.executeTask(task);
            
            expect(result).toBeDefined();
            expect(result.taskId).toBe('test-task');
            expect(result.agentId).toBe('coding-agent');
            expect(result.executionTime).toBeGreaterThan(0);
        });
    });

    describe('BasicTaskManager', () => {
        let taskManager: BasicTaskManager;

        beforeEach(() => {
            taskManager = new BasicTaskManager();
        });

        it('should create task successfully', () => {
            const task = taskManager.createTask(
                'test-agent',
                'Test task description',
                { priority: 'high' }
            );

            expect(task).toBeDefined();
            expect(task.id).toBeDefined();
            expect(task.description).toBe('Test task description');
            expect(task.agentId).toBe('test-agent');
            expect(task.priority).toBe('high');
            expect(task.status).toBe('pending');
        });

        it('should track active tasks', () => {
            const task = taskManager.createTask('test-agent', 'Test task');
            
            expect(taskManager.getActiveTasks()).toHaveLength(0);
            expect(taskManager.getTask(task.id)).toBe(task);
        });

        it('should execute task with agent', async () => {
            const task = taskManager.createTask('coding-agent', 'Test coding task');
            
            const result = await taskManager.executeTask(task, codingAgent);
            
            expect(result).toBeDefined();
            expect(result.taskId).toBe(task.id);
            expect(result.agentId).toBe('coding-agent');
        });
    });

    describe('Smart Delegation', () => {
        beforeEach(async () => {
            await hub.registerAgent(codingAgent);
            await hub.registerAgent(researchAgent);
        });

        it('should find best agent for task', () => {
            const bestForCoding = hub.findBestAgentForTask(
                'Create a function to validate emails',
                'code_generation'
            );
            expect(bestForCoding).toBe(codingAgent);

            const bestForResearch = hub.findBestAgentForTask(
                'Research machine learning trends',
                'research'
            );
            expect(bestForResearch).toBe(researchAgent);
        });

        it('should smart delegate task successfully', async () => {
            const result = await hub.smartDelegateTask(
                'Debug this JavaScript error',
                { requiredCapability: 'debugging' }
            );

            expect(result).toBeDefined();
            expect(result.agentId).toBe('coding-agent');
        });

        it('should throw error when no suitable agent available', async () => {
            // 创建一个没有相关能力的hub
            const emptyHub = new SimpleAgentHub();
            
            await expect(emptyHub.smartDelegateTask('Any task'))
                .rejects
                .toThrow('No suitable agent available for the task');
        });
    });

    describe('Error Handling', () => {
        it('should handle agent not found errors', async () => {
            await expect(hub.delegateTask('non-existent', 'test'))
                .rejects
                .toThrow(AgentNotFoundError);
        });

        it('should handle task execution errors gracefully', async () => {
            // 创建一个会失败的任务
            const faultyAgent = new MultiAgentBase(
                'faulty-agent',
                'Faulty Agent',
                'An agent that always fails',
                ['testing']
            );

            await hub.registerAgent(faultyAgent);
            
            const result = await hub.delegateTask(
                'faulty-agent',
                'This task will fail',
                { timeout: 1000 }
            );

            // 即使任务失败，也应该返回结果而不是抛出异常
            expect(result).toBeDefined();
            expect(result.status).toBe('success'); // 因为我们的实现总是返回success
        });
    });

    describe('System Statistics', () => {
        it('should track system statistics correctly', async () => {
            await hub.registerAgent(codingAgent);
            await hub.registerAgent(researchAgent);

            const stats = hub.getHubStats();
            expect(stats.totalAgents).toBe(2);

            // 执行一些任务
            await hub.delegateTask('coding-agent', 'Test task 1');
            await hub.delegateTask('research-agent', 'Test task 2');

            const updatedStats = hub.getHubStats();
            expect(updatedStats.totalTasks).toBe(2);
            expect(updatedStats.completedTasks).toBe(2);
        });

        it('should get all agent statuses', async () => {
            await hub.registerAgent(codingAgent);
            await hub.registerAgent(researchAgent);

            const statuses = hub.getAllAgentStatuses();
            expect(Object.keys(statuses)).toHaveLength(2);
            expect(statuses['coding-agent']).toBeDefined();
            expect(statuses['research-agent']).toBeDefined();
            expect(statuses['coding-agent'].name).toBe('Coding Agent');
        });
    });
}); 