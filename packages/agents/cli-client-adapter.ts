import { ReactCLIClient, ReactCLIConfig } from '@continue-reasoning/react-cli';
import { IClient, ISessionManager } from '@continue-reasoning/core';

/**
 * CLI 客户端类型
 */
export type CLIClientType = 'react-terminal' | 'readline';

/**
 * CLI 客户端配置
 */
export interface CLIClientConfig {
  name: string;
  userId?: string;
  agentId?: string;
  enableStreaming?: boolean;
  theme?: 'light' | 'dark';
  displayOptions?: {
    showTimestamps?: boolean;
    showStepNumbers?: boolean;
    compactMode?: boolean;
  };
  maxSteps?: number;
  enableColors?: boolean;
  enableTimestamps?: boolean;
  enableHistory?: boolean;
  historyFile?: string;
  promptPrefix?: string;
  multilineDelimiter?: string;
}

/**
 * CLI 客户端注册表
 */
export class CLIClientRegistry {
  /**
   * 创建指定类型的客户端
   */
  create(type: CLIClientType, config: CLIClientConfig): IClient {
    switch (type) {
      case 'react-terminal':
        return this.createReactClient(config);
      case 'readline':
        throw new Error('Readline client is not yet implemented. Please use react-terminal instead.');
      default:
        throw new Error(`Unknown client type: ${type}`);
    }
  }

  /**
   * 创建 React 终端客户端
   */
  private createReactClient(config: CLIClientConfig): IClient {
    const reactConfig: ReactCLIConfig = {
      name: config.name,
      theme: config.theme || 'dark',
      compactMode: config.displayOptions?.compactMode || false,
      showTimestamps: config.displayOptions?.showTimestamps ?? true,
      enableStreaming: config.enableStreaming ?? true,
      userId: config.userId,
      agentId: config.agentId,
      maxSteps: config.maxSteps || 50,
      debug: false,
      enableToolFormatting: true,
      enableFileImport: true
    };

    return new ReactCLIClient(reactConfig);
  }

  /**
   * 获取支持的客户端类型
   */
  getSupportedTypes(): CLIClientType[] {
    return ['react-terminal'];
  }
}

/**
 * 全局客户端注册表实例
 */
const globalRegistry = new CLIClientRegistry();

/**
 * 获取客户端注册表
 */
export function getCLIClientRegistry(): CLIClientRegistry {
  return globalRegistry;
}

/**
 * 创建 CLI 客户端
 */
export function createCLIClient(type: CLIClientType = 'react-terminal', config: CLIClientConfig): IClient {
  return globalRegistry.create(type, config);
}

/**
 * 创建带会话管理器的 CLI 客户端
 */
export function createCLIClientWithSession(
  sessionManager: ISessionManager,
  config: CLIClientConfig
): IClient {
  const client = createCLIClient('react-terminal', config);
  client.setSessionManager(sessionManager);
  return client;
}