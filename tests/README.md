# HHH-AGI Automated Testing Framework

This is an automated testing framework for the HHH-AGI agent system, with a focus on evaluating the prompt architecture, context coordination, and MCP integration capabilities.

## Test Files

- **agent_prompt_tests.ts**: Main test suite for agent capabilities and context coordination
- **prompt_architecture_tests.md**: Detailed test scenarios for prompt architecture
- **mcp_integration_tests.md**: Specific tests for MCP server integration
- **real_world_tasks.md**: Practical task-based tests for evaluation

## Running Tests

The test framework uses Vitest. To run the tests:

```bash
# Install dependencies if not already done
npm install

# Run tests
npm run test
```

## Features

### 1. Configurable Context Testing

The framework allows testing different combinations of contexts by creating agents with specific context configurations:

```typescript
const result = createTestAgent(
  'custom-agent',
  'Custom Agent',
  'An agent with custom contexts',
  [
    ToolCallContext,
    ClientContext,
    PlanContext,
    // Add or remove contexts to test different configurations
  ]
);
```

### 2. Dynamic Test Generation

The framework automatically loads tests from Markdown files and converts them into test cases:

```typescript
const testData = loadTestsFromMarkdown();
```

This allows maintaining human-readable test scenarios while still being able to run them in automated tests.

### 3. MCP Integration Testing

The framework includes tests for Model Context Protocol (MCP) integration, using a test configuration file (`config/test-mcp.json`).

### 4. Prompt Rendering Evaluation

Dedicated tests evaluate how individual contexts and combined contexts render their prompts, ensuring proper formatting and content.

## Extending Tests

To add new tests:

1. Add individual test cases to the existing test files
2. Create new test categories in the test files to evaluate specific capabilities
3. Update the Markdown test files with new test scenarios

## Metrics

The tests evaluate:

- Context identification and boundary recognition
- Tool activation and management
- Cross-context coordination
- Error handling and recovery
- Prompt rendering quality
- MCP server integration

## Example Test Output

```
Test 1.1: Context Awareness
Input: Tell me what contexts you have access to and what each one does.
Response: I have access to several contexts:
- ToolCall Context: Manages available tools and tracks tool calls
- Client Context: Handles user interactions and responses
- Plan Context: Creates and manages multi-step plans
- Problem Context: Tracks problems, their analysis and solutions
- System Context: Provides system-level operations
- Execute Context: Handles execution of code and commands
- WebSearch Context: Enables web searching capabilities
- MCP Context: Manages Model Context Protocol tools and servers
``` 