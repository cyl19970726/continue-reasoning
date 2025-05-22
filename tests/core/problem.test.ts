import { expect, vi, test, describe, beforeEach, afterEach, Mock } from 'vitest';
import { ProblemContext, ProblemContextSchema, CreateProblemTool, UpdateProblemTool, ResolveProblemTool, RejectProblemTool, AddAnalysisStepTool, LoadSimilarProblemsTool, LoadSimilarRAGProblemsTool, ProblemDataSchema, PROBLEM_CONTEXT_ID, createProblemRAGContext, setRAGInstance } from './problem';
import { z } from 'zod';
import { IRAG, RAGResult, IRAGEnabledContext } from '../interfaces';

// Create a mock RAG function
const createMockRAG = (): IRAG => {
  return {
    id: 'mockRag',
    name: 'MockRAG',
    description: 'Mock RAG for testing',
    query: vi.fn().mockResolvedValue([]),
    upsert: vi.fn().mockResolvedValue([]),
    delete: vi.fn().mockResolvedValue(true),
    queryWithFilter: vi.fn().mockResolvedValue([]),
  };
};

describe('Problem Context and Tools', () => {
  // Mock Agent and ContextManager
  const mockAgent = {
    contextManager: {
      findContextById: vi.fn(),
    },
    memoryManager: {
      saveMemory: vi.fn(),
      loadMemory: vi.fn(),
    }
  };

  // Reset mocks before each test
  beforeEach(() => {
    vi.clearAllMocks();
    mockAgent.contextManager.findContextById.mockReturnValue(ProblemContext);
    ProblemContext.data = {
      items: [],
      maxActiveItems: 5
    };
  });

  describe('Problem Context', () => {
    test('should initialize ProblemContext correctly', () => {
      expect(ProblemContext.id).toBe(PROBLEM_CONTEXT_ID);
      expect(ProblemContext.data.items).toEqual([]);
      expect(ProblemContext.data.maxActiveItems).toBe(5);
    });

    test('renderPrompt should return formatted problem list', async () => {
      const now = new Date();
      const testProblems = [
        {
          id: 'test-1',
          title: 'Test Problem 1',
          description: 'This is an active problem',
          priority: 80,
          status: 'active' as const,
          timeCreated: now,
          timeUpdated: now,
          analysisSteps: [],
          result: '',
          tags: ['test', 'important']
        },
        {
          id: 'test-2',
          title: 'Test Problem 2',
          description: 'This is a pending problem',
          priority: 60,
          status: 'pending' as const,
          timeCreated: now,
          timeUpdated: now,
          analysisSteps: [],
          result: '',
          tags: ['test']
        }
      ];
      ProblemContext.setData({
        items: testProblems
      });
      const prompt = await ProblemContext.renderPrompt();
      expect(prompt).toContain('Active problems (1/5)');
      expect(prompt).toContain('Test Problem 1');
      expect(prompt).toContain('Pending problems (1)');
      expect(prompt).toContain('Test Problem 2');
      expect(prompt).toContain('Status: active');
      expect(prompt).toContain('Status: pending');
      expect(prompt).toContain('Tags: test, important');
    });
  });
  
  describe('CreateProblemTool', () => {
    test('should create a new problem', async () => {
      const result = await CreateProblemTool.execute({
        title: 'New Problem',
        description: 'This is a test problem',
        priority: 75,
        tags: ['test', 'new']
      }, mockAgent as any);
      expect(result.success).toBe(true);
      expect(ProblemContext.data.items.length).toBe(1);
      const newProblem = ProblemContext.data.items[0];
      expect(newProblem.title).toBe('New Problem');
      expect(newProblem.description).toBe('This is a test problem');
      expect(newProblem.priority).toBe(75);
      expect(newProblem.status).toBe('active');
      expect(newProblem.tags).toEqual(['test', 'new']);
      expect(newProblem.analysisSteps).toEqual([]);
      expect(newProblem.result).toBe('');
    });
  });
  
  describe('UpdateProblemTool', () => {
    beforeEach(() => {
      ProblemContext.data.items = [{
        id: 'test-id',
        title: 'Original Problem',
        description: 'Original description',
        priority: 50,
        status: 'active' as const,
        timeCreated: new Date(),
        timeUpdated: new Date(),
        analysisSteps: [],
        result: '',
        tags: ['original']
      }];
    });
    
    test('should update problem information', async () => {
      const result = await UpdateProblemTool.execute({
        id: 'test-id',
        title: 'Updated Problem',
        description: 'Updated description',
        priority: 90,
        tags: ['updated', 'test']
      }, mockAgent as any);
      expect(result.success).toBe(true);
      const updatedProblem = ProblemContext.data.items[0];
      expect(updatedProblem.title).toBe('Updated Problem');
      expect(updatedProblem.description).toBe('Updated description');
      expect(updatedProblem.priority).toBe(90);
      expect(updatedProblem.tags).toEqual(['updated', 'test']);
      expect(updatedProblem.status).toBe('active');
    });
    
    test('should not update a resolved problem', async () => {
      ProblemContext.data.items[0].status = 'resolved' as const;
      const result = await UpdateProblemTool.execute({
        id: 'test-id',
        title: 'Try to update resolved problem'
      }, mockAgent as any);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Update not allowed');
      expect(ProblemContext.data.items[0].title).toBe('Original Problem');
    });
  });
  
  describe('AddAnalysisStepTool', () => {
    beforeEach(() => {
      ProblemContext.data.items = [{
        id: 'test-id',
        title: 'Test Problem',
        description: 'Problem to analyze',
        priority: 70,
        status: 'active' as const,
        timeCreated: new Date(),
        timeUpdated: new Date(),
        analysisSteps: ['Step 1'],
        result: '',
        tags: []
      }];
    });
    
    test('should add analysis step to active problem', async () => {
      const result = await AddAnalysisStepTool.execute({
        id: 'test-id',
        step: 'Step 2'
      }, mockAgent as any);
      expect(result.success).toBe(true);
      expect(ProblemContext.data.items[0].analysisSteps).toEqual(['Step 1', 'Step 2']);
    });
    
    test('should not add analysis step to non-active problem', async () => {
      ProblemContext.data.items[0].status = 'pending' as const;
      const result = await AddAnalysisStepTool.execute({
        id: 'test-id',
        step: 'Try to add to non-active problem'
      }, mockAgent as any);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Only active problems can have analysis steps added');
      expect(ProblemContext.data.items[0].analysisSteps).toEqual(['Step 1']);
    });
  });
  
  describe('LoadSimilarProblemsTool', () => {
    const mockRAG = {
      query: vi.fn(),
      upsert: vi.fn(),
      delete: vi.fn(),
      name: 'MockRAG'
    };

    beforeEach(() => {
      ProblemContext.data.items = [
        {
          id: 'resolved-1',
          title: 'Resolved API Problem',
          description: 'Solved an API call error',
          priority: 80,
          status: 'resolved' as const,
          timeCreated: new Date('2023-01-01'),
          timeUpdated: new Date('2023-01-02'),
          analysisSteps: [],
          result: 'Fixed by updating auth header',
          tags: ['API', 'error']
        },
        {
          id: 'rejected-1',
          title: 'Rejected Feature Request',
          description: 'User requested a complex feature',
          priority: 60,
          status: 'rejected' as const,
          timeCreated: new Date('2023-02-01'),
          timeUpdated: new Date('2023-02-02'),
          analysisSteps: [],
          result: 'Out of project scope',
          tags: ['feature', 'user-request']
        },
        {
          id: 'active-1',
          title: 'Active Bug Fix',
          description: 'Fixing data sync issue',
          priority: 90,
          status: 'active' as const,
          timeCreated: new Date('2023-03-01'),
          timeUpdated: new Date('2023-03-01'),
          analysisSteps: [],
          result: '',
          tags: ['bug', 'sync']
        }
      ];
      vi.clearAllMocks();
    });
    
    test('should find similar problems by query', async () => {
      const result = await LoadSimilarProblemsTool.execute({
        query: 'API',
        limit: 10
      }, mockAgent as any);
      expect(result.success).toBe(true);
      expect(result.items.length).toBe(1);
      expect(result.items[0].id).toBe('resolved-1');
    });
    
    test('should filter problems by status', async () => {
      const result = await LoadSimilarProblemsTool.execute({
        query: '',
        status: 'rejected',
        limit: 10
      }, mockAgent as any);
      expect(result.success).toBe(true);
      expect(result.items.length).toBe(1);
      expect(result.items[0].id).toBe('rejected-1');
    });
    
    test('should filter problems by tags', async () => {
      const result = await LoadSimilarProblemsTool.execute({
        query: '',
        tags: ['bug'],
        limit: 10
      }, mockAgent as any);
      expect(result.success).toBe(true);
      expect(result.items.length).toBe(1);
      expect(result.items[0].id).toBe('active-1');
    });
    
    test('should combine multiple filters', async () => {
      const result = await LoadSimilarProblemsTool.execute({
        query: 'request',
        status: 'rejected',
        tags: ['feature'],
        limit: 10
      }, mockAgent as any);
      expect(result.success).toBe(true);
      expect(result.items.length).toBe(1);
      expect(result.items[0].id).toBe('rejected-1');
    });

    test('should query problems from RAG if available', async () => {
      const ragProblem = {
        id: 'rag-1',
        title: 'Problem from RAG',
        description: 'This is a problem from RAG',
        priority: 85,
        status: 'resolved',
        timeCreated: new Date('2023-04-01'),
        timeUpdated: new Date('2023-04-02'),
        analysisSteps: ['Step 1'],
        result: 'Solved',
        tags: ['RAG-test']
      };
      const ragResults: RAGResult[] = [
        {
          id: 'rag-1',
          content: JSON.stringify(ragProblem),
          score: 0.95,
          metadata: {
            source: 'problem-context',
            category: 'resolved',
            created: new Date('2023-04-01'),
            lastUpdated: new Date('2023-04-02'),
            tags: ['RAG-test']
          }
        }
      ];
      mockRAG.query.mockResolvedValue(ragResults);
      setRAGInstance(mockRAG as any);
      const result = await LoadSimilarProblemsTool.execute({
        query: 'RAG-test',
        limit: 5
      }, mockAgent as any);
      expect(mockRAG.query).toHaveBeenCalled();
      expect(mockRAG.query).toHaveBeenCalledWith(expect.stringContaining('RAG-test'), expect.any(Object));
      expect(result.success).toBe(true);
      expect(result.items.length).toBe(1);
      expect(result.items[0].id).toBe('rag-1');
    });
  });
  
  describe('ResolveProblemTool', () => {
    beforeEach(() => {
      ProblemContext.data.items = [
        {
          id: 'test-id',
          title: 'Problem to Resolve',
          description: 'This is a problem to be resolved',
          priority: 80,
          status: 'active' as const,
          timeCreated: new Date(),
          timeUpdated: new Date(),
          analysisSteps: ['Step 1', 'Step 2'],
          result: '',
          tags: ['important']
        },
        {
          id: 'inactive-id',
          title: 'Inactive Problem',
          description: 'This is an inactive problem',
          priority: 60,
          status: 'inactive' as const,
          timeCreated: new Date(),
          timeUpdated: new Date(),
          analysisSteps: [],
          result: '',
          tags: []
        }
      ];
    });
    
    test('should resolve a problem and promote inactive problem', async () => {
      const result = await ResolveProblemTool.execute({
        id: 'test-id',
        result: 'Problem successfully resolved'
      }, mockAgent as any);
      expect(result.success).toBe(true);
      const resolvedProblem = ProblemContext.data.items.find((p) => p.id === 'test-id');
      expect(resolvedProblem).toBeDefined();
      expect(resolvedProblem!.status).toBe('resolved');
      expect(resolvedProblem!.result).toBe('Problem successfully resolved');
      const previousInactiveProblem = ProblemContext.data.items.find((p) => p.id === 'inactive-id');
      expect(previousInactiveProblem).toBeDefined();
      expect(previousInactiveProblem!.status).toBe('active');
    });
  });
  
  describe('RejectProblemTool', () => {
    beforeEach(() => {
      ProblemContext.data.items = [{
        id: 'test-id',
        title: 'Problem to Reject',
        description: 'This is a problem to be rejected',
        priority: 40,
        status: 'active' as const,
        timeCreated: new Date(),
        timeUpdated: new Date(),
        analysisSteps: ['Step'],
        result: '',
        tags: ['minor']
      }];
    });
    
    test('should reject a problem', async () => {
      const result = await RejectProblemTool.execute({
        id: 'test-id',
        result: 'Problem does not meet criteria'
      }, mockAgent as any);
      expect(result.success).toBe(true);
      const rejectedProblem = ProblemContext.data.items.find((p) => p.id === 'test-id');
      expect(rejectedProblem).toBeDefined();
      expect(rejectedProblem!.status).toBe('rejected');
      expect(rejectedProblem!.result).toBe('Problem does not meet criteria');
    });
  });

  describe('LoadSimilarRAGProblemsTool', () => {
    let mockRAG: IRAG;
    let ragEnabledContext: IRAGEnabledContext<typeof ProblemContextSchema>;

    beforeEach(() => {
      mockRAG = createMockRAG();
      ragEnabledContext = createProblemRAGContext(mockRAG);
      mockAgent.contextManager.findContextById.mockReturnValue(ragEnabledContext);
      ragEnabledContext.setData({
        items: [
          {
            id: 'resolved-1',
            title: 'Resolved API Problem',
            description: 'Solved an API call error',
            priority: 80,
            status: 'resolved' as const,
            timeCreated: new Date('2023-01-01'),
            timeUpdated: new Date('2023-01-02'),
            analysisSteps: [],
            result: 'Fixed by updating auth header',
            tags: ['API', 'error']
          },
          {
            id: 'active-1',
            title: 'Active Bug Fix',
            description: 'Fixing data sync issue',
            priority: 90,
            status: 'active' as const,
            timeCreated: new Date('2023-03-01'),
            timeUpdated: new Date('2023-03-01'),
            analysisSteps: [],
            result: '',
            tags: ['bug', 'sync']
          }
        ]
      });
      const ragResults: RAGResult[] = [
        {
          id: 'rag-1',
          content: JSON.stringify({
            id: 'rag-1',
            title: 'Semantically Similar API Problem',
            description: 'Solved REST API request failure',
            priority: 85,
            status: 'resolved',
            timeCreated: new Date('2023-05-01'),
            timeUpdated: new Date('2023-05-02'),
            analysisSteps: ['Check auth', 'Fix request format'],
            result: 'Updated API key',
            tags: ['API', 'auth']
          }),
          score: 0.92,
          metadata: {
            source: 'problem-context',
            category: 'resolved',
            created: new Date('2023-05-01'),
            lastUpdated: new Date('2023-05-02'),
            tags: ['API', 'auth']
          }
        },
        {
          id: 'rag-2',
          content: JSON.stringify({
            id: 'rag-2',
            title: 'Another API Problem',
            description: 'Server API rate limit caused request failure',
            priority: 75,
            status: 'resolved',
            timeCreated: new Date('2023-06-01'),
            timeUpdated: new Date('2023-06-02'),
            analysisSteps: ['Analyze error code', 'Implement retry logic'],
            result: 'Added exponential backoff retry',
            tags: ['API', 'performance']
          }),
          score: 0.85,
          metadata: {
            source: 'problem-context',
            category: 'resolved',
            created: new Date('2023-06-01'),
            lastUpdated: new Date('2023-06-02'),
            tags: ['API', 'performance']
          }
        }
      ];
      (mockRAG.query as Mock).mockResolvedValue(ragResults);
      (mockRAG.queryWithFilter as Mock).mockResolvedValue([ragResults[0]]);
    });
    
    test('should query semantically similar problems from RAG', async () => {
      const result = await LoadSimilarRAGProblemsTool.execute({
        query: 'API auth failed',
        limit: 5
      }, mockAgent as any);
      expect(mockRAG.query).toHaveBeenCalled();
      expect(mockRAG.query).toHaveBeenCalledWith('API auth failed', expect.objectContaining({ limit: 5 }));
      expect(result.success).toBe(true);
      expect(result.items.length).toBe(2);
      expect(result.items[0].title).toBe('Semantically Similar API Problem');
      expect(result.items[0].similarityScore).toBe(0.92);
      expect(result.items[1].title).toBe('Another API Problem');
      expect(result.items[1].similarityScore).toBe(0.85);
    });
    
    test('should use filter for RAG query', async () => {
      const result = await LoadSimilarRAGProblemsTool.execute({
        query: 'API Problem',
        status: 'resolved',
        tags: ['API'],
        limit: 5
      }, mockAgent as any);
      expect(mockRAG.queryWithFilter).toHaveBeenCalled();
      expect(mockRAG.queryWithFilter).toHaveBeenCalledWith(
        'API Problem',
        expect.objectContaining({
          metadata: expect.objectContaining({
            category: 'resolved',
            tags: ['API']
          })
        }),
        expect.objectContaining({ limit: 5 })
      );
      expect(result.success).toBe(true);
      expect(result.items.length).toBe(1);
      expect(result.items[0].title).toBe('Semantically Similar API Problem');
    });
    
    test('should return error if RAG is not configured', async () => {
      const noRagContext = createProblemRAGContext();
      mockAgent.contextManager.findContextById.mockReturnValue(noRagContext);
      const result = await LoadSimilarRAGProblemsTool.execute({
        query: 'API Problem',
        limit: 5
      }, mockAgent as any);
      expect(result.success).toBe(false);
      expect(result.error).toContain('RAG system not configured');
    });
    
    test('should handle parse errors from RAG results', async () => {
      (mockRAG.query as Mock).mockResolvedValue([
        {
          id: 'invalid-json',
          content: 'This is not valid JSON',
          score: 0.75,
          metadata: {
            source: 'problem-context',
            category: 'resolved',
            created: new Date(),
            tags: []
          }
        }
      ]);
      const result = await LoadSimilarRAGProblemsTool.execute({
        query: 'API Problem',
        limit: 5
      }, mockAgent as any);
      expect(result.success).toBe(true);
      expect(result.items.length).toBe(1);
      expect(result.items[0].title).toBe('Parse Error');
      expect(result.items[0].error).toContain('Failed to parse problem data');
      expect(result.items[0].similarityScore).toBe(0.75);
    });
  });
}); 