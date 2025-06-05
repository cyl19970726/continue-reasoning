import { ThinkingEngine, LLMResponse } from './thinking-engine';
import { ExecutionTracker, ExecutionHistoryRenderOptions } from './execution-tracker';
import { ParsedThinking } from './thinking-extractor';
import { ParsedResponse, ConversationMessage } from './response-extractor';
import { ILLM, ToolCallDefinition, IContextManager, PromptAssemblyStrategy, ToolCallParams } from '../interfaces';

export interface ProcessResult {
  thinking: ParsedThinking | null; 
  response: ParsedResponse | null;
  toolCalls: ToolCallParams[];
  stepNumber: number;
  sessionId: string;
  rawText: string;
}

export interface ThinkingOrchestratorOptions {
  // 主要 ContextManager 实例（必需）
  contextManager: IContextManager;
  // Prompt 拼接策略
  promptAssemblyStrategy?: PromptAssemblyStrategy;
  // 对话历史设置
  maxConversationHistory?: number;
  // 执行历史设置
  maxExecutionHistory?: number;
  // 执行历史渲染选项
  executionHistoryRenderOptions?: ExecutionHistoryRenderOptions;
}

export class ThinkingOrchestrator {
  private executionTracker: ExecutionTracker;
  private thinkingEngine: ThinkingEngine;
  private contextManager: IContextManager;
  private conversationHistory: ConversationMessage[] = [];
  private options: Required<Omit<ThinkingOrchestratorOptions, 'promptAssemblyStrategy' | 'executionHistoryRenderOptions'>> & {
    promptAssemblyStrategy: PromptAssemblyStrategy;
    executionHistoryRenderOptions: ExecutionHistoryRenderOptions;
  };

  constructor(llm: ILLM, options: ThinkingOrchestratorOptions) {
    // 默认的执行历史渲染选项：不包含 response（因为已在 conversationHistory 中）
    const defaultExecutionRenderOptions: ExecutionHistoryRenderOptions = {
      includeThinking: true,
      includeResponse: false, // 重要：避免与 conversationHistory 重复
      includeToolCalls: true,
      includeToolResults: true,
      maxSteps: 5
    };

    this.options = {
      contextManager: options.contextManager,
      promptAssemblyStrategy: options.promptAssemblyStrategy || 'grouped',
      maxConversationHistory: options.maxConversationHistory || 10,
      maxExecutionHistory: options.maxExecutionHistory || 5,
      executionHistoryRenderOptions: {
        ...defaultExecutionRenderOptions,
        ...options.executionHistoryRenderOptions
      }
    };

    this.executionTracker = new ExecutionTracker(this.options.executionHistoryRenderOptions);
    this.thinkingEngine = new ThinkingEngine(llm);
    this.contextManager = this.options.contextManager;
    
    // 设置拼接策略
    if (this.contextManager.setPromptAssemblyStrategy) {
      this.contextManager.setPromptAssemblyStrategy(this.options.promptAssemblyStrategy);
    }
  }

