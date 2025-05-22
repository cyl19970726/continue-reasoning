# CodeActAgent: File System Operations Report

## 1. Introduction

This document provides a detailed summary of how the `CodeActAgent` in OpenHands performs file system operations, specifically focusing on modifying files and viewing file/directory status. The information herein is intended to assist in understanding these mechanisms for the purpose of reimplementing similar functionalities in other agent systems.

The `CodeActAgent` leverages a tool-based approach where Large Language Models (LLMs) invoke specific "tools" (functions) to interact with the file system. These calls are then translated into concrete `Action` objects, which are executed by a `Runtime` environment (like Docker or local).

## 2. Core Mechanisms

1.  **Tool Definition**: File system capabilities are exposed to the LLM as tools (e.g., `execute_bash`, `str_replace_editor`, `edit_file`). Each tool has a name, a detailed description of its purpose and usage, and a JSON schema defining its parameters. These definitions are crucial for the LLM to correctly utilize the tools.
2.  **LLM Function Calling**: The agent provides the LLM with the list of available tools. The LLM, based on the task and its understanding of the tool descriptions, decides which tool to use and with what arguments.
3.  **Action Parsing (`function_calling.py`)**: The `CodeActAgent` uses a dedicated module (`openhands/agenthub/codeact_agent/function_calling.py`) to parse the LLM's response. If the LLM requests a tool call, this module validates the arguments and converts the tool call into a specific OpenHands `Action` dataclass (e.g., `CmdRunAction`, `FileReadAction`, `FileEditAction`).
4.  **Runtime Execution**: The generated `Action` objects are then passed to the `Runtime` component, which is responsible for the actual execution of the command or file operation in a sandboxed environment.

## 3. Viewing File System Status and Content

The `CodeActAgent` primarily uses two mechanisms for viewing file system information: the general-purpose `execute_bash` tool and the `view` command of the `str_replace_editor` tool.

### 3.1. Using the Bash Tool (`execute_bash`)

The `execute_bash` tool allows the agent to run arbitrary bash commands, making it highly versatile for querying the file system.

*   **Tool Definition Snippet (`tools/bash.py`)**:
    *   **Name**: `execute_bash`
    *   **Description**: "Execute a bash command in the terminal within a persistent shell session." (Includes details on sequential commands, persistent sessions, timeouts, background processes, and output handling).
    *   **Parameters**:
        *   `command` (string, required): The bash command to execute.
        *   `is_input` (string, "true" or "false", optional): If true, the command is input to a running process.
        *   `timeout` (number, optional): Hard timeout in seconds.

*   **How it's used for viewing**:
    *   Listing directory contents: `ls -la /workspace/my_project`
    *   Displaying file content: `cat /workspace/my_project/main.py`
    *   Checking file/directory metadata: `stat /workspace/my_project/main.py`
    *   Finding files: `find /workspace -name "*.txt"`
    *   Getting current working directory: `pwd`

