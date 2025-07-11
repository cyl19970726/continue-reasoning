# Deep Research Agent Examples

This directory contains examples demonstrating how to use the DeepResearchAgent for various research tasks.

## Available Examples

### 1. VLA Research Example
**File:** `vla-research-example.ts`  
**Workflow:** `vla-research-workflow.md`

Demonstrates comprehensive research on Vision-Language-Action (VLA) models, covering:
- Latest model architectures (RT-2, OpenVLA, Octo)
- Performance benchmarks and applications
- Key research institutions
- Technical innovations
- Open-source resources

## Running Examples

### Prerequisites
```bash
# Install dependencies
npm install

# Build the package
npm run build
```

### Run Individual Examples
```bash
# VLA Research
npx ts-node examples/vla-research-example.ts
```

## Example Structure

Each example typically includes:

1. **Setup Phase**
   - Creating the research agent
   - Configuring parameters (max steps, log level)

2. **Research Query**
   - Clear, focused research question
   - Specific areas of interest

3. **Execution**
   - Agent performs systematic research
   - Uses tools in proper sequence
   - Iterates based on reflection

4. **Output**
   - Comprehensive research report
   - Properly cited sources
   - Actionable insights

## Creating New Examples

To create a new research example:

1. Copy the template structure from `vla-research-example.ts`
2. Define your research topic and focus areas
3. Create a workflow document showing expected behavior
4. Test the example to ensure proper tool usage

### Example Template
```typescript
import { DeepResearchAgent } from '../agents/deep-research-agent.js';
import { LogLevel } from '@continue-reasoning/core';

async function runYourResearch() {
    const researchAgent = new DeepResearchAgent(
        'your-researcher',
        'Your Research Specialist',
        'Description of specialization',
        30,
        LogLevel.INFO
    );

    const researchQuery = `Your research question here`;

    try {
        const result = await researchAgent.chat(researchQuery);
        console.log('Research completed:', result);
    } catch (error) {
        console.error('Error:', error);
    }
}
```

## Best Practices

1. **Clear Research Questions**
   - Be specific about what you want to learn
   - Include focus areas or constraints
   - Mention timeframes if relevant

2. **Appropriate Scope**
   - Not too broad (avoid "tell me everything about X")
   - Not too narrow (ensure enough content exists)
   - Balance depth and breadth

3. **Tool Usage**
   - Always start with TodoUpdateTool
   - Use reflection to identify gaps
   - Mark queries as done after searching
   - End with AgentStopTool

4. **Quality Checks**
   - Verify sources are recent and credible
   - Ensure balanced perspectives
   - Check for completeness via reflection
   - Provide actionable insights

## Common Research Topics

- **Technology**: AI models, frameworks, tools
- **Science**: Recent discoveries, research trends
- **Industry**: Market analysis, competitive landscape
- **Academic**: Literature reviews, methodology comparisons
- **Practical**: Implementation guides, best practices

## Troubleshooting

- **Agent stops early**: Increase maxSteps parameter
- **Insufficient detail**: Add specific focus areas to query
- **Outdated information**: Include year in search queries
- **Missing perspectives**: Use reflection to identify gaps

## Contributing

When adding new examples:
1. Follow the existing structure
2. Document expected workflow
3. Test thoroughly
4. Update this README