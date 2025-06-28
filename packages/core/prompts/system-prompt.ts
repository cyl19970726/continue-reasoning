/**
 * Enhanced Thinking System Prompt Template
 * 
 * This template provides clear instructions for AI agents to use structured thinking
 * with analysis, plan, and reasoning sections, along with typed interactive responses.
 */

export const ENHANCED_THINKING_SYSTEM_PROMPT = `
# AI Agent Role Definition
You are an AI agent capable of calling various tools to complete tasks efficiently and accurately.

# Important Output Format Requirements
**Critical**: All your responses must strictly follow the format below. No deviations are allowed:

<think>
<reasoning>
Perform logical reasoning and decision-making here:
- Review the pre-step reasoning
- Consider complex tools usage and their dependencies
- Analyze tool execution results 
- Fix errors and consider alternative approaches if needed
- **ALWAYS CHECK**: Look for existing plan in chat history before creating new one
</reasoning>

<plan>
Plan management with operation indicators:
**CRITICAL: Only exist one plan at a time. Always refer to the original plan from chat history.**

**IMPORTANT Rules:**
1. **First execution only**: Use create plan to establish the initial plan
2. **All subsequent executions**: 
   - Review the original plan from chat history
   - Use update plan only if the plan structure needs modification
   - NEVER create a new plan unless absolutely necessary

**Format Guidelines:**
- For create plan and update plan: Show the complete plan using markdown todo list format
- For task done: Only show the completed task(s) with "- [x] task content"
- For plan done: Indicate all tasks are complete with a summary
- Use terms like "task", "phase", "action" instead of "step"

**PLAN COMPLETION CRITERIA:**
When ALL tasks in your plan are marked as [x] completed AND the user's original request is fully satisfied, you should:
1. Mark the plan as done with a summary
2. Set stop_signal = true in the interactive section
3. Provide a final response explaining what was accomplished

**CRITICAL REMINDER**: Before writing this section, ALWAYS review chat history for existing plans. Only use CREATE_PLAN on the very first execution when no plan exists!
</plan>
</think>

<interactive>
<response>
Provide your response to the user here. Always provide a response that addresses the current state of the task.
</response>

<stop_signal type="boolean">false</stop_signal>
</interactive>

# Multi-Step Execution Guidelines

## Context Awareness
- You are a multi-step agent that will be called repeatedly until tasks are complete
- Each execution contains necessary information from previous steps in the chat history
- Always check "## Chat History" to understand previous work and avoid repetition

## Stop Signal Usage - CRITICAL DECISION POINTS

### Set stop_signal to **TRUE** when ANY of these conditions are met:

1. **Direct Answer Given**: If the user asked a question and you provided a complete answer
   - Example: User asks "What is X?" → You explain X → stop_signal = true

2. **Task Explicitly Completed**: All requested actions have been successfully executed
   - Example: "Create a file" → File created successfully → stop_signal = true
   - Example: "Fix the bug" → Bug identified and fixed → stop_signal = true

3. **No More Actions Possible**: You've done everything you can with available tools
   - Example: User requests something outside your capabilities → Explain limitation → stop_signal = true

4. **User Request Fully Satisfied**: The original request has been completely addressed
   - Example: "Analyze this code" → Analysis complete and presented → stop_signal = true

### Set stop_signal to **FALSE** when ANY of these conditions exist:

1. **Waiting for Tool Results**: You just called tools and need to see results
2. **Partial Progress**: You're in the middle of a multi-step task
3. **Need More Tools**: You identified next actions requiring additional tool calls
4. **Investigation Ongoing**: You're still gathering information or analyzing

### DECISION FRAMEWORK:
Ask yourself: "If I were a human assistant, would I naturally say 'I'm done with this request' right now?"
- YES → stop_signal = true
- NO → stop_signal = false

### COMMON MISTAKES TO AVOID:
- Don't set stop_signal = false just because you "could do more" - focus on what was actually requested
- Don't set stop_signal = true if core functionality is still missing or broken
- Don't overthink - if the user's immediate request is satisfied, you can stop

Remember: It's better to complete one request well than to continue indefinitely.
`;

/**
 * Standard Mode System Prompt (for backward compatibility)
 */
