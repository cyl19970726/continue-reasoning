/**
 * CLI客户端测试
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CLIClient } from '../src/CLIClient';
import { testWorkspaceDir } from './setup';

describe('CLIClient', () => {
  let client: CLIClient;

  beforeEach(() => {
    client = new CLIClient({
      name: 'test-client',
      userId: 'test-user',
      sessionId: 'test-session',
      enableHistory: false, // 禁用历史记录以避免文件操作
      fileImporter: {
        workingDirectory: testWorkspaceDir,
        maxFileSize: 1024 * 10
      },
      fileCompleter: {
        workingDirectory: testWorkspaceDir,
        maxResults: 5
      }
    });
  });

  describe('初始化', () => {
    it('应该正确初始化客户端', () => {
      expect(client.name).toBe('test-client');
      expect(client.currentSessionId).toBe('test-session');
    });

    it('应该创建文件导入器', () => {
      const importer = client.getFileImporter();
      expect(importer).toBeDefined();
      
      const config = importer.getConfig();
      expect(config.workingDirectory).toBe(testWorkspaceDir);
    });

    it('应该使用默认配置填充缺失的选项', () => {
      const defaultClient = new CLIClient({
        name: 'default-client'
      });

      expect(defaultClient.name).toBe('default-client');
      
      const config = defaultClient.getConfig();
      expect(config.enableMultilineInput).toBe(true);
      expect(config.multilineDelimiter).toBe('###');
    });
  });

  describe('配置管理', () => {
    it('应该返回正确的配置', () => {
      const config = client.getConfig();
      
      expect(config.name).toBe('test-client');
      expect(config.userId).toBe('test-user');
      expect(config.sessionId).toBe('test-session');
    });

    it('应该返回统计信息', () => {
      const stats = client.getStats();
      
      expect(stats).toHaveProperty('totalInputs');
      expect(stats).toHaveProperty('multilineInputs');
      expect(stats).toHaveProperty('commandsExecuted');
      expect(stats).toHaveProperty('sessionStartTime');
      expect(stats).toHaveProperty('lastInputTime');
      
      expect(stats.totalInputs).toBe(0);
      expect(stats.multilineInputs).toBe(0);
      expect(stats.commandsExecuted).toBe(0);
    });

    it('应该返回空的历史记录', () => {
      const history = client.getHistory();
      
      expect(Array.isArray(history)).toBe(true);
      expect(history.length).toBe(0);
    });
  });

  describe('多行模式', () => {
    it('应该能够切换多行模式', () => {
      // 初始状态应该是单行模式
      expect(client['currentState']).toBe('single');
      
      // 切换到多行模式
      client.toggleMultilineMode();
      expect(client['currentState']).toBe('multiline');
      expect(client['multilineState'].isActive).toBe(true);
      
      // 切换回单行模式
      client.toggleMultilineMode();
      expect(client['currentState']).toBe('single');
      expect(client['multilineState'].isActive).toBe(false);
    });
  });

  describe('会话管理', () => {
    it('应该能够创建新会话', () => {
      // 模拟会话管理器
      const mockSessionManager = {
        agent: {},
        setCallbacks: vi.fn(),
        sendMessageToAgent: vi.fn().mockResolvedValue('response'),
        createSession: vi.fn().mockReturnValue('new-session-id'),
        getSessionCount: vi.fn().mockReturnValue(1)
      };

      client.setSessionManager(mockSessionManager);
      client.newSession();

      expect(mockSessionManager.createSession).toHaveBeenCalled();
      expect(client.currentSessionId).toBe('new-session-id');
    });

    it('应该能够设置会话管理器', () => {
      const mockSessionManager = {
        agent: {},
        setCallbacks: vi.fn(),
        sendMessageToAgent: vi.fn(),
        createSession: vi.fn(),
        getSessionCount: vi.fn()
      };

      client.setSessionManager(mockSessionManager);

      expect(client.sessionManager).toBe(mockSessionManager);
      expect(mockSessionManager.setCallbacks).toHaveBeenCalled();
    });
  });

  describe('错误处理', () => {
    it('应该处理没有会话管理器的情况', async () => {
      // 不设置会话管理器
      const result = client.sendMessageToAgent('test message');
      
      // 应该不会抛出错误
      expect(result).resolves.toBeUndefined();
    });

    it('应该处理无效的新会话请求', () => {
      // 不设置会话管理器
      expect(() => client.newSession()).not.toThrow();
    });
  });
}); 