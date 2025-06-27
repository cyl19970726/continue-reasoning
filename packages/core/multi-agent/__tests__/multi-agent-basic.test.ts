import { describe, it, expect, beforeEach } from 'vitest';
import { 
    SimpleAgentHub, 
    MultiAgentBase, 
    BasicTaskManager,
    Task,
    AgentNotFoundError
} from '../index';

describe('Multi-Agent System - Basic Tests', () => {
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
            1, // 设置为1步以避免长时间运行
            { maxConcurrentTasks: 2 }
        );

        researchAgent = new MultiAgentBase(
            'research-agent', 
            'Research Agent',
            'Specialized in research tasks',
            ['research', 'analysis'],
            1, // 设置为1步以避免长时间运行
            { maxConcurrentTasks: 3 }
        );
    });

    describe('Agent Hub Core Functions', () => {
        it('should create and initialize hub', () => {
            expect(hub).toBeDefined();
            expect(hub.getSystemStatus().totalAgents).toBe(0);
        });

        it('should register agents successfully', async () => {
            await hub.registerAgent(codingAgent);
            await hub.registerAgent(researchAgent);
            
            expect(hub.getSystemStatus().totalAgents).toBe(2);
            expect(hub.getAgent('coding-agent')).toBe(codingAgent);
            expect(hub.getAgent('research-agent')).toBe(researchAgent);
        });

        it('should prevent duplicate registration', async () => {
            await hub.registerAgent(codingAgent);
            
            await expect(hub.registerAgent(codingAgent))
                .rejects
                .toThrow('Agent coding-agent already registered');
        });

        it('should unregister agents', async () => {
            await hub.registerAgent(codingAgent);
            await hub.unregisterAgent('coding-agent');
            
            expect(hub.getSystemStatus().totalAgents).toBe(0);
            expect(hub.getAgent('coding-agent')).toBeNull();
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
    });

    describe('Agent Properties and Status', () => {
        it('should have correct agent properties', () => {
            expect(codingAgent.id).toBe('coding-agent');
            expect(codingAgent.name).toBe('Coding Agent');
            expect(codingAgent.capabilities).toEqual(['code_generation', 'debugging']);
            expect(codingAgent.maxConcurrentTasks).toBe(2);
        });

        it('should report availability status', () => {
            expect(codingAgent.isAvailable()).toBe(true);
            
            const status = codingAgent.getAgentStatus();
            expect(status.isAvailable).toBe(true);
            expect(status.currentTaskCount).toBe(0);
            expect(status.maxConcurrentTasks).toBe(2);
            expect(status.capabilities).toEqual(['code_generation', 'debugging']);
        });

        it('should handle capability matching', () => {
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
    });

    describe('Task Management', () => {
        let taskManager: BasicTaskManager;

        beforeEach(() => {
            taskManager = new BasicTaskManager();
        });

        it('should create tasks with correct properties', () => {
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
            expect(task.createdAt).toBeGreaterThan(0);
        });

        it('should track tasks correctly', () => {
            const task1 = taskManager.createTask('agent1', 'Task 1');
            const task2 = taskManager.createTask('agent2', 'Task 2');
            
            expect(taskManager.getTask(task1.id)).toBe(task1);
            expect(taskManager.getTask(task2.id)).toBe(task2);
            expect(taskManager.getTask('non-existent')).toBeNull();
        });

        it('should handle task priorities', () => {
            const highTask = taskManager.createTask('agent', 'High priority', { priority: 'high' });
            const lowTask = taskManager.createTask('agent', 'Low priority', { priority: 'low' });
            
            expect(highTask.priority).toBe('high');
            expect(lowTask.priority).toBe('low');
        });
    });

    describe('Smart Agent Selection', () => {
        beforeEach(async () => {
            await hub.registerAgent(codingAgent);
            await hub.registerAgent(researchAgent);
        });

        it('should find best agent for coding tasks', () => {
            const bestAgent = hub.findBestAgentForTask(
                'Create a function to validate emails',
                'code_generation'
            );
            expect(bestAgent).toBe(codingAgent);
        });

        it('should find best agent for research tasks', () => {
            const bestAgent = hub.findBestAgentForTask(
                'Research machine learning trends',
                'research'
            );
            expect(bestAgent).toBe(researchAgent);
        });

        it('should return null when no suitable agent exists', () => {
            const bestAgent = hub.findBestAgentForTask(
                'Translate this document',
                'translation'
            );
            expect(bestAgent).toBeNull();
        });
    });

    describe('Error Handling', () => {
        it('should throw AgentNotFoundError for non-existent agents', async () => {
            await expect(hub.delegateTask('non-existent', 'test task'))
                .rejects
                .toThrow(AgentNotFoundError);
        });

        it('should handle unregistering non-existent agents', async () => {
            await expect(hub.unregisterAgent('non-existent'))
                .rejects
                .toThrow(AgentNotFoundError);
        });

        it('should validate agent IDs', () => {
            expect(() => new MultiAgentBase('', 'Empty ID', 'Test', []))
                .toThrow('Agent ID cannot be empty');
            
            expect(() => new MultiAgentBase('  ', 'Whitespace ID', 'Test', []))
                .toThrow('Agent ID cannot be empty');
        });
    });

    describe('System Statistics', () => {
        it('should track agent registration stats', async () => {
            const initialStats = hub.getHubStats();
            expect(initialStats.totalAgents).toBe(0);

            await hub.registerAgent(codingAgent);
            await hub.registerAgent(researchAgent);

            const updatedStats = hub.getHubStats();
            expect(updatedStats.totalAgents).toBe(2);
        });

        it('should provide agent status overview', async () => {
            await hub.registerAgent(codingAgent);
            await hub.registerAgent(researchAgent);

            const statuses = hub.getAllAgentStatuses();
            expect(Object.keys(statuses)).toHaveLength(2);
            expect(statuses['coding-agent']).toBeDefined();
            expect(statuses['research-agent']).toBeDefined();
            expect(statuses['coding-agent'].name).toBe('Coding Agent');
            expect(statuses['research-agent'].name).toBe('Research Agent');
        });

        it('should show system health status', async () => {
            await hub.registerAgent(codingAgent);
            
            const systemStatus = hub.getSystemStatus();
            expect(systemStatus.totalAgents).toBe(1);
            expect(systemStatus.availableAgents).toBe(1);
            expect(systemStatus.activeTasks).toBe(0);
        });
    });

    describe('Configuration and Limits', () => {
        it('should respect agent concurrent task limits', () => {
            expect(codingAgent.maxConcurrentTasks).toBe(2);
            expect(researchAgent.maxConcurrentTasks).toBe(3);
        });

        it('should handle empty capabilities', () => {
            const basicAgent = new MultiAgentBase(
                'basic-agent',
                'Basic Agent',
                'A basic agent',
                []
            );
            
            expect(basicAgent.capabilities).toEqual([]);
            expect(basicAgent.canHandleTask({
                id: 'test',
                description: 'Any task',
                agentId: 'basic-agent',
                priority: 'medium',
                createdAt: Date.now(),
                status: 'pending'
            })).toBe(false);
        });
    });
}); 