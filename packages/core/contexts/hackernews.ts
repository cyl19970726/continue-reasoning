import { ContextHelper } from "../utils";
import { z } from 'zod';
import { ToolSet, ToolCallResult } from "../interfaces";
import { IContext } from "../interfaces";
import { logger } from "../utils/logger";

// Schema for storing HN context data
export const HackernewsContextSchema = z.object({
    // Store recent search results
    recentSearches: z.array(z.object({
        query: z.string(),
        timestamp: z.number(),
        results: z.array(z.any())
    })).default([]),
    // Store recently retrieved stories
    recentStories: z.array(z.any()).default([]),
    // Track last successful search query
    lastQuery: z.string().optional(),
    // AI-related keywords for better searches
    aiKeywords: z.array(z.string()).default([
        "AI", "artificial intelligence", "machine learning", "ML", "LLM", 
        "large language model", "claude", "gpt", "deep learning", "neural network", 
        "transformer", "diffusion", "generative AI"
    ]),
    // Popular AI topics and their relevance count
    hotAITopics: z.record(z.string(), z.number()).default({
        "large language models": 0,
        "AI safety and ethics": 0,
        "generative AI": 0,
        "AI regulation": 0,
        "open source AI": 0
    })
});

export type HackernewsContextType = z.infer<typeof HackernewsContextSchema>;

// Use 'mcp-hn' as the context ID to match MCP server name for consistency
export const HackernewsContextId = 'mcp-hn';

/**
 * Enhanced AI content detection with advanced matching techniques
 * Uses multiple passes to improve accuracy of determining AI relevance
 */
export function isAIRelated(content: string, aiKeywords: string[]): boolean {
    if (!content || typeof content !== 'string') return false;
    
    const contentLower = content.toLowerCase();
    
    // Fast path: direct keyword match
    if (aiKeywords.some(kw => contentLower.includes(kw.toLowerCase()))) {
        return true;
    }
    
    // Second pass: check for common AI model names that might not be in keywords
    const aiModelRegex = /\b(gpt-[34]|claude(\s+[23])?|llama\s*2|falcon|palm|bert|dall-e|stable\s*diffusion|midjourney)\b/i;
    if (aiModelRegex.test(contentLower)) {
        return true;
    }
    
    // Third pass: check for AI-adjacent terms not in keywords list
    const aiAdjacentTerms = [
        'algorithm', 'autoregressive', 'embedding', 'fine-tuning', 'inference',
        'token', 'tokenizer', 'prompt', 'multimodal', 'parameter'
    ];
    
    // If we find AI-adjacent terms AND some general tech indicators, consider it AI-related
    const hasAIAdjacentTerms = aiAdjacentTerms.some(term => contentLower.includes(term));
    if (hasAIAdjacentTerms) {
        const techIndicators = ['tech', 'model', 'data', 'research', 'computer', 'software'];
        const hasTechIndicators = techIndicators.some(term => contentLower.includes(term));
        
        if (hasTechIndicators) {
            return true;
        }
    }
    
    return false;
}

/**
 * Process Hacker News story data after retrieval and update context
 */
