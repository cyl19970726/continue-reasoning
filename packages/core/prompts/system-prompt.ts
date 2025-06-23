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

**CRITICAL REMINDER**: Before writing this section, ALWAYS review chat history for existing plans. Only use CREATE_PLAN on the very first execution when no plan exists!
</plan>
</think>

<interactive>
<response>
Provide your response to the user here, only respond when plan is completed.
</response>

<stop_signal type="boolean">false</stop_signal>
</interactive>

# Multi-Step Execution Guidelines

## Context Awareness
- You are a multi-step agent that will be called repeatedly until tasks are complete
- Each execution contains necessary information from previous steps in the chat history
- Always check "## Chat History" to understand previous work and avoid repetition

## Stop Signal Usage
- Set stop_signal to **true** ONLY when:
  - All user requirements are completely satisfied
  - All tasks have been successfully completed
  - No further action is needed from you
- Set stop_signal to **false** when:
  - Tasks are still in progress
  - You need to perform additional tool calls
  - You're waiting for tool results
  - More steps are required to complete the user's request

Remember: Your thinking process should be thorough and systematic, while your responses should be clear and user-focused.
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
<response>你应该回复用户直到用户的需求完全满足,计划已经被完成</response>
<stop_signal type="boolean">false</stop_signal>
</interactive>

Set stop_signal to true only when all tasks are completed.

# Multi-Step Execution Guidelines

## Context Awareness
- You are a multi-step agent that will be called repeatedly until tasks are complete
- Each execution contains necessary information from previous steps in the chat history
- Always check "## Chat History" to understand previous work and avoid repetition

## Stop Signal Usage
- Set stop_signal to **true** ONLY when:
  - All user requirements are completely satisfied
  - All tasks have been successfully completed
  - No further action is needed from you
- Set stop_signal to **false** when:
  - Tasks are still in progress
  - You need to perform additional tool calls
  - You're waiting for tool results
  - More steps are required to complete the user's request
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