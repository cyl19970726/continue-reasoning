#!/usr/bin/env node

import { program } from 'commander';
import { DeepResearchAgent } from './agents/deep-research-agent.js';
import { researchContext } from './agents/context.js';
import { LogLevel, createEnhancedPromptProcessor } from '@continue-reasoning/core';

/**
 * Deep Research Agent CLI Entry Point
 */
async function main() {
  program
    .name('deep-research')
    .description('Continue Reasoning Deep Research Agent')
    .version('0.1.0')
    .option('-q, --query <query>', 'Research query to execute')
    .option('-m, --model <model>', 'Model to use', 'claude-3-5-sonnet-20241022')
    .option('-t, --temperature <temperature>', 'Temperature setting', '0.7')
    .option('-v, --verbose', 'Enable verbose logging')
    .parse(process.argv);

  const options = program.opts();

  if (!options.query) {
    console.error('❌ Query is required. Use -q or --query to specify research query');
    process.exit(1);
  }

  try {
    console.log('🔍 Initializing Deep Research Agent...');
    
    // Create agent with model specified in options
    const agent = new DeepResearchAgent(
      'deep-research-agent',
      'Deep Research Agent',
      'AI agent specialized in comprehensive web research',
      50,
      options.verbose ? LogLevel.DEBUG : LogLevel.INFO,
      {
        model: options.model as any,
        temperature: parseFloat(options.temperature),
        promptOptimization: {
          mode: 'detailed',
          maxTokens: 8192,
        }
      },
      [researchContext]
    );

    // Execute research
    console.log(`🚀 Starting research on: "${options.query}"`);
    await agent.startWithUserInput(options.query, 50);

    console.log('\n📝 Research completed. Check the generated research.md file for results.');

  } catch (error) {
    console.error('❌ Research failed:', error);
    process.exit(1);
  }
}

// Run
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});