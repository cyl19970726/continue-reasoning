# CR (Continue Reasoning) - Quick Start Guide

## What is CR?

`cr` is a command-line coding assistant that helps you with various programming tasks directly from your terminal.

## Quick Start

### 1. Install Dependencies
```bash
pnpm install
```

### 2. Build Packages (First Time Setup)
```bash
pnpm run build:packages
```

### 3. Make CR Executable
```bash
chmod +x ./cr
```

### 4. Run CR
```bash
./cr
```

## Usage Examples

```bash
# Start the coding assistant in current directory
./cr

# Show help
./cr --help

# Show version
./cr --version
```

## Features

- 💻 Interactive coding assistance
- 📁 Works with your current directory as workspace
- 🛠️ Can write, edit, and analyze code
- 🚀 Runs commands and manages files
- 📝 Creates tests and documentation
- 🔍 Helps debug and fix issues

## Tips

- Use ``` to enter multiline mode for longer inputs
- Type `exit` or press `Ctrl+C` to quit
- Your command history is saved in `.cr_history`

## Troubleshooting

If `cr` doesn't work, try:
```bash
# Run directly with tsx
npx tsx packages/agents/start.ts
```

For detailed documentation, see [packages/agents/README.md](packages/agents/README.md)