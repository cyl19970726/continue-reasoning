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

export { HackernewsContext, HackernewsContextId } from './hackernews.js';
export { DeepWikiContext, DeepWikiContextId } from './deepwiki.js';
export { FireCrawlContext, FireCrawlContextId } from './firecrawl.js';
export { PlanContext, PlanContextId } from './plan.js';
export { WebSearchContext, WebSearchContextId } from './web-search.js';