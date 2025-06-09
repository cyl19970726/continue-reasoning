import { ContextHelper } from "../utils";
import { z } from 'zod';
import { ToolSet, ToolCallResult } from "../interfaces";
import { logger } from "../utils/logger";

// Schema for storing DeepWiki context data
export const DeepWikiContextSchema = z.object({
    // Store recent search results
    recentRepos: z.array(z.object({
        url: z.string(),
        timestamp: z.number(),
        data: z.any()
    })).default([]),
    // Last searched repository
    lastRepo: z.string().optional(),
    // Cached repository data
    repoCache: z.record(z.string(), z.any()).default({})
});

export type DeepWikiContextType = z.infer<typeof DeepWikiContextSchema>;

// Use 'mcp-deepwiki' as the context ID to match MCP server name for consistency
export const DeepWikiContextId = 'mcp-deepwiki';

/**
 * Process deepwiki fetch result and update context
 */
function processDeepWikiData(context: any, data: any, url?: string): void {
    if (!context || !context.setData) return;
    
    try {
        // Parse data if needed
        let repoData = data;
        if (typeof data === 'string') {
            try {
                repoData = JSON.parse(data);
            } catch (e) {
                // If it's not JSON, keep as is
                repoData = { text: data };
            }
        } else if (data && data.result) {
            // Handle tool call result format
            repoData = typeof data.result === 'string' 
                ? (data.result.startsWith('{') ? JSON.parse(data.result) : { text: data.result })
                : data.result;
        }
        
        // If URL provided, update lastRepo and add to recentRepos
        if (url) {
            context.setData({ lastRepo: url });
            
            // Add to recentRepos
            const repos = [...(context.data.recentRepos || [])];
            const existingIndex = repos.findIndex(r => r.url === url);
            
            // Create new entry
            const newEntry = {
                url,
                timestamp: Date.now(),
                data: repoData
            };
            
            // Replace if exists, otherwise add at beginning
            if (existingIndex >= 0) {
                repos[existingIndex] = newEntry;
            } else {
                repos.unshift(newEntry);
                // Keep only last 10 repos
                if (repos.length > 10) {
                    repos.pop();
                }
            }
            
            context.setData({ recentRepos: repos });
            
            // Update cache
            const repoCache = { ...(context.data.repoCache || {}) };
            repoCache[url] = repoData;
            context.setData({ repoCache });
        }
    } catch (e) {
        logger.error('Error processing DeepWiki data:', e);
    }
}

/**
 * Process a tool call result and update the context accordingly
 */
function handleToolCall(toolCallResult: ToolCallResult, context: any): void {
    if (!toolCallResult || !toolCallResult.name || !context) {
        return;
    }
    
    // Only process results from mcp-deepwiki tools
    const toolName = toolCallResult.name.replace(/^mcp_\d+_/, '');
    if (toolName !== 'deepwiki_fetch') {
        return;
    }
    
    logger.debug(`DeepWikiContext processing tool call result for ${toolName}`);
    
    try {
        const result = toolCallResult.result;
        const params = (toolCallResult as any).parameters || {};
        
        // Process the fetch result
        processDeepWikiData(context, result, params.url);
    } catch (e) {
        logger.error(`Error handling tool call result for ${toolName}:`, e);
    }
}

// Create the DeepWiki context
export const DeepWikiContext = ContextHelper.createContext({
    id: DeepWikiContextId,
    description: "Manages interactions with the DeepWiki service, which provides access to documentation and repositories in markdown format. Helps the agent find and explore open-source projects, documentation, and code explanations.",
    dataSchema: DeepWikiContextSchema,
    initialData: {
        recentRepos: [],
        repoCache: {}
    },
    // Associate directly with the mcp-deepwiki server 
    mcpServers: [
        {
            name: 'mcp-deepwiki',
            type: 'stdio',
            command: 'npx',
            args: ['-y', 'mcp-deepwiki@latest']
        }
    ],
    renderPromptFn(data: DeepWikiContextType) {
        return `# DeepWiki Documentation Access Guide

DeepWiki provides access to high-quality documentation and repositories in markdown format.

## Available Tools

The mcp-deepwiki server provides this core tool:

1. **deepwiki_fetch(url)**
   - Fetches documentation from a GitHub repository or other supported sources
   - url: The repository URL, owner/repo name, or keyword to fetch
   - Returns markdown content of the repository documentation

## Using DeepWiki

### How to Access Documentation:
1. Use deepwiki_fetch with a GitHub repository in any of these formats:
   - Full URL: "https://github.com/owner/repo"
   - Owner/repo format: "owner/repo"
   - Simple keyword: "react"

### Common Usage Patterns:
- Explore project documentation: deepwiki_fetch("vercel/next.js")
- Learn about libraries: deepwiki_fetch("react")
- Read specific documentation: deepwiki_fetch("openai/openai-cookbook")

${data.lastRepo ? `\n## Last Accessed Repository\n${data.lastRepo}` : ''}
${data.recentRepos.length > 0 ? `\n## Recently Accessed Repositories\n${data.recentRepos.slice(0, 3).map(r => `- ${r.url}`).join('\n')}` : ''}

DeepWiki is most useful when you need to:
- Understand how a library or framework works
- Find examples of coding patterns or best practices
- Access documentation for open source projects
- Assist with understanding complex codebases`;
    },
    toolSetFn: () => ({
        name: DeepWikiContextId, // Use same name as context ID for auto-association
        description: "Tools for interacting with DeepWiki to access repository documentation and explanations",
        tools: [], // The actual tools will be provided by the MCP server registration
        active: true,
        source: "deepwiki-context"
    }),
    handleToolCall: function(toolCallResult: ToolCallResult) {
        handleToolCall(toolCallResult, this);
    }
});

// Export the context
export default DeepWikiContext; 