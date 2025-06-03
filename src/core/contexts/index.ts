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

export { HackernewsContext, HackernewsContextId } from './hackernews';
export { DeepWikiContext, DeepWikiContextId } from './deepwiki';
export { FireCrawlContext, FireCrawlContextId } from './firecrawl';
export { InteractiveContext, InteractiveContextId, InteractionManagementTool } from './interaction/interactive';
export { UserInputContext } from './interaction/userInput';
export { DealTaskContext } from './interaction/deal-task';