function processStoryData(context: any, data: any, query?: string): void {
    if (!context || !context.setData) return;
    
    try {
        // Parse data if it's a string
        let stories = [];
        if (typeof data === 'string') {
            stories = JSON.parse(data);
        } else if (data && data.result) {
            // Handle tool call result format
            stories = typeof data.result === 'string' ? JSON.parse(data.result) : data.result;
        } else if (data && data.text) {
            // Handle alternative format some MCP tools might return
            stories = typeof data.text === 'string' ? JSON.parse(data.text) : data.text;
        } else if (Array.isArray(data)) {
            // Direct array
            stories = data;
        }
        
        // Skip if no stories found
        if (!stories || !Array.isArray(stories) || stories.length === 0) return;
        
        // Filter for AI-related stories if we have enough stories
        const aiKeywords = context.data.aiKeywords || [];
        
        if (stories.length > 5) {
            // If we have many stories, prefer AI-related ones
            const aiStories = stories.filter((story: any) => {
                // Check both title and text if available
                const contentToCheck = [
                    story.title || '',
                    story.text || '',
                    story.url || ''
                ].join(' ');
                
                return isAIRelated(contentToCheck, aiKeywords);
            });
            
            // Use AI stories if we found enough, otherwise use all stories
            if (aiStories.length >= 3) {
                stories = aiStories;
            }
        }
        
        // Stories are available - update context data
        
        // 1. Update recentStories
        context.setData({ recentStories: stories });
        
        // 2. If query is available, update lastQuery and recentSearches
        if (query) {
            context.setData({ lastQuery: query });
            
            // Add to search history
            const searches = [...(context.data.recentSearches || [])];
            searches.unshift({
                query,
                timestamp: Date.now(),
                results: stories
            });
            
            // Keep only last 10 searches
            if (searches.length > 10) {
                searches.pop();
            }
            
            context.setData({ recentSearches: searches });
            
            // 3. Update hotAITopics based on query terms
            updateHotTopics(context, query);
        }
    } catch (e) {
        logger.error(`Error processing Hacker News data:`, e);
    }
}

/**
 * Update hot topics based on a search query
 */
function updateHotTopics(context: any, query: string): void {
    if (!context || !context.setData || !query) return;
    
    try {
        const hotTopics = { ...context.data.hotAITopics };
        const queryLower = query.toLowerCase();
        
        // Check if query matches any topic
        for (const topic in hotTopics) {
            // Improved topic matching algorithm
            if (
                // Direct inclusion
                queryLower.includes(topic.toLowerCase()) || 
                // Word-level match (e.g., "language models" matches "large language models")
                topic.toLowerCase().split(' ').some(word => 
                    word.length > 3 && queryLower.includes(word)
                ) ||
                // Check if topic words appear close to each other in query
                (function() {
                    const topicWords = topic.toLowerCase().split(' ')
                        .filter(w => w.length > 3);
                    if (topicWords.length < 2) return false;
                    
                    return topicWords.every(word => queryLower.includes(word));
                })()
            ) {
                hotTopics[topic] += 1;
            }
        }
        
        context.setData({ hotAITopics: hotTopics });
    } catch (e) {
        logger.error(`Error updating hot topics:`, e);
    }
}

/**
 * Handle tool call result from MCP-HN tools
 * This function would be called after a tool execution to update context
 */
function handleToolCallResult(toolName: string, params: any, result: any, context: any): void {
    if (!context) return;
    
    try {
        switch (toolName) {
            case 'search_stories':
                // Handles: search_stories(query, search_by_date, num_results)
                if (params && params.query) {
                    processStoryData(context, result, params.query);
                }
                break;
                
            case 'get_stories':
                // Handles: get_stories(story_type, num_stories)
                processStoryData(context, result);
                break;
                
            case 'get_story_info':
                // Handles: get_story_info(story_id)
                // For single story, we usually don't update much
                if (result) {
                    // Still process it as it might contain valuable info
                    const story = typeof result.text === 'string' ? JSON.parse(result.text) : result;
                    if (story) {
                        // Combine all story text fields for better AI detection
                        const storyContent = [
                            story.title || '',
                            story.text || '',
                            story.url || '',
                            ...(story.comments || []).map((c: any) => c.text || '').slice(0, 5)
                        ].join(' ');
                        
                        // Add to recent stories if it contains AI keywords
                        const aiKeywords = context.data.aiKeywords || [];
                        
                        if (isAIRelated(storyContent, aiKeywords)) {
                            const recentStories = [...(context.data.recentStories || [])];
                            // Add at beginning if not already present
                            if (!recentStories.some((s: any) => s.id === story.id)) {
                                recentStories.unshift(story);
                                if (recentStories.length > 20) recentStories.pop();
                                context.setData({ recentStories });
                            }
                        }
                    }
                }
                break;
        }
    } catch (e) {
        logger.error(`Error handling tool call result for ${toolName}:`, e);
    }
}

