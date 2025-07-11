# Gemini Coding Agent Sandbox

This directory contains the sandbox implementations for security isolation in the Gemini Coding Agent.

## Directory Structure

- `index.ts` - Main entry point and exports
- `no-sandbox.ts` - Basic implementation with no additional security (for trusted environments)
- `seatbelt-sandbox.ts` - macOS Seatbelt implementation for process isolation

## Runtime vs Sandbox

- **Sandbox**: Security isolation boundary for runtime (None, macOS Seatbelt, Linux Landlock)
- **Runtime**: Environment in which commands are executed (Node.js, Docker container)

The runtime implementations are located in the sibling `/runtime` directory.

## Available Sandboxes

### NoSandbox

A pass-through implementation with no additional security isolation. Suitable for trusted environments or when another isolation mechanism (like Docker) is already in use.

### SeatbeltSandbox

Uses macOS built-in Seatbelt sandboxing mechanism to apply security policies to executed commands. This provides OS-level isolation for processes. 