# Continue Reasoning - Coding Agent

An interactive CLI coding assistant powered by the Continue Reasoning framework.

## Installation

Install globally via npm:

```bash
npm install -g @continue-reasoning/coding
```

## Quick Start

After installation, start the coding agent:

```bash
cr
```

This will launch an interactive CLI interface where you can:
- Ask coding questions
- Request code generation and editing
- Analyze and understand codebases
- Get help with debugging and testing
- Execute system commands

## Features

### 🤖 Intelligent Code Assistant
- **Code Generation**: Create new files, functions, and components
- **Code Editing**: Smart editing with diff support and multiple editing strategies
- **Code Analysis**: Understand complex codebases and dependencies
- **Debugging**: Identify and fix issues with detailed error analysis

### 🔧 Advanced Editing Tools
- **Whole File Editing**: Replace entire file contents
- **Block Editing**: Edit specific code blocks
- **Ranged Editing**: Edit specific line ranges
- **Unified Diff**: Apply unified diff patches
- **Reverse Diff**: Reverse applied changes

### 🗂️ Project Management
- **File Operations**: Read, write, and manage files
- **Directory Structure**: Navigate and organize project files
- **Pattern Matching**: Find files and code patterns with glob and grep
- **Version Control**: Git integration and change tracking

### 🏃 Runtime Environment
- **Sandbox Support**: Safe code execution environments
- **Command Execution**: Run bash commands and scripts
- **Interactive Sessions**: Persistent chat history and context
- **Enhanced Prompts**: Intelligent prompt processing with context management

## Architecture

```
packages/coding/
├── contexts/
│   ├── coding/              # Core coding context
│   │   ├── runtime/         # Code execution runtime
│   │   ├── sandbox/         # Sandboxed execution environments
│   │   ├── toolsets/        # Editing and file operation tools
│   │   └── tests/           # Test suites
│   └── interaction/         # Interactive session management
├── src/
│   └── launchers/           # CLI launchers and entry points
├── utils/                   # Utility functions
├── coding-agent.ts          # Main agent implementation
├── start.ts                 # CLI entry point
└── index.ts                 # Package exports
```

## Tool Categories

### File Operations
- **Read**: Read file contents with line-by-line processing
- **Edit**: Advanced editing with multiple strategies
- **Glob**: Pattern-based file matching
- **Grep**: Content search and pattern matching

### System Operations
- **Bash**: Execute shell commands
- **Runtime**: Code execution in different environments
- **Sandbox**: Safe execution with security constraints

### Development Tools
- **Diff Tools**: Apply and reverse diffs
- **Error Handling**: Enhanced error reporting and recovery
- **Chat History**: Manage conversation context

## Configuration

The coding agent uses intelligent defaults:
- **Model**: Latest OpenAI models with enhanced reasoning
- **Context Management**: Smart history pruning and context optimization
- **Tool Integration**: Parallel tool execution for efficiency
- **Security**: Sandboxed execution environments

## Development

### Building from Source

```bash
# Clone the repository
git clone https://github.com/cyl19970726/continue-reasoning
cd continue-reasoning

# Install dependencies
pnpm install

# Build the coding package
cd packages/coding
pnpm run build

# Run locally
npm link
cr
```

### Development Mode

For quick verification after code modifications, you can run the project in development mode:

```bash
# Start TypeScript compiler in watch mode
pnpm run dev

# In a separate terminal, run the CLI directly
node --loader ts-node/esm start.ts
# Or alternatively:
npx ts-node --esm start.ts
```

This setup will automatically recompile the TypeScript files whenever you make changes, allowing you to quickly test your modifications without having to manually rebuild the project each time.

### Running Tests

```bash
cd packages/coding
pnpm test
```

## License

MIT License - see the main project LICENSE file for details.