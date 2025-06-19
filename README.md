# Continue Reasoning

Continue Reasoning is a powerful AI agent framework designed to handle complex reasoning tasks through modular architecture, intelligent context management, and sophisticated tool integration.

## ✨ Features

- **🤖 Intelligent Agent System**: Multi-step reasoning agents with configurable execution modes
- **🧠 Enhanced Thinking Architecture**: Structured thinking with analysis, planning, and reasoning capabilities
- **🔧 Modular Tool System**: Extensible tool sets with MCP (Model Context Protocol) integration
- **📚 Context Management**: Dynamic context loading with RAG (Retrieval-Augmented Generation) support
- **🎯 Interactive Memory**: Persistent memory management with vector store integration
- **⚡ Parallel Processing**: Concurrent tool execution and task queue management
- **🌐 Multi-Interface Support**: CLI, Web UI, and programmatic APIs
- **📊 Comprehensive Logging**: Detailed logging with multiple levels and file rotation

## 🏗️ Architecture

The framework is built around several core interfaces:

### Core Interfaces

- **`IAgent`**: The main agent interface handling task processing, tool calling, and reasoning
- **`IContext`**: Modular context system with MCP server integration and RAG capabilities
- **`ITool`**: Flexible tool interface supporting async execution and type safety
- **`IPromptProcessor`**: Advanced prompt processing with thinking modes and step management
- **`IMemoryManager`**: Enhanced memory management with RAG integration
- **`IRAG`**: Vector store and retrieval system for knowledge augmentation

### Agent Capabilities

- **Multi-step reasoning** with configurable maximum steps
- **Parallel tool execution** for improved performance
- **Context-aware processing** with dynamic context loading
- **Interactive memory** with persistent storage
- **Structured thinking** with analysis, planning, and reasoning phases
- **Session management** with state persistence

## 🚀 Quick Start

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd continue-reasoning

# Install dependencies
pnpm install

# Install MCP servers (automatically runs after pnpm install)
pnpm run install-mcp
```

### Running the Agent

```bash
# Start the agent with default settings
pnpm start-agent

# Start with different log levels
pnpm start-agent:debug  # Detailed logs including prompts and debug info
pnpm start-agent:info   # Standard information logs (default)
pnpm start-agent:warn   # Only warnings and errors
pnpm start-agent:error  # Only errors

# Manual log level specification
pnpm start-agent -- --log-level debug
```

Available log levels:
- `DEBUG`: Most verbose, includes all prompt rendering and context information
- `INFO`: Standard information (default)
- `WARN`: Only warnings and errors
- `ERROR`: Only errors
- `NONE`: Disable all logging

### Web Interface

```bash
# Start the web UI
pnpm start-web-ui

# Start web UI with agent integration
pnpm start-web-ui-with-agent

