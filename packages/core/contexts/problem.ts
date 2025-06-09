import { createTool, ContextHelper, createContextSearchTool, SearchFilter } from "../utils";
import { z } from "zod";
import { IAgent, IMemoryManager, MemoryData, RAGMetadata, IRAG, RAGDocument, IContext, ITool, IRAGEnabledContext, RAGFilter, RAGResult } from "../interfaces";
import { randomUUID } from "crypto";
import { ContextManagerHelper, ManagedItem, ItemStatus } from "./helper";

// --- Define Container IDs --- 
export const PROBLEM_CONTEXT_ID = "problem-context";

// Problem basic info schema
export const ProblemInfoSchema = z.object({
  id: z.string().describe("Unique identifier for the problem"),
  title: z.string().describe("Title of the problem"),
  description: z.string().describe("Detailed description of the problem"),
  priority: z.number().describe("Priority of the problem, higher value means higher priority"),
  status: z.enum(["pending", "active", "inactive", "resolved", "rejected"]).describe("Current status of the problem"),
  timeCreated: z.date().describe("Time when the problem was created"),
  timeUpdated: z.date().describe("Time when the problem was last updated"),
  tags: z.array(z.string()).optional().describe("List of tags for the problem"),
});

// Complete problem data schema
export const ProblemDataSchema = ProblemInfoSchema.extend({
  analysisSteps: z.array(z.string()).default([]).describe("Recorded analysis steps for the problem"),
  result: z.string().default("").describe("Result of the problem resolution or reason for rejection"),
});

// Problem context schema
export const ProblemContextSchema = z.object({
  items: z.array(ProblemDataSchema).default([]).describe("List of all problems"),
  maxActiveItems: z.number().describe("Maximum number of active problems at the same time"),
});

// Create problem schema
export const CreateProblemSchema = z.object({
  title: z.string().describe("Title of the problem"),
  description: z.string().describe("Detailed description of the problem"),
  priority: z.number().describe("Priority of the problem, range 1-100"),
  tags: z.array(z.string()).optional().describe("List of tags for the problem"),
});

// Update problem schema
export const UpdateProblemSchema = z.object({
  id: z.string().describe("ID of the problem to update"),
  title: z.string().optional().describe("Updated title"),
  description: z.string().optional().describe("Updated description"),
  priority: z.number().optional().describe("Updated priority"),
  tags: z.array(z.string()).optional().describe("Updated tags"),
  analysisSteps: z.array(z.string()).optional().describe("Updated analysis steps"),
});

// Add analysis step schema
export const AddAnalysisStepSchema = z.object({
  id: z.string().describe("Problem ID"),
  step: z.string().describe("Analysis step to add"),
});

// Load similar problems schema
export const LoadSimilarProblemsSchema = z.object({
  query: z.string().describe("Query to search for similar problems"),
  limit: z.number().describe("Maximum number of results to return"),
  tags: z.array(z.string()).optional().describe("Filter by tags"),
  status: z.enum(["resolved", "rejected"]).optional().describe("Filter by status"),
});

// Resolve or reject problem schema
export const ResolveProblemSchema = z.object({
  id: z.string().describe("ID of the problem to resolve"),
  result: z.string().describe("Result of the problem resolution"),
});

export const RejectProblemSchema = z.object({
  id: z.string().describe("ID of the problem to reject"),
  result: z.string().describe("Reason for rejection"),
});

// RAG instance and document generator
let ragInstance: IRAG | undefined;

// Function to set RAG instance for testing
export const setRAGInstance = (rag?: IRAG): void => {
  ragInstance = rag;
};

const getRAGDocument = (problem: z.infer<typeof ProblemDataSchema>): RAGDocument => {
  const metadata: RAGMetadata = {
    source: "problem-context",
    category: problem.status,
    created: problem.timeCreated,
    lastUpdated: problem.timeUpdated,
    tags: problem.tags || [],
  };
  
  return {
    id: problem.id,
    content: JSON.stringify(problem),
    metadata,
  };
};