  /**
   * 构建完整的 prompt
   * 
   * 完整的 Prompt 格式说明：
   * ================================
   * 
   * 0. SYSTEM PROMPT (系统级指导)
   *    设定 AI Agent 的角色、工作模式和核心原则
   * 
   * 1. CONTEXT SECTION (使用拼接策略)
   *    使用 ContextManager 的 renderStructuredPrompt() 方法
   *    根据策略生成不同的格式：
   *    
   *    grouped 策略：
   *    ```
   *    # 🔄 WORKFLOWS
   *    ## coding-context
   *    工作流程内容...
   *    ## plan-context  
   *    工作流程内容...
   *    
   *    # 📊 STATUS
   *    ## coding-context
   *    状态信息...
   *    ## plan-context
   *    状态信息...
   *    
   *    # 📋 GUIDELINES
   *    ## coding-context
   *    指导原则...
   *    ## plan-context
   *    指导原则...
   *    
   *    # 💡 EXAMPLES
   *    ## coding-context
   *    使用示例...
   *    ## plan-context
   *    使用示例...
   *    ```
   * 
   * 2. CONVERSATION HISTORY (如果有对话历史)
   *    ```
   *    ## Conversation History
   *    **user**: Previous user message
   *    **assistant**: Previous assistant response
   *    ...
   *    ```
   * 
   * 3. EXECUTION HISTORY (如果有执行历史) - 可配置渲染组件
   *    ```
   *    ## Recent Execution History
   *    ### Step 1
   *    **Thinking Summary**: Analysis + Plan + Reasoning + Next Action (if includeThinking)
   *    **Response**: User message (if includeResponse - 默认为false避免重复)
   *    **Tools**: Tool calls and results (if includeToolCalls/includeToolResults)
   *    ### Step 2
   *    ...
   *    ```
   * 
   * 4. THINKING PROTOCOL (思考协议模板)
   *    ```
   *    ## THINKING PROTOCOL
   *    You must engage in structured thinking...
   *    <thinking>
   *    <analysis>...</analysis>
   *    <plan>...</plan>
   *    <reasoning>...</reasoning>
   *    <next_action>...</next_action>
   *    </thinking>
   *    <response>
   *    <message>...</message>
   *    </response>
   *    ```
   * 
   * 5. CURRENT STEP INPUT (当前步骤输入)
   *    ```
   *    ## Current Step Input
   *    [当前步骤的输入内容：可能是用户输入、继续推理指令等]
   *    ```
   * 
   * 总体结构：SystemPrompt → Context → History → Protocol → UserInput
   * 估计 token 使用：System(400-600) + Context(1000-3000) + History(500-1500) + Protocol(800) + UserInput(50-500)
   */
  async buildPrompt(userInput: string, sessionId: string): Promise<string> {
    let prompt = '';
    
    // 0. 添加系统级 Prompt（最重要，放在最前面）
    prompt += this.getSystemPromptTemplate();

    // 1. 添加基础 Context（使用拼接策略）
    try {
      // 检查是否有结构化 prompt 渲染方法
      if (!this.contextManager.renderStructuredPrompt) {
        throw new Error('ContextManager does not support renderStructuredPrompt method');
      }
      
      // 使用结构化 prompt 渲染
      const structuredPrompt = await this.contextManager.renderStructuredPrompt();
      
      // 将 PromptCtx 转换为字符串
      const contextPrompt = this.formatStructuredPrompt(structuredPrompt);
      prompt += contextPrompt;
      
      const currentStrategy = this.contextManager.getPromptAssemblyStrategy?.() || 'unknown';
      console.log(`[ThinkingOrchestrator] Using structured prompt with strategy: ${currentStrategy}`);
    } catch (error) {
      console.error('[ThinkingOrchestrator] Failed to render structured prompt:', error);
      throw error; // 不再有 fallback，直接抛出错误
    }

    // 2. 添加对话历史（如果有）- 包含用户和助手的响应
    if (this.conversationHistory.length > 0) {
      prompt += this.thinkingEngine.buildConversationHistory(
        this.conversationHistory.slice(-this.options.maxConversationHistory)
      );
    }

    // 3. 添加执行历史（如果有）- 使用配置的渲染选项，默认不包含response避免重复
    prompt += this.executionTracker.buildExecutionHistory(this.options.executionHistoryRenderOptions);

    // 4. 添加思考协议
    prompt += this.getThinkingProtocolTemplate();

    // 5. 添加当前步骤输入
    prompt += `\n## Current Step Input\n${userInput}\n\n`;

    return prompt;
  }

  /**
   * 将结构化 PromptCtx 格式化为字符串
   */
  private formatStructuredPrompt(promptCtx: { workflow: string; status: string; guideline: string; examples: string }): string {
    let formatted = '';
    
    if (promptCtx.workflow && promptCtx.workflow.trim()) {
      formatted += promptCtx.workflow + '\n\n';
    }
    
    if (promptCtx.status && promptCtx.status.trim()) {
      formatted += promptCtx.status + '\n\n';
    }
    
    if (promptCtx.guideline && promptCtx.guideline.trim()) {
      formatted += promptCtx.guideline + '\n\n';
    }
    
    if (promptCtx.examples && promptCtx.examples.trim()) {
      formatted += promptCtx.examples + '\n\n';
    }
    
    return formatted;
  }

