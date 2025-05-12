import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import { BaseAgent, AgentOptions } from '../src/core/agent';
import { ContextManager } from '../src/core/context';
import { MapMemoryManager } from '../src/core/memory/baseMemory';
import { IClient, IContext, AnyTool, Message, ToolSet, IRAGEnabledContext } from '../src/core/interfaces';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { z } from 'zod';

// Import contexts directly from their respective files
import { ToolCallContext, ToolCallContextId } from '../src/core/contexts/tool';
import { ClientContext, cliClientId } from '../src/core/contexts/client';
import { PlanContext } from '../src/core/contexts/plan';
import { ProblemContext } from '../src/core/contexts/problem';
import { SystemToolContext } from '../src/core/contexts/system';
import { ExecuteToolsContext } from '../src/core/contexts/execute';
import { WebSearchContext } from '../src/core/contexts/web-search';
import { MCPContext, MCPContextId, AddSseOrHttpMcpServer } from '../src/core/contexts/mcp';

// Import MCP server helper functions
import { startMcpServer, stopMcpServer, serverUrl } from './mcp_helper';

// Load environment variables
dotenv.config();

// Start MCP server before all tests and stop after all tests
beforeAll(async () => {
  try {
    await startMcpServer();
  } catch (e) {
    console.error("MCP server failed to start for tests:", e);
    throw e;
  }
}, 30000);

afterAll(async () => {
  await stopMcpServer();
});

// Mock client for capturing agent outputs
class TestClient implements IClient<any, any> {
  id: string;
  description: string;
  responses: Message[] = [];
  toolCalls: any[] = [];
  
  constructor(id: string) {
    this.id = id;
    this.description = `Test client for automated testing`;
    this.responses = [];
    this.toolCalls = [];
  }
  
  input = {
    subscribe: (sendfn: (clientInfo: {clientId: string, userId: string}, incomingMessages: Message) => void) => {
      this.sendfn = sendfn;
    }
  };
  
  output = {
    paramsSchema: z.object({
      text: z.string(),
      format: z.string().optional()
    }),
    responseTool: {
      id: 'test-response-tool',
      type: 'function',
      name: 'test_response',
      description: 'Tool for test client response',
      params: z.object({
        text: z.string(),
        format: z.string().optional()
      }),
      async: false,
      execute: (params: any) => {
        this.responses.push({
          role: 'assistant',
          text: params.text,
          timestamp: new Date().toISOString()
        });
        return { success: true };
      },
      toCallParams: () => ({
        type: 'function' as const,
        name: 'test_response',
        description: 'Tool for test client response',
        paramSchema: z.object({
          text: z.string(),
          format: z.string().optional()
        }),
        async: false,
        strict: true,
        resultSchema: z.object({ success: z.boolean() })
      })
    }
  };
  
  sendfn: any;
  
  sendMessage(text: string) {
    const message: Message = {
      role: 'user',
      text,
      timestamp: new Date().toISOString()
    };
    
    this.sendfn({ clientId: this.id, userId: 'test-user' }, message);
    return new Promise<void>((resolve) => {
      // Wait for responses to be collected
      setTimeout(() => {
        resolve();
      }, 1000);
    });
  }
  
  getResponses() {
    return this.responses;
  }
  
  clearResponses() {
    this.responses = [];
  }
}

// Helper function to create an agent with specific contexts
function createTestAgent(
  id: string,
  name: string,
  description: string,
  contexts: IContext<any>[],
  options: AgentOptions = {}
) {
  const contextManager = new ContextManager(id, name, description, {});
  const memoryManager = new MapMemoryManager(id, name, description);
  const testClient = new TestClient('test-client');
  
  // Default agent options
  const defaultOptions: AgentOptions = {
    llmProvider: 'openai',
    enableParallelToolCalls: false,
    temperature: 0.2,
    maxTokens: 2048,
    taskConcurency: 3,
    ...options
  };
  
  const agent = new BaseAgent(
    id,
    name,
    description,
    contextManager,
    memoryManager,
    [testClient],
    defaultOptions,
    10, // maxSteps
    contexts
  );
  
  return { agent, testClient };
}