/**
 * Process a tool call result and update the context accordingly
 * This function can be used by the agent to pipe tool call results to the context
 */
export function updateContextFromToolCall(toolCallResult: ToolCallResult, context: any): void {
    if (!toolCallResult || !toolCallResult.name || !context) {
        console.log("[DEBUG] Invalid input:", { toolCallResult, context });
        return;
    }
    
    // Only process results from mcp-hn tools
    if (!['search_stories', 'get_stories', 'get_story_info', 'get_user_info'].includes(toolCallResult.name)) {
        console.log("[DEBUG] Skipping non-HN tool:", toolCallResult.name);
        return;
    }
    
    console.log("[DEBUG] Processing tool call:", { 
        name: toolCallResult.name, 
        resultType: typeof toolCallResult.result,
        paramsType: typeof (toolCallResult as any).parameters,
        contextData: context.data ? Object.keys(context.data) : "no data",
        setDataType: typeof context.setData
    });
    
    logger.debug(`HackernewsContext received tool call result for ${toolCallResult.name}`);
    
    // Extract tool name and result
    const { name, result } = toolCallResult;
    // Extract parameters if available
    const parameters = (toolCallResult as any).parameters || {};
    
    // Process the result directly for testing
    try {
        switch (name) {
            case 'search_stories':
                // Handles: search_stories(query, search_by_date, num_results)
                let parsedStories;
                try {
                    parsedStories = typeof result === 'string' ? JSON.parse(result) : result;
                    console.log("[DEBUG] Parsed stories:", { 
                        resultType: typeof result, 
                        parsedType: typeof parsedStories,
                        isArray: Array.isArray(parsedStories),
                        length: Array.isArray(parsedStories) ? parsedStories.length : "N/A" 
                    });
                } catch (e) {
                    console.log("[DEBUG] Error parsing stories:", e);
                    parsedStories = result;
                }
                
                console.log("[DEBUG] Calling setData with recentStories");
                // Update recentStories
                context.setData({ recentStories: parsedStories });
                
                // Update searchHistory if query parameter exists
                if (parameters && parameters.query) {
                    console.log("[DEBUG] Found query parameter:", parameters.query);
                    
                    // Add to search history
                    const searches = [...(context.data.recentSearches || [])];
                    searches.unshift({
                        query: parameters.query,
                        timestamp: Date.now(),
                        results: parsedStories
                    });
                    
                    // Keep only last 10 searches
                    if (searches.length > 10) {
                        searches.pop();
                    }
                    
                    console.log("[DEBUG] Calling setData with lastQuery and recentSearches");
                    context.setData({ 
                        lastQuery: parameters.query,
                        recentSearches: searches 
                    });
                    
                    // Update hot topics based on query terms
                    const hotTopics = { ...context.data.hotAITopics };
                    const queryLower = parameters.query.toLowerCase();
                    
                    console.log("[DEBUG] Analyzing hot topics for query:", queryLower);
                    console.log("[DEBUG] Available topics:", Object.keys(hotTopics));
                    
                    // Check if query matches any topic
                    for (const topic in hotTopics) {
                        if (queryLower.includes(topic.toLowerCase())) {
                            console.log("[DEBUG] Topic match found:", topic);
                            hotTopics[topic] += 1;
                        }
                    }
                    
                    console.log("[DEBUG] Calling setData with hotTopics");
                    context.setData({ hotTopics: hotTopics });
                }
                break;
                
            case 'get_story_info':
                // Handles: get_story_info(story_id)
                let parsedStory;
                try {
                    parsedStory = typeof result === 'string' ? JSON.parse(result) : result;
                    console.log("[DEBUG] Parsed story:", { 
                        resultType: typeof result, 
                        parsedType: typeof parsedStory
                    });
                } catch (e) {
                    console.log("[DEBUG] Error parsing story:", e);
                    parsedStory = result;
                }
                
                if (parsedStory) {
                    const recentStories = [...(context.data.recentStories || [])];
                    recentStories.unshift(parsedStory);
                    if (recentStories.length > 20) recentStories.pop();
                    console.log("[DEBUG] Calling setData with recentStories for get_story_info");
                    context.setData({ recentStories });
                }
                break;
                
            case 'get_stories':
                // Handles: get_stories(story_type, num_stories)
                let stories;
                try {
                    stories = typeof result === 'string' ? JSON.parse(result) : result;
                    console.log("[DEBUG] Parsed get_stories result:", { 
                        resultType: typeof result, 
                        storiesType: typeof stories,
                        isArray: Array.isArray(stories)
                    });
                } catch (e) {
                    console.log("[DEBUG] Error parsing get_stories result:", e);
                    stories = result;
                }
                
                console.log("[DEBUG] Calling setData with recentStories for get_stories");
                context.setData({ recentStories: stories });
                break;
        }
    } catch (e) {
        console.log("[DEBUG] Error in updateContextFromToolCall:", e);
        logger.error(`Error handling tool call result for ${name}:`, e);
    }
}