  /**
   * 设置 prompt 拼接策略
   */
  setPromptAssemblyStrategy(strategy: PromptAssemblyStrategy): void {
    this.options.promptAssemblyStrategy = strategy;
    if (this.contextManager.setPromptAssemblyStrategy) {
      this.contextManager.setPromptAssemblyStrategy(strategy);
      console.log(`[ThinkingOrchestrator] Prompt assembly strategy changed to: ${strategy}`);
    }
  }

  /**
   * 获取当前 prompt 拼接策略
   */
  getPromptAssemblyStrategy(): PromptAssemblyStrategy {
    if (this.contextManager.getPromptAssemblyStrategy) {
      return this.contextManager.getPromptAssemblyStrategy();
    }
    return this.options.promptAssemblyStrategy;
  }

  /**
   * 设置执行历史渲染选项
   */
  setExecutionHistoryRenderOptions(options: Partial<ExecutionHistoryRenderOptions>): void {
    this.options.executionHistoryRenderOptions = {
      ...this.options.executionHistoryRenderOptions,
      ...options
    };
    this.executionTracker.setDefaultRenderOptions(this.options.executionHistoryRenderOptions);
  }

  /**
   * 获取当前执行历史渲染选项
   */
  getExecutionHistoryRenderOptions(): ExecutionHistoryRenderOptions {
    return { ...this.options.executionHistoryRenderOptions };
  }

  /**
   * 处理下一个推理步骤的完整流程
   * 
   * 真实的执行架构：
   * Step n: 历史上下文 + thinking_(n-1) + 执行结果 → LLM → thinking_n + toolCalls_n (同时生成)
   * Step n+1: 历史上下文 + thinking_n + 执行结果 → LLM → thinking_n+1 + toolCalls_n+1 (同时生成)
   * 
   * 这不是"用户输入处理"，而是基于完整历史上下文的连续推理过程
   */
  async processStep(stepInput: string, sessionId: string, tools: ToolCallDefinition[] = []): Promise<ProcessResult> {
    try {
      // 注意：这里的 stepInput 可能是用户输入（第一步）或者是"continue reasoning"（后续步骤）
      
      // 添加当前步骤输入到对话历史
      this.conversationHistory.push({
        role: 'user',
        content: stepInput,
        timestamp: new Date()
      });

      // 1. 构建 prompt（包含所有历史thinking和执行结果）
      const prompt = await this.buildPrompt(stepInput, sessionId);
      
      // 2. 调用 ThinkingEngine（LLM同时返回thinking和toolCalls）
      const llmResponse = await this.thinkingEngine.call(prompt, tools);
      
      // 3. 添加助手响应到对话历史
      if (llmResponse.response && llmResponse.response.message) {
        this.conversationHistory.push({
          role: 'assistant',
          content: llmResponse.response.message,
          timestamp: new Date()
        });
      }

      // 4. 添加到执行管理器（包含prompt记录）
      if (llmResponse.thinking) {
        this.executionTracker.addStep(
          llmResponse.thinking, 
          llmResponse.response,
          llmResponse.toolCalls,
          prompt  // 添加prompt记录
        );
      }
      
      // 5. 返回处理结果
      const result: ProcessResult = {
        thinking: llmResponse.thinking,
        response: llmResponse.response,
        toolCalls: llmResponse.toolCalls,
        stepNumber: this.executionTracker.getCurrentStepNumber() - 1,
        sessionId,
        rawText: llmResponse.rawText,
      };

      // 6. 生成质量报告（可选）
      if (llmResponse.thinking) {
        const quality = this.thinkingEngine.assessThinkingQuality(llmResponse.thinking);
        if (quality.overallScore < 70) {
          const suggestions = this.thinkingEngine.generateImprovementSuggestions(llmResponse.thinking);
          console.warn(`Low thinking quality detected (score: ${quality.overallScore}). Suggestions:`, suggestions);
        }
      }
      
      return result;
      
    } catch (error) {
      console.error('ThinkingOrchestrator.processStep failed:', error);
      throw error;
    }
  }