// Helper function to connect to the MCP server
async function connectToMcpServer(agent: BaseAgent): Promise<number | null> {
  try {
    // First check if MCP server was already connected via config
    const mcpToolSets = agent.toolSets.filter(ts => 
      ts.name.startsWith('MCPServer_') && ts.active
    );
    
    if (mcpToolSets.length > 0) {
      // Extract server ID from tool set name (MCPServer_X)
      const serverIdMatch = mcpToolSets[0].name.match(/MCPServer_(\d+)/);
      if (serverIdMatch && serverIdMatch[1]) {
        const serverId = parseInt(serverIdMatch[1], 10);
        console.log(`Found existing MCP server connection with ID: ${serverId}`);
        return serverId;
      }
    }
    
    // If no existing connection, connect directly
    const result = await AddSseOrHttpMcpServer.execute({
      type: 'sse',
      url: serverUrl
    }, agent);
    
    if (result.success && result.serverId !== undefined) {
      console.log(`Connected to MCP server with ID: ${result.serverId}`);
      return result.serverId;
    }
    console.error('Failed to connect to MCP server:', result.error);
    return null;
  } catch (error) {
    console.error('Error connecting to MCP server:', error);
    return null;
  }
}

// Test suite for agent prompt architecture
describe('Agent Prompt Architecture Tests', () => {
  // Basic Context Recognition Tests
  describe('Context Recognition Tests', () => {
    let agent: BaseAgent;
    let testClient: TestClient;
    
    beforeEach(async () => {
      // Create agent with all contexts
      const result = createTestAgent(
        'test-agent',
        'Test Agent',
        'An agent for testing prompt architecture',
        [
          ToolCallContext,
          ClientContext,
          PlanContext,
          ProblemContext,
          SystemToolContext,
          ExecuteToolsContext,
          WebSearchContext,
          MCPContext
        ]
      );
      
      agent = result.agent as BaseAgent;
      testClient = result.testClient;
      
      await agent.setup();
    });
    
    afterEach(() => {
      agent.stop();
      testClient.clearResponses();
    });
    
    it('should identify available contexts when asked', async () => {
      await testClient.sendMessage('Tell me what contexts you have access to and what each one does.');
      
      // Allow time for the agent to process and respond
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const responses = testClient.getResponses();
      expect(responses.length).toBeGreaterThan(0);
      
      // Check that the response mentions all contexts
      const response = responses[responses.length - 1].text;
      
      expect(response).toContain('ToolCall');
      expect(response).toContain('Client');
      expect(response).toContain('Plan');
      expect(response).toContain('Problem');
      expect(response).toContain('System');
      expect(response).toContain('Execute');
      expect(response).toContain('WebSearch');
      expect(response).toContain('MCP');
    });
    
    it('should explain context boundary rules when asked', async () => {
      await testClient.sendMessage('How do you know which context to use when responding to a request?');
      
      // Allow time for the agent to process and respond
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const responses = testClient.getResponses();
      expect(responses.length).toBeGreaterThan(0);
      
      // Check for context coordination logic
      const response = responses[responses.length - 1].text;
      expect(response).toMatch(/priorit|coordinat|boundar/i); // Match coordination related terms
    });
  });
  
  // Tool Management Tests
  describe('Tool Management Tests', () => {
    let agent: BaseAgent;
    let testClient: TestClient;
    
    beforeEach(async () => {
      const result = createTestAgent(
        'test-agent',
        'Test Agent',
        'An agent for testing tool management',
        [
          ToolCallContext,
          ClientContext,
          SystemToolContext,
          ExecuteToolsContext,
          WebSearchContext,
          MCPContext
        ]
      );
      
      agent = result.agent as BaseAgent;
      testClient = result.testClient;
      
      await agent.setup();
    });
    
    afterEach(() => {
      agent.stop();
      testClient.clearResponses();
    });
    
    it('should list all available tool sets and activation status', async () => {
      await testClient.sendMessage('What tool sets do you have available? Which ones are currently active?');
      
      // Allow time for the agent to process and respond
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const responses = testClient.getResponses();
      expect(responses.length).toBeGreaterThan(0);
      
      // Check that the response mentions tool sets and activation status
      const response = responses[responses.length - 1].text;
      expect(response).toMatch(/active|inactive/i);
      expect(response).toMatch(/tool sets?/i);
    });
    
    it('should check and activate necessary tools when requested', async () => {
      // First deactivate web search tools
      const webSearchToolSet = agent.toolSets.find(ts => ts.name.includes('WebSearch'));
      if (webSearchToolSet) {
        agent.deactivateToolSets([webSearchToolSet.name]);
      }
      
      await testClient.sendMessage('I need to search the web. Make sure the necessary tools are activated.');
      
      // Allow time for the agent to process and respond
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Check if the web search tool set was activated
      const isWebSearchActive = agent.toolSets.find(ts => 
        ts.name.includes('WebSearch') && ts.active
      );
      
      expect(isWebSearchActive).toBeTruthy();
    });
  });
  
  // Custom Context Configuration Tests
  describe('Custom Context Configuration Tests', () => {
    it('should operate with a minimal set of contexts', async () => {
      // Create agent with only essential contexts
      const result = createTestAgent(
        'minimal-agent',
        'Minimal Agent',
        'An agent with minimal context configuration',
        [
          ToolCallContext,
          ClientContext,
          SystemToolContext
        ]
      );
      
      const agent = result.agent as BaseAgent;
      const testClient = result.testClient;
      
      await agent.setup();
      
      await testClient.sendMessage('What capabilities do you have?');
      
      // Allow time for the agent to process and respond
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const responses = testClient.getResponses();
      expect(responses.length).toBeGreaterThan(0);
      
      // The agent should respond appropriately even with limited contexts
      const response = responses[responses.length - 1].text;
      expect(response.length).toBeGreaterThan(0);
      
      agent.stop();
    });
    
    it('should function with specialized contexts for problem-solving', async () => {
      // Create agent focused on problem-solving
      const result = createTestAgent(
        'problem-agent',
        'Problem-Solving Agent',
        'An agent specialized for problem analysis',
        [
          ToolCallContext,
          ClientContext,
          SystemToolContext,
          ProblemContext,
          ExecuteToolsContext
        ]
      );
      
      const agent = result.agent as BaseAgent;
      const testClient = result.testClient;
      
      await agent.setup();
      
      await testClient.sendMessage('I have a problem with my code that keeps crashing. Can you help analyze it?');
      
      // Allow time for the agent to process and respond
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const responses = testClient.getResponses();
      expect(responses.length).toBeGreaterThan(0);
      
      // Check if ProblemContext is being utilized
      const problemTools = agent.toolSets.find(ts => 
        ts.tools.some(t => t.name.includes('problem') || t.name.includes('analysis'))
      );
      
      expect(problemTools).toBeTruthy();
      
      agent.stop();
    });
  });

  // Tests mapping to the test categories in prompt_architecture_tests.md
  describe('Multi-Context Coordination Tests', () => {
    let agent: BaseAgent;
    let testClient: TestClient;
    
    beforeEach(async () => {
      const result = createTestAgent(
        'test-agent',
        'Test Agent',
        'An agent for testing multi-context coordination',
        [
          ToolCallContext,
          ClientContext,
          PlanContext,
          ProblemContext,
          SystemToolContext,
          ExecuteToolsContext,
          WebSearchContext,
          MCPContext
        ]
      );
      
      agent = result.agent as BaseAgent;
      testClient = result.testClient;
      
      await agent.setup();
    });
    
    afterEach(() => {
      agent.stop();
      testClient.clearResponses();
    });
    
    // This is a more complex test that would typically run longer
    it('should coordinate across contexts for research and planning', async () => {
      // For automated testing, we'll use a simpler query that can run quickly
      await testClient.sendMessage('Research Python best practices and create a simple plan for a web scraper.');
      
      // Allow more time for this complex task
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      const responses = testClient.getResponses();
      expect(responses.length).toBeGreaterThan(0);
      
      // Check for evidence of planning, research coordination
      const response = responses[responses.length - 1].text;
      
      // Look for plan-related terms
      expect(response).toMatch(/plan|step|task|research/i);
    });
  });
  
  // Error handling tests
  describe('Error Handling and Recovery Tests', () => {
    let agent: BaseAgent;
    let testClient: TestClient;
    
    beforeEach(async () => {
      const result = createTestAgent(
        'test-agent',
        'Test Agent',
        'An agent for testing error handling',
        [
          ToolCallContext,
          ClientContext,
          PlanContext,
          SystemToolContext,
          ExecuteToolsContext
        ]
      );
      
      agent = result.agent as BaseAgent;
      testClient = result.testClient;
      
      await agent.setup();
    });
    
    afterEach(() => {
      agent.stop();
      testClient.clearResponses();
    });
    
    it('should request clarification when given ambiguous input', async () => {
      await testClient.sendMessage('Create a plan for my project.');
      
      // Allow time for the agent to process and respond
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const responses = testClient.getResponses();
      expect(responses.length).toBeGreaterThan(0);
      
      // Check that the response asks for clarification
      const response = responses[responses.length - 1].text;
      expect(response).toMatch(/what|which|clarify|specify|more information|details/i);
    });
  });
});

