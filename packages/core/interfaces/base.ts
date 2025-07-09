import { z } from "zod";

// Import from agent.ts type definitions
export type LLMProvider = 'openai' | 'anthropic' | 'google';
export type AgentStatus = 'idle' | 'initializing' | 'running' | 'stopping' | 'error';

/**
 * Configuration for the agent
 */
export interface Config {
}

/**
 * Base message schema and types
 */
export const MessageSchema = z.object({
    role: z.string(),
    text: z.string(),
    timestamp: z.string().describe("timestamp uses to mark the timestamp of the message"),
});
export type Message = z.infer<typeof MessageSchema>;

/**
 * Standardized tool execution result base format
 */
export const BaseToolResultSchema = z.object({
    success: z.boolean().describe("Whether the tool execution was successful"),
    message: z.string().optional().describe("Message about the tool execution success or error")
}).describe("Base tool execution result format with success/error fields");

export type BaseToolResult = z.infer<typeof BaseToolResultSchema>;


export enum MessageType {
    ERROR = 'error',
    MESSAGE = 'message',
    TOOL_CALL = 'tool-call',
    THINKING = 'thinking',
    ANALYSIS = 'thinking.analysis',
    PLAN = 'thinking.plan',
    REASONING = 'thinking.reasoning',
    INTERACTIVE = 'interactive',
    RESPONSE = 'interactive.response',
    STOP_SIGNAL = 'interactive.stop-signal',
}

/**
 * Chat message type for PromptProcessor history management
 */
export interface ChatMessage {
    role: 'user' | 'agent' | 'system';
    type?: MessageType;
    step: number;
    content: string;
    timestamp: string;
}

/**
 * Container interface for memory management
 */
export interface Container<T> {
    id: string;
    name: string;
    description: string;
    storage: T;
}

/**
 * Memory data structure
 */
export type MemoryData<T> = {
    id: string;
    description: string;
    data: T;
};

/**
 * LLM Model enumeration
 */
export const LLMModel = z.enum(['openai', 'anthropic', 'google']); 