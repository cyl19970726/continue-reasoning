export enum SystemToolNames {
    stopResponse = "stop-response",
    loadMemory = "load-memory",
    saveMemory = "save-memory",
    deleteMemory = "delete-memory",
    listMemory = "list-memory",
    loadContext = "load-context",
    saveContext = "save-context",
    deleteContext = "delete-context",
}

export enum BasicToolNames {
    runBash = "run-bash",
    runLongBash = "run-long-bash",
    runDocker = "run-docker",
}

export { DeepWikiContext, DeepWikiContextId } from './deepwiki.js';
export { FireCrawlContext, FireCrawlContextId } from './firecrawl.js';
export { PlanContext, PlanContextId } from './plan.js';
export { WebSearchContext, WebSearchContextId,WebSearchTool } from './web-search.js';