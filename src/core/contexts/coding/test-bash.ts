/**
 * Simple test for the bash tool using the sandbox
 */
import { createGeminiCodingContext } from './coding-context';
import { BashCommandTool } from './toolsets/bash';

async function testBashTool() {
  // Create a coding context with the current directory as workspace
  const context = createGeminiCodingContext(process.cwd());
  
  // Allow sandbox initialization to complete
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Log the sandbox type
  const sandbox = context.getSandbox();
  console.log(`Sandbox type: ${sandbox.type}`);
  
  // Simulate a basic tool call
  const result = await BashCommandTool.execute({
    command: 'echo "Hello from sandbox" && ls -la',
    cwd: process.cwd(),
    allow_network: false
  }, {
    contextManager: {
      findContextById: (id: string) => id === 'coding_gemini' ? context : null
    }
  } as any);
  
  console.log('Tool execution result:');
  console.log('stdout:', result.stdout);
  console.log('stderr:', result.stderr);
  console.log('exit_code:', result.exit_code);
  
  // Test with a command that should fail in a restrictive sandbox
  if (sandbox.type !== 'none') {
    console.log('\nTesting sandbox restrictions...');
    const restrictedResult = await BashCommandTool.execute({
      command: 'curl https://api.github.com',
      cwd: process.cwd(),
      allow_network: false // This should be blocked by the sandbox
    }, {
      contextManager: {
        findContextById: (id: string) => id === 'coding_gemini' ? context : null
      }
    } as any);
    
    console.log('Restricted command result:');
    console.log('stdout:', restrictedResult.stdout);
    console.log('stderr:', restrictedResult.stderr);
    console.log('exit_code:', restrictedResult.exit_code);
  }
}

// Run the test
testBashTool().catch(error => {
  console.error('Test failed:', error);
}); 