// Create the base context first
const baseHackernewsContext = ContextHelper.createContext({
    id: HackernewsContextId,
    description: "Manages Hacker News interaction capabilities through the mcp-hn server connection, enabling the agent to discover, search for, and retrieve AI-related news, stories, and discussions from Hacker News.",
    dataSchema: HackernewsContextSchema,
    initialData: {
        recentSearches: [],
        recentStories: [],
        aiKeywords: [
            "AI", "artificial intelligence", "machine learning", "ML", "LLM", 
            "large language model", "claude", "gpt", "deep learning", "neural network",
            "transformer", "diffusion", "generative AI"
        ],
        hotAITopics: {
            "large language models": 0,
            "AI safety and ethics": 0,
            "generative AI": 0,
            "AI regulation": 0,
            "open source AI": 0
        }
    },
    // Associate directly with the mcp-hn server
    mcpServers: [
        {
            name: 'mcp-hn',
            type: 'stdio',
            command: 'uvx',
            args: ['mcp-hn']
        }
    ],
    renderPromptFn(data: HackernewsContextType) {
        // Get sorted top topics
        const topTopics = Object.entries(data.hotAITopics)
            .sort((a, b) => b[1] - a[1])
            .map(([topic]) => topic)
            .slice(0, 3);
            
        // Get recent search queries
        const recentQueries = data.recentSearches.map(s => s.query).slice(0, 3);

        return `# Hacker News Interaction Guide

You can now access Hacker News through the mcp-hn integration to find AI-related news and discussions.

## Available Tools

The mcp-hn server provides these core tools:

1. **get_stories(story_type, num_stories)**
   - Fetches stories from different Hacker News sections
   - PARAMETERS:
     - story_type: string - Options: "top", "new", "ask_hn", "show_hn"
     - num_stories: number (optional) - Defaults to 10
   - RETURNS:
     - An array of story objects, each containing:
       - id: number - The story's unique ID
       - title: string - The story's title
       - url: string (optional) - The story's URL if it's a link
       - text: string (optional) - The story's text content if it's a text post
       - time: number - Unix timestamp of post
       - by: string - Username of poster
       - score: number - Current score of the story

2. **get_story_info(story_id)**
   - Fetches detailed information about a specific story, including comments
   - PARAMETERS:
     - story_id: number - The numerical ID of the story to retrieve
   - RETURNS:
     - A story object containing:
       - id: number - The story's unique ID
       - title: string - The story's title
       - url: string (optional) - The story's URL if it's a link
       - text: string (optional) - The story's text content if it's a text post
       - time: number - Unix timestamp of post
       - by: string - Username of poster
       - score: number - Current score of the story
       - comments: array - Nested comments array with items containing:
         - id: number - Comment ID
         - text: string - Comment text content
         - by: string - Commenter username
         - time: number - Comment timestamp
         - children: array (optional) - Nested replies

3. **search_stories(query, search_by_date, num_results)**
   - Searches for stories using a query string
   - PARAMETERS:
     - query: string - Words to search for (recommend using simple queries of <5 words)
     - search_by_date: boolean - REQUIRED, set to true to sort by date, false for relevance
     - num_results: number (optional) - Defaults to 10
   - RETURNS:
     - An array of story objects matching the search, with same structure as get_stories()

4. **get_user_info(user_name, num_stories)**
   - Fetches information about a specific user and their recent submissions
   - PARAMETERS:
     - user_name: string - The username to look up
     - num_stories: number (optional) - Defaults to 10
   - RETURNS:
     - An object containing:
       - id: string - Username
       - created: number - User account creation time
       - karma: number - User's karma points
       - about: string (optional) - User's self-description
       - submitted: array - Array of recent stories by user (same structure as get_stories)

## Common AI-Related Keywords for Searches
${data.aiKeywords.join(", ")}

## Currently Popular AI Topics
${topTopics.join(", ")}${recentQueries.length > 0 ? `

## Recent Search Queries
${recentQueries.join(", ")}` : ''}${data.recentStories.length > 0 ? `

## Recently Retrieved Stories
${data.recentStories.slice(0, 3).map((s: any) => `- ${s.title || 'Untitled'} (ID: ${s.id})`).join('\n')}` : ''}

## Recommended Workflows for Finding AI News

To find recent AI-related content, follow these patterns:

### Efficient Search Pattern:
1. Use search_stories with relevant AI keywords (like "artificial intelligence", "machine learning", "LLM")
2. Example: search_stories("large language model gpt", false, 10)
3. From results, identify the most interesting stories by ID
4. Get full details with get_story_info(story_id) to read comments

### Alternative Approach:
1. Get recent stories with get_stories("new", 20)
2. Filter results by looking for AI-related terms in titles
3. Get full details of interesting stories with get_story_info(story_id)

### Finding Trending AI Discussions:
1. Get top stories with get_stories("top", 20)
2. Identify AI-related stories by title
3. Use get_story_info(story_id) to analyze discussions in comments

### Expert Tracking:
1. Identify key AI researchers or companies
2. Use get_user_info("username") to find their submissions
3. Examine comments on their posts with get_story_info(story_id)

## Important Notes on Data Structure
1. Story IDs are numerical and required when retrieving full story details
2. All timestamps are Unix timestamps (seconds since epoch)
3. Comments may be nested with children containing sub-comments
4. The search_by_date parameter is required for search_stories - use false if in doubt
5. Some stories might not have a URL (self-posts, Ask HN)`;
    },
    toolSetFn: () => ({
        name: HackernewsContextId, // Use same name as context ID to allow for auto-association
        description: "Tools for interacting with Hacker News to find and analyze AI-related content",
        tools: [], // The actual tools will be provided by the MCP server registration
        active: true,
        source: "hackernews-context"
    }),
    handleToolCall: function(toolCallResult: ToolCallResult) {
        if (!toolCallResult || !toolCallResult.name) return;
        
        // Only process results from mcp-hn tools (prefix is added by MCP registration)
        const toolName = toolCallResult.name.replace(/^mcp_\d+_/, '');
        
        // Check if this is a HN tool we should handle
        if (!['search_stories', 'get_stories', 'get_story_info', 'get_user_info'].includes(toolName)) {
            return;
        }
        
        logger.debug(`HackernewsContext processing tool call result for ${toolName}`);
        
        // Use our existing handler function, passing "this" context
        updateContextFromToolCall({
            ...toolCallResult,
            name: toolName // Use clean name without mcp prefix
        }, this);
    }
});

// 不需要手动扩展了，直接导出上下文
export const HackernewsContext = baseHackernewsContext;

// Export the context
export default HackernewsContext; 