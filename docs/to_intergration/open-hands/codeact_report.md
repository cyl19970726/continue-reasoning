# OpenHands CodeActAgent: Design Document

## 1. Introduction

The `CodeActAgent` is the primary reasoning and execution agent within the OpenHands framework. It is engineered to understand user requests, break them down into actionable steps, and interact with various tools (including code execution, file manipulation, and web browsing) to achieve complex goals. This document outlines the core design principles, architecture, and workflow of the `CodeActAgent`.

The design is heavily influenced by the [CodeAct paper](https://arxiv.org/abs/2402.01030), which advocates for consolidating Large Language Model (LLM) agent actions into a unified code-centric action space for simplicity and improved performance.

## 2. Core Responsibilities and Goals

The `CodeActAgent` is designed to:

*   **Understand and Interpret User Intent**: Process natural language instructions from the user.
*   **Plan and Decompose Tasks**: Break down complex tasks into a sequence of smaller, manageable steps.
*   **Select and Utilize Tools**: Intelligently choose appropriate tools (actions) from a predefined set to execute these steps.
*   **Execute Code**: Run Bash commands and Python code (via IPython) in a sandboxed environment.
*   **Interact with File Systems**: Read, write, and modify files.
*   **Browse the Web**: Fetch information from web pages and interact with web elements.
*   **Maintain Context and State**: Keep track of the conversation history, previous actions, and observations.
*   **Communicate with the User**: Ask for clarifications, provide updates, and present final results or a summary of actions taken.
*   **Conclude Tasks**: Determine when a task is completed or if it cannot be completed, and finish gracefully.

## 3. Architectural Components

The `CodeActAgent`'s functionality is distributed across several key components within the `openhands/agenthub/codeact_agent/` directory:

### 3.1. `codeact_agent.py`: The Core Agent Logic

This file contains the `CodeActAgent` class, which inherits from the base `Agent` class in OpenHands.

*   **Initialization (`__init__`)**:
    *   Sets up the LLM instance.
    *   Loads agent configuration (`AgentConfig`).
    *   Initializes a `PromptManager` to load and manage prompt templates from the `prompts/` directory.
    *   Defines and loads the available tools (see `_get_tools` method).
    *   Initializes `ConversationMemory` for managing the history of interactions.
    *   Initializes a `Condenser` for summarizing long conversation histories.
*   **Tool Management (`_get_tools`)**:
    *   Dynamically assembles a list of available tools based on the agent's configuration (e.g., `enable_cmd`, `enable_browsing`, `enable_jupyter`).
    *   Tools include: `bash`, `ipython`, `think`, `finish`, `web_read`, `browser`, `llm_based_edit`, `str_replace_editor`.
    *   It can opt for shorter tool descriptions for certain LLM models to manage token limits.
*   **Main Execution Loop (`step`)**:
    *   This is the heart of the agent, called iteratively by the `Controller`.
    *   Checks for pending actions.
    *   Condenses the conversation history using the `Condenser`.
    *   Formats the condensed history and current state into a prompt for the LLM.
    *   Invokes the LLM with the current messages and available tools (function calling).
    *   Processes the LLM's response, converting tool calls into concrete `Action` objects.
*   **Message and History Management (`_get_messages`, `_get_initial_user_message`)**:
    *   Prepares the list of messages to be sent to the LLM, incorporating system prompts, historical interactions, and the latest user query.
*   **Response Handling (`response_to_actions`)**:
    *   Delegates to `function_calling.py` to parse the LLM's response (which may include text and tool calls) into a list of `Action` objects.
*   **State**: Manages internal state, including a queue for `pending_actions`.

### 3.2. `tools/` Directory: Defining Agent Capabilities

This directory contains Python files, each defining one or more tools (Actions) that the `CodeActAgent` can use.

*   **Structure**: Each tool is typically defined using `litellm.ChatCompletionToolParam`, which specifies:
    *   `type`: Usually `'function'`.
    *   `function`:
        *   `name`: The name the LLM will use to call the tool (e.g., `execute_bash`, `execute_ipython_cell`).
        *   `description`: A natural language description of what the tool does, its parameters, and best practices for its use. This is crucial for the LLM to understand when and how to use the tool.
        *   `parameters`: A JSON schema defining the arguments the tool expects.
*   **Examples of Tools**:
    *   `bash.py`: `create_cmd_run_tool` for executing shell commands.
    *   `ipython.py`: `IPythonTool` for executing Python code cells.
    *   `llm_based_edit.py`: `LLMBasedFileEditTool` for complex file edits.
    *   `str_replace_editor.py`: `create_str_replace_editor_tool` for simpler, pattern-based file edits and viewing.
    *   `browser.py` & `web_read.py`: For web browsing and content extraction.
    *   `finish.py`: `FinishTool` to signal task completion.
    *   `think.py`: `ThinkTool` to allow the agent to output its thought process before acting.
*   **Tool Import**: These tools are imported into `codeact_agent.py` and `function_calling.py`.

### 3.3. `prompts/` Directory: Guiding the LLM

This directory holds Jinja2 template files (`.j2`) used for constructing the prompts sent to the LLM.

*   **`system_prompt.j2`**: Defines the overall role, capabilities, constraints, and high-level instructions for the agent. It sets the persona and tells the LLM how to behave, what tools it has, and how to format its responses (especially regarding tool usage).
*   **`in_context_learning_example.j2` / `in_context_learning_example_suffix.j2`**: Likely used to provide few-shot examples to the LLM, demonstrating desired interaction patterns or tool usage sequences.
*   **`additional_info.j2`**: May contain dynamically inserted information into the prompt, like current date/time, OS information, or specific task context.
*   **`microagent_info.j2`**: Provides information about available micro-agents.
*   **Usage**: The `PromptManager` in `codeact_agent.py` is responsible for loading and rendering these templates with appropriate context.

### 3.4. `function_calling.py`: Bridging LLM and Actions

This crucial file handles the translation between the LLM's "tool call" requests and the OpenHands `Action` objects.

*   **`response_to_actions(response: ModelResponse)` function**:
    *   Takes the raw response from the LLM.
    *   If the response contains `tool_calls` (as per OpenAI's function calling or equivalent):
        *   Parses the `function_name` and `arguments` for each tool call.
        *   Validates the arguments against the tool's schema.
        *   Constructs the corresponding OpenHands `Action` object (e.g., `CmdRunAction`, `IPythonRunCellAction`, `FileEditAction`).
        *   Handles potential thought content from the LLM alongside tool calls.
    *   If the response is a plain text message, it's typically wrapped in a `MessageAction`.
*   **Tool-Specific Logic**: Contains `if/elif` blocks to map specific `tool_call.function.name` strings to the instantiation of the correct `Action` dataclass with the parsed arguments.
*   **Error Handling**: Includes checks for missing arguments or malformed JSON in arguments, raising specific `FunctionCallValidationError` or `FunctionCallNotExistsError`.

## 4. Operational Workflow

The `CodeActAgent` operates in a loop, driven by the `Controller`:

1.  **State Update**: The `Controller` provides the current `State` to the `agent.step()` method. This state includes the history of user messages, agent actions, and system observations.
2.  **History Condensation**: The agent's `Condenser` processes the history from the `State` to create a summarized or filtered view. This is important for managing context length for the LLM.
3.  **Prompt Assembly**:
    *   The `CodeActAgent` uses its `PromptManager` to render the system prompt.
    *   It formats the condensed history of (Action, Observation) pairs and user messages.
    *   The current user task/query is appended.
4.  **LLM Invocation**:
    *   The assembled messages are sent to the configured LLM.
    *   The list of available tools (from `_get_tools()`) is also provided to the LLM, enabling function calling.
5.  **LLM Response Processing**:
    *   The LLM's response is received. This can be:
        *   A natural language message (to converse with the user).
        *   A request to call one or more tools (functions) with specific arguments.
        *   A combination of both.
6.  **Action Generation**:
    *   The `function_calling.response_to_actions` method parses the LLM's response.
    *   If tool calls are present, they are converted into concrete `Action` objects (e.g., `CmdRunAction(command="ls -l")`, `FileEditAction(...)`).
    *   If it's a text response, a `MessageAction` is typically generated.
    *   The `ThinkTool` can result in an `AgentThinkAction` followed by another action.
    *   The `FinishTool` results in an `AgentFinishAction`.
7.  **Action Return**: The generated `Action` (or list of actions, handled via `pending_actions` queue) is returned to the `Controller`.
8.  **Execution by Runtime**: The `Controller` dispatches the `Action` to the appropriate `Runtime` (e.g., DockerRuntime, LocalRuntime) for execution.
9.  **Observation Generation**: The `Runtime` executes the `Action` and produces an `Observation` (e.g., command output, file content, error message).
10. **Loop**: The `Observation` is added to the `State`, and the `Controller` calls `agent.step()` again, continuing the cycle until the task is finished (`AgentFinishAction`) or an unrecoverable error occurs.

## 5. Interaction with OpenHands Core Components

*   **`Controller`**: Orchestrates the overall workflow, repeatedly calling the agent's `step` method and dispatching actions.
*   **`State`**: Provides the agent with the current context, including history, user inputs, and observations.
*   **`EventStream`**: Actions and Observations are typically passed via an `EventStream`, though the agent primarily interacts with a `State` object which encapsulates this.
*   **`Runtime`**: The `CodeActAgent` itself does not directly execute commands or file operations. It generates `Action` objects which are then passed to a `Runtime` instance (e.g., `DockerRuntime`, `LocalRuntime`) for actual execution in a sandboxed environment. This decouples the agent's logic from the execution environment.
*   **`LLM`**: The agent relies on an `LLM` instance for its core intelligence: understanding prompts, making decisions, and generating tool calls.
*   **`Action` / `Observation`**: These are dataclasses from `openhands.events.action` and `openhands.events.observation` that represent the agent's decisions and the results of those decisions, respectively.

## 6. Key Design Principles

*   **LLM-Driven Decision Making**: The core logic of choosing what to do next (which tool to use, with what arguments, or whether to respond in natural language) is delegated to the LLM.
*   **Tool-Based Action Space**: The agent's capabilities are defined by a discrete set of tools. This makes the action space understandable and manageable for the LLM.
*   **Function Calling**: Leverages the function calling capabilities of modern LLMs to structure the interaction between the LLM and the available tools.
*   **Prompt Engineering**: Significant emphasis is placed on crafting effective system prompts and tool descriptions to guide the LLM's behavior.
*   **Modularity**:
    *   Agent logic (`codeact_agent.py`) is separate from tool definitions (`tools/`).
    *   Tool definitions are separate from LLM interaction for tool calls (`function_calling.py`).
    *   Prompts are externalized in template files (`prompts/`).
*   **Extensibility**: New tools can be added by:
    1.  Defining the tool's `ChatCompletionToolParam` structure.
    2.  Implementing the logic in `function_calling.py` to map the LLM tool call to an OpenHands `Action`.
    3.  Ensuring the `Runtime` can handle the new `Action` (if it requires new `Runtime` capabilities).
    4.  Adding the tool to the `_get_tools` method in `codeact_agent.py`.
*   **Context Management**: Utilizes conversation memory and condensation techniques to handle potentially long interaction histories within LLM context limits.
*   **Configuration-Driven Behavior**: Tool availability and certain agent behaviors can be controlled via the `AgentConfig`.

## 7. Considerations for Re-implementing a Similar Agent

If you aim to implement an agent with a similar design:

1.  **Define a Clear Action Space**: Identify the core capabilities your agent needs. Represent these as "tools" or "functions."
2.  **Standardize Tool Definition**: Create a consistent way to define each tool, including its name, a detailed description for the LLM, and a schema for its parameters (JSON schema is a good choice).
3.  **Master Prompt Engineering**:
    *   Develop a comprehensive system prompt that clearly outlines the agent's role, its tools, how to use them, constraints, and desired output format.
    *   Use few-shot examples if necessary to guide the LLM.
4.  **Implement a Robust Function Calling Parser**: Write code to reliably parse the LLM's tool call requests, validate arguments, and map them to your internal action representations.
5.  **Separate Agent Logic from Execution**:
    *   The agent's role should be to decide *what* to do.
    *   A separate "runtime" or "executor" component should be responsible for *how* to do it (e.g., actually running a shell command).
6.  **Manage State and History**: Implement a mechanism to track conversation history, actions, and observations. Consider context window limitations of your chosen LLM and implement summarization or condensation if needed.
7.  **Iterative Development**: Start with a few core tools and a simple workflow. Gradually add more tools and refine the prompts based on observed behavior and failures.
8.  **Error Handling**: Anticipate and handle potential errors, such as malformed LLM responses, invalid tool arguments, or failures during action execution.
9.  **Logging and Debugging**: Implement thorough logging to understand the agent's decision-making process and to debug issues.

By following these principles, you can build a powerful and flexible LLM-based agent capable of performing complex tasks through tool interactions, much like the `CodeActAgent`. 