  /**
   * 处理用户输入（第一步特殊处理）
   */
  async processUserInput(userInput: string, sessionId: string, tools: ToolCallDefinition[] = []): Promise<ProcessResult> {
    return this.processStep(userInput, sessionId, tools);
  }

  /**
   * 处理工具执行结果
   */
  async processToolResults(stepNumber: number, results: any[]): Promise<void> {
    this.executionTracker.addToolResults(stepNumber, results);
  }

  /**
   * 继续推理（用于步骤间的连续推理）
   * 这是系统的核心方法：基于历史thinking和执行结果生成下一步thinking+toolCalls
   */
  async continueReasoning(
    sessionId: string,
    tools: ToolCallDefinition[] = []
  ): Promise<ProcessResult> {
    // 构建继续推理的输入（基于当前状态）
    const continuationInput = "Continue reasoning based on previous thinking and execution results.";
    return this.processStep(continuationInput, sessionId, tools);
  }

  /**
   * 获取对话摘要
   */
  getConversationSummary(): string {
    const stats = this.executionTracker.getStats();
    const recentMessages = this.conversationHistory.slice(-5);
    
    let summary = `## Conversation Summary\n\n`;
    summary += `**Execution Stats:** ${stats.totalSteps} steps, ${stats.completedSteps} completed\n`;
    summary += `**Recent Messages:** ${recentMessages.length} messages\n\n`;
    
    for (const msg of recentMessages) {
      const timeStr = msg.timestamp.toISOString().substring(11, 19);
      summary += `**${msg.role}** (${timeStr}): ${msg.content.substring(0, 100)}${msg.content.length > 100 ? '...' : ''}\n\n`;
    }
    
    return summary;
  }

  /**
   * 获取执行统计信息
   */
  getExecutionStats() {
    return {
      execution: this.executionTracker.getStats(),
      conversation: {
        totalMessages: this.conversationHistory.length,
        userMessages: this.conversationHistory.filter(m => m.role === 'user').length,
        assistantMessages: this.conversationHistory.filter(m => m.role === 'assistant').length
      }
    };
  }

  /**
   * 重置会话
   */
  reset(): void {
    this.executionTracker.reset();
    this.conversationHistory = [];
  }

  /**
   * 导出会话数据
   */
  exportSession(): string {
    return JSON.stringify({
      executionHistory: this.executionTracker.serialize(),
      conversationHistory: this.conversationHistory,
      promptAssemblyStrategy: this.getPromptAssemblyStrategy(),
      timestamp: new Date().toISOString()
    });
  }

  /**
   * 导入会话数据
   */
  importSession(sessionData: string): void {
    try {
      const data = JSON.parse(sessionData);
      
      // 恢复执行历史
      this.executionTracker.deserialize(data.executionHistory);
      
      // 恢复对话历史
      this.conversationHistory = data.conversationHistory.map((msg: any) => ({
        ...msg,
        timestamp: new Date(msg.timestamp)
      }));
      
      // 恢复策略设置（如果有）
      if (data.promptAssemblyStrategy) {
        this.setPromptAssemblyStrategy(data.promptAssemblyStrategy);
      }
      
    } catch (error) {
      console.error('Failed to import session data:', error);
      throw error;
    }
  }

  /**
   * 保存prompt历史到文件（用于prompt分析和优化）
   */
  async savePromptHistory(filePath: string, options?: {
    includeMetadata?: boolean;
    formatType?: 'markdown' | 'json' | 'txt';
    stepRange?: { start?: number; end?: number };
  }): Promise<void> {
    return this.executionTracker.savePromptsToFile(filePath, options);
  }

  /**
   * 获取prompt统计信息
   */
  getPromptStats() {
    return this.executionTracker.getPromptStats();
  }

  /**
   * 分析prompt演化模式
   */
  analyzePromptEvolution() {
    return this.executionTracker.analyzePromptEvolution();
  }

