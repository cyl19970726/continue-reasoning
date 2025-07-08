#!/usr/bin/env node
import { LogLevel, logger, OPENAI_MODELS, DEEPSEEK_MODELS,ANTHROPIC_MODELS } from '@continue-reasoning/core';
import { CodingAgent } from './coding-agent.js';
import { createCLIClient, createCLIClientWithSession, getCLIClientRegistry } from './cli-client-adapter.js';
import { SessionManager } from '@continue-reasoning/core';
import path from 'path';
import fs from 'fs';



/**
 * CLI Coding Agent - Interactive coding assistant that runs in the current directory
 */
async function startCLICodingAgent(useReactClient: boolean = false) {
    console.log('🚀 Continue Reasoning - Coding Agent\n');
    
    // Use current working directory as workspace
    const workspacePath = process.cwd();
    console.log(`📁 Working directory: ${workspacePath}\n`);

    try {
        // Create CodingAgent
        console.log('🤖 Initializing Coding Agent...');
        const agent = new CodingAgent(
            'cr-coding-agent',
            'Interactive Coding Assistant',
            'A coding agent that works through CLI interface for interactive development',
            workspacePath,
            500, // Allow more steps for interactive sessions
            LogLevel.DEBUG,
            {
                model: ANTHROPIC_MODELS.CLAUDE_3_7_SONNET_LATEST,
                enableParallelToolCalls: true,
                temperature: 0.1,
            },
            [],
        );


        // Create SessionManager
        console.log('🔗 Setting up session...');
        const sessionManager = new SessionManager(agent);
        
        // Create CLI Client with SessionManager
        console.log('🖥️  Starting interactive session...');
        
        let client: any;
        
        // Check if we should use React CLI based on Gemini CLI pattern
        // React CLI requires real TTY support (not available in VS Code integrated terminal)
        const shouldUseReactCLI = useReactClient && process.stdin.isTTY;
        
        if (shouldUseReactCLI) {
            // Use the new React+Ink client (only in TTY environment)
            console.log('🎨 Using React+Ink interface...');
            
            try {
                const registry = getCLIClientRegistry();
                
                // Create React client using the registry
                client = registry.create('react-terminal', {
                    name: 'Continue Reasoning - Coding Assistant (React)',
                    userId: 'developer',
                    agentId: 'cr-coding-agent',
                    enableStreaming: true,
                    theme: 'dark',
                    displayOptions: {
                        showTimestamps: true,
                        showStepNumbers: true,
                        compactMode: false
                    },
                    maxSteps: 50
                });
                
                // Set session manager
                client.setSessionManager(sessionManager);
                
                // Create session
                const sessionId = client.createSession?.('developer', 'cr-coding-agent');
                if (!sessionId) {
                    throw new Error('Failed to create session');
                }
            } catch (error) {
                console.log('⚠️  React CLI failed to start, falling back to standard CLI...');
                console.log('💡 Tip: Try running in a regular terminal for React CLI support\\n');
                
                // Fall back to standard client
                client = createCLIClientWithSession(sessionManager, {
                    name: 'Continue Reasoning - Coding Assistant',
                    userId: 'developer',
                    agentId: 'cr-coding-agent',
                    enableColors: true,
                    enableTimestamps: true,
                    enableHistory: true,
                    historyFile: path.join(workspacePath, '.cr_history'),
                    promptPrefix: '💻',
                    multilineDelimiter: '```',
                    maxSteps: 50
                });
            }
        } else {
            // Use standard readline client (for non-TTY or explicit choice)
            if (useReactClient && !process.stdin.isTTY) {
                console.log('⚠️  React CLI requires TTY environment, using standard CLI...');
                console.log('💡 Tip: React CLI needs Terminal.app or iTerm2 - VS Code integrated terminal is not supported');
                console.log('💡 You can open Terminal.app and run the same command there for React CLI\\n');
            }
            
            client = createCLIClientWithSession(sessionManager, {
                name: 'Continue Reasoning - Coding Assistant',
                userId: 'developer',
                agentId: 'cr-coding-agent',
                enableColors: true,
                enableTimestamps: true,
                enableHistory: true,
                historyFile: path.join(workspacePath, '.cr_history'),
                promptPrefix: '💻',
                multilineDelimiter: '```',
                maxSteps: 50
            });
        }

        // Setup Agent
        console.log('🛠️  Configuring agent...');
        await agent.setup();
        
        // Configure tool call strategy (first step no tools, subsequent steps can use tools)
        agent.setEnableToolCallsForStep((stepIndex) => {
            return stepIndex > 0;
        });

        console.log('✅ Ready! Type your questions or coding tasks.\n');
        console.log('💡 Tips:');
        console.log('   - Use ``` to enter multiline mode');
        console.log('   - Type "exit" or Ctrl+C to quit');
        console.log('   - Your command history is saved in .cr_history\n');

        // Start CLI Client (begins interactive session)
        if (!client) {
            throw new Error('Failed to create client');
        }
        
        try {
            await client.start();
        } catch (error) {
            // If React CLI fails, try to fall back to standard CLI
            if (shouldUseReactCLI && (error as Error).message.includes('Raw mode not supported')) {
                console.log('⚠️  React CLI failed to start, falling back to standard CLI...');
                console.log('💡 Tip: Try running in a regular terminal for React CLI support\\n');
                
                // Create standard CLI client as fallback
                client = createCLIClientWithSession(sessionManager, {
                    name: 'Continue Reasoning - Coding Assistant',
                    userId: 'developer',
                    agentId: 'cr-coding-agent',
                    enableColors: true,
                    enableTimestamps: true,
                    enableHistory: true,
                    historyFile: path.join(workspacePath, '.cr_history'),
                    promptPrefix: '💻',
                    multilineDelimiter: '```',
                    maxSteps: 50
                });
                
                await client.start();
            } else {
                throw error;
            }
        }

    } catch (error) {
        console.error('❌ Failed to start:', error);
        process.exit(1);
    }
}

// Parse command line arguments
function parseArgs() {
    const args = process.argv.slice(2);
    const options = {
        help: false,
        version: false,
        react: false,
    };

    for (const arg of args) {
        switch (arg) {
            case '-h':
            case '--help':
                options.help = true;
                break;
            case '-v':
            case '--version':
                options.version = true;
                break;
            case '-r':
            case '--react':
                options.react = true;
                break;
        }
    }

    return options;
}

// Show help message
function showHelp() {
    console.log(`
Continue Reasoning - Coding Agent

Usage: cr [options]

Options:
  -h, --help     Show this help message
  -v, --version  Show version information
  -r, --react    Use React+Ink interface (experimental)

The coding agent will use the current directory as its workspace.
It can help you with various coding tasks including:
  - Writing and editing code
  - Running commands
  - Analyzing and understanding codebases
  - Creating tests and documentation
  - Debugging and fixing issues

For more information, visit: https://github.com/continue-reasoning/continue-reasoning
`);
}

// Show version
function showVersion() {
    // For ESM, we need to use fs to read package.json
    const packageJson = JSON.parse(fs.readFileSync('./package.json', 'utf-8'));
    console.log(`cr-coding v${packageJson.version}`);
}

// Main entry point
async function main() {
    const options = parseArgs();

    if (options.help) {
        showHelp();
        process.exit(0);
    }

    if (options.version) {
        showVersion();
        process.exit(0);
    }

    // Start the coding agent
    await startCLICodingAgent(options.react);
}

// Run if called directly (ESM way)
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch(error => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
}

export { startCLICodingAgent };