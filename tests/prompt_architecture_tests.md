# HHH-AGI Prompt Architecture Testing Plan

This document contains structured tests to evaluate the prompt architecture, context coordination, tool management and overall agent effectiveness of HHH-AGI.

## Setup Requirements

Before running these tests, ensure:

1. Agent is properly initialized with all contexts
2. MCP configuration is loaded from `config/mcp.json` 
3. At least one MCP server is correctly connected
4. Web search capabilities are available
5. Bash execution is permitted

## Test Categories

### 1. Basic Context Recognition Tests

**Test 1.1: Context Awareness**
- **Input**: "Tell me what contexts you have access to and what each one does."
- **Expected**: Agent should identify all registered contexts (Client, Tool, System, Execute, Plan, MCP, WebSearch, etc.) and explain their purpose.
- **Success Criteria**: Accurate description of at least 5 contexts and their main functions.

**Test 1.2: Context Boundary Recognition**
- **Input**: "How do you know which context to use when responding to a request?"
- **Expected**: Agent should explain its context prioritization logic and mention the context coordination guidelines from the system prompt.
- **Success Criteria**: Mention of context coordination rules and the importance of ClientContext for user interactions.

### 2. Tool Management Tests

**Test 2.1: Tool Discovery and Activation**
- **Input**: "What tool sets do you have available? Which ones are currently active?"
- **Expected**: Agent should use the ToolSetContext to list all available tool sets and their activation status.
- **Success Criteria**: Complete list of tool sets with clear indication of active/inactive status.

**Test 2.2: MCP Tool Integration**
- **Input**: "Tell me about the MCP tools you have access to from the config file."
- **Expected**: Agent should list the MCP servers connected during initialization and the tool categories they provide.
- **Success Criteria**: Correctly identifies auto-loaded MCP servers and mentions at least one tool from each.

**Test 2.3: Tool Activation Management**
- **Input**: "I need to search the web. Make sure the necessary tools are activated."
- **Expected**: Agent should check if WebSearchToolSet is active, and if not, activate it.
- **Success Criteria**: Proper use of list_toolset and activate_toolset if needed.

### 3. Multi-Context Coordination Tests

**Test 3.1: Research and Planning**
- **Input**: "Research the latest advancements in quantum computing and create a plan to implement a basic quantum simulator."
- **Expected**: Agent should coordinate across:
  - WebSearchContext for information gathering
  - PlanContext for creating a structured plan
  - ToolSetContext for managing necessary tools
  - ClientContext for appropriate user responses
- **Success Criteria**: Coherent research results that inform a well-structured plan with clear steps.

**Test 3.2: Problem Analysis and Code Generation**
- **Input**: "I'm having trouble with async/await in JavaScript. Can you explain how it works and provide an example?"
- **Expected**: Agent should:
  - Create a problem record in ProblemContext
  - Use WebSearchContext for up-to-date information if needed
  - Use ExecuteToolsContext to demonstrate code examples
  - Provide clear explanations through ClientContext
- **Success Criteria**: Clear explanation, working code example, and proper problem tracking.

**Test 3.3: MCP Tool Usage**
- **Input**: "Use one of the tools from the MCP server to analyze this data: [provide relevant data for an available MCP tool]."
- **Expected**: Agent should:
  - Identify appropriate MCP server and tool
  - Ensure the tool set is active
  - Correctly format and send the data
  - Process and display results
- **Success Criteria**: Proper tool selection, correct data handling, and clear presentation of results.

### 4. Error Handling and Recovery Tests

**Test 4.1: Missing Information Recovery**
- **Input**: "Create a plan for my project."
- **Expected**: Agent should recognize the ambiguity and request clarification through ClientContext.
- **Success Criteria**: Specific questions that would help clarify the request rather than making assumptions.

**Test 4.2: Tool Error Recovery**
- **Input**: "Search for information about [intentionally problematic query that might cause errors]."
- **Expected**: Agent should handle search tool errors gracefully and provide alternative approaches.
- **Success Criteria**: Proper error detection, clear explanation of the issue, and suggestion of alternatives.

**Test 4.3: Unavailable Tool Handling**
- **Input**: "Deactivate the WebSearchToolSet and then ask to search for something."
- **Expected**: Agent should recognize the tool is unavailable, explain the issue, and suggest activating it.
- **Success Criteria**: Clear explanation of why the search failed and appropriate suggestion to enable the tool set.

### 5. Complex Workflow Tests

**Test 5.1: Multi-Step Task with Tool Switching**
- **Input**: "I need to: 1) find current Bitcoin price, 2) create a Python script that fetches and displays this price, 3) save this as a scheduled task."
- **Expected**: Agent should coordinate across multiple contexts and tool sets, switching between them as needed.
- **Success Criteria**: Complete solution with all steps addressed in proper sequence and appropriate tool usage.

**Test 5.2: Long-Running Task with Progress Updates**
- **Input**: "Create a detailed analysis of cloud providers AWS, Azure, and GCP, with pricing comparisons for common services."
- **Expected**: Agent should create a plan, use web search for data gathering, and provide progress updates.
- **Success Criteria**: Structured approach to the task, clear progress updates, and comprehensive final output.

## Evaluation Metrics

For each test, evaluate:

1. **Context Utilization**: Does the agent use the appropriate contexts for each part of the task?
2. **Prompt Adherence**: Does the agent follow the guidelines established in the system prompt?
3. **Tool Selection**: Are the right tools activated and used for each requirement?
4. **Error Resilience**: How gracefully does the agent handle exceptions, missing information, or unavailable resources?
5. **Information Transfer**: Is information correctly shared and utilized across different contexts?
6. **Output Quality**: Are the final responses coherent, accurate, and well-structured?

## Test Results Template

For each test, record:

```
### Test X.X: [Name]

**Input**: [Actual input provided]
**Observed Behavior**: [What the agent actually did]
**Success Metrics**:
- Context Utilization: [Pass/Partial/Fail] - [Notes]
- Prompt Adherence: [Pass/Partial/Fail] - [Notes]
- Tool Selection: [Pass/Partial/Fail] - [Notes]
- Error Resilience: [Pass/Partial/Fail] - [Notes]
- Information Transfer: [Pass/Partial/Fail] - [Notes]
- Output Quality: [Pass/Partial/Fail] - [Notes]

**Overall Assessment**: [Pass/Partial/Fail]
**Improvement Opportunities**:
- [Specific suggestions for improvement]
```

## Next Steps

After completing these tests:

1. Identify common patterns in any failures or suboptimal responses
2. Determine if issues are related to:
   - Context design/descriptions
   - Prompt structure or clarity
   - Tool definitions and documentation
   - Context coordination mechanisms
3. Develop specific improvements to address identified weaknesses
4. Create follow-up tests to validate improvements 