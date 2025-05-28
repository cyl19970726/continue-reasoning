# HHH-AGI Coding Agent Benchmark

A streamlined benchmark suite for testing the HHH-AGI coding agent's performance on real coding tasks.

## Overview

This benchmark evaluates the coding agent across three difficulty levels:
- **Level 1**: Basic file operations and simple tasks
- **Level 2**: Code understanding, analysis, and refactoring  
- **Level 3**: Feature implementation and integration

## Quick Start

### Prerequisites
- Node.js 16+
- HHH-AGI project setup

### Installation
```bash
cd tests/coding-agent-benchmark
npm install
npm run setup
```

### Running Tests

#### Basic Usage
```bash
# Run Level 1 tests (basic operations)
npm run test:level1

# Run Level 2 tests (code understanding)
npm run test:level2

# Run Level 3 tests (feature implementation)
npm run test:level3

# Run legacy basic test suite
npm run test:basic
```

#### Advanced Usage
```bash
# Run with specific model configuration
node run-optimized-test.js development level1-basic-operations

# Run with different model profiles
node run-optimized-test.js testing level2-code-understanding
node run-optimized-test.js budget level1-basic-operations

# Test multi-line input functionality
npm run test:multiline

# Test CLI task manager implementation
npm run test:cli-task-manager

# Show help
npm test
```

## Test Levels

### Level 1: Basic Operations
**Time Limit**: 30-60 seconds per test
**Success Criteria**: 90%+ accuracy

Tests basic file and directory operations:
- Create project structure with multiple directories
- Generate configuration files with specific content
- Perform file operations (create, read, update)
- Handle file permissions and validation
- Build complete CLI applications with command-line argument parsing
- Implement data persistence with JSON files

### Level 2: Code Understanding  
**Time Limit**: 60-180 seconds per test
**Success Criteria**: 80%+ accuracy

Tests code analysis and improvement:
- Identify and fix bugs in React components
- Refactor legacy JavaScript to modern ES6+
- Analyze code patterns and suggest improvements
- Generate documentation and explanations

### Level 3: Feature Implementation
**Time Limit**: 240-300 seconds per test  
**Success Criteria**: 70%+ accuracy

Tests full feature development:
- Build complete Todo application (backend + frontend)
- Implement API integration with error handling
- Create React components with proper state management
- Handle real-world development scenarios

## Model Configurations

The benchmark supports multiple model profiles defined in `test-config.json`:

- **development**: High-performance models for development testing
- **testing**: Balanced models for regular testing
- **budget**: Cost-effective models for frequent testing

Each profile includes:
- Model selection and provider
- Rate limiting and retry logic
- Temperature and token limits
- Timeout configurations

## Test Structure

```
tests/coding-agent-benchmark/
├── run-agent-test.js          # Main test runner
├── run-optimized-test.js      # Optimized runner with model configs
├── test-multiline.js          # Multi-line input functionality test
├── test-cli-task-manager.js   # CLI task manager comprehensive test
├── test-config.json           # Model and test configurations
├── level1-basic-operations/   # Level 1 test definitions
│   ├── test-file-operations.md
│   └── test-cli-task-manager.md
├── level2-code-understanding/ # Level 2 test definitions  
├── level3-feature-implementation/ # Level 3 test definitions
├── test-workspace/            # Temporary workspace for tests
└── reports/                   # Test results and reports
```

## Evaluation Metrics

### Automated Scoring
- **Correctness**: Does the code work as intended?
- **Completeness**: Are all requirements implemented?
- **File Structure**: Are directories and files created correctly?
- **Content Quality**: Does the content meet specifications?

### Performance Metrics
- **Execution Time**: Time to complete each test
- **Success Rate**: Percentage of tests passed
- **Error Recovery**: How well the agent handles failures
- **Tool Usage**: Effectiveness of tool utilization

## Results and Reporting

Test results are automatically saved to the `reports/` directory with:
- Individual test scores and timing
- Detailed evaluation feedback
- Error logs and debugging information
- Summary statistics across all tests

Example output:
```
📊 Test Summary
==================================================
Total Tests: 3
Passed: 2
Failed: 1
Average Score: 78.3%
Total Time: 145s

📋 Individual Results:
PASS file-operations: 95% (45s)
PASS bug-fixing: 85% (60s)
FAIL todo-app: 55% (40s)
```

## Multi-line Input Support

The CLI agent now supports multi-line input for complex instructions:

### Using Multi-line Mode
```bash
# In the CLI, type ### to start multi-line mode
###
Your complex multi-line instruction here
with proper formatting and structure
###
```

### File Input
```bash
# Load file content directly
/file path/to/your/instruction-file.md
```

### Benefits
- **Preserve formatting**: Code blocks, lists, and structure are maintained
- **Complex instructions**: Send detailed requirements without line breaks being lost
- **File loading**: Load test scenarios or instructions from files
- **Better testing**: Write comprehensive test cases with proper formatting

## Troubleshooting

### Common Issues

**Agent timeout**: Increase time limits in test configuration
**Rate limiting**: Adjust `rateLimitDelay` in model config
**Workspace errors**: Run `npm run clean && npm run setup`
**Missing dependencies**: Ensure HHH-AGI is properly installed
**Multi-line issues**: Ensure you use `###` delimiter correctly

### Debug Mode
Add debug logging by setting environment variables:
```bash
LOG_LEVEL=debug npm run test:level1
```

## Contributing

To add new tests:
1. Create test definition files in appropriate level directory
2. Add evaluation logic to `run-agent-test.js`
3. Update test configurations as needed
4. Test with multiple model profiles

## License

MIT License - see main project for details. 