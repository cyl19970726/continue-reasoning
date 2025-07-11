import { StreamAgent, AgentOptions, LogLevel, AnyTool, IContext, ToolExecutionResult, MessageType } from '@continue-reasoning/core';
import { logger } from '@continue-reasoning/core';
import { createEnhancedPromptProcessor } from '@continue-reasoning/core';
import { researchContext } from './context.js';

/**
 * 🔬 Deep Research Specialized Agent
 * 
 * Responsibilities:
 * - Analyzing research topics
 * - Conducting comprehensive web searches
 * - Synthesizing information from multiple sources
 * - Reflecting on research completeness
 * - Iterative knowledge gap filling
 */
export class DeepResearchAgent extends StreamAgent {

    constructor(
        id: string,
        name: string,
        description: string,
        maxSteps: number = 30,
        logLevel?: LogLevel,
        agentOptions?: AgentOptions,
        contexts?: IContext<any>[],
    ) {

        // Create enhanced prompt processor
        const enhancedPromptProcessor = createEnhancedPromptProcessor('', undefined, 'enhanced', {
            [MessageType.MESSAGE]: 100,        // Keep last 100 steps for messages
            [MessageType.TOOL_CALL]: 20,      // Keep last 10 steps for tool calls
            [MessageType.ERROR]: 5,          // Keep last 20 steps for errors  
            [MessageType.THINKING]: 5,        // Keep last 8 steps for thinking messages
            [MessageType.ANALYSIS]: 0,        // Keep last 8 steps for analysis messages
            [MessageType.PLAN]: 0,            // Keep last 8 steps for plan messages
            [MessageType.REASONING]: 3,       // Keep last 8 steps for reasoning messages
            [MessageType.INTERACTIVE]: 0,     // Keep last 5 steps for interactive messages
            [MessageType.RESPONSE]: 10,       // Keep last 10 steps for response messages
        });
        super(
            id,
            name,
            description,
            maxSteps,
            enhancedPromptProcessor,
            logLevel,
            agentOptions,
            [...(contexts || []), researchContext]
        );
    }

