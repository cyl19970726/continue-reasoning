#!/usr/bin/env node

/**
 * Simple test script to verify multi-line input functionality
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const chalk = require('chalk');

async function testMultilineInput() {
  console.log(chalk.blue('🧪 Testing Multi-line Input Functionality'));
  console.log(chalk.gray('='.repeat(50)));

  const agentPath = path.join(__dirname, '../../examples/cli-with-agent.ts');
  const testWorkspace = path.join(__dirname, 'test-workspace');

  // Prepare test workspace
  if (fs.existsSync(testWorkspace)) {
    fs.rmSync(testWorkspace, { recursive: true, force: true });
  }
  fs.mkdirSync(testWorkspace, { recursive: true });

  console.log(chalk.gray(`Test workspace: ${testWorkspace}`));
  console.log(chalk.blue('Starting agent...'));

  try {
    // Start the agent
    const agentProcess = spawn('npx', ['tsx', agentPath], {
      cwd: testWorkspace,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let output = '';
    let error = '';

    // Collect output
    agentProcess.stdout.on('data', (data) => {
      output += data.toString();
      process.stdout.write(chalk.gray(data.toString()));
    });

    agentProcess.stderr.on('data', (data) => {
      error += data.toString();
      process.stderr.write(chalk.red(data.toString()));
    });

    // Wait a moment for agent to start
    await new Promise(resolve => setTimeout(resolve, 3000));

    console.log(chalk.cyan('\n📝 Sending multi-line test instructions...'));

    // Test multi-line input
    const testInstructions = `Please create a simple test file with the following content:

1. A JavaScript file named 'hello.js'
2. The file should contain:
   - A function called 'greet' that takes a name parameter
   - The function should return "Hello, [name]!"
   - Export the function using module.exports

3. Also create a 'package.json' file with:
   - name: "test-project"
   - version: "1.0.0"
   - description: "A simple test project"

Please implement this and confirm when done.`;

    // Send using multi-line mode
    agentProcess.stdin.write('###\n');
    agentProcess.stdin.write(testInstructions + '\n');
    agentProcess.stdin.write('###\n');

    console.log(chalk.green('✅ Multi-line instructions sent!'));

    // Wait for processing
    await new Promise(resolve => setTimeout(resolve, 10000));

    // Send exit command
    agentProcess.stdin.write('/exit\n');

    // Wait for process to end
    await new Promise((resolve) => {
      agentProcess.on('close', (code) => {
        console.log(chalk.blue(`\n🏁 Agent process ended with code: ${code}`));
        resolve();
      });
    });

    // Check results
    console.log(chalk.cyan('\n📊 Checking results...'));
    
    const helloJsPath = path.join(testWorkspace, 'hello.js');
    const packageJsonPath = path.join(testWorkspace, 'package.json');

    let score = 0;
    const issues = [];

    if (fs.existsSync(helloJsPath)) {
      console.log(chalk.green('✅ hello.js created'));
      const content = fs.readFileSync(helloJsPath, 'utf8');
      if (content.includes('greet') && content.includes('module.exports')) {
        console.log(chalk.green('✅ hello.js has correct content'));
        score += 50;
      } else {
        console.log(chalk.red('❌ hello.js missing required content'));
        issues.push('hello.js missing greet function or exports');
      }
    } else {
      console.log(chalk.red('❌ hello.js not found'));
      issues.push('hello.js file not created');
    }

    if (fs.existsSync(packageJsonPath)) {
      console.log(chalk.green('✅ package.json created'));
      try {
        const content = fs.readFileSync(packageJsonPath, 'utf8');
        const pkg = JSON.parse(content);
        if (pkg.name === 'test-project' && pkg.version === '1.0.0') {
          console.log(chalk.green('✅ package.json has correct content'));
          score += 50;
        } else {
          console.log(chalk.red('❌ package.json missing required properties'));
          issues.push('package.json missing name or version');
        }
      } catch (err) {
        console.log(chalk.red('❌ package.json is not valid JSON'));
        issues.push('package.json is not valid JSON');
      }
    } else {
      console.log(chalk.red('❌ package.json not found'));
      issues.push('package.json file not created');
    }

    // Display final results
    console.log(chalk.blue('\n📋 Test Results:'));
    console.log(chalk.white(`Score: ${score}/100`));
    
    if (issues.length > 0) {
      console.log(chalk.red('Issues:'));
      issues.forEach(issue => {
        console.log(chalk.red(`  • ${issue}`));
      });
    }

    const success = score >= 80;
    const status = success ? chalk.green('PASS') : chalk.red('FAIL');
    console.log(`\n${status} - Multi-line input test ${success ? 'passed' : 'failed'}!`);

    return { success, score, issues };

  } catch (error) {
    console.error(chalk.red('Test failed:'), error);
    return { success: false, score: 0, issues: [error.message] };
  }
}

// Run the test
if (require.main === module) {
  testMultilineInput().then(result => {
    process.exit(result.success ? 0 : 1);
  }).catch(error => {
    console.error(chalk.red('Test execution failed:'), error);
    process.exit(1);
  });
}

module.exports = { testMultilineInput }; 