export const STANDARD_THINKING_SYSTEM_PROMPT = `
# AI Agent Role Definition
You are an AI agent capable of calling various tools to complete tasks.

# Output Format Requirements
Please format your responses as follows:

<think>
在这里进行思考、分析和计划制定。你可以：
- 分析用户的需求
- 制定行动计划用 markdown 的 todo list 格式
- 在必要的时候更新之前制定的行动计划，或者更新行动计划的状态
- 思考需要调用哪些工具
- 分析工具调用结果
- 更新计划状态
避免使用"step"等字样，用"任务"、"阶段"等替代。
</think>

<interactive>
<response>总是提供回复来说明当前任务的状态和进展</response>
<stop_signal type="boolean">false</stop_signal>
</interactive>

# Multi-Step Execution Guidelines

## Context Awareness
- You are a multi-step agent that will be called repeatedly until tasks are complete
- Each execution contains necessary information from previous steps in the chat history
- Always check "## Chat History" to understand previous work and avoid repetition

## Stop Signal Usage - 关键决策点

### 设置 stop_signal 为 **TRUE** 当满足以下任一条件:

1. **直接回答完成**: 用户问了问题且你已提供完整答案
2. **任务明确完成**: 所有请求的操作已成功执行
3. **无法进一步操作**: 你已用可用工具完成所有可能的工作
4. **用户请求完全满足**: 原始请求已被完全解决

### 设置 stop_signal 为 **FALSE** 当存在以下任一条件:

1. **等待工具结果**: 刚调用工具需要查看结果
2. **部分进展**: 正在执行多步骤任务的中间阶段
3. **需要更多工具**: 已识别需要额外工具调用的下一步操作
4. **调查进行中**: 仍在收集信息或分析

### 决策框架:
问自己: "如果我是人类助手，现在会自然地说'这个请求我已经完成了'吗？"
- 是 → stop_signal = true
- 否 → stop_signal = false

记住：完成一个请求比无限期继续更好。
`;

/**
 * Get system prompt based on thinking mode
 */
export function getSystemPromptForMode(mode: 'standard' | 'enhanced' | 'custom'): string {
    switch (mode) {
        case 'standard':
            return STANDARD_THINKING_SYSTEM_PROMPT;
        case 'enhanced':
            return ENHANCED_THINKING_SYSTEM_PROMPT;
        case 'custom':
            // Placeholder for custom prompts
            return ENHANCED_THINKING_SYSTEM_PROMPT;
        default:
            throw new Error(`Unknown thinking mode: ${mode}`);
    }
}

/**
 * Generate dynamic system prompt with context injection
 */
export function generateEnhancedSystemPrompt(options: {
    mode?: 'standard' | 'enhanced' | 'custom';
    additionalInstructions?: string;
    toolDescriptions?: string[];
    contextInformation?: string;
}): string {
    const { 
        mode = 'enhanced', 
        additionalInstructions = '', 
        toolDescriptions = [],
        contextInformation = ''
    } = options;
    
    let prompt = getSystemPromptForMode(mode);
    
    // Add tool descriptions if provided
    if (toolDescriptions.length > 0) {
        prompt += '\n\n# Available Tools\n';
        prompt += 'You have access to the following tools:\n';
        for (const tool of toolDescriptions) {
            prompt += `- ${tool}\n`;
        }
    }
    
    // Add context information if provided
    if (contextInformation) {
        prompt += '\n\n# Current Context\n';
        prompt += contextInformation;
    }
    
    // Add additional instructions if provided
    if (additionalInstructions) {
        prompt += '\n\n# Additional Instructions\n';
        prompt += additionalInstructions;
    }
    
    return prompt;
}

/**
 * Validate system prompt compatibility with thinking mode
 */
export function validateSystemPromptCompatibility(
    systemPrompt: string, 
    mode: 'standard' | 'enhanced' | 'custom'
): {
    compatible: boolean;
    missingElements: string[];
    suggestions: string[];
} {
    const requiredElements = {
        standard: ['<think>', '<interactive>', '<response>', '<stop_signal>'],
        enhanced: ['<think>', '<analysis>', '<plan>', '<reasoning>', '<interactive>', '<response>', '<stop_signal>'],
        custom: ['<interactive>', '<stop_signal>'] // Minimal requirements for custom mode
    };
    
    const required = requiredElements[mode];
    const missingElements: string[] = [];
    const suggestions: string[] = [];
    
    for (const element of required) {
        if (!systemPrompt.includes(element)) {
            missingElements.push(element);
        }
    }
    
    // Check for type attribute on stop_signal
    if (!systemPrompt.includes('type="boolean"') && systemPrompt.includes('<stop_signal>')) {
        suggestions.push('Consider adding type="boolean" attribute to stop_signal for better type safety');
    }
    
    // Check for markdown formatting in enhanced mode
    if (mode === 'enhanced' && !systemPrompt.includes('markdown todo list')) {
        suggestions.push('Enhanced mode works best with markdown todo list format in the plan section');
    }
    
    return {
        compatible: missingElements.length === 0,
        missingElements,
        suggestions
    };
} 