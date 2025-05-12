# HHH-AGI MCP Integration Tests

This document focuses specifically on testing the Model Context Protocol (MCP) integration features of HHH-AGI, including both pre-configured MCP servers from `config/mcp.json` and dynamically discovered servers.

## Setup Requirements

1. At least one MCP server configured in `config/mcp.json`
2. Additional MCP server available for dynamic connection tests
3. Agent initialized with MCP context registered

## Test Categories

### 1. Pre-Configured MCP Server Tests

**Test 1.1: Startup Connection Verification**
- **Procedure**: Start the agent and observe logs for MCP connection attempts
- **Expected**: Agent should attempt to connect to all servers defined in `config/mcp.json`
- **Success Criteria**: Log messages showing successful connections and tool registration for each valid server

**Test 1.2: Auto-Activation Configuration**
- **Procedure**: After startup, check the activation status of MCP tool sets
- **Expected**: Tool sets should be activated or deactivated based on the `autoActivate` property in `config/mcp.json` 
- **Success Criteria**: `list_toolset` results matching the expected activation status from configuration

**Test 1.3: Configuration Error Handling**
- **Procedure**: Intentionally introduce errors in the MCP configuration (invalid URL, missing command, etc.)
- **Expected**: Agent should gracefully handle configuration errors and continue with valid configurations
- **Success Criteria**: Error logs for problematic configurations, but successful startup and function for valid ones

### 2. Dynamic MCP Server Discovery Tests

**Test 2.1: Adding New Stdio Server**
- **Input**: "Connect to a new MCP server running on my computer that provides data analysis tools."
- **Expected**: Agent should guide the user through setting up the connection with `add_stdio_mcp_server`
- **Success Criteria**: Successful connection, tool discovery, and appropriate response about available tools

**Test 2.2: Adding New HTTP/SSE Server**
- **Input**: "Connect to the MCP server at https://example-mcp.com/mcp using SSE transport."
- **Expected**: Agent should use `add_sse_or_http_mcp_client` with the provided URL
- **Success Criteria**: Successful connection establishment and confirmation of available tools

**Test 2.3: Dynamic Server Removal**
- **Input**: "Remove the MCP server that we just added."
- **Expected**: Agent should identify the recently added server and use `remove-mcp-client` to disconnect it
- **Success Criteria**: Server successfully removed, associated tool set deactivated and removed

### 3. Tool Discovery and Usage Tests

**Test 3.1: Tool Set Information**
- **Input**: "What MCP tool sets do you have available? List their categories and capabilities."
- **Expected**: Agent should query all MCP contexts for tool set information
- **Success Criteria**: Comprehensive list of all MCP tool sets with proper categorization and description

**Test 3.2: Tool Selection Logic**
- **Input**: "I need to analyze some data. What MCP tools might help with this?"
- **Expected**: Agent should identify and suggest relevant tools from available MCP servers
- **Success Criteria**: Contextually appropriate tool suggestions with accurate descriptions

**Test 3.3: Tool Parameter Handling**
- **Input**: "Use the [specific MCP tool] to process this data: [sample data]."
- **Expected**: Agent should correctly format the parameters for the specified tool
- **Success Criteria**: Proper parameter formatting and successful tool execution

### 4. MCP Tool Integration Tests

**Test 4.1: Tool Result Processing**
- **Input**: "Use [MCP tool] and explain the results to me."
- **Expected**: Agent should execute the tool and provide a clear interpretation of results
- **Success Criteria**: Accurate execution and meaningful explanation of returned data

**Test 4.2: Multi-Tool Workflow**
- **Input**: "Create a workflow that uses multiple MCP tools in sequence to analyze and visualize data."
- **Expected**: Agent should design a workflow that chains multiple tools together
- **Success Criteria**: A working workflow with proper data passing between tools

**Test 4.3: Error Handling in MCP Tools**
- **Input**: "Use [MCP tool] with intentionally invalid parameters."
- **Expected**: Agent should handle the error gracefully and explain the issue
- **Success Criteria**: Clear error reporting and suggestions for correction

### 5. Configuration Management Tests

**Test 5.1: Configuration Persistence**
- **Procedure**: After adding a new MCP server dynamically, restart the agent
- **Expected**: Dynamically added servers should not persist unless saved to configuration
- **Success Criteria**: Clean startup with only configured servers connected

**Test 5.2: Configuration Update Recommendation**
- **Input**: "I want to permanently add this MCP server to my configuration."
- **Expected**: Agent should explain how to update the `config/mcp.json` file
- **Success Criteria**: Clear instructions for adding the server to the configuration

**Test 5.3: Configuration Optimization**
- **Input**: "Analyze my MCP server configurations and suggest improvements."
- **Expected**: Agent should analyze current configurations and suggest optimizations
- **Success Criteria**: Specific, actionable recommendations for improving MCP setup

## Evaluation Metrics

For each test, evaluate:

1. **Connection Success Rate**: Percentage of successful MCP server connections
2. **Tool Discovery Accuracy**: How accurately tools are discovered and categorized
3. **Error Resilience**: How gracefully the system handles connection and tool execution errors
4. **User Guidance Quality**: How well the agent guides users through MCP-related operations
5. **Performance Impact**: Any performance implications of MCP integration

## Results Template

For each test, record:

```
### Test X.X: [Name]

**Input/Procedure**: [Description of the test procedure]
**Observed Behavior**: [What actually happened]
**Connection Success**: [Success/Partial/Failure]
**Tool Discovery**: [Complete/Partial/Failed]
**Error Handling**: [Good/Adequate/Poor]
**User Guidance**: [Clear/Ambiguous/Missing]

**Issues Encountered**:
- [List of specific issues]

**Recommendations**:
- [Specific improvement suggestions]
```

## Integration with Other Tests

Some of these MCP tests may overlap with the prompt architecture and real-world task tests. When executing the test suite:

1. Run the basic MCP configuration tests first to ensure the foundation is working
2. Use successful MCP configurations when testing other aspects of the system
3. Note any interactions between MCP functionality and other system components
4. Pay special attention to context switching between MCP and other contexts

This focused testing approach will help isolate and identify any issues specific to the MCP integration functionality. 