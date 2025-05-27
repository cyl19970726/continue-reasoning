# Coding Agent Performance Testing Framework

## Overview

This framework provides a comprehensive set of tests to evaluate the coding agent's performance across different scenarios, from basic file operations to complex software development tasks.

## Test Categories

### 1. Basic Operations (Level 1)
**Purpose**: Test fundamental file and code operations
**Success Criteria**: 90%+ accuracy, <30s completion time

- **File Operations**
  - Create, read, update, delete files
  - Directory navigation and management
  - File permission handling
  
- **Code Reading**
  - Parse and understand code structure
  - Extract functions, classes, imports
  - Identify code patterns and dependencies

- **Simple Edits**
  - Fix syntax errors
  - Add/remove imports
  - Rename variables/functions
  - Add simple comments

### 2. Code Understanding (Level 2)
**Purpose**: Test code comprehension and analysis
**Success Criteria**: 80%+ accuracy, <60s completion time

- **Code Analysis**
  - Explain code functionality
  - Identify bugs and issues
  - Suggest improvements
  - Generate documentation

- **Refactoring**
  - Extract functions/methods
  - Simplify complex logic
  - Apply design patterns
  - Optimize performance

### 3. Feature Implementation (Level 3)
**Purpose**: Test ability to implement new features
**Success Criteria**: 70%+ accuracy, <300s completion time

- **Small Features**
  - Add new functions/methods
  - Implement simple algorithms
  - Create utility classes
  - Add configuration options

- **Integration Tasks**
  - Connect APIs
  - Add database operations
  - Implement authentication
  - Add logging/monitoring

### 4. Complex Projects (Level 4)
**Purpose**: Test end-to-end development capabilities
**Success Criteria**: 60%+ accuracy, <600s completion time

- **Full Applications**
  - Build complete web apps
  - Create CLI tools
  - Implement microservices
  - Design system architecture

## Test Repositories

### Beginner Level
1. **simple-calculator** - Basic arithmetic operations
2. **todo-list** - CRUD operations with local storage
3. **file-organizer** - File system manipulation
4. **weather-app** - API integration basics

### Intermediate Level
1. **blog-engine** - Full-stack web application
2. **chat-application** - Real-time communication
3. **e-commerce-api** - RESTful API with database
4. **task-scheduler** - Background job processing

### Advanced Level
1. **distributed-system** - Microservices architecture
2. **ml-pipeline** - Data processing and machine learning
3. **game-engine** - Complex algorithms and optimization
4. **compiler** - Language processing and code generation

## Evaluation Metrics

### Functional Metrics
- **Correctness**: Does the code work as intended?
- **Completeness**: Are all requirements implemented?
- **Quality**: Is the code well-structured and maintainable?
- **Performance**: Does the code meet performance requirements?

### Process Metrics
- **Time to Completion**: How long does each task take?
- **Planning Quality**: How well does the agent plan the work?
- **Error Recovery**: How well does the agent handle errors?
- **Tool Usage**: How effectively does the agent use available tools?

### Code Quality Metrics
- **Readability**: Is the code easy to understand?
- **Maintainability**: Is the code easy to modify?
- **Testability**: Is the code easy to test?
- **Documentation**: Is the code well-documented?

## Running Tests

### Quick Start
```bash
# Run basic operations tests
npm run test:basic

# Run all tests
npm run test:all

# Run specific test category
npm run test:level2

# Run with detailed reporting
npm run test:detailed
```

### Custom Test Scenarios
```bash
# Test specific repository
npm run test:repo simple-calculator

# Test with time limits
npm run test:timed 300

# Test with specific agent configuration
npm run test:config production
```

## Test Results Analysis

### Automated Scoring
- Code compilation/execution success
- Test case pass rate
- Performance benchmarks
- Code quality metrics

### Manual Review
- Code review checklist
- Architecture assessment
- Best practices compliance
- Innovation and creativity

## Continuous Improvement

### Performance Tracking
- Track metrics over time
- Identify improvement areas
- Compare different configurations
- Benchmark against human developers

### Test Evolution
- Add new test scenarios
- Update existing tests
- Incorporate real-world challenges
- Community-contributed tests 