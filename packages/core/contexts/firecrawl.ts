import { ContextHelper } from "../utils";
import { z } from 'zod';
import { ToolSet, ToolCallResult } from "../interfaces";
import { logger } from "../utils/logger";
import path from 'path';
import fs from 'fs';

// Schema for storing FireCrawl context data
export const FireCrawlContextSchema = z.object({
    // Store recent search results
    recentSearches: z.array(z.object({
        query: z.string(),
        timestamp: z.number(),
        results: z.array(z.any())
    })).default([]),
    // Store recently visited web pages
    recentPages: z.array(z.object({
        url: z.string(),
        timestamp: z.number(),
        content: z.string().optional(),
        title: z.string().optional(),
    })).default([]),
    // Last search query
    lastQuery: z.string().optional(),
    // Last crawled or visited URL
    lastUrl: z.string().optional(),
    // Cache of crawled content by URL
    contentCache: z.record(z.string(), z.any()).default({})
});

export type FireCrawlContextType = z.infer<typeof FireCrawlContextSchema>;

// Use 'mcp-server-firecrawl' as the context ID to match MCP server name for consistency
export const FireCrawlContextId = 'mcp-server-firecrawl';

/**
 * Process search results and update context
 */
function processSearchData(context: any, data: any, query?: string): void {
    if (!context || !context.setData) return;
    
    try {
        // Parse data if it's a string
        let searchResults = [];
        if (typeof data === 'string') {
            try {
                searchResults = JSON.parse(data);
            } catch (e) {
                // If not valid JSON, treat as text
                searchResults = [{ content: data }];
            }
        } else if (data && data.result) {
            // Handle tool call result format
            searchResults = typeof data.result === 'string' 
                ? (data.result.startsWith('[') || data.result.startsWith('{') ? JSON.parse(data.result) : [{ content: data.result }])
                : data.result;
        } else if (Array.isArray(data)) {
            // Direct array
            searchResults = data;
        } else if (data) {
            // Object result
            searchResults = [data];
        }
        
        // If query is provided, update search history
        if (query) {
            context.setData({ lastQuery: query });
            
            // Add to search history
            const searches = [...(context.data.recentSearches || [])];
            const newEntry = {
                query,
                timestamp: Date.now(),
                results: Array.isArray(searchResults) ? searchResults : [searchResults]
            };
            
            // Add at beginning
            searches.unshift(newEntry);
            
            // Keep only last 10 searches
            if (searches.length > 10) {
                searches.pop();
            }
            
            context.setData({ recentSearches: searches });
        }
    } catch (e) {
        logger.error('Error processing FireCrawl search data:', e);
    }
}

/**
 * Process scrape/crawl results and update context
 */