// Create RAG-enabled problem context
export const createProblemRAGContext = (rag?: IRAG): IRAGEnabledContext<typeof ProblemContextSchema> => {
  // Update global RAG instance
  if (rag) {
    ragInstance = rag;
  }
  
  const context = ContextHelper.createRAGContext({
    id: PROBLEM_CONTEXT_ID,
    description: "Manage the context of problems, support querying historical problems via RAG.",
    dataSchema: ProblemContextSchema,
    initialData: {
      items: [],
      maxActiveItems: 5,
    },
    renderPromptFn: (data) => {
      // Categorize problems
      const activeProblems = data.items.filter(item => item.status === "active");
      const pendingProblems = data.items.filter(item => item.status === "pending");
      const inactiveProblems = data.items.filter(item => item.status === "inactive");
      
      // Format problem list
      const formatProblem = (problem: z.infer<typeof ProblemDataSchema>) => {
        return `  - ${problem.title} (ID: ${problem.id}, Priority: ${problem.priority})\n    Description: ${problem.description}\n    Status: ${problem.status}\n    Tags: ${problem.tags?.join(", ") || "None"}`;
      };
      
      // Render prompt
      return `
--- Problem Context ---
Max active problems: ${data.maxActiveItems}

Active problems (${activeProblems.length}/${data.maxActiveItems}):
${activeProblems.length > 0 ? activeProblems.map(formatProblem).join('\n\n') : "  None"}

Pending problems (${pendingProblems.length}):
${pendingProblems.length > 0 ? pendingProblems.map(formatProblem).join('\n\n') : "  None"}

Inactive problems (${inactiveProblems.length}):
${inactiveProblems.length > 0 ? inactiveProblems.map(formatProblem).join('\n\n') : "  None"}

--- Problem Solving Guide ---
1. Active problems are the main problems to be solved currently
2. Pending problems will automatically enter the active queue, if the active queue is full, they will enter the inactive queue
3. When an active problem is resolved or rejected, an inactive problem will be promoted to active
4. When creating a new problem, please provide a clear title, description, and appropriate priority
5. When solving a problem, record the reasoning process through analysis steps
6. If the problem cannot be solved, please use the reject tool and explain the reason
      `;
    },
    toolSetFn: () => ({
      name: "ProblemTools",
      description: "This tool set is designed for problem management and analysis, including tools for creating, updating, analyzing, searching, resolving, and rejecting problems. Suitable for issue tracking, troubleshooting, and knowledge base enrichment.",
      tools: [
        CreateProblemTool,
        UpdateProblemTool,
        AddAnalysisStepTool,
        LoadSimilarProblemsTool,
        LoadSimilarRAGProblemsTool,
        ResolveProblemTool,
        RejectProblemTool
      ],
      active: true,
      source: "problem-context"
    }),
    ragConfigs: ragInstance ? {
      "problemHistory": {
        rag: ragInstance,
        queryTemplate: "Find historical problems similar to the following: {{query}}",
        maxResults: 5,
        resultsFormatter: (results) => {
          let formatted = "\n--- Similar Historical Problems ---\n";
          results.forEach((result, i) => {
            try {
              const problem = JSON.parse(result.content);
              formatted += `[${i+1}] ${problem.title} (Similarity: ${result.score.toFixed(2)})\n`;
              formatted += `  Description: ${problem.description}\n`;
              formatted += `  Result: ${problem.result || 'Unresolved'}\n`;
              if (problem.tags && problem.tags.length > 0) {
                formatted += `  Tags: ${problem.tags.join(', ')}\n`;
              }
              formatted += '\n';
            } catch {
              formatted += `[${i+1}] ${result.content.substring(0, 100)}... (Similarity: ${result.score.toFixed(2)})\n\n`;
            }
          });
          return formatted;
        }
      }
    } : {}
  });
  
  return context;
};

// 先创建 context
const _ProblemContext = createProblemRAGContext();
// 优化 description 字段
_ProblemContext.description = "Captures and manages the current problem or task the agent is working on, including its background, requirements, and any relevant context. Guides the agent in problem analysis, decomposition, and solution generation.";
export const ProblemContext = _ProblemContext;

