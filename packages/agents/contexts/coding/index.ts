/**
 * Gemini Coding Agent
 * 
 * This module provides a coding-specific implementation of the Context interface
 * focused on code reading, editing, and executing tasks.
 */

// Export the main context class and factory function
export type { ICodingContext } from "./coding-context";
export { createCodingContext, CodingContext } from "./coding-context";

// Export all toolsets
export * from "./toolsets";

// Export the runtime components
export * from "./runtime";

// Export the sandbox components
export * from "./sandbox";