function processScrapeData(context: any, data: any, url?: string): void {
    if (!context || !context.setData || !url) return;
    
    try {
        // Parse data with proper type
        let pageContent: Record<string, any> = {};
        if (typeof data === 'string') {
            pageContent = { content: data };
        } else if (data && data.result) {
            pageContent = typeof data.result === 'string' 
                ? { content: data.result }
                : data.result;
        } else if (data) {
            pageContent = data;
        }
        
        // Extract title if available
        const title = pageContent.title || 
            (pageContent.markdown && typeof pageContent.markdown === 'string' 
                ? pageContent.markdown.split('\n')[0].replace(/^#\s+/, '') 
                : '');
        
        // Determine content to store
        const content = pageContent.markdown || pageContent.content || pageContent.html || '';
        
        // Update last URL
        context.setData({ lastUrl: url });
        
        // Add to recent pages
        const pages = [...(context.data.recentPages || [])];
        const existingIndex = pages.findIndex(p => p.url === url);
        
        const newEntry = {
            url,
            timestamp: Date.now(),
            content: typeof content === 'string' ? content : JSON.stringify(content),
            title: title || url
        };
        
        // Replace if exists, otherwise add at beginning
        if (existingIndex >= 0) {
            pages[existingIndex] = newEntry;
        } else {
            pages.unshift(newEntry);
            // Keep only last 10 pages
            if (pages.length > 10) {
                pages.pop();
            }
        }
        
        context.setData({ recentPages: pages });
        
        // Update cache
        const contentCache = { ...(context.data.contentCache || {}) };
        contentCache[url] = pageContent;
        context.setData({ contentCache });
        
    } catch (e) {
        logger.error('Error processing FireCrawl scrape data:', e);
    }
}

/**
 * Process a tool call result and update the context accordingly
 */
function handleToolCall(toolCallResult: ToolCallResult, context: any): void {
    if (!toolCallResult || !toolCallResult.name || !context) {
        return;
    }
    
    // Normalize tool name (remove MCP client prefix)
    const toolName = toolCallResult.name.replace(/^mcp_\d+_firecrawl_/, '');
    const params = (toolCallResult as any).parameters || {};
    
    // Handle based on tool type
    switch (toolName) {
        case 'search':
            processSearchData(context, toolCallResult.result, params.query);
            break;
            
        case 'scrape':
            processScrapeData(context, toolCallResult.result, params.url);
            break;
            
        case 'crawl':
        case 'check_crawl_status':
            // For crawls, we might just record the job status
            // Full results would be processed when retrieved separately
            if (params.url) {
                context.setData({ lastUrl: params.url });
            }
            break;
            
        case 'deep_research':
            // Handle deep research results - similar to search
            processSearchData(context, toolCallResult.result, params.query);
            break;
            
        case 'map':
            // URL discovery - might record the starting URL
            if (params.url) {
                context.setData({ lastUrl: params.url });
            }
            break;
        
        case 'extract':
            // Structured extraction - similar to scrape
            if (params.urls && Array.isArray(params.urls) && params.urls.length > 0) {
                processScrapeData(context, toolCallResult.result, params.urls[0]);
            }
            break;
            
        case 'generate_llmstxt':
            // LLMs.txt generation - record the URL
            if (params.url) {
                processScrapeData(context, toolCallResult.result, params.url);
            }
            break;
    }
}

// Create the FireCrawl context
export const FireCrawlContext = ContextHelper.createContext({
    id: FireCrawlContextId,
    description: "Manages web search, scraping, and crawling capabilities through the FireCrawl service, enabling the agent to find, extract, and analyze information from websites, search engines, and online documentation.",
    dataSchema: FireCrawlContextSchema,
    initialData: {
        recentSearches: [],
        recentPages: [],
        contentCache: {}
    },
    // Associate with the mcp-server-firecrawl server directly
    mcpServers: [
        {
            name: 'mcp-server-firecrawl',
            type: 'stdio',
            command: 'npx',
            args: ['-y', 'firecrawl-mcp'],
            env: {
                "FIRECRAWL_API_KEY": "fc-6f5db9c3fa5c4795a02b47c6ba8e4c59"
            }
        }
    ],
    
    renderPromptFn(data: FireCrawlContextType) {
        return `# FireCrawl Web Research Guide

FireCrawl provides advanced web search, scraping, and crawling capabilities for gathering information from the internet.

## Available Tool Categories

The mcp-server-firecrawl provides various tools organized in these categories:

1. **Web Search**: Find information using search engines
   - firecrawl_search: Search the web with optional scraping of results

2. **Web Scraping**: Extract content from specific URLs
   - firecrawl_scrape: Fetch and parse content from a URL in various formats
   - firecrawl_extract: Extract structured information from a URL using AI

3. **Web Crawling**: Explore and analyze websites
   - firecrawl_map: Discover URLs from a starting point
   - firecrawl_crawl: Start a multi-page crawl
   - firecrawl_check_crawl_status: Check status of a crawl

4. **Advanced Research**:
   - firecrawl_deep_research: Conduct in-depth research on a topic
   - firecrawl_generate_llmstxt: Generate structured LLMs.txt for a site

## Common Usage Patterns

### Quick Information Search:
- firecrawl_search("query", { limit: 5 })

### In-depth Page Analysis:
- firecrawl_scrape(url, { formats: ["markdown"] })

### Website Exploration:
- firecrawl_map(url, { limit: 20 })
- firecrawl_crawl(url, { maxDepth: 2, limit: 10 })

### Structured Information Extraction:
- firecrawl_extract({ urls: [url], prompt: "Extract all pricing information" })

${data.lastQuery ? `\n## Last Search Query\n${data.lastQuery}` : ''}
${data.lastUrl ? `\n## Last Accessed URL\n${data.lastUrl}` : ''}
${data.recentPages.length > 0 ? `\n## Recently Visited Pages\n${data.recentPages.slice(0, 3).map(p => `- ${p.title || p.url}`).join('\n')}` : ''}

FireCrawl is most useful when you need to:
- Research current information not in your training data
- Extract specific content from web pages
- Analyze website structure or content
- Perform comprehensive research on a topic`;
    },
    toolSetFn: () => ({
        name: FireCrawlContextId, // Use same name as context ID for auto-association
        description: "Tools for web search, scraping, and crawling using the FireCrawl service",
        tools: [], // The actual tools will be provided by the MCP server registration
        active: true,
        source: "firecrawl-context"
    }),
    handleToolCall: function(toolCallResult: ToolCallResult) {
        handleToolCall(toolCallResult, this);
    }
});

// Export the context
export default FireCrawlContext; 