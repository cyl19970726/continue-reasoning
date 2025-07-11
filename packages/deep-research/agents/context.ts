import { IContext, ITool, IAgent, ToolExecutionResult,ContextHelper,WebSearchTool, ToolSet , IRAGEnabledContext, PromptCtx } from '@continue-reasoning/core';
import { z } from 'zod';
import { logger } from '@continue-reasoning/core';
import { createTool } from '@continue-reasoning/core';
import * as os from 'os';
import { BashCommandTool } from './tool.js';
import { WaitingTool } from '@continue-reasoning/core';

// AgentStopTool - 停止Agent执行
const AgentStopTool = createTool({
  name: 'AgentStopTool',
  description: `
  This tool is used to send the stop signal to the agent.
  Usage:
  - **Complete stop**: Use with reason "Task completed successfully" 
  - **Wait for confirmation**: Use with reason "Please confirm before proceeding with implementation"
`,
  inputSchema: z.object({
    reason: z.string().describe('Reason for stopping the agent. Example: "Task completed successfully" or "User request fulfilled"')
  }),
  async: false,
  execute: async (args, agent) => {
    const { reason } = args;
    
    if (!agent) {
      return {
        success: false,
        message: 'Agent context is required to stop execution'
      };
    }

    try {
      // Call the agent's stop method
      await agent.stop();
      
      return {
        success: true,
        message: `Agent stopped successfully. Reason: ${reason}`,
        stopped: true
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to stop agent: ${error}`,
        stopped: false
      };
    }
  }
});

// TodoUpdateTool - 管理context data中的todos
const TodoUpdateTool = createTool({
  name: 'TodoUpdate',
  description: `
  **CRITICAL**: You MUST use this tool to update todos list when you are working on a complex task.
  Format:
  - **Open tasks**: \`- [ ] task description\`
  - **Completed tasks**: \`- [x] task description\`
  - **Multiple tasks**: Separate with newlines
  Usage:
  - For simple 1-step tasks, todos creation is not required.
  - For complex tasks, use this tool to create/update a todos list to track your progress.`,
  inputSchema: z.object({
    todos: z.string().describe('Todos in markdown format. Example: "- [ ] task1\\n- [ ] task2\\n- [x] completed_task". Use "EMPTY" to clear all todos.')
  }),
  async: false,
  execute: async (args, agent) => {
    const { todos } = args;
    
    if (!agent) {
      return {
        success: false,
        message: 'Agent context is required',
        todos: ''
      };
    }

    // Get the research context
    const researchContext = agent.contextManager.findContextById('research-context');
    if (!researchContext) {
      return {
        success: false,
        message: 'Research context not found',
        todos: ''
      };
    }

    const contextData = researchContext.getData();
    const currentTodos = contextData.todos || 'EMPTY';
    
    // Handle special case: EMPTY
    if (todos.trim() === 'EMPTY') {
      researchContext.setData({
        ...contextData,
        todos: 'EMPTY'
      });
      
      return {
        success: true,
        message: 'Cleared todos list',
        todos: 'EMPTY'
      };
    }
    
    // Handle normal todos update
    if (!todos || todos.trim() === '') {
      return {
        success: false,
        message: 'Todos string is required. Use "EMPTY" to clear todos.',
        todos: currentTodos
      };
    }
    
    // Update context data
    researchContext.setData({
      ...contextData,
      todos: todos.trim()
    });
    
    const taskCount = (todos.match(/^- \[/gm) || []).length;
    return {
      success: true,
      message: `Updated todos list with ${taskCount} tasks`,
      todos: todos.trim()
    };
  }
});

// 1. updateResearchTopic - 设置研究主题
export const updateResearchTopicTool = createTool({
  name: 'updateResearchTopic',
  description: `
This tool is used to set or update the main research topic being investigated.

**EXAMPLE**
user: Research the latest developments in quantum computing

agent:
updateResearchTopic:
{
    "research_topic": "latest developments in quantum computing"
}
  `,
  inputSchema: z.object({
    research_topic: z.string().describe("The main research topic being investigated")
  }),
  async: false,
  execute: async (args, agent) => {
    const { research_topic } = args;
    const context = agent?.contextManager.findContextById('research-context');
    if (!context) {
      return {
        success: false,
        message: 'Research context not found'
      };
    }

    const contextData = context.getData();
    contextData.research_topic = research_topic;
    context.setData(contextData);

    return {
      success: true,
      message: `Research topic updated: ${research_topic}`,
      research_topic
    };
  }
});

// 2. updateRationale - 更新研究理由
export const updateRationaleTool = createTool({
  name: 'updateRationale',
  description: `
This tool is used to update the reasoning behind the current research approach.

**EXAMPLE**
user: Research Topic: What revenue grew more last year apple stock or the number of people buying an iphone

agent:
updateRationale:
{
    "rationale": "To answer this comparative growth question accurately, we need specific data points on Apple's stock performance and iPhone sales metrics. These queries target the precise financial information needed: company revenue trends, product-specific unit sales figures, and stock price movement over the same fiscal period for direct comparison."
}
  `,
  inputSchema: z.object({
    rationale: z.string().describe("Brief explanation of why this research approach is relevant")
  }),
  async: false,
  execute: async (args, agent) => {
    const { rationale } = args;
    const context = agent?.contextManager.findContextById('research-context');
    if (!context) {
      return {
        success: false,
        message: 'Research context not found'
      };
    }

    const contextData = context.getData();
    contextData.rationale = rationale;
    context.setData(contextData);

    return {
      success: true,
      message: 'Rationale updated successfully',
      rationale
    };
  }
});

// 3. updateQueries - 更新搜索查询
export const updateQueriesTool = createTool({
  name: 'updateQueries',
  description: `
This tool is used to update the list of search queries to execute.

**EXAMPLE**
agent:
updateQueries:
{
    "queries": ["Apple total revenue growth fiscal year 2024", "iPhone unit sales growth fiscal year 2024", "Apple stock price growth fiscal year 2024"]
}
  `,
  inputSchema: z.object({
    queries: z.array(z.string()).describe("List of search queries to execute")
  }),
  async: false,
  execute: async (args, agent) => {
    const { queries } = args;
    const context = agent?.contextManager.findContextById('research-context');
    if (!context) {
      return {
        success: false,
        message: 'Research context not found'
      };
    }

    const contextData = context.getData();
    contextData.queries = queries;
    context.setData(contextData);

    return {
      success: true,
      message: `Updated ${queries.length} queries`,
      queries
    };
  }
});

// 4. updateKnowledgeGap - 更新知识缺口
export const updateKnowledgeGapTool = createTool({
  name: 'updateKnowledgeGap',
  description: `
This tool is used to update the identified gaps in current knowledge that need to be addressed.

**EXAMPLE**
agent:
updateKnowledgeGap:
{
    "knowledge_gap": "The summary lacks information about performance metrics, benchmarks, and specific technical implementations"
}
  `,
  inputSchema: z.object({
    knowledge_gap: z.string().describe("Description of what information is missing or needs clarification")
  }),
  async: false,
  execute: async (args, agent) => {
    const { knowledge_gap } = args;
    const context = agent?.contextManager.findContextById('research-context');
    if (!context) {
      return {
        success: false,
        message: 'Research context not found'
      };
    }

    const contextData = context.getData();
    contextData.knowledge_gap = knowledge_gap;
    context.setData(contextData);

    return {
      success: true,
      message: 'Knowledge gap updated successfully',
      knowledge_gap
    };
  }
});

// 5. updateIsSufficient - 更新是否足够标志
export const updateIsSufficientTool = createTool({
  name: 'updateIsSufficient',
  description: `
This tool is used to update whether the current research is sufficient to answer the question.

**EXAMPLE**
agent:
updateIsSufficient:
{
    "is_sufficient": false
}
  `,
  inputSchema: z.object({
    is_sufficient: z.boolean().describe("Whether the current research is sufficient to answer the question")
  }),
  async: false,
  execute: async (args, agent) => {
    const { is_sufficient } = args;
    const context = agent?.contextManager.findContextById('research-context');
    if (!context) {
      return {
        success: false,
        message: 'Research context not found'
      };
    }

    const contextData = context.getData();
    contextData.is_sufficient = is_sufficient;
    context.setData(contextData);

    return {
      success: true,
      message: `Research sufficiency updated: ${is_sufficient ? 'sufficient' : 'insufficient'}`,
      is_sufficient
    };
  }
});

// 6. updateSummaries - 更新研究总结
export const updateSummariesTool = createTool({
  name: 'updateSummaries',
  description: `
This tool is used to update the consolidated summaries of all research findings.

**EXAMPLE**
agent:
updateSummaries:
{
    "summaries": "Current research shows quantum computers are advancing rapidly. IBM and Google are leading developments with specific focus on error correction and scalability..."
}
  `,
  inputSchema: z.object({
    summaries: z.string().describe("Consolidated summaries of all research findings")
  }),
  async: false,
  execute: async (args, agent) => {
    const { summaries } = args;
    const context = agent?.contextManager.findContextById('research-context');
    if (!context) {
      return {
        success: false,
        message: 'Research context not found'
      };
    }

    const contextData = context.getData();
    contextData.summaries = summaries;
    context.setData(contextData);

    return {
      success: true,
      message: 'Summaries updated successfully',
      summaries
    };
  }
});

// 7. updateQueriesDone - 将完成的查询移动到queries_done
export const updateQueriesDoneTool = createTool({
  name: 'updateQueriesDone',
  description: `
This tool is used to mark a query as completed by moving it from queries to queries_done.

**IMPORTANT**: Use this tool after successfully searching with a query to track progress.

**EXAMPLE**
agent:
updateQueriesDone:
{
    "completed_query": "quantum computing breakthroughs 2024"
}
  `,
  inputSchema: z.object({
    completed_query: z.string().describe("The query that has been completed and should be moved to queries_done")
  }),
  async: false,
  execute: async (args, agent) => {
    const { completed_query } = args;
    const context = agent?.contextManager.findContextById('research-context');
    if (!context) {
      return {
        success: false,
        message: 'Research context not found'
      };
    }

    const contextData = context.getData();
    
    // Check if the query exists in queries array
    const queryIndex = contextData.queries.indexOf(completed_query);
    if (queryIndex === -1) {
      return {
        success: false,
        message: `Query "${completed_query}" not found in pending queries`,
        queries: contextData.queries,
        queries_done: contextData.queries_done
      };
    }

    // Remove from queries and add to queries_done
    contextData.queries.splice(queryIndex, 1);
    contextData.queries_done.push(completed_query);
    context.setData(contextData);

    return {
      success: true,
      message: `Query moved to completed: "${completed_query}"`,
      remaining_queries: contextData.queries.length,
      completed_queries: contextData.queries_done.length,
      queries: contextData.queries,
      queries_done: contextData.queries_done
    };
  }
});

const allTools = [  
    AgentStopTool,
    TodoUpdateTool,
    updateResearchTopicTool,
    updateRationaleTool,
    updateQueriesTool,
    updateQueriesDoneTool,
    updateKnowledgeGapTool,
    updateIsSufficientTool,
    updateSummariesTool,
    WebSearchTool,
    BashCommandTool,
    WaitingTool
]
let ResearchToolSet: ToolSet = {
    tools: allTools,
    active: true,
    name: 'ResearchToolSet',
    description: 'Tool set for deep research operations',
}
// Schema for ResearchContext persistent data - 7 core components
export const ResearchContextDataSchema = z.object({
    research_topic: z.string().describe("The main research topic being investigated"),
    rationale: z.string().describe("The reasoning behind the current research approach"),
    queries: z.array(z.string()).describe("List of search queries to execute"),
    queries_done: z.array(z.string()).describe("List of search queries that have been completed"),
    knowledge_gap: z.string().describe("Identified gaps in current knowledge that need to be addressed"),
    is_sufficient: z.boolean().describe("Whether the current research is sufficient to answer the question"),
    summaries: z.string().describe("Consolidated summaries of all research findings"),
    todos: z.string().optional().describe("Current task list in markdown format. Example: '- [ ] task1\\n- [ ] task2'. Mark completed tasks with '- [x] task1'."),
  });

// Create research context using ContextHelper
export const researchContext = ContextHelper.createContext({
  id: 'research-context',
  description: 'Context for deep research operations',
  dataSchema: ResearchContextDataSchema,
  initialData: {
    research_topic: '',
    rationale: '',
    queries: [],
    queries_done: [],
    knowledge_gap: '',
    is_sufficient: false,
    summaries: '',
    todos: 'EMPTY',
  },
  toolSetFn: () => {
      return ResearchToolSet;
  },
});

// Export all tools for external use
export {
  AgentStopTool,
  TodoUpdateTool,
  WebSearchTool
};