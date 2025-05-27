# Quick Start Guide: Testing Your Coding Agent

## 🚀 Getting Started

This guide will help you quickly test your HHH-AGI coding agent's performance using our comprehensive benchmark suite.

## Prerequisites

1. **Node.js** (v16 or higher)
2. **npm** or **yarn**
3. **HHH-AGI** project set up and working
4. **Required dependencies**:
   ```bash
   npm install chalk tsx
   ```

## Quick Test (5 minutes)

### 1. Run Basic Performance Test
```bash
cd tests/coding-agent-benchmark
node run-agent-test.js --basic
```

This will test:
- ✅ File operations (creating directories, files)
- ✅ Simple bug fixing
- ✅ Basic code understanding

### 2. Expected Output
```
🚀 Running Basic Coding Agent Tests
==================================================

🧪 Running Test: file-operations
Time Limit: 120s
--------------------------------------------------
[Agent output will appear here...]

PASS - Score: 85% - Time: 45s

🧪 Running Test: bug-fixing
Time Limit: 60s
--------------------------------------------------
[Agent output will appear here...]

PASS - Score: 78% - Time: 23s

📊 Test Summary
==================================================
Total Tests: 2
Passed: 2
Failed: 0
Average Score: 81.5%
Total Time: 68s
```

## Comprehensive Testing (30 minutes)

### 1. Run Full Test Suite
```bash
# Run all levels
node test-runner.js

# Run specific level
node test-runner.js --level level1
node test-runner.js --level level2
node test-runner.js --level level3
```

### 2. Test Categories

#### Level 1: Basic Operations (30s each)
- **File Operations**: Create, read, modify files
- **Directory Management**: Navigate and organize files
- **Simple Code Reading**: Parse and understand code structure

#### Level 2: Code Understanding (60s each)
- **Bug Detection**: Find and identify code issues
- **Code Analysis**: Explain functionality and suggest improvements
- **Refactoring**: Improve code structure and quality

#### Level 3: Feature Implementation (300s each)
- **Todo Application**: Build complete full-stack app
- **API Development**: Create RESTful services
- **Frontend Integration**: Connect UI with backend

## Manual Testing

### 1. Interactive Testing
```bash
# Start the CLI agent
cd examples
npx tsx cli-with-agent.ts

# Test specific capabilities
/mode manual
"Create a simple calculator function that handles division by zero"
"Find and fix bugs in this code: [paste buggy code]"
"Build a todo list application with React and Node.js"
```

### 2. Custom Test Scenarios

Create your own test files in `tests/coding-agent-benchmark/custom/`:

```markdown
# Custom Test: Your Scenario

## Task
Describe what you want the agent to do...

## Success Criteria
- [ ] Requirement 1
- [ ] Requirement 2
- [ ] Requirement 3

## Evaluation
How to measure success...
```

## Performance Benchmarks

### Expected Performance Levels

| Level | Beginner | Intermediate | Advanced | Expert |
|-------|----------|--------------|----------|--------|
| **Level 1** | 70-80% | 85-90% | 95%+ | 98%+ |
| **Level 2** | 50-65% | 70-80% | 85-90% | 95%+ |
| **Level 3** | 30-45% | 55-70% | 75-85% | 90%+ |

### Time Performance

| Test Category | Target Time | Good Time | Excellent Time |
|---------------|-------------|-----------|----------------|
| **File Ops** | <30s | <20s | <10s |
| **Bug Fixing** | <60s | <40s | <20s |
| **Todo App** | <300s | <180s | <120s |

## Troubleshooting

### Common Issues

1. **Agent doesn't start**
   ```bash
   # Check if all dependencies are installed
   npm install
   
   # Verify TypeScript compilation
   npx tsc --noEmit
   ```

2. **Tests timeout**
   ```bash
   # Increase timeout for complex tests
   node run-agent-test.js --basic --timeout 600
   ```

3. **Workspace permission errors**
   ```bash
   # Ensure write permissions
   chmod -R 755 tests/coding-agent-benchmark/test-workspace
   ```

### Debug Mode

```bash
# Run with verbose output
DEBUG=1 node run-agent-test.js --basic

# Save detailed logs
node run-agent-test.js --basic > test-output.log 2>&1
```

## Interpreting Results

### Score Interpretation

- **90-100%**: Excellent - Ready for production tasks
- **80-89%**: Good - Suitable for most development work
- **70-79%**: Fair - Needs improvement for complex tasks
- **60-69%**: Poor - Requires significant training
- **<60%**: Inadequate - Major issues need addressing

### Common Failure Patterns

1. **File Operations Failures**
   - Missing directory creation
   - Incorrect file paths
   - Permission issues

2. **Bug Fixing Issues**
   - Incomplete bug identification
   - Fixes that introduce new bugs
   - Missing edge case handling

3. **Implementation Problems**
   - Incomplete feature implementation
   - Poor error handling
   - Missing integration between components

## Next Steps

### Improve Performance
1. **Analyze failure patterns** from test reports
2. **Adjust agent configuration** (temperature, max tokens, etc.)
3. **Enhance context prompts** for better understanding
4. **Add more training examples** for specific scenarios

### Advanced Testing
1. **Create custom test scenarios** for your specific use cases
2. **Set up continuous testing** with CI/CD pipelines
3. **Compare different agent configurations**
4. **Benchmark against human developers**

### Real-World Testing
1. **Use agent on actual projects**
2. **Track performance over time**
3. **Collect user feedback**
4. **Iterate and improve**

## Support

If you encounter issues or need help:

1. Check the [troubleshooting section](#troubleshooting)
2. Review test logs in `tests/coding-agent-benchmark/reports/`
3. Create an issue with detailed error information
4. Join our community discussions

Happy testing! 🎯 