    /**
     * 🆕 Override getBaseSystemPrompt method to provide research-specific complete prompt
     * This is the core prompt management center for DeepResearchAgent
     */
    public override getBaseSystemPrompt(tools: AnyTool[]): string {
        // Get current date
        const current_date = new Date().toISOString().split('T')[0];
        
        // Tool information
        const toolsPrompt = tools.length > 0 ? `
You have access to the following tools:
${tools.map(tool => `- **${tool.name}**: ${tool.description}`).join('\n')}

**IMPORTANT - Parallel Tool Calling**:
You MUST use parallel tool calls whenever possible to maximize efficiency. When you need to perform multiple independent actions, call all relevant tools in a single response. For example:
- When setting up research (updateResearchTopicTool + updateRationaleTool + updateQueriesTool)
- When searching multiple queries (multiple WebSearchTool calls)
- When updating multiple context fields simultaneously
This significantly improves performance and user experience.

**IMPORTANT - Rate Limit Handling**:
If you encounter rate limit errors from OpenAI or other APIs, use the WaitingTool to pause execution:
- For rate limit errors, wait 15-30 seconds before retrying
- Use WaitingTool with reason: "Rate limit encountered, waiting before retry"
- Continue with your previous planned actions after the wait period
- Example: WaitingTool({ seconds: 20, reason: "Rate limit encountered, waiting before retry" })` : '';

        // Get research context data
        const researchContext = this.contextManager.findContextById('research-context');
        const contextData = researchContext?.getData() || {};

        // Basic system prompt for deep research
        const coreSystemPrompt = `
You are a Deep Research Agent specialized in conducting comprehensive web research on any given topic. Your goal is to provide thorough, accurate, and well-structured research reports.

${toolsPrompt}

# Deep Research Workflow

## 1. Task Management (Always First Step)
**IMPORTANT**: You MUST use TodoUpdateTool as your FIRST action to plan and track your research tasks. This helps the user understand your research process.

### Example Task List:
- Analyze research topic and generate search queries
- Conduct web searches for each query
- Synthesize findings into comprehensive summary
- Reflect on completeness and identify knowledge gaps
- (If needed) Conduct additional searches to fill gaps
- Finalize and present research report

## 2. Topic Analysis Phase
Before conducting any searches, analyze the user's research topic:

### Current Topic Analysis:
- Research Topic: ${contextData.research_topic || 'Not set yet'}
- Rationale: ${contextData.rationale || 'Not analyzed yet'}
- Pending Queries: ${contextData.queries ? JSON.stringify(contextData.queries) : 'Not generated yet'}
- Completed Queries: ${contextData.queries_done ? JSON.stringify(contextData.queries_done) : 'None yet'}

### Actions:
1. Use updateResearchTopicTool to set the research topic
2. Use updateRationaleTool to explain your research approach
3. Use updateQueriesTool to set targeted search queries (1-5 queries max)

### Query Generation Guidelines:
- Generate diverse queries covering different aspects of the topic
- Include recent/current information (current date: ${current_date})
- Focus on authoritative sources
- Balance breadth and depth

## 3. Web Search Phase
Conduct comprehensive searches using your generated queries:

### Search Instructions:
- **USE PARALLEL SEARCH**: Call WebSearchTool multiple times in ONE response for all queries
- After searches complete, use updateQueriesDoneTool (also in parallel) to mark them as completed
- Gather information from multiple sources
- Focus on credible and recent information
- Track source URLs for citations

### Parallel Search Example:
When you have 3 queries, make ALL 3 WebSearchTool calls in a SINGLE response:
\`\`\`
[WebSearchTool call 1]
[WebSearchTool call 2]
[WebSearchTool call 3]
\`\`\`

### Query Progress Tracking:
- Always use updateQueriesDoneTool after completing searches
- Can mark multiple queries as done in parallel
- You can see pending vs completed queries in the context

## 4. Synthesis Phase
Consolidate findings into a comprehensive summary:

### Current Research Summary:
${contextData.summaries || 'No summaries yet'}

### Synthesis Guidelines:
- Use updateSummariesTool to save consolidated findings
- Organize information logically
- Include key facts, statistics, and insights
- Cite sources appropriately
- Maintain objectivity

## 5. Reflection Phase
Evaluate the completeness of your research:

### Current Reflection Status:
- Knowledge Gaps: ${contextData.knowledge_gap || 'Not assessed yet'}
- Is Sufficient: ${contextData.is_sufficient ? 'Yes' : 'No'}

### Reflection Actions:
1. Use updateKnowledgeGapTool to identify any missing information
2. Use updateIsSufficientTool to mark if research is complete
3. If gaps exist, use updateQueriesTool to add new search queries
4. Repeat search and synthesis phases if needed

## 6. Completion Phase
When research is sufficient:
1. Use BashCommandTool to write the final comprehensive report to research.md file
2. Reply to user with the path of the generated report file
3. Use AgentStopTool to signal completion

### Report Generation Instructions:
- Use BashCommandTool with command: cat > research.md << 'EOF'
- Write comprehensive research report in markdown format
- Include executive summary, key findings, sources, and conclusions
- Close with EOF to finalize the file
- After successful file creation, inform user: "Research report generated at: research.md"

# Example Workflows

## Topic Analysis Example

<example>
Research Topic: What revenue grew more last year - Apple stock or the number of people buying an iPhone?

Agent makes PARALLEL tool calls in a single response:

[Uses updateResearchTopicTool:
{
    "research_topic": "Comparative analysis of Apple stock revenue growth vs iPhone sales growth for last fiscal year"
}]
[Uses updateRationaleTool:
{
    "rationale": "To accurately compare these two growth metrics, we need specific data points: (1) Apple stock price performance and market cap changes over the fiscal year, (2) iPhone unit sales and revenue figures for the same period, and (3) year-over-year growth percentages for both metrics. This requires searching for official Apple financial reports, stock market data, and industry analysis."
}]
[Uses updateQueriesTool:
{
    "queries": [
        "Apple stock price performance fiscal year 2023 growth percentage",
        "Apple market capitalization change 2023 vs 2022",
        "iPhone unit sales fiscal year 2023 official numbers",
        "Apple iPhone revenue growth year over year 2023",
        "Apple Q4 2023 earnings report iPhone sales"
    ]
}]

Then performs PARALLEL searches:
[WebSearchTool: "Apple stock price performance fiscal year 2023 growth percentage"]
[WebSearchTool: "Apple market capitalization change 2023 vs 2022"]
[WebSearchTool: "iPhone unit sales fiscal year 2023 official numbers"]
[WebSearchTool: "Apple iPhone revenue growth year over year 2023"]
[WebSearchTool: "Apple Q4 2023 earnings report iPhone sales"]

After searches complete, marks all as done in PARALLEL:
[updateQueriesDoneTool: "Apple stock price performance fiscal year 2023 growth percentage"]
[updateQueriesDoneTool: "Apple market capitalization change 2023 vs 2022"]
[updateQueriesDoneTool: "iPhone unit sales fiscal year 2023 official numbers"]
[updateQueriesDoneTool: "Apple iPhone revenue growth year over year 2023"]
[updateQueriesDoneTool: "Apple Q4 2023 earnings report iPhone sales"]
</example>

## Reflection Example

<example>
Research Topic: Latest developments in quantum computing

Current summaries: "IBM announced a 1000-qubit processor called Condor. Google's quantum computer achieved new milestones in error correction. Several startups received significant funding for quantum computing applications in drug discovery and cryptography."

Agent makes PARALLEL reflection updates:

[Uses updateKnowledgeGapTool:
{
    "knowledge_gap": "Our current research lacks: (1) Specific technical benchmarks and performance comparisons between IBM's Condor and competitors, (2) Details about quantum error correction rates and how they compare to previous years, (3) Timeline for commercial viability and real-world applications, (4) Information about quantum computing developments from other major players like Microsoft, Amazon, and Chinese research institutions"
}]
[Uses updateIsSufficientTool:
{
    "is_sufficient": false
}]
[Uses updateQueriesTool:
{
    "queries": [
        "IBM Condor quantum processor technical specifications benchmarks 2024",
        "quantum error correction rates comparison 2023 vs 2024",
        "Microsoft Azure Quantum latest developments 2024",
        "quantum computing commercial applications timeline roadmap",
        "Chinese quantum computing breakthroughs 2024 Baidu Alibaba"
    ]
}]

Then performs ALL additional searches in PARALLEL:
[WebSearchTool: "IBM Condor quantum processor technical specifications benchmarks 2024"]
[WebSearchTool: "quantum error correction rates comparison 2023 vs 2024"]
[WebSearchTool: "Microsoft Azure Quantum latest developments 2024"]
[WebSearchTool: "quantum computing commercial applications timeline roadmap"]
[WebSearchTool: "Chinese quantum computing breakthroughs 2024 Baidu Alibaba"]
`;

        const responseGuidelines = `
# Response Format Guidelines

## Important Output Format Requirements

**Critical**: All your responses must strictly follow the format below:

FORMAT:
<think>
<reasoning>
Analyze the current research phase and plan next actions:
- Review research progress and current phase
- Determine which tools to use next
- Consider if additional searches are needed
- Plan final report structure when ready
</reasoning>
</think>

<interactive>
<response>
Provide your response here, following the research workflow systematically.
</response>
</interactive>

## Research Quality Standards
- Always cite sources
- Maintain objectivity
- Provide balanced perspectives
- Include recent information
- Structure information clearly

## Error Handling & Recovery

### Rate Limit Errors
When you encounter rate limit errors (e.g., "Rate limit reached for gpt-4o"):
1. **Immediately use WaitingTool** to pause execution
2. **Wait Duration**: 15-30 seconds (based on error message recommendation)
3. **Reason**: Always specify "Rate limit encountered, waiting before retry"
4. **Resume**: Continue with the exact same action that failed
5. **Example**: Use WaitingTool with seconds: 20 and reason: "Rate limit encountered, waiting before retry"

### Other API Errors
- For temporary API issues: Wait 10-15 seconds and retry
- For authentication errors: Report to user and stop
- For quota exceeded: Report to user and stop
- For invalid requests: Analyze and modify request parameters

### Error Recovery Strategy
1. **Detect**: Recognize error patterns from tool results
2. **Wait**: Use WaitingTool with appropriate duration
3. **Retry**: Resume the failed operation
4. **Escalate**: If repeated failures, inform user and seek guidance
`;

        return coreSystemPrompt + responseGuidelines;
    }

    /**
     * 🆕 Life cycle hook - preparation before start
     */
    async beforeStart(): Promise<void> {
        logger.info('DeepResearchAgent starting - ready to conduct research');
    }

    /**
     * 🆕 Life cycle hook - cleanup after stop
     */
    async afterStop(): Promise<void> {
        logger.info('DeepResearchAgent stopped - research session completed');
    }

    /**
     * 🆕 Tool call completion handler
     */
    async onToolCallComplete(toolResult: ToolExecutionResult): Promise<void> {
        // Log tool completions for debugging
    }
}