  /**
   * 快速保存最近的prompt（用于调试）
   */
  async saveRecentPrompts(filePath: string, stepCount: number = 5): Promise<void> {
    const recentSteps = this.executionTracker.getRecentSteps(stepCount);
    const endStep = recentSteps.length > 0 ? recentSteps[recentSteps.length - 1].stepNumber : undefined;
    const startStep = recentSteps.length > 0 ? recentSteps[0].stepNumber : undefined;
    
    return this.executionTracker.savePromptsToFile(filePath, {
      formatType: 'markdown',
      includeMetadata: true,
      stepRange: { start: startStep, end: endStep }
    });
  }

  /**
   * 获取思考协议模板
   */
  private getThinkingProtocolTemplate(): string {
    return `
## THINKING PROTOCOL

⚠️  **CRITICAL REQUIREMENT**: You MUST include complete thinking analysis before any action. This is NON-NEGOTIABLE.

**THINKING FORMAT** (Use EXACTLY this structure):

<thinking>
<analysis>
[Your analysis here]
</analysis>
<plan>
[Your plan here]
</plan>
<reasoning>
[Your reasoning here]
</reasoning>
<next_action>
[Your next action here]
</next_action>
</thinking>

**THINKING CONTENT GUIDELINES:**

**Analysis Section:**
- Current task: [Describe what you need to accomplish]
- Available context: [List relevant information from above]
- Execution history review: [What has been done in previous steps]
- Data availability check: [What information is already available vs. what's needed]
- Constraints: [Note any limitations or requirements]
- Available tools: [List tools you can use for this specific task]
- Environment state: [Current state of workspace/system]

**Plan Section:**
- Step 1: [First action to take - specify tool and approach]
- Step 2: [Second action to take - build on Step 1 results]
- Step 3: [Continue as needed - ensure logical progression]
- Validation strategy: [How to verify success at each step]
- Error handling: [What to do if something goes wrong]
- Efficiency considerations: [How to minimize redundant operations]

**Reasoning Section:**
- Why this approach: [Justify your chosen method over alternatives]
- Data utilization: [How you're using existing information vs. gathering new data]
- Tool selection rationale: [Why these specific tools for this task]
- Risk assessment: [Potential issues and mitigation strategies]
- Expected outcome: [What you expect to achieve and how to measure success]
- Dependency management: [How this step relates to previous/future steps]

**Next Action Section:**
Next concrete tasks to be completed:
- Primary task: [The specific task to be completed next, based on the analysis above]
- Tool selection: [Specific tool names to be used, e.g.: read_file, edit_file, run_terminal_cmd, agent_stop, etc.]
- Operation type: [The type of operation each tool will perform, e.g.: read configuration files, modify code, execute tests, stop execution, etc.]
- Tool sequence: [If multiple tools are needed, specify the execution order]
- Data dependencies: [What existing data is needed to avoid redundant retrieval]
- Validation method: [How to verify the correctness and quality of task completion]
- Downstream impact: [How this step affects overall task progress]

**IMPORTANT NOTES:**
- Use agent_stop tool when all tasks are completed or user interaction is needed
- Only need to select tool names and operation types, specific parameters are handled automatically by the system in toolCalls
- Prioritize using existing data and execution history to avoid redundant operations
- Choose the minimal viable toolset to complete the task
- Focus on strategic tool usage, without involving specific invocation details

**AFTER thinking, you MUST provide a response in these scenarios:**

<response>
<message>
[User-facing message - REQUIRED in the following situations]
</message>
</response>

**🚨 RESPONSE REQUIREMENTS - WHEN TO RESPOND:**

**MANDATORY Response Scenarios:**
1. **User Greetings/Chat**: ALWAYS respond to user social interactions (hi, hello, how are you, etc.)
2. **Task Completion**: When a user's request has been completed
3. **Progress Updates**: When completing significant milestones  
4. **Questions/Clarifications**: When user asks questions or needs clarification
5. **Error Resolution**: When encountering errors that affect the user
6. **Task Initiation**: When starting a complex task to confirm understanding
7. **User Input Needed**: When you need additional information from the user

**RESPONSE EXAMPLES:**

**User Greeting Examples:**
- User: "hi" → Response: "Hi! How can I help you today?"
- User: "hello" → Response: "Hello! What would you like to work on?"
- User: "how are you?" → Response: "I'm doing well, thank you! How can I assist you?"

**Task-Related Examples:**
- User: "create a test file" → Response: "I'll create a test file for you. Let me set that up."
- User: "fix the bug" → Response: "I'll analyze and fix the bug. Let me investigate the issue first."
- User: "what's the status?" → Response: "Here's the current status: [provide summary]"

**Completion Examples:**
- After completing: "✅ Task completed! I've successfully [what was done]."
- After analysis: "📊 Analysis complete. Here are the findings: [summary]"
- After fix: "🔧 Bug fixed! The issue was [explanation] and it's now resolved."

**Clarification Examples:**
- Need info: "Could you clarify which file you'd like me to modify?"
- Multiple options: "I found several approaches. Would you prefer [option A] or [option B]?"

**🚨 CRITICAL**: 
- **NEVER** leave user greetings or questions unanswered
- **ALWAYS** acknowledge user input with appropriate responses
- **BE CONVERSATIONAL** while maintaining professional assistance
- **PROVIDE VALUE** in every response - explain what you're doing or what you found

**🚨 EXECUTION RULES:**
1. **THINKING FIRST**: Always complete the <thinking> section before any tool execution - NO EXCEPTIONS
2. **RESPOND TO USERS**: Always provide appropriate responses for user interactions
3. **Data-First Approach**: Check available information and execution history before gathering new data
4. **Avoid Redundancy**: Don't repeat actions if information already exists or tasks are completed
5. **Tool Selection Optimization**: Use the minimal viable toolset that achieves the objective
6. **Progressive Building**: Each step should advance toward the goal and build on previous results
7. **Batch Operations**: Combine related actions when possible to improve efficiency
8. **Quality Validation**: Verify results before considering any step complete
9. **Strategic Communication**: Communicate meaningfully with users at appropriate times
10. **Error Recovery**: Have contingency plans and graceful failure handling
11. **Context Continuity**: Maintain awareness of the full session context and user intent
12. **Task Completion Control**: Use agent_stop tool when all objectives are achieved or user input is required

⚠️  **CRITICAL WARNING**: If you skip the thinking section or don't follow the exact format, the system will fail.
    `;
  }