// Load test data from the test markdown files
function loadTestsFromMarkdown() {
  const testFiles = [
    'prompt_architecture_tests.md',
    'mcp_integration_tests.md',
    'real_world_tasks.md'
  ];
  
  const tests: {[key: string]: Array<{id: string, name: string, input: string}>} = {};
  
  testFiles.forEach(file => {
    try {
      const filePath = path.join(__dirname, file);
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf-8');
        
        // Extract test cases using regex
        const testCaseRegex = /\*\*Test (\d+\.\d+): ([^*]+)\*\*\s+- \*\*Input\*\*: "([^"]+)"/g;
        let match;
        
        while ((match = testCaseRegex.exec(content)) !== null) {
          const [_, testId, testName, testInput] = match;
          
          if (!tests[file]) {
            tests[file] = [];
          }
          
          tests[file].push({
            id: testId,
            name: testName.trim(),
            input: testInput
          });
        }
      }
    } catch (error) {
      console.error(`Error loading tests from ${file}:`, error);
    }
  });
  
  return tests;
}

// Dynamic test generation from markdown test files
describe('Dynamically Generated Tests', () => {
  const testData = loadTestsFromMarkdown();
  
  Object.entries(testData).forEach(([file, fileTests]) => {
    describe(`Tests from ${file}`, () => {
      let agent: BaseAgent;
      let testClient: TestClient;
      
      beforeEach(async () => {
        const result = createTestAgent(
          'test-agent',
          'Test Agent',
          'An agent for dynamic tests',
          [
            ToolCallContext,
            ClientContext,
            PlanContext,
            ProblemContext,
            SystemToolContext,
            ExecuteToolsContext,
            WebSearchContext,
            MCPContext
          ]
        );
        
        agent = result.agent as BaseAgent;
        testClient = result.testClient;
        
        await agent.setup();
      });
      
      afterEach(() => {
        agent.stop();
        testClient.clearResponses();
      });
      
      // Generate a test for each test case found in the markdown files
      fileTests.slice(0, 3).forEach(test => { // Limit to first 3 tests from each file for faster testing
        it(`Test ${test.id}: ${test.name}`, async () => {
          await testClient.sendMessage(test.input);
          
          // Allow time for the agent to process and respond
          await new Promise(resolve => setTimeout(resolve, 3000));
          
          const responses = testClient.getResponses();
          expect(responses.length).toBeGreaterThan(0);
          
          // Simply verify that there's a response - manual evaluation would be needed for quality
          const response = responses[responses.length - 1].text;
          expect(response.length).toBeGreaterThan(0);
          
          // Output test results to console for manual review
          console.log(`\nTest ${test.id}: ${test.name}`);
          console.log(`Input: ${test.input}`);
          console.log(`Response: ${response}`);
        });
      });
    });
  });
});

