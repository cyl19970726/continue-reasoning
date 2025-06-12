import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WebUIClient } from '@continue-reasoning/web/client/webUIClient';
import { EventBus } from '@continue-reasoning/core/events/eventBus';

describe('WebUIClient', () => {
  let eventBus: EventBus;
  let webUIClient: WebUIClient;

  beforeEach(async () => {
    eventBus = new EventBus();
    await eventBus.start();
    
    webUIClient = WebUIClient.createDefault(eventBus);
  });

  afterEach(async () => {
    if (webUIClient) {
      await webUIClient.stop();
    }
    if (eventBus) {
      await eventBus.stop();
    }
  });

  describe('Basic Functionality', () => {
    it('should create a WebUIClient with default configuration', () => {
      expect(webUIClient).toBeDefined();
      expect(webUIClient).toBeInstanceOf(WebUIClient);
    });

    it('should have correct capabilities', () => {
      const capabilities = webUIClient.getCapabilities();
      
      expect(capabilities.supportsRealTimeUpdates).toBe(true);
      expect(capabilities.supportsInteractiveApproval).toBe(true);
      expect(capabilities.supportsCollaboration).toBe(true);
      expect(capabilities.maxConcurrentSessions).toBe(10);
      expect(capabilities.supportedEventTypes).toContain('approval_request');
      expect(capabilities.supportedEventTypes).toContain('status_update');
    });

    it('should provide Web UI specific capabilities', () => {
      const webCapabilities = webUIClient.getWebUICapabilities();
      
      expect(webCapabilities.supportsFileUpload).toBe(true);
      expect(webCapabilities.supportsCodeHighlighting).toBe(true);
      expect(webCapabilities.supportsRealTimeCollaboration).toBe(true);
      expect(webCapabilities.maxFileSize).toBeGreaterThan(0);
      expect(webCapabilities.supportedFileTypes).toContain('.js');
      expect(webCapabilities.supportedFileTypes).toContain('.ts');
    });
  });

  describe('Configuration', () => {
    it('should use custom configuration', () => {
      const customClient = new WebUIClient({
        name: 'Custom Web UI',
        capabilities: {
          supportsRealTimeUpdates: true,
          supportsFilePreview: false,
          supportsCodeHighlighting: false,
          supportsInteractiveApproval: false,
          supportsCollaboration: false,
          maxConcurrentSessions: 5,
          supportedEventTypes: ['status_update']
        },
        eventBus,
        serverPort: 3001,
        enableFileUpload: false
      });

      expect(customClient).toBeInstanceOf(WebUIClient);
      
      const capabilities = customClient.getWebUICapabilities();
      expect(capabilities.supportsFileUpload).toBe(false);
    });
  });

  describe('Statistics', () => {
    it('should provide initial statistics', () => {
      const stats = webUIClient.getWebUIStats();
      
      expect(stats).toHaveProperty('activeConnections');
      expect(stats).toHaveProperty('totalMessages');
      expect(stats).toHaveProperty('sessionsCreated');
      expect(stats).toHaveProperty('uptime');
      expect(stats).toHaveProperty('memoryUsage');
      
      expect(stats.activeConnections).toBe(0);
      expect(stats.totalMessages).toBe(0);
      expect(stats.sessionsCreated).toBe(0);
      expect(stats.uptime).toBeGreaterThanOrEqual(0);
      expect(stats.memoryUsage).toBeGreaterThan(0);
    });
  });

  describe('Message Handling', () => {
    it('should handle sendMessage correctly', async () => {
      const message = {
        id: 'test-id',
        timestamp: Date.now(),
        type: 'status_update' as const,
        source: 'user' as const,
        sessionId: 'test-session',
        payload: {
          stage: 'testing' as const,
          message: 'Test message'
        }
      };

      // This should not throw an error
      await expect(webUIClient.sendMessage(message)).resolves.toBeUndefined();
    });
  });

  describe('Lifecycle', () => {
    it('should start and stop correctly', async () => {
      // Starting should not throw
      await expect(webUIClient.start()).resolves.toBeUndefined();
      
      // Stopping should not throw
      await expect(webUIClient.stop()).resolves.toBeUndefined();
    });

    it('should handle multiple start calls gracefully', async () => {
      await webUIClient.start();
      
      // Second start should not throw
      await expect(webUIClient.start()).resolves.toBeUndefined();
    });

    it('should handle stop when not running', async () => {
      // Stop without starting should not throw
      await expect(webUIClient.stop()).resolves.toBeUndefined();
    });
  });
}); 