  /**
   * 获取系统级 Prompt 模板
   */
  private getSystemPromptTemplate(): string {
    return `# AI AGENT SYSTEM PROMPT

You are an advanced AI Agent specialized in handling complex tasks through structured thinking and intelligent tool usage.

## 🧠 CORE MISSION - THINKING-FIRST ARCHITECTURE
Your primary role is to solve problems efficiently by combining deep analysis with precise action execution. You MUST engage in structured thinking before every action.

## 🚨 CRITICAL SYSTEM REQUIREMENT
**MANDATORY THINKING**: You MUST ALWAYS generate complete thinking content using the exact <thinking> format before taking any action. This is NON-NEGOTIABLE and system-critical.

**IMPORTANT**: The system expects and requires thinking content for every response. Failure to provide thinking content will cause system failures.

## 🤝 USER INTERACTION PRINCIPLES
**CONVERSATION-FIRST APPROACH**: You are designed to be conversational and helpful. Always acknowledge user input appropriately.

### User Communication Rules:
1. **IMMEDIATE ACKNOWLEDGMENT**: Respond promptly to all user communications
2. **CONTEXTUAL RESPONSES**: Provide relevant, helpful responses based on user needs
3. **PROFESSIONAL FRIENDLINESS**: Maintain a helpful, professional, yet approachable tone
4. **VALUE-DRIVEN COMMUNICATION**: Every response should provide value or move the conversation forward
5. **CLEAR INTENTIONS**: Always explain what you're doing and why

### Response Frequency Guidelines:
- **Greetings/Social**: ALWAYS respond immediately
- **Questions**: ALWAYS provide direct answers
- **Task Requests**: Acknowledge and explain your approach
- **Status Inquiries**: Provide current status and next steps
- **Casual Chat**: Engage appropriately while steering toward helpful assistance

## SYSTEM ARCHITECTURE - CRITICAL

### **Sequential Thinking-Tool Integration Model**
**IMPORTANT**: This system uses a step-by-step reasoning architecture where thinking and tool calls are generated simultaneously:

**True Execution Flow:**
- **Step 1**: User Input + Context → LLM → (Thinking₁ + ToolCalls₁) *simultaneously generated*
- **Step 2**: Previous Context + Thinking₁ + Execution Results → LLM → (Thinking₂ + ToolCalls₂) *simultaneously generated*  
- **Step 3**: Previous Context + Thinking₁ + Thinking₂ + Execution Results → LLM → (Thinking₃ + ToolCalls₃) *simultaneously generated*
- **Step N**: Complete History + All Previous Thinking + All Execution Results → LLM → (Thinking_N + ToolCalls_N) *simultaneously generated*

### **Key Architectural Principles**
1. **Cumulative Context Building**: Each step builds upon ALL previous thinking and execution results
2. **Simultaneous Generation**: Thinking and ToolCalls are generated in the same LLM call using function calling capability
3. **Historical Continuity**: Every reasoning step has access to the complete session history
4. **Progressive Refinement**: Each thinking iteration improves upon previous analysis
5. **Context-Aware Planning**: Tool selection is informed by previous thinking patterns and results
6. **User-Centric Communication**: All interactions prioritize user understanding and engagement

### **Critical Understanding**
- **NOT**: Think → Wait → ToolCall → Wait → Think Again  
- **ACTUALLY**: History + Context → LLM → (Thinking + ToolCalls) → Execute → Next Iteration
- **Thinking and ToolCalls happen together**, not sequentially
- **Each step references all previous thinking**, creating a continuous reasoning chain
- **LLM's function calling capability enables simultaneous thinking text + tool calls output**
- **User responses are generated alongside thinking**, ensuring conversational continuity

## ARCHITECTURAL FRAMEWORK

### Continuous Reasoning Architecture
- **Context Layer**: All historical thinking + execution results + current state
- **Reasoning Layer**: Structured thinking that builds on previous analysis
- **Action Layer**: Tool calls generated simultaneously with thinking
- **Communication Layer**: User-facing responses that explain and engage
- **Execution Layer**: Tool execution and result integration
- **Iteration Layer**: Results feed into next reasoning cycle

### Multi-Step Reasoning Philosophy
- **Session Continuity**: Maintain complete thinking history across all steps
- **Incremental Building**: Each thinking step advances the overall understanding
- **State Evolution**: Track how understanding and plans evolve over time
- **Adaptive Intelligence**: Adjust approach based on accumulated insights
- **Conversational Flow**: Maintain engaging dialogue throughout the process

### Operational Excellence
- **Historical Awareness**: Every decision informed by complete session context
- **Thinking Continuity**: Maintain reasoning threads across multiple steps
- **Progressive Problem Solving**: Build complexity through iterative thinking
- **Context Optimization**: Efficiently manage growing context while preserving key insights
- **User Engagement**: Keep users informed and engaged throughout the process

## EXECUTION PHILOSOPHY

The core principle: **Mandatory Continuous Contextual Reasoning with User-Centric Communication**

Every reasoning step must be:
1. **Historically Informed** - Based on all previous thinking and results
2. **Contextually Integrated** - Connected to the complete session context
3. **Progressively Building** - Advancing the overall understanding and plan
4. **Thinking-Tool Synchronized** - Generating thinking and actions together
5. **User-Responsive** - Providing appropriate communication and engagement

Your role is to maintain a continuous thread of reasoning that evolves and improves with each step, while ensuring users feel heard, understood, and informed throughout the interaction process.

**🚨 SYSTEM CRITICAL**: Always provide complete thinking content using the required <thinking> format. The system architecture depends on this.

**🤝 USER CRITICAL**: Always provide appropriate responses to user communications. User engagement is essential to system success.

---

`;
  }
} 