/**
 * @continue-reasoning/cli-client
 * 
 * 模块化的 CLI 客户端包，用于与 Continue Reasoning Agent 进行交互
 */

import { CLIClient } from './CLIClient';
import { CLIClientConfig, ISessionManager } from './types';

// 导出主要类和接口
export { CLIClient };
export * from './types';
export * from './commands';
export * from './utils';
export * from './utils/display-formatter';

/**
 * 创建默认的 CLI Client 配置
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
 * 启动 CLI Client 的工厂函数
 */
export async function startCLIClient(config: Partial<CLIClientConfig> = {}): Promise<CLIClient> {
  const fullConfig = createDefaultConfig(config);
  const client = new CLIClient(fullConfig);
  await client.start();
  return client;
}

/**
 * 创建 CLI Client 实例的工厂函数（不自动启动）
 */
export function createCLIClient(config: Partial<CLIClientConfig> = {}): CLIClient {
  const fullConfig = createDefaultConfig(config);
  return new CLIClient(fullConfig);
}

/**
 * 创建与 SessionManager 集成的 CLI Client
 */
export function createCLIClientWithSession(
  sessionManager: any, // ISessionManager 类型
  config: Partial<CLIClientConfig> = {}
): CLIClient {
  const fullConfig = createDefaultConfig(config);
  const client = new CLIClient(fullConfig);
  
  // 使用依赖注入设置 SessionManager
  client.setSessionManager(sessionManager);
  
  // 如果需要，可以自动创建新会话
  if (!client.currentSessionId) {
    client.newSession();
  }
  
  return client;
}

/**
 * 启动与 SessionManager 集成的 CLI Client
 */
export async function startCLIClientWithSession(
  sessionManager: any, // ISessionManager 类型
  config: Partial<CLIClientConfig> = {}
): Promise<CLIClient> {
  const client = createCLIClientWithSession(sessionManager, config);
  await client.start();
  return client;
}

// 向后兼容的默认导出
export default CLIClient;

/**
 * 版本信息
 */
export const VERSION = '0.1.0'; 