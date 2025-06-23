/**
 * @continue-reasoning/cli-client
 * 
 * Modular CLI client package for interacting with Continue Reasoning Agent
 */

import { CLIClient } from './CLIClient';
import { CLIClientConfig, ISessionManager } from './types';

// Export main classes and interfaces
export { CLIClient };
export * from './types';
export * from './commands';
export * from './utils';
export * from './utils/display-formatter';

/**
 * Create default CLI Client configuration
 */
export function createDefaultConfig(overrides: Partial<CLIClientConfig> = {}): CLIClientConfig {
  return {
    name: 'CLI Client',
    enableMultilineInput: true,
    multilineDelimiter: '###',
    enableHistory: true,
    maxHistorySize: 1000,
    enableColors: true,
    enableTimestamps: true,
    promptPrefix: '>',
    maxSteps: 10,
    ...overrides
  };
}

/**
 * Factory function to start CLI Client
 */
export async function startCLIClient(config: Partial<CLIClientConfig> = {}): Promise<CLIClient> {
  const fullConfig = createDefaultConfig(config);
  const client = new CLIClient(fullConfig);
  await client.start();
  return client;
}

/**
 * Factory function to create CLI Client instance (without auto-start)
 */
export function createCLIClient(config: Partial<CLIClientConfig> = {}): CLIClient {
  const fullConfig = createDefaultConfig(config);
  return new CLIClient(fullConfig);
}

/**
 * Create CLI Client integrated with SessionManager
 */
export function createCLIClientWithSession(
  sessionManager: any, // ISessionManager type
  config: Partial<CLIClientConfig> = {}
): CLIClient {
  const fullConfig = createDefaultConfig(config);
  const client = new CLIClient(fullConfig);
  
  // Set SessionManager using dependency injection
  client.setSessionManager(sessionManager);
  
  // Automatically create new session if needed
  if (!client.currentSessionId) {
    client.newSession();
  }
  
  return client;
}

/**
 * Start CLI Client integrated with SessionManager
 */
export async function startCLIClientWithSession(
  sessionManager: any, // ISessionManager type
  config: Partial<CLIClientConfig> = {}
): Promise<CLIClient> {
  const client = createCLIClientWithSession(sessionManager, config);
  await client.start();
  return client;
}

// Backward compatible default export
export default CLIClient;

/**
 * Version information
 */
export const VERSION = '0.1.0'; 