# Start web UI with self-test mode
pnpm start-web-ui:self-test
```

### CLI Coding Agent

```bash
# Start the CLI coding agent
pnpm start-cli-coding-agent
```

## 🏗️ Project Structure

```
continue-reasoning/
├── packages/
│   ├── core/                    # Core agent framework
│   │   ├── interfaces/          # TypeScript interfaces and types
│   │   │   ├── agent.ts         # Agent interface and LLM integration
│   │   │   ├── context.ts       # Context management and MCP integration
│   │   │   ├── tool.ts          # Tool system and task queue
│   │   │   ├── prompt.ts        # Prompt processing and thinking modes
│   │   │   ├── memory.ts        # Memory management and RAG system
│   │   │   └── base.ts          # Base types and utilities
│   │   ├── models/              # LLM model implementations
│   │   ├── contexts/            # Built-in context implementations
│   │   ├── memory/              # Memory and RAG implementations
│   │   └── utils/               # Utilities and logging
│   ├── agents/                  # Specialized agent implementations
│   │   └── contexts/            # Agent-specific contexts
│   │       └── coding/          # Coding agent with sandbox support
│   ├── cli-client/              # CLI interface implementation
│   ├── web/                     # Web UI implementation
│   ├── ui-ink/                  # Terminal UI with Ink
│   └── ai-research/             # AI research tools and examples
├── examples/                    # Usage examples and demos
├── tests/                       # Test suites and integration tests
└── docs/                        # Documentation and guides
```

## 🔧 Core Components

### Agent System

The `IAgent` interface provides:
- **Task Processing**: Multi-step reasoning with configurable execution modes
- **Tool Management**: Dynamic tool set activation and deactivation
- **Context Integration**: Seamless context loading and management
- **Session Persistence**: State saving and restoration
- **Execution Control**: Auto, manual, and supervised modes

### Context System

The `IContext` interface enables:
- **Dynamic Data**: Zod schema-based data validation
- **MCP Integration**: Direct MCP server configuration and tool injection
- **RAG Capabilities**: Vector store integration for knowledge retrieval
- **Tool Sets**: Context-specific tool provisioning
- **Prompt Generation**: Flexible prompt rendering with structured support

### Tool System

The `ITool` interface supports:
- **Type Safety**: Zod schema validation for parameters and results
- **Async Execution**: Promise-based tool execution
- **Agent Integration**: Access to agent context during execution
- **MCP Compatibility**: Seamless integration with MCP servers
- **Task Queue**: Priority-based concurrent execution

### Memory & RAG

The memory system provides:
- **Vector Stores**: Support for multiple vector database types
- **Embedding Models**: Multiple embedding provider support
- **Document Management**: Structured document storage with metadata
- **Query Filtering**: Advanced filtering and search capabilities
- **Memory Containers**: Organized memory storage and retrieval

## 🧠 Thinking Architecture

The framework supports enhanced thinking modes:

- **Analysis**: Deep analysis of problems and situations
- **Planning**: Strategic planning and step-by-step approaches
- **Reasoning**: Logical reasoning and decision-making processes
- **Interactive Response**: User interaction and communication

## 🛠️ Development

### Running Tests

```bash
# Run all tests
pnpm test

# Run specific test suites
pnpm test:core          # Core framework tests
pnpm test:events        # Event system tests
pnpm test:rag           # RAG system tests
pnpm test:memory        # Memory management tests
pnpm test:snapshot      # Snapshot system tests
pnpm test:web-ui        # Web UI tests
```

### Building

```bash
# Build all packages
pnpm build:packages

# Build frontend
pnpm build-frontend

# Development mode for all packages
pnpm dev:packages
```

## 📚 Advanced Usage

### Custom Contexts

Create custom contexts by implementing the `IContext` interface:

```typescript
import { IContext } from '@continue-reasoning/core';
import { z } from 'zod';

const MyContextSchema = z.object({
  customData: z.string(),
  settings: z.object({
    enabled: z.boolean()
  })
});

export class MyCustomContext implements IContext<typeof MyContextSchema> {
  id = 'my-custom-context';
  description = 'Custom context for specific tasks';
  dataSchema = MyContextSchema;
  data = { customData: '', settings: { enabled: true } };

  // Implement required methods...
}
```

### Custom Tools

Implement custom tools using the `ITool` interface:

```typescript
import { ITool } from '@continue-reasoning/core';
import { z } from 'zod';

const ParamsSchema = z.object({
  input: z.string()
});

const ResultSchema = z.string();

export class MyCustomTool implements ITool<typeof ParamsSchema, typeof ResultSchema, any> {
  name = 'my-custom-tool';
  description = 'Custom tool implementation';
  params = ParamsSchema;
  async = true;

  async execute(params: z.infer<typeof ParamsSchema>) {
    // Tool implementation
    return `Processed: ${params.input}`;
  }

  // Implement other required methods...
}
```

### Memory Integration

Integrate RAG capabilities into your contexts:

```typescript
import { IRAGEnabledContext, IRAG } from '@continue-reasoning/core';

export class RAGEnabledContext implements IRAGEnabledContext<MySchema> {
  rags: Record<string, IRAG> = {};

  async loadRAGForPrompt(): Promise<string> {
    const ragResults = await this.queryContextRAG('my-rag', 'relevant query');
    return ragResults.map(r => r.content).join('\n');
  }

  // Implement other methods...
}
```

## 🤝 Contributing

We welcome contributions! Please see our contributing guidelines for more information.

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Support

For questions and support:
- Check the [documentation](./docs/)
- Review the [examples](./examples/)
- Open an issue on GitHub

---

**Continue Reasoning** - Empowering AI agents with structured thinking and reasoning capabilities.
