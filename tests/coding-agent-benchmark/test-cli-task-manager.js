#!/usr/bin/env node

/**
 * CLI Task Manager Test Script
 * 
 * This script tests the CLI task manager implementation
 * by running the actual commands and verifying the results.
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const chalk = require('chalk');

class CliTaskManagerTester {
  constructor() {
    this.agentPath = path.join(__dirname, '../../examples/cli-with-agent.ts');
    this.testWorkspace = path.join(__dirname, 'test-workspace');
    this.taskCliPath = path.join(this.testWorkspace, 'task-cli');
  }

  async runTest() {
    console.log(chalk.blue('🧪 Testing CLI Task Manager Implementation'));
    console.log(chalk.gray('='.repeat(50)));

    // Prepare test workspace
    await this.prepareWorkspace();

    try {
      // Step 1: Create the CLI task manager using the agent
      console.log(chalk.cyan('📝 Step 1: Creating CLI Task Manager with Agent...'));
      await this.createTaskManagerWithAgent();

      // Step 2: Verify the implementation
      console.log(chalk.cyan('🔍 Step 2: Verifying Implementation...'));
      const verificationResult = await this.verifyImplementation();

      // Step 3: Test functionality (if implementation exists)
      console.log(chalk.cyan('⚡ Step 3: Testing Functionality...'));
      const functionalityResult = await this.testFunctionality();

      // Generate final report
      const finalScore = this.calculateFinalScore(verificationResult, functionalityResult);
      this.generateReport(verificationResult, functionalityResult, finalScore);

      return finalScore;

    } catch (error) {
      console.error(chalk.red('Test execution failed:'), error);
      return { success: false, score: 0, issues: [error.message] };
    }
  }

  async prepareWorkspace() {
    if (fs.existsSync(this.testWorkspace)) {
      fs.rmSync(this.testWorkspace, { recursive: true, force: true });
    }
    fs.mkdirSync(this.testWorkspace, { recursive: true });
    console.log(chalk.gray(`Test workspace: ${this.testWorkspace}`));
  }

  async createTaskManagerWithAgent() {
    const agentProcess = spawn('npx', ['tsx', this.agentPath], {
      cwd: this.testWorkspace,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let output = '';
    let error = '';

    agentProcess.stdout.on('data', (data) => {
      output += data.toString();
      process.stdout.write(chalk.gray(data.toString()));
    });

    agentProcess.stderr.on('data', (data) => {
      error += data.toString();
      process.stderr.write(chalk.red(data.toString()));
    });

    // Wait for agent to start
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Send the task instructions
    const instructions = fs.readFileSync(
      path.join(__dirname, 'level1-basic-operations/test-cli-task-manager.md'), 
      'utf8'
    );

    agentProcess.stdin.write('###\n');
    agentProcess.stdin.write(instructions + '\n');
    agentProcess.stdin.write('###\n');

    console.log(chalk.green('✅ Instructions sent to agent'));

    // Wait for processing
    await new Promise(resolve => setTimeout(resolve, 30000)); // 30 seconds

    // Send exit command
    agentProcess.stdin.write('/exit\n');

    // Wait for process to end
    await new Promise((resolve) => {
      agentProcess.on('close', (code) => {
        console.log(chalk.blue(`Agent process ended with code: ${code}`));
        resolve();
      });
    });

    return { output, error };
  }

  async verifyImplementation() {
    const result = {
      score: 0,
      issues: [],
      details: {}
    };

    // Check project structure
    const requiredDirs = ['task-cli', 'task-cli/data', 'task-cli/utils'];
    const requiredFiles = [
      'task-cli/index.js',
      'task-cli/taskManager.js',
      'task-cli/utils/fileUtils.js',
      'task-cli/README.md'
    ];

    let dirsCreated = 0;
    let filesCreated = 0;

    console.log(chalk.cyan('📁 Checking project structure...'));
    
    for (const dir of requiredDirs) {
      const dirPath = path.join(this.testWorkspace, dir);
      if (fs.existsSync(dirPath)) {
        dirsCreated++;
        console.log(chalk.green(`✅ Directory: ${dir}`));
      } else {
        console.log(chalk.red(`❌ Missing directory: ${dir}`));
        result.issues.push(`Missing directory: ${dir}`);
      }
    }

    for (const file of requiredFiles) {
      const filePath = path.join(this.testWorkspace, file);
      if (fs.existsSync(filePath)) {
        filesCreated++;
        console.log(chalk.green(`✅ File: ${file}`));
      } else {
        console.log(chalk.red(`❌ Missing file: ${file}`));
        result.issues.push(`Missing file: ${file}`);
      }
    }

    // Check file contents
    console.log(chalk.cyan('📄 Checking file contents...'));
    
    const indexPath = path.join(this.taskCliPath, 'index.js');
    if (fs.existsSync(indexPath)) {
      const content = fs.readFileSync(indexPath, 'utf8');
      if (content.includes('process.argv')) {
        console.log(chalk.green('✅ index.js has command line argument handling'));
        result.score += 10;
      } else {
        console.log(chalk.red('❌ index.js missing command line argument handling'));
        result.issues.push('index.js missing process.argv');
      }
    }

    const taskManagerPath = path.join(this.taskCliPath, 'taskManager.js');
    if (fs.existsSync(taskManagerPath)) {
      const content = fs.readFileSync(taskManagerPath, 'utf8');
      const hasAdd = content.includes('add');
      const hasList = content.includes('list');
      const hasDone = content.includes('done');
      
      if (hasAdd && hasList && hasDone) {
        console.log(chalk.green('✅ taskManager.js has all required functions'));
        result.score += 20;
      } else {
        console.log(chalk.red('❌ taskManager.js missing some functions'));
        result.issues.push(`taskManager.js missing functions: ${[!hasAdd && 'add', !hasList && 'list', !hasDone && 'done'].filter(Boolean).join(', ')}`);
      }
    }

    const fileUtilsPath = path.join(this.taskCliPath, 'utils/fileUtils.js');
    if (fs.existsSync(fileUtilsPath)) {
      const content = fs.readFileSync(fileUtilsPath, 'utf8');
      if (content.includes('readJSON') && content.includes('writeJSON')) {
        console.log(chalk.green('✅ fileUtils.js has JSON utility functions'));
        result.score += 10;
      } else {
        console.log(chalk.red('❌ fileUtils.js missing JSON utility functions'));
        result.issues.push('fileUtils.js missing readJSON/writeJSON');
      }
    }

    result.score += (dirsCreated / requiredDirs.length) * 10;
    result.score += (filesCreated / requiredFiles.length) * 10;
    
    result.details = {
      dirsCreated,
      filesCreated,
      totalDirs: requiredDirs.length,
      totalFiles: requiredFiles.length
    };

    return result;
  }

  async testFunctionality() {
    const result = {
      score: 0,
      issues: [],
      details: {}
    };

    const indexPath = path.join(this.taskCliPath, 'index.js');
    
    if (!fs.existsSync(indexPath)) {
      result.issues.push('Cannot test functionality: index.js not found');
      return result;
    }

    console.log(chalk.cyan('⚡ Testing CLI commands...'));

    try {
      // Test 1: Add a task
      console.log(chalk.blue('Testing: node index.js add "Test task"'));
      const addResult = await this.runCliCommand(['add', 'Test task']);
      
      if (addResult.success) {
        console.log(chalk.green('✅ Add command executed successfully'));
        result.score += 15;
      } else {
        console.log(chalk.red('❌ Add command failed'));
        result.issues.push('Add command failed: ' + addResult.error);
      }

      // Test 2: List tasks
      console.log(chalk.blue('Testing: node index.js list'));
      const listResult = await this.runCliCommand(['list']);
      
      if (listResult.success) {
        console.log(chalk.green('✅ List command executed successfully'));
        result.score += 10;
        
        // Check if the added task appears in the list
        if (listResult.output.includes('Test task')) {
          console.log(chalk.green('✅ Added task appears in list'));
          result.score += 10;
        } else {
          console.log(chalk.red('❌ Added task not found in list'));
          result.issues.push('Added task not found in list output');
        }
      } else {
        console.log(chalk.red('❌ List command failed'));
        result.issues.push('List command failed: ' + listResult.error);
      }

      // Test 3: Mark task as done
      console.log(chalk.blue('Testing: node index.js done 1'));
      const doneResult = await this.runCliCommand(['done', '1']);
      
      if (doneResult.success) {
        console.log(chalk.green('✅ Done command executed successfully'));
        result.score += 15;
      } else {
        console.log(chalk.red('❌ Done command failed'));
        result.issues.push('Done command failed: ' + doneResult.error);
      }

      // Test 4: Check data persistence
      const tasksJsonPath = path.join(this.taskCliPath, 'data/tasks.json');
      if (fs.existsSync(tasksJsonPath)) {
        try {
          const tasksData = JSON.parse(fs.readFileSync(tasksJsonPath, 'utf8'));
          console.log(chalk.green('✅ Data persistence working (tasks.json created)'));
          result.score += 10;
          
          if (Array.isArray(tasksData) && tasksData.length > 0) {
            console.log(chalk.green('✅ Task data structure is valid'));
            result.score += 10;
          }
        } catch (error) {
          console.log(chalk.red('❌ tasks.json is not valid JSON'));
          result.issues.push('tasks.json is not valid JSON');
        }
      } else {
        console.log(chalk.red('❌ Data persistence not working (tasks.json not found)'));
        result.issues.push('tasks.json not created');
      }

    } catch (error) {
      result.issues.push('Functionality testing failed: ' + error.message);
    }

    return result;
  }

  async runCliCommand(args) {
    return new Promise((resolve) => {
      const child = spawn('node', ['index.js', ...args], {
        cwd: this.taskCliPath,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let output = '';
      let error = '';

      child.stdout.on('data', (data) => {
        output += data.toString();
      });

      child.stderr.on('data', (data) => {
        error += data.toString();
      });

      child.on('close', (code) => {
        resolve({
          success: code === 0,
          output,
          error,
          code
        });
      });

      child.on('error', (err) => {
        resolve({
          success: false,
          output,
          error: err.message,
          code: -1
        });
      });

      // Set timeout
      setTimeout(() => {
        child.kill();
        resolve({
          success: false,
          output,
          error: 'Command timeout',
          code: -1
        });
      }, 5000);
    });
  }

  calculateFinalScore(verificationResult, functionalityResult) {
    const totalScore = verificationResult.score + functionalityResult.score;
    const allIssues = [...verificationResult.issues, ...functionalityResult.issues];
    
    return {
      success: totalScore >= 80,
      score: Math.min(100, totalScore),
      issues: allIssues,
      details: {
        verification: verificationResult.details,
        functionality: functionalityResult.details,
        verificationScore: verificationResult.score,
        functionalityScore: functionalityResult.score
      }
    };
  }

  generateReport(verificationResult, functionalityResult, finalScore) {
    console.log(chalk.blue('\n📊 CLI Task Manager Test Report'));
    console.log(chalk.gray('='.repeat(50)));
    
    console.log(chalk.white(`Final Score: ${finalScore.score}/100`));
    console.log(chalk.white(`Verification Score: ${verificationResult.score}/60`));
    console.log(chalk.white(`Functionality Score: ${functionalityResult.score}/70`));
    
    const status = finalScore.success ? chalk.green('PASS') : chalk.red('FAIL');
    console.log(`\n${status} - CLI Task Manager test ${finalScore.success ? 'passed' : 'failed'}!`);
    
    if (finalScore.issues.length > 0) {
      console.log(chalk.red('\nIssues:'));
      finalScore.issues.forEach(issue => {
        console.log(chalk.red(`  • ${issue}`));
      });
    }

    // Save detailed report
    const reportPath = path.join(__dirname, 'reports', `cli-task-manager-${Date.now()}.json`);
    const reportsDir = path.dirname(reportPath);
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }
    
    fs.writeFileSync(reportPath, JSON.stringify({
      testName: 'cli-task-manager',
      timestamp: new Date().toISOString(),
      finalScore,
      verificationResult,
      functionalityResult
    }, null, 2));
    
    console.log(chalk.gray(`\nDetailed report saved: ${reportPath}`));
  }
}

// Run the test
if (require.main === module) {
  const tester = new CliTaskManagerTester();
  tester.runTest().then(result => {
    process.exit(result.success ? 0 : 1);
  }).catch(error => {
    console.error(chalk.red('Test execution failed:'), error);
    process.exit(1);
  });
}

module.exports = { CliTaskManagerTester }; 