*   **Example LLM Tool Calls & Actions**:
    *   **LLM Call (Listing Directory)**:
        ```json
        {
          "tool_calls": [
            {
              "function": {
                "name": "execute_bash",
                "arguments": "{\"command\": \"ls -la /app\"}"
              }
            }
          ]
        }
        ```
    *   **Corresponding OpenHands Action (from `function_calling.py`)**:
        `CmdRunAction(command="ls -la /app", is_input=False)`

    *   **LLM Call (Viewing a file's content)**:
        ```json
        {
          "tool_calls": [
            {
              "function": {
                "name": "execute_bash",
                "arguments": "{\"command\": \"cat /app/config.yaml\"}"
              }
            }
          ]
        }
        ```
    *   **Corresponding OpenHands Action**:
        `CmdRunAction(command="cat /app/config.yaml", is_input=False)`

    *   **LLM Call (Checking file status/metadata)**:
        ```json
        {
          "tool_calls": [
            {
              "function": {
                "name": "execute_bash",
                "arguments": "{\"command\": \"stat /app/important_file.txt\"}"
              }
            }
          ]
        }
        ```
    *   **Corresponding OpenHands Action**:
        `CmdRunAction(command="stat /app/important_file.txt", is_input=False)`

    *   **LLM Call (Finding files)**:
        ```json
        {
          "tool_calls": [
            {
              "function": {
                "name": "execute_bash",
                "arguments": "{\"command\": \"find /app -name '*.log'\"}"
              }
            }
          ]
        }
        ```
    *   **Corresponding OpenHands Action**:
        `CmdRunAction(command="find /app -name '*.log'", is_input=False)`

### 3.2. Using the String Replace Editor (`str_replace_editor`) for Viewing

The `str_replace_editor` tool, primarily for editing, also has a `view` command to display file or directory contents.

*   **Tool Definition Snippet (`tools/str_replace_editor.py`)**:
    *   **Name**: `str_replace_editor`
    *   **Description**: "Custom editing tool for viewing, creating and editing files..."
    *   **Parameters (relevant for `view`)**:
        *   `command` (string, required): Set to `"view"`.
        *   `path` (string, required): Absolute path to the file or directory.
        *   `view_range` (array of integers, optional): For files, specifies line range (1-indexed), e.g., `[10, 20]`. `[start, -1]` means from `start` to end.

*   **How it's used for viewing**:
    *   When `path` is a file, `view` displays content with line numbers (like `cat -n`).
    *   When `path` is a directory, `view` lists non-hidden files/directories up to 2 levels deep.
    *   Allows viewing specific line ranges of a file.

*   **Example LLM Tool Calls & Actions**:
    *   **LLM Call (Viewing a specific file range)**:
        ```json
        {
          "tool_calls": [
            {
              "function": {
                "name": "str_replace_editor",
                "arguments": "{\"command\": \"view\", \"path\": \"/app/utils.py\", \"view_range\": [1, 15]}"
              }
            }
          ]
        }
        ```
    *   **Corresponding OpenHands Action (from `function_calling.py`)**:
        When `command` is `"view"`, `function_calling.py` maps this to a `FileReadAction`:
        `FileReadAction(path="/app/utils.py", impl_source=FileReadSource.OH_ACI, view_range=[1, 15])`

    *   **LLM Call (Viewing an entire file using `str_replace_editor`)**:
        ```json
        {
          "tool_calls": [
            {
              "function": {
                "name": "str_replace_editor",
                "arguments": "{\"command\": \"view\", \"path\": \"/app/main.py\"}" 
              }
            }
          ]
        }
        ```
    *   **Corresponding OpenHands Action**:
        `FileReadAction(path="/app/main.py", impl_source=FileReadSource.OH_ACI, view_range=None)`

    *   **LLM Call (Viewing a directory using `str_replace_editor`)**:
        ```json
        {
          "tool_calls": [
            {
              "function": {
                "name": "str_replace_editor",
                "arguments": "{\"command\": \"view\", \"path\": \"/app/modules\"}" 
              }
            }
          ]
        }
        ```
    *   **Corresponding OpenHands Action**:
        `FileReadAction(path="/app/modules", impl_source=FileReadSource.OH_ACI, view_range=None)` (The runtime would handle listing directory contents for this action).

## 4. Modifying Files

File modifications are handled by two primary tools: `str_replace_editor` for more structured, command-based edits, and `edit_file` for LLM-generated content replacement.

### 4.1. Using the String Replace Editor (`str_replace_editor`)

This tool provides commands for creating files, replacing strings, inserting content, and undoing edits.

*   **Tool Definition Snippet (`tools/str_replace_editor.py`)**:
    *   **Name**: `str_replace_editor`
    *   **Parameters (relevant for modification)**:
        *   `command` (string, required): `"create"`, `"str_replace"`, `"insert"`, `"undo_edit"`.
        *   `path` (string, required): Absolute path to the file.
        *   `file_text` (string, required for `create`): Content for the new file.
        *   `old_str` (string, required for `str_replace`): Exact string/lines to be replaced.
        *   `new_str` (string, required for `str_replace` and `insert`): The replacement string or content to insert.
        *   `insert_line` (integer, required for `insert`): Line number AFTER which `new_str` is inserted.
    *   **Critical Requirements**: Emphasizes exact matching for `old_str` and uniqueness to avoid ambiguous edits.

*   **How it's used for modifying**:
    *   **Creating a new file**: `command="create"`, `path="/app/new_module.py"`, `file_text="import os\n\ndef run():\n  pass"`
    *   **Replacing content**: `command="str_replace"`, `path="/app/config.py"`, `old_str="DEBUG = True"`, `new_str="DEBUG = False"`
    *   **Inserting content**: `command="insert"`, `path="/app/main.py"`, `insert_line=5`, `new_str="import new_dependency"`
    *   **Undoing an edit**: `command="undo_edit"`, `path="/app/config.py"` (reverts the last edit on this file by this tool instance/session, if supported by runtime).

*   **Example LLM Tool Calls & Actions**:
    *   **LLM Call (Create File)**:
        ```json
        {
          "tool_calls": [
            {
              "function": {
                "name": "str_replace_editor",
                "arguments": "{\"command\": \"create\", \"path\": \"/app/data.json\", \"file_text\": \"{\\\"key\\\": \\\"value\\\"}\"}"
              }
            }
          ]
        }
        ```
    *   **Corresponding OpenHands Action**:
        `FileEditAction(path="/app/data.json", command="create", file_text="{\"key\": \"value\"}", impl_source=FileEditSource.OH_ACI)`

    *   **LLM Call (Replace String)**:
        ```json
        {
          "tool_calls": [
            {
              "function": {
                "name": "str_replace_editor",
                "arguments": "{\"command\": \"str_replace\", \"path\": \"/app/settings.py\", \"old_str\": \"VERSION = '1.0'\", \"new_str\": \"VERSION = '1.1'\"}"
              }
            }
          ]
        }
        ```
    *   **Corresponding OpenHands Action**:
        `FileEditAction(path="/app/settings.py", command="str_replace", old_str="VERSION = '1.0'", new_str="VERSION = '1.1'", impl_source=FileEditSource.OH_ACI)`

    *   **LLM Call (Insert String at Line)**:
        ```json
        {
          "tool_calls": [
            {
              "function": {
                "name": "str_replace_editor",
                "arguments": "{\"command\": \"insert\", \"path\": \"/app/script.sh\", \"insert_line\": 3, \"new_str\": \"echo 'New line inserted'\"}"
              }
            }
          ]
        }
        ```
    *   **Corresponding OpenHands Action**:
        `FileEditAction(path="/app/script.sh", command="insert", insert_line=3, new_str="echo 'New line inserted'", impl_source=FileEditSource.OH_ACI)`

### 4.2. Using the LLM-Based File Edit Tool (`edit_file`)

This tool is designed for situations where the LLM directly generates the new file content or a significant portion of it, potentially using diff-like syntax or comments to indicate unchanged parts.

*   **Tool Definition Snippet (`tools/llm_based_edit.py`)**:
    *   **Name**: `edit_file`
    *   **Description**: "Edit a file in plain-text format. ... The assistant may skip unchanged lines using comments like `# unchanged`..." (Includes detailed examples for short files, appending, and long files with `start`/`end` ranges).
    *   **Parameters**:
        *   `path` (string, required): Absolute path to the file.
        *   `content` (string, required): A draft of the new content.
        *   `start` (integer, optional, default: 1): Starting line number for edit (1-indexed).
        *   `end` (integer, optional, default: -1 for end-of-file): Ending line number for edit (1-indexed).

*   **How it's used for modifying**:
    *   The LLM provides the `content` argument, which represents the desired state of the file (or a section of it).
    *   For large files, `start` and `end` parameters are crucial to specify the editing window (max ~300 lines).
    *   To append, `start` and `end` are set to `-1`.
    *   If the file doesn't exist, it will be created.

*   **Example LLM Tool Calls & Actions**:
    *   **LLM Call (Full file content generation/replacement for a new or short file)**:
        ```json
        {
          "tool_calls": [
            {
              "function": {
                "name": "edit_file",
                "arguments": "{\"path\": \"/app/README.md\", \"content\": \"# New Project Title\nThis is the updated README content.\"}"
              }
            }
          ]
        }
        ```
    *   **Corresponding OpenHands Action (from `function_calling.py`)**:
        `FileEditAction(path="/app/README.md", content="# New Project Title\nThis is the updated README content.", start=1, end=-1)` (Defaults for start/end if not provided by LLM and parsed as such).

    *   **LLM Call (Partial Edit of a long file using start/end)**:
        ```json
        {
          "tool_calls": [
            {
              "function": {
                "name": "edit_file",
                "arguments": "{\"path\": \"/app/large_file.log\", \"content\": \"Line 105 new content\n# unchanged\nLine 107 new content\", \"start\": 105, \"end\": 108}"
              }
            }
          ]
        }
        ```
    *   **Corresponding OpenHands Action**:
        `FileEditAction(path="/app/large_file.log", content="Line 105 new content\n# unchanged\nLine 107 new content", start=105, end=108)`

    *   **LLM Call (Appending to a file)**:
        ```json
        {
          "tool_calls": [
            {
              "function": {
                "name": "edit_file",
                "arguments": "{\"path\": \"/app/output.log\", \"content\": \"New log entry: Process completed.\", \"start\": -1, \"end\": -1}"
              }
            }
          ]
        }
        ```
    *   **Corresponding OpenHands Action**:
        `FileEditAction(path="/app/output.log", content="New log entry: Process completed.", start=-1, end=-1)`

## 5. Key Considerations for Re-implementation

When reimplementing these file system operations in a new agent, consider the following:

1.  **Clear Tool Definitions for LLM**: The success heavily relies on the LLM's ability to understand when and how to use each tool. Descriptions must be precise, cover edge cases, and provide good examples.
2.  **Robust Argument Parsing**: The logic that translates LLM-generated arguments (which are often strings of JSON) into structured `Action` parameters must be robust and handle potential malformations or missing arguments gracefully. This is what `function_calling.py` does.
3.  **Stateful vs. Stateless Tools**:
    *   `execute_bash` operates in a persistent shell session within a given `Runtime` instance.
    *   `str_replace_editor`'s `undo_edit` command implies statefulness. The core replacement and insert operations are generally stateless per call, relying on the `Runtime` to apply changes to the current file state.
    *   The `edit_file` tool is generally stateless per call.
4.  **Action Granularity**:
    *   `execute_bash` is very general.
    *   `str_replace_editor` offers more structured file operations (view, create, replace, insert, undo).
    *   `edit_file` is for LLM-driven content generation/replacement.
    Consider if this level of granularity is needed or if a more unified/simplified file operation tool would suffice for your agent's needs.
5.  **File Path Management**: Consistently use and expect absolute paths within the sandboxed environment to avoid ambiguity.
6.  **Runtime Capabilities**: The underlying `Runtime` (local, Docker, etc.) must be able to:
    *   Execute arbitrary shell commands (`CmdRunAction`).
    *   Read file contents, potentially specific line ranges, and list directory contents (`FileReadAction`).
    *   Write/overwrite file contents, create files, insert content at specific lines, and potentially apply diffs or partial updates (`FileEditAction`). The `Runtime` would need to implement the logic for commands like `create`, `str_replace`, `insert` based on the `FileEditAction` parameters.
7.  **Error Handling**:
    *   The agent needs to understand observations from the `Runtime` indicating errors (e.g., file not found, permission denied, command failed, edit conflict, `old_str` not found or not unique).
    *   The LLM should be prompted to handle these errors, perhaps by trying an alternative approach, re-viewing the file for accurate `old_str`, or asking the user for clarification.
8.  **Security**: All file operations, especially those involving command execution or writing LLM-generated content, must occur within a properly sandboxed environment to protect the host system.
9.  **Idempotency and Uniqueness for `str_replace`**: For tools like `str_replace_editor`'s `str_replace` command, ensuring the `old_str` is unique and an exact match is critical. The tool descriptions emphasize this to the LLM. Your runtime implementation for this action needs to enforce this or return an appropriate error.
10. **Large File Handling with `edit_file`**: The `edit_file` tool's `start` and `end` parameters are essential for working with large files by breaking down edits into manageable chunks. Ensure the LLM is guided to use this, and your runtime correctly applies these ranged edits.
11. **`undo_edit` Implementation**: A true `undo_edit` for `str_replace_editor` is complex. It would require the `Runtime` to store previous file versions or diffs for each file modified by this tool within a session. A simpler approach might be to only allow undoing the very last specific `FileEditAction` if its inverse is clearly defined and feasible.

By carefully designing the tool interfaces, the LLM prompting strategy, the action parsing logic, and the runtime execution capabilities, a new agent can effectively replicate and potentially improve upon the file system interaction patterns demonstrated by the `CodeActAgent`.

## 6. End-to-End Example: Creating a Simple Python Greeter Script

Let's illustrate how these components work together with a practical example. 
**User Task**: "Create a Python script named `greeter.py` in the `/workspace` directory. This script should ask the user for their name and then print a personalized greeting, for example, 'Hello, [name]!"."

Here's a hypothetical step-by-step execution flow:

**Initial State**: Empty `/workspace` directory (or agent is aware of its contents).

**Step 1: Agent decides to create the `greeter.py` file.**

*   **LLM Thought Process (Conceptual)**: "The user wants a new Python script. I should first create an empty file named `greeter.py` in `/workspace`."
*   **LLM Tool Call (Conceptual JSON)**:
    ```json
    {
      "tool_calls": [
        {
          "function": {
            "name": "str_replace_editor",
            "arguments": "{\"command\": \"create\", \"path\": \"/workspace/greeter.py\", \"file_text\": \"\"}" 
          }
        }
      ]
    }
    ```
*   **Generated OpenHands Action** (by `function_calling.py`):
    `FileEditAction(path="/workspace/greeter.py", command="create", file_text="", impl_source=FileEditSource.OH_ACI)`
*   **Runtime Execution**: The `Runtime` receives this `FileEditAction`. It creates an empty file named `greeter.py` at `/workspace/greeter.py` within its sandboxed environment.
*   **Returned Observation** (simplified):
    `FileEditObservation(status="success", message="File /workspace/greeter.py created successfully.", path="/workspace/greeter.py")`

**Step 2: Agent decides to write the Python code into `greeter.py`.**

*   **LLM Thought Process (Conceptual)**: "The file is created. Now I need to write the Python code that prompts for a name and prints a greeting."
*   **LLM Tool Call (Conceptual JSON) using `edit_file`**:
    ```json
    {
      "tool_calls": [
        {
          "function": {
            "name": "edit_file",
            "arguments": "{\"path\": \"/workspace/greeter.py\", \"content\": \"name = input(\\\"Enter your name: \\\")\nprint(f\\\"Hello, {name}!\\\")\"}"
          }
        }
      ]
    }
    ```
*   **Generated OpenHands Action**:
    `FileEditAction(path="/workspace/greeter.py", content="name = input(\"Enter your name: \")\nprint(f\"Hello, {name}!\")", start=1, end=-1)`
*   **Runtime Execution**: The `Runtime` receives this `FileEditAction`. It opens `/workspace/greeter.py` and writes the provided Python code into it.
*   **Returned Observation** (simplified):
    `FileEditObservation(status="success", message="File /workspace/greeter.py updated successfully.", path="/workspace/greeter.py")`

**Step 3: Agent decides to make the script executable (optional but good practice).**

*   **LLM Thought Process (Conceptual)**: "The script is written. It would be good to make it executable so it can be run directly."
*   **LLM Tool Call (Conceptual JSON)**:
    ```json
    {
      "tool_calls": [
        {
          "function": {
            "name": "execute_bash",
            "arguments": "{\"command\": \"chmod +x /workspace/greeter.py\"}"
          }
        }
      ]
    }
    ```
*   **Generated OpenHands Action**:
    `CmdRunAction(command="chmod +x /workspace/greeter.py")`
*   **Runtime Execution**: The `Runtime` executes the `chmod +x` command in its shell.
*   **Returned Observation** (simplified, assuming success):
    `CmdOutputObservation(command_id=..., command="chmod +x /workspace/greeter.py", exit_code=0, content="")`

**Step 4: Agent decides to test the script (optional).**

*   **LLM Thought Process (Conceptual)**: "Let's run the script to make sure it works as expected. I'll need to provide some input when prompted."
    *(Note: Testing interactive scripts like this directly can be complex for an automated agent. It might first try running it and see if it prompts, or it might inform the user how to run it. For this example, let's assume it tries a simple execution.)*
*   **LLM Tool Call (Conceptual JSON)**:
    ```json
    {
      "tool_calls": [
        {
          "function": {
            "name": "execute_bash",
            "arguments": "{\"command\": \"echo 'TestUser' | python /workspace/greeter.py\"}" 
          }
        }
      ]
    }
    ```
*   **Generated OpenHands Action**:
    `CmdRunAction(command="echo 'TestUser' | python /workspace/greeter.py")`
*   **Runtime Execution**: The `Runtime` executes the command. The `echo 'TestUser'` provides input to the script's `input()` prompt.
*   **Returned Observation** (simplified, assuming success):
    `CmdOutputObservation(command_id=..., command="echo 'TestUser' | python /workspace/greeter.py", exit_code=0, content="Enter your name: Hello, TestUser!")`

**Step 5: Agent confirms task completion.**

*   **LLM Thought Process (Conceptual)**: "The script was created, made executable, and a simple test run showed it prints the greeting. The task is complete."
*   **LLM Tool Call (Conceptual JSON)**:
    ```json
    {
      "tool_calls": [
        {
          "function": {
            "name": "finish",
            "arguments": "{\"message\": \"Successfully created and tested greeter.py. You can run it using \\`python /workspace/greeter.py\\` and it will ask for your name.\"}"
          }
        }
      ]
    }
    ```
*   **Generated OpenHands Action**:
    `AgentFinishAction(message="Successfully created and tested greeter.py. You can run it using `python /workspace/greeter.py` and it will ask for your name.")`
*   **Controller/System Action**: The `Controller` receives `AgentFinishAction`, marking the end of the current task execution by the agent.

This example illustrates the iterative nature of the agent: making a decision (thought process), choosing a tool, forming an action, receiving an observation, and then using that observation to inform the next step, all orchestrated by the LLM's reasoning capabilities and the defined toolset. The actual interactions would involve more detailed prompts and potentially more back-and-forth if errors occur or clarifications are needed. 