// Create Helper instance
export const problemHelper = new ContextManagerHelper<z.infer<typeof ProblemDataSchema>>({
  maxActiveItems: 5,
  contextId: PROBLEM_CONTEXT_ID,
  getRAGDocument,
  ragInstance,
});

// Create problem tool
export const CreateProblemTool = problemHelper.createCreateTool({
  name: "create_problem",
  description: "Create a new problem to be solved",
  inputSchema: CreateProblemSchema,
  itemBuilder: (params) => {
    const now = new Date();
    return {
      title: params.title,
      description: params.description,
      priority: params.priority,
      tags: params.tags || [],
      timeCreated: now,
      timeUpdated: now,
      analysisSteps: [],
      result: "",
    };
  },
});

// Update problem tool
export const UpdateProblemTool = problemHelper.createUpdateTool({
  name: "update_problem",
  description: "Update information of an existing problem",
  inputSchema: UpdateProblemSchema,
  shouldUpdateFn: (problem, params) => {
    // Only problems with status pending, active, or inactive can be updated
    return ["pending", "active", "inactive"].includes(problem.status);
  },
});

// Add analysis step tool
export const AddAnalysisStepTool: ITool<typeof AddAnalysisStepSchema, any, IAgent> = {
  name: "add_analysis_step",
  description: "Add an analysis step to a problem",
  type: "function",
  params: AddAnalysisStepSchema,
  async: false,
  execute: async (params: z.infer<typeof AddAnalysisStepSchema>, agent?: IAgent) => {
    if (!agent) {
      return { success: false, error: "Agent instance required" };
    }
    
    try {
      const context = agent.contextManager.findContextById(PROBLEM_CONTEXT_ID);
      if (!context || !context.data) {
        return { success: false, error: `Context ${PROBLEM_CONTEXT_ID} not found` };
      }
      
      // Get all current problems
      const items = context.data.items || [];
      
      // Find the problem to update
      const itemIndex = items.findIndex((item: z.infer<typeof ProblemDataSchema>) => item.id === params.id);
      if (itemIndex === -1) {
        return { success: false, error: `Problem with ID ${params.id} not found` };
      }
      
      // Only active problems can have analysis steps added
      if (items[itemIndex].status !== "active") {
        return { success: false, error: `Only active problems can have analysis steps added` };
      }
      
      // Add analysis step
      items[itemIndex].analysisSteps.push(params.step);
      items[itemIndex].timeUpdated = new Date();
      
      // Update context data
      if (context.setData) {
        context.setData({ items });
      }
      
      return { success: true };
    } catch (error) {
      console.error(`add_analysis_step error:`, error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : String(error) 
      };
    }
  },
  toCallParams: function() {
    return {
      type: "function" as const,
      name: this.name,
      description: this.description,
      paramSchema: this.params,
      async: this.async,
      strict: true
    };
  }
};

// Load similar problems tool
export const LoadSimilarProblemsTool = createContextSearchTool<typeof LoadSimilarProblemsSchema, z.infer<typeof ProblemDataSchema>>({
  name: "load_similar_problems",
  description: "Search for past problems similar to the current problem",
  contextId: PROBLEM_CONTEXT_ID,
  inputSchema: LoadSimilarProblemsSchema,
  
  // Get items from context
  getItems: (context) => context.data.items || [],
  
  // Fields to search
  searchFields: ['title', 'description', 'result'],
  
  // Build filter
  buildFilter: (params) => {
    const filter: SearchFilter = {};
    
    // Add status filter
    if (params.status) {
      filter.status = params.status;
    }
    
    // Add tag filter
    if (params.tags && params.tags.length > 0) {
      filter.tags = params.tags;
    }
    
    return filter;
  },
  
  // Transform result
  transformResult: (items) => ({
    success: true,
    items
  })
});

