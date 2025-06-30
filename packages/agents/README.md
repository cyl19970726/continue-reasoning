# Continue Reasoning - Coding Agent (cr-coding)

An interactive CLI coding assistant powered by Continue Reasoning framework.

## Overview

The `cr` command provides an interactive coding assistant that can help you with various programming tasks including:

- Writing and editing code
- Running commands
- Analyzing and understanding codebases
- Creating tests and documentation
- Debugging and fixing issues

## Installation & Setup

### Prerequisites

- Node.js (v18 or higher)
- pnpm (for workspace management)

### Building from Source

1. Clone the repository and navigate to the project root:
```bash
git clone <repository-url>
cd continue-reasoning
```

2. Install dependencies using pnpm:
```bash
pnpm install
```

3. Build all workspace packages:
```bash
# Build core package first
cd packages/core
pnpm run build
cd ../..

# Build cli-client package
cd packages/cli-client  
pnpm run build
cd ../..

# Build cr-coding package
cd packages/agents
pnpm run build
cd ../..
```

Or build all packages at once from the root:
```bash
pnpm run build:packages
```

4. Make the cr script executable:
```bash
chmod +x ./cr
```

## Usage

### Running the Coding Agent

From the project root directory, run:

```bash
./cr
```

This will start the interactive coding assistant using your current directory as the workspace.

### Command Line Options

- `./cr --help` - Display help information
- `./cr --version` - Display version information

### How it Works

The `cr` script uses `tsx` (TypeScript execute) to run the TypeScript source directly without requiring a separate compilation step for development. The script:

1. Locates the `start.ts` file in `packages/agents/`
2. Executes it using `npx tsx`
3. Passes through any command line arguments

### Interactive Mode

Once started, the coding agent provides an interactive CLI where you can:

- Type questions or coding tasks
- Use `\`\`\`` to enter multiline mode
- Type `exit` or press `Ctrl+C` to quit
- Command history is saved in `.cr_history` in your workspace

### Development

For development, you can run the TypeScript files directly without building:

```bash
# From project root
npx tsx packages/agents/start.ts
```

Or use the provided cr script which does the same thing:

```bash
./cr
```

### Building for Distribution

To create a distributable version:

1. Build all packages as described above
2. The compiled JavaScript files will be in the `dist` directories of each package
3. The `bin` field in `package.json` points to `dist/start.js` for npm installation

### Package Structure

```
packages/agents/
├── coding-agent.ts      # Main agent implementation
├── start.ts            # CLI entry point
├── contexts/           # Context implementations
├── dist/              # Compiled JavaScript (after build)
├── package.json       # Package configuration
└── tsconfig.json      # TypeScript configuration
```

## Configuration

The coding agent uses the following default configuration:

- Model: OpenAI O3
- Temperature: 0.1
- Max steps: 500 for interactive sessions
- Parallel tool calls: Enabled
- Enhanced prompt processing: Enabled

## Troubleshooting

### Module Not Found Errors

If you encounter "Cannot find module" errors when running the compiled version:

1. Ensure all packages are built in the correct order (core, cli-client, then agents)
2. Check that `pnpm install` completed successfully
3. Use the `cr` script which handles module resolution automatically

### Permission Denied

If you get a permission error when running `./cr`:

```bash
chmod +x ./cr
```

### TypeScript Errors

If you encounter TypeScript compilation errors:

1. Check that all dependencies are installed: `pnpm install`
2. Ensure TypeScript version compatibility across packages
3. Try cleaning and rebuilding: `rm -rf packages/*/dist && pnpm run build:packages`

## License

See the main project LICENSE file.