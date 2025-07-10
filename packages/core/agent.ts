// Re-export the new agent implementations
export { BaseAgent } from "./base-agent.js";
export type { AgentOptions } from "./base-agent.js";
export { StreamAgent } from "./stream-agent.js";
export { AsyncAgent } from "./async-agent.js";
// AgentFactory has been removed in favor of direct agent instantiation