// MCP Integration Tests
describe('MCP Integration Tests', () => {
  let agent: BaseAgent;
  let testClient: TestClient;
  let mcpServerId: number | null = null;
  
  beforeEach(async () => {
    // Create agent with focus on MCP functionality
    const result = createTestAgent(
      'mcp-test-agent',
      'MCP Test Agent',
      'An agent for testing MCP integration',
      [
        ToolCallContext,
        ClientContext,
        SystemToolContext,
        MCPContext
      ],
      {
        // Use a test MCP config path
        mcpConfigPath: path.join(__dirname, '..', 'config', 'test-mcp.json')
      }
    );
    
    agent = result.agent as BaseAgent;
    testClient = result.testClient;
    
    await agent.setup();
    
    // Connect to MCP server directly via tool call
    mcpServerId = await connectToMcpServer(agent);
  });
  
  afterEach(() => {
    agent.stop();
    testClient.clearResponses();
  });
  
  it('should load MCP configurations at startup', () => {
    // Check if MCP-related tool sets were created
    const mcpToolSets = agent.toolSets.filter(ts => 
      ts.name.startsWith('MCP') || ts.source === 'mcp'
    );
    
    // Log tool set information
    console.log(`Found ${mcpToolSets.length} MCP tool sets`);
    mcpToolSets.forEach(ts => {
      console.log(`  - ${ts.name}: ${ts.active ? 'active' : 'inactive'}, ${ts.tools.length} tools`);
    });
    
    // At least one tool set should be present from the dynamic connection
    expect(mcpToolSets.length).toBeGreaterThan(0);
  });
  
  it('should connect to MCP server and retrieve tools', async () => {
    expect(mcpServerId).not.toBeNull();
    
    // Find the dynamically created tool set
    const mcpToolSet = agent.toolSets.find(ts => ts.name === `MCPServer_${mcpServerId}`);
    expect(mcpToolSet).toBeDefined();
    expect(mcpToolSet?.tools.length).toBeGreaterThan(0);
    
    // Check for expected tools from the test server
    const toolNames = mcpToolSet?.tools.map(t => t.name) || [];
    expect(toolNames).toContain('add');
    expect(toolNames).toContain('echo');
  });
  
  it('should query MCP server for resources', async () => {
    if (mcpServerId === null) {
      return; // Skip test if MCP server connection failed
    }
    
    // Have the agent ask about available resources
    await testClient.sendMessage('List the resources available from the MCP server you are connected to.');
    
    // Allow time for the agent to process and respond
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    const responses = testClient.getResponses();
    const response = responses[responses.length - 1].text;
    
    // The response should mention greeting or docs resources
    expect(response).toMatch(/resource|greeting|docs/i);
  });
});

