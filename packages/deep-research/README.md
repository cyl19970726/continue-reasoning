# Deep Research Agent

A specialized agent for conducting comprehensive web research on any given topic. The agent provides thorough, accurate, and well-structured research reports through systematic web searches, analysis, and synthesis.

## Features

- **Systematic Research Workflow**: Structured approach from topic analysis to final report generation
- **Parallel Search Capabilities**: Efficient concurrent web searches for multiple queries
- **Comprehensive Context Management**: Tracks research progress, queries, and findings
- **Automatic Report Generation**: Creates markdown research reports with bash tools
- **Rate Limit Handling**: Built-in tools to manage API rate limits gracefully
- **Error Recovery**: Robust error handling and retry mechanisms

## Core Tools

### Research Management Tools
- `updateResearchTopicTool`: Set the main research topic
- `updateRationaleTool`: Define research approach rationale
- `updateQueriesTool`: Generate targeted search queries
- `updateQueriesDoneTool`: Track completed searches
- `updateKnowledgeGapTool`: Identify information gaps
- `updateIsSufficientTool`: Mark research completeness
- `updateSummariesTool`: Consolidate findings

### Execution Tools
- `WebSearchTool`: Conduct web searches with multiple sources
- `BashCommandTool`: Execute bash commands for report generation
- `WaitingTool`: Handle rate limits and API throttling
- `TodoUpdateTool`: Manage task lists and progress tracking
- `AgentStopTool`: Signal completion of research

## Rate Limit Management

The Deep Research Agent includes built-in rate limit handling to prevent API throttling issues:

### WaitingTool Usage
When encountering rate limit errors (e.g., OpenAI token limits), the agent can:

```typescript
// Example usage
WaitingTool({
  seconds: 20,
  reason: "Rate limit encountered, waiting before retry"
})
```

### Error Recovery Strategy
1. **Detection**: Automatically recognizes rate limit error patterns
2. **Waiting**: Uses WaitingTool to pause execution (15-30 seconds)
3. **Retry**: Resumes the failed operation after waiting
4. **Escalation**: Reports persistent failures to user

### Rate Limit Best Practices
- Wait 15-30 seconds for OpenAI rate limits
- Use specific reasons for waiting (tracking and debugging)
- Continue with exact same action after wait period
- Monitor token usage through enhanced context management

## Research Workflow

### 1. Topic Analysis Phase
- Set research topic with context
- Define research approach rationale
- Generate diverse, targeted search queries

### 2. Web Search Phase
- Execute parallel searches for efficiency
- Track query completion status
- Gather information from multiple authoritative sources

### 3. Synthesis Phase
- Consolidate findings into comprehensive summaries
- Organize information logically with citations
- Maintain objectivity and balanced perspectives

### 4. Reflection Phase
- Evaluate research completeness
- Identify knowledge gaps
- Generate additional queries if needed

### 5. Completion Phase
- Generate comprehensive markdown research report
- Save report to `research.md` using BashCommandTool
- Inform user of report location
- Signal completion with AgentStopTool

## Example Usage

```typescript
import { DeepResearchAgent } from '@continue-reasoning/deep-research';
import { OPENAI_MODELS } from '@continue-reasoning/core';

const agent = new DeepResearchAgent(
  'research-agent',
  'Deep Research Specialist',
  'Conducts comprehensive web research',
  30, // max steps
);

// Start research
await agent.startWithUserInput("Research the latest developments in quantum computing");
```

## Configuration

### Enhanced Prompt Processing
The agent uses enhanced prompt processing with optimized message retention:
- Messages: 100 steps
- Tool calls: 20 steps (increased for complex research)
- Errors: 5 steps
- Thinking: 5 steps
- Reasoning: 3 steps

### Context Management
Research context automatically tracks:
- Research topic and rationale
- Pending and completed queries
- Knowledge gaps identification
- Research sufficiency status
- Consolidated summaries
- Task progress (todos)

## Error Handling

### Common Scenarios
- **Rate Limits**: Automatic waiting and retry with WaitingTool
- **API Throttling**: Intelligent backoff strategies
- **Search Failures**: Alternative query generation
- **Network Issues**: Graceful degradation and retry

### Monitoring and Debugging
- Comprehensive logging of all operations
- Tool execution tracking
- Error pattern recognition
- Performance optimization

## Output

The agent generates:
1. **Real-time Progress**: Step-by-step research updates
2. **Comprehensive Report**: Final markdown document with:
   - Executive summary
   - Key findings and insights
   - Source citations and references
   - Balanced analysis and conclusions
3. **Structured Data**: Persistent context for future reference

## Testing

Run the waiting tool test to verify functionality:

```bash
npx tsx packages/deep-research/examples/test-waiting-tool.ts
```

This ensures the rate limit handling mechanism works correctly before conducting research. 