import { IContext, IContextManager, IRAGEnabledContext } from "./interfaces";
import { z } from "zod";
import { getLogger, LogLevel } from "./utils/logger";
import { logger } from "./agent";


export class ContextManager implements IContextManager {
    id: string;
    name: string;
    description: string;
    data: any;
    contexts: IRAGEnabledContext<any>[];

    constructor(id: string, name: string, description: string, data: any) {
        this.id = id;
        this.name = name;
        this.description = description;
        this.data = data;
        this.contexts = [];
        logger.info(`ContextManager initialized: ${id}`);
    }

    registerContext<T extends z.ZodObject<any>>(context: IRAGEnabledContext<T>): void {
        this.contexts.push(context);
        logger.debug(`Context registered: ${context.id}`);
    }
    
    findContextById(id: string): IRAGEnabledContext<any> {
        return this.contexts.find((context) => context.id === id) as IRAGEnabledContext<any>;
    }

    async renderPrompt(): Promise<string> {
        logger.debug(`Starting prompt rendering for ${this.contexts.length} contexts`);
        
        // 1. System introduction and agent identity
        const header = `
# HHH-AGI System Prompt

## Agent Identity
You are HHH-AGI, an advanced AI agent designed to help humans and continuously evolve as a digital life form.
Your purpose is to understand user requests, coordinate multiple contexts, and provide accurate and helpful responses.

## System Architecture
This prompt is organized as a collection of context blocks, each containing specific information and rules:
- Each <context name="..."> block represents a different aspect of your reasoning and capabilities
- Contexts may contain data, tools, instructions, and history relevant to your operation
- You must respect the boundaries and specific rules within each context
- Information can flow between contexts when needed to fulfill user requests

## Context Coordination Instructions
1. Read and understand ALL contexts before responding
2. Identify which contexts are most relevant to the current request
3. Follow the specific rules within each applicable context
4. When contexts provide different tools, select the most appropriate one for the current task
5. Maintain consistency across contexts (e.g., don't contradict yourself)
6. When in doubt about which context to prioritize, focus on the ClientContext for user interaction guidance

## Response Guidelines
- Respond directly to the user's needs in a helpful, accurate manner
- Use available tools according to their specific context rules
- Coordinate information across contexts to provide comprehensive answers
- Be proactive in using appropriate contexts and tools for complex tasks

## Execution Flow
1. ANALYZE: Check "client-context" first to understand what the user is asking
2. DECIDE: Determine if this is a simple request or requires multiple steps/tools
3. EXECUTE: For simple requests, answer directly and then call stop-response
4. PLAN: For complex requests, use problem/plan contexts to organize your work
5. FINISH: Always evaluate if the user's request is complete after each response
6. STOP: Call stop-response when no further processing is needed

## Common Scenarios
- Simple greeting → Respond with greeting → Call stop-response
- Simple question → Provide answer → Call stop-response  
- Complex task → Create plan/problem → Execute steps → Provide updates → Only stop when fully resolved
`;

        // Log the header
        logger.debug("System prompt header:", header);

        // 2. Compile and format all contexts
        const contextsPromises = this.contexts.map(
            async (context) => {
                const contextName = context.id;
                const contextDesc = context.description || "";
                
                try {
                    // Start timing context rendering
                    const startTime = Date.now();
                    const content = await context.renderPrompt();
                    const renderTime = Date.now() - startTime;
                    
                    // Log the context content for debugging
                    logger.debug(`Rendered context ${contextName} in ${renderTime}ms`);
                    // Convert content to string if it's a String object
                    logger.logPrompt(contextName, String(content));
                    
                    // Create a clearly formatted context block
                    return `<context name="${contextName}">
/* ${contextName} - ${contextDesc} */
${content}
</context>`;
                } catch (error) {
                    logger.error(`Error rendering context ${contextName}:`, error);
                    return `<context name="${contextName}">
/* ${contextName} - ERROR RENDERING CONTEXT */
${error instanceof Error ? error.message : `${error}`}
</context>`;
                }
            }
        );
        
        // Wait for all contexts to render
        const prompts = await Promise.all(contextsPromises);
        
        // Calculate total size of contexts for debugging
        let totalSize = header.length;
        const contextSizes = prompts.map(p => p.length);
        totalSize += contextSizes.reduce((a, b) => a + b, 0);
        
        // Log size information (helpful for debugging token issues)
        logger.info(`Total prompt size: ~${Math.round(totalSize / 4)} tokens (${totalSize} chars)`);
        
        const largeContexts = this.contexts.filter((_, i) => contextSizes[i] > 2000);
        if (largeContexts.length > 0) {
            logger.warn(`Large contexts detected: ${largeContexts.map(c => c.id).join(', ')}`);
        }
        
        // 3. Combine header and contexts with clear separation
        const fullPrompt = header + "\n\n## Context Blocks\n\n" + prompts.join("\n\n");

        // Add a reminder at the end about stopping properly
        const footer = `
## IMPORTANT REMINDER
1. Check if user request is complete and fully addressed
2. If yes, and no further clarification or processing is needed, call the stop-response tool
3. Avoid unnecessary continuation of the conversation if the current exchange is complete
`;

        const completePrompt = fullPrompt + "\n\n" + footer;
        
        logger.debug("Agent prompt rendered successfully");
        
        return completePrompt;
    }

    contextList(): IRAGEnabledContext<any>[] {
        return this.contexts;
    }
}

// Export the logger for use in other modules
export { logger, LogLevel };

