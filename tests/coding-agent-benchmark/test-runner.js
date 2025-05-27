#!/usr/bin/env node

/**
 * Coding Agent Performance Test Runner
 * 
 * This script runs various tests to evaluate the coding agent's performance
 * across different categories and difficulty levels.
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const chalk = require('chalk');

class TestRunner {
  constructor() {
    this.results = {
      totalTests: 0,
      passedTests: 0,
      failedTests: 0,
      scores: {},
      startTime: Date.now(),
      endTime: null
    };
    
    this.testCategories = {
      level1: {
        name: 'Basic Operations',
        timeLimit: 30,
        successThreshold: 90,
        tests: [
          'test-file-operations.md'
        ]
      },
      level2: {
        name: 'Code Understanding',
        timeLimit: 60,
        successThreshold: 80,
        tests: [
          'test-bug-fixing.md'
        ]
      },
      level3: {
        name: 'Feature Implementation',
        timeLimit: 300,
        successThreshold: 70,
        tests: [
          'test-todo-app.md'
        ]
      }
    };
  }

  async runAllTests() {
    console.log(chalk.blue('🚀 Starting Coding Agent Performance Tests'));
    console.log(chalk.gray('=' .repeat(50)));
    
    for (const [level, config] of Object.entries(this.testCategories)) {
      await this.runTestLevel(level, config);
    }
    
    this.generateReport();
  }

  async runTestLevel(level, config) {
    console.log(chalk.cyan(`\n📋 Running ${config.name} Tests (${level.toUpperCase()})`));
    console.log(chalk.gray(`Time Limit: ${config.timeLimit}s | Success Threshold: ${config.successThreshold}%`));
    
    const levelResults = {
      passed: 0,
      total: config.tests.length,
      scores: [],
      timeSpent: 0
    };
    
    for (const testFile of config.tests) {
      const testPath = path.join(__dirname, level + '-' + config.name.toLowerCase().replace(' ', '-'), testFile);
      const result = await this.runSingleTest(testPath, config.timeLimit);
      
      levelResults.scores.push(result.score);
      levelResults.timeSpent += result.timeSpent;
      
      if (result.passed) {
        levelResults.passed++;
        this.results.passedTests++;
      } else {
        this.results.failedTests++;
      }
      
      this.results.totalTests++;
    }
    
    this.results.scores[level] = levelResults;
    
    const avgScore = levelResults.scores.reduce((a, b) => a + b, 0) / levelResults.scores.length;
    const passRate = (levelResults.passed / levelResults.total) * 100;
    
    console.log(chalk.green(`✅ ${config.name} Complete:`));
    console.log(chalk.white(`   Average Score: ${avgScore.toFixed(1)}%`));
    console.log(chalk.white(`   Pass Rate: ${passRate.toFixed(1)}%`));
    console.log(chalk.white(`   Time Spent: ${levelResults.timeSpent}s`));
  }

  async runSingleTest(testPath, timeLimit) {
    const testName = path.basename(testPath, '.md');
    console.log(chalk.yellow(`\n🧪 Running: ${testName}`));
    
    const startTime = Date.now();
    
    // Simulate test execution (in real implementation, this would interact with the agent)
    const result = await this.simulateTestExecution(testPath, timeLimit);
    
    const endTime = Date.now();
    const timeSpent = Math.round((endTime - startTime) / 1000);
    
    const status = result.passed ? chalk.green('PASS') : chalk.red('FAIL');
    console.log(`   ${status} - Score: ${result.score}% - Time: ${timeSpent}s`);
    
    if (result.issues.length > 0) {
      console.log(chalk.red('   Issues:'));
      result.issues.forEach(issue => {
        console.log(chalk.red(`     • ${issue}`));
      });
    }
    
    return {
      ...result,
      timeSpent
    };
  }

  async simulateTestExecution(testPath, timeLimit) {
    // This is a simulation - in real implementation, this would:
    // 1. Parse the test file
    // 2. Send tasks to the coding agent
    // 3. Evaluate the agent's responses
    // 4. Check code execution and correctness
    // 5. Calculate scores based on criteria
    
    const testContent = fs.readFileSync(testPath, 'utf8');
    const testName = path.basename(testPath, '.md');
    
    // Simulate different test outcomes based on test complexity
    let score = 0;
    let passed = false;
    let issues = [];
    
    if (testName.includes('file-operations')) {
      // Basic operations - usually high success rate
      score = Math.random() * 20 + 80; // 80-100%
      passed = score >= 90;
      if (!passed) {
        issues.push('Some file operations failed');
        issues.push('Directory structure not created correctly');
      }
    } else if (testName.includes('bug-fixing')) {
      // Bug fixing - moderate success rate
      score = Math.random() * 30 + 60; // 60-90%
      passed = score >= 80;
      if (!passed) {
        issues.push('Not all bugs identified');
        issues.push('Some fixes introduced new issues');
      }
    } else if (testName.includes('todo-app')) {
      // Complex implementation - lower success rate
      score = Math.random() * 40 + 50; // 50-90%
      passed = score >= 70;
      if (!passed) {
        issues.push('Backend API incomplete');
        issues.push('Frontend functionality missing');
        issues.push('Data persistence not working');
      }
    }
    
    // Simulate time delay
    await new Promise(resolve => setTimeout(resolve, Math.random() * 2000 + 1000));
    
    return {
      score: Math.round(score),
      passed,
      issues
    };
  }

  generateReport() {
    this.results.endTime = Date.now();
    const totalTime = Math.round((this.results.endTime - this.results.startTime) / 1000);
    
    console.log(chalk.blue('\n📊 Test Results Summary'));
    console.log(chalk.gray('=' .repeat(50)));
    
    // Overall statistics
    const overallPassRate = (this.results.passedTests / this.results.totalTests) * 100;
    console.log(chalk.white(`Total Tests: ${this.results.totalTests}`));
    console.log(chalk.green(`Passed: ${this.results.passedTests}`));
    console.log(chalk.red(`Failed: ${this.results.failedTests}`));
    console.log(chalk.white(`Pass Rate: ${overallPassRate.toFixed(1)}%`));
    console.log(chalk.white(`Total Time: ${totalTime}s`));
    
    // Level-by-level breakdown
    console.log(chalk.cyan('\n📈 Performance by Level:'));
    for (const [level, results] of Object.entries(this.results.scores)) {
      const avgScore = results.scores.reduce((a, b) => a + b, 0) / results.scores.length;
      const passRate = (results.passed / results.total) * 100;
      
      console.log(chalk.white(`\n${level.toUpperCase()}:`));
      console.log(chalk.white(`  Average Score: ${avgScore.toFixed(1)}%`));
      console.log(chalk.white(`  Pass Rate: ${passRate.toFixed(1)}%`));
      console.log(chalk.white(`  Time: ${results.timeSpent}s`));
    }
    
    // Recommendations
    console.log(chalk.yellow('\n💡 Recommendations:'));
    this.generateRecommendations();
    
    // Save detailed report
    this.saveDetailedReport();
  }

  generateRecommendations() {
    const level1Score = this.results.scores.level1?.scores[0] || 0;
    const level2Score = this.results.scores.level2?.scores[0] || 0;
    const level3Score = this.results.scores.level3?.scores[0] || 0;
    
    if (level1Score < 90) {
      console.log(chalk.yellow('  • Focus on basic file operations and code reading'));
      console.log(chalk.yellow('  • Practice with simple CRUD operations'));
    }
    
    if (level2Score < 80) {
      console.log(chalk.yellow('  • Improve code analysis and debugging skills'));
      console.log(chalk.yellow('  • Practice identifying common bug patterns'));
    }
    
    if (level3Score < 70) {
      console.log(chalk.yellow('  • Work on end-to-end application development'));
      console.log(chalk.yellow('  • Practice API design and frontend integration'));
    }
    
    const overallScore = (level1Score + level2Score + level3Score) / 3;
    if (overallScore >= 85) {
      console.log(chalk.green('  • Excellent performance! Ready for production tasks'));
    } else if (overallScore >= 70) {
      console.log(chalk.yellow('  • Good performance with room for improvement'));
    } else {
      console.log(chalk.red('  • Needs significant improvement before production use'));
    }
  }

  saveDetailedReport() {
    const reportPath = path.join(__dirname, 'reports', `test-report-${Date.now()}.json`);
    
    // Ensure reports directory exists
    const reportsDir = path.dirname(reportPath);
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }
    
    fs.writeFileSync(reportPath, JSON.stringify(this.results, null, 2));
    console.log(chalk.gray(`\n📄 Detailed report saved: ${reportPath}`));
  }
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const runner = new TestRunner();
  
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Coding Agent Performance Test Runner

Usage:
  node test-runner.js [options]

Options:
  --level <level>     Run tests for specific level (level1, level2, level3)
  --test <test>       Run specific test file
  --timeout <sec>     Set custom timeout (default: varies by level)
  --report            Generate detailed report only
  --help, -h          Show this help message

Examples:
  node test-runner.js                    # Run all tests
  node test-runner.js --level level1     # Run only basic operations tests
  node test-runner.js --test todo-app    # Run specific test
    `);
    process.exit(0);
  }
  
  runner.runAllTests().catch(error => {
    console.error(chalk.red('Test runner failed:'), error);
    process.exit(1);
  });
}

module.exports = TestRunner; 