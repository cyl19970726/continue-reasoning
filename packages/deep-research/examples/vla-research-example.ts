import { DeepResearchAgent } from '../agents/deep-research-agent.js';
import { LogLevel, OPENAI_MODELS } from '@continue-reasoning/core';

/**
 * Example: Research the latest developments in Vision-Language-Action (VLA) models
 * 
 * This example demonstrates how to use the DeepResearchAgent to conduct
 * comprehensive research on a cutting-edge AI/robotics topic.
 */

async function runVLAResearch() {
    console.log('🔬 Starting VLA Research Example...\n');

    // Create the Deep Research Agent
    const researchAgent = new DeepResearchAgent(
        'vla-researcher',
        'VLA Research Specialist',
        'Specialized agent for researching Vision-Language-Action models and robotic learning',
        2, // maxSteps - VLA research might need multiple iterations
        LogLevel.INFO,
        {
            model: OPENAI_MODELS.GPT_4O,
            enableParallelToolCalls: true,
            enableParallelToolExecution: true,
            toolExecutionPriority: 10,
        }
    );
    await researchAgent.setup();
    researchAgent.setEnableToolCallsForStep(()=>true);

    // The research query
    const researchQuery = `Research the latest developments in Vision-Language-Action (VLA) models. 
    Focus on:
    1. Recent breakthrough models and architectures
    2. Performance benchmarks and real-world applications
    3. Major research labs and companies working on VLA
    4. Technical innovations in multimodal learning for robotics
    5. Open-source implementations and datasets`;

    try {
        console.log('📋 Research Topic:', researchQuery);
        console.log('\n🚀 Starting research agent...\n');

        // Start the agent with the research query
        const result = await researchAgent.startWithUserInput(
            researchQuery,
            40,
            '0xhhh',
            {
                savePromptPerStep: true,
                promptSaveDir: './vla-research-example',
                promptSaveFormat: 'markdown',
            }
           
        );

        console.log('\n✅ Research completed!');
        console.log('📊 Final Result:', result);

    } catch (error) {
        console.error('❌ Error during research:', error);
    }
}

// Run the example
if (import.meta.url === `file://${process.argv[1]}`) {
    runVLAResearch().catch(console.error);
}

export { runVLAResearch };