// Load similar problems from RAG tool
export const LoadSimilarRAGProblemsTool = createTool({
  name: "load_similar_rag_problems",
  description: "Search for historical problems semantically similar to the current problem using RAG system",
  inputSchema: LoadSimilarProblemsSchema,
  outputSchema: z.object({
    success: z.boolean(),
    items: z.array(z.any()),
    error: z.string().optional()
  }),
  async: true,
  execute: async (params: z.infer<typeof LoadSimilarProblemsSchema>, agent?: IAgent) => {
    if (!agent) {
      return { success: false, items: [], error: "Agent instance required" };
    }
    
    try {
      // Get context
      const context = agent.contextManager.findContextById(PROBLEM_CONTEXT_ID);
      if (!context) {
        return { success: false, items: [], error: `Context ${PROBLEM_CONTEXT_ID} not found` };
      }
      
      // Check for RAG capability
      const ragContext = context as IRAGEnabledContext<typeof ProblemContextSchema>;
      if (!ragContext.rags || !ragContext.rags['problemHistory']) {
        return { 
          success: false, 
          items: [], 
          error: "RAG system not configured, cannot perform semantic search. Please configure RAG or use load_similar_problems tool." 
        };
      }
      
      // Build filter
      const filter: RAGFilter = { 
        metadata: {} 
      };
      
      // Add status filter
      if (params.status) {
        filter.metadata = filter.metadata || {};
        filter.metadata.category = params.status;
      }
      
      // Add tag filter
      if (params.tags && params.tags.length > 0) {
        filter.metadata = filter.metadata || {};
        filter.metadata.tags = params.tags;
      }
      
      // Perform RAG query
      let results: RAGResult[];
      if (filter.metadata && Object.keys(filter.metadata).length > 0) {
        results = await ragContext.rags['problemHistory'].queryWithFilter(
          params.query,
          filter,
          { limit: params.limit || 5 }
        );
      } else {
        results = await ragContext.rags['problemHistory'].query(
          params.query,
          { limit: params.limit || 5 }
        );
      }
      
      // Transform results to problem objects
      const items = results.map(result => {
        try {
          // Try to parse JSON content as problem object
          const problem = JSON.parse(result.content);
          // Add similarity score
          return { ...problem, similarityScore: result.score };
        } catch (error) {
          // If parsing fails, return raw content
          return { 
            title: "Parse Error", 
            description: result.content.substring(0, 100), 
            similarityScore: result.score,
            error: "Failed to parse problem data"
          };
        }
      });
      
      return {
        success: true,
        items
      };
    } catch (error) {
      console.error(`load_similar_rag_problems error:`, error);
      return {
        success: false,
        items: [],
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
});

// Save to RAG when resolving or rejecting a problem
const saveToRAG = async (item: z.infer<typeof ProblemDataSchema>) => {
  if (ragInstance) {
    try {
      const ragDoc = getRAGDocument(item);
      await ragInstance.upsert([ragDoc]);
      console.log(`Problem ${item.id} has been saved to RAG for future reference`);
      return true;
    } catch (error) {
      console.error(`Error saving problem to RAG:`, error);
      return false;
    }
  }
  return false;
};

// Resolve problem tool
export const ResolveProblemTool = problemHelper.createStatusChangeTool({
  name: "resolve_problem",
  description: "Mark the problem as resolved",
  inputSchema: ResolveProblemSchema,
  newStatus: "resolved",
  postStatusChangeFn: async (item: z.infer<typeof ProblemDataSchema>, params) => {
    // Update the result of the problem
    item.result = params.result;
    console.log(`Problem ${item.title} (${item.id}) resolved: ${params.result}`);
    
    // Save to RAG
    await saveToRAG(item);
  }
});

// Reject problem tool
export const RejectProblemTool = problemHelper.createStatusChangeTool({
  name: "reject_problem",
  description: "Mark the problem as rejected",
  inputSchema: RejectProblemSchema,
  newStatus: "rejected",
  postStatusChangeFn: async (item: z.infer<typeof ProblemDataSchema>, params) => {
    // Update the result of the problem
    item.result = params.result;
    console.log(`Problem ${item.title} (${item.id}) rejected: ${params.result}`);
    
    // Save to RAG
    await saveToRAG(item);
  }
});