// Test suite that evaluates template generation and prompt rendering
describe('Prompt Rendering Tests', () => {
  let contextManager: ContextManager;
  
  beforeEach(() => {
    contextManager = new ContextManager('test-context-manager', 'Test Context Manager', 'For testing prompt rendering', {});
  });
  
  it('should render all contexts in a coherent format', async () => {
    // Register a selection of contexts
    [
      ToolCallContext,
      ClientContext,
      PlanContext,
      ProblemContext
    ].forEach(context => {
      contextManager.registerContext(context as unknown as IRAGEnabledContext<any>);
    });
    
    // Render the complete prompt
    const prompt = await contextManager.renderPrompt();
    
    // Check for expected structure elements
    expect(prompt).toContain('<context');
    expect(prompt).toContain('</context>');
    
    // Check for content from each context
    contextManager.contextList().forEach(context => {
      expect(prompt).toContain(`<context name="${context.id}"`);
    });
    
    // Log the prompt for manual inspection
    console.log('\nComplete Rendered Prompt:');
    console.log(prompt);
  });
  
  it('should render individual contexts correctly', async () => {
    // Test each context's rendering individually
    for (const context of [
      ToolCallContext,
      ClientContext,
      PlanContext,
      ProblemContext
    ]) {
      // Create a fresh context manager for each test
      const testContextManager = new ContextManager('test-context-manager', 'Test Context Manager', 'For testing prompt rendering', {});
      testContextManager.registerContext(context as unknown as IRAGEnabledContext<any>);
      
      // Render prompt with just this context
      const prompt = await testContextManager.renderPrompt();
      
      // Verify context content is included
      expect(prompt).toContain(`<context name="${context.id}"`);
      
      // Verify basic structure
      expect(prompt).toMatch(/<context[^>]*>[\s\S]*<\/context>/);
      
      console.log(`\nRendered Prompt for ${context.id}:`);
      console.log(prompt);
    }
  });
}); 