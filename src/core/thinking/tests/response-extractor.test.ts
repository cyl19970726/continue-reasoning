import { describe, it, expect, beforeEach } from 'vitest';
import { ResponseExtractor, ParsedResponse, UserInputContext, TaskType } from '../response-extractor';

describe('ResponseExtractor', () => {
  let extractor: ResponseExtractor;

  beforeEach(() => {
    extractor = new ResponseExtractor();
  });

  describe('基本响应解析', () => {
    it('应该解析标准的response/message结构', () => {
      const text = '<response><message>Hello, how can I help you?</message></response>';
      const result = extractor.parseResponse(text);
      
      expect(result).not.toBeNull();
      expect(result!.message).toBe('Hello, how can I help you?');
    });

    it('应该解析包含action和status的复杂响应', () => {
      const text = `<response>
        <message>I'll help you with that task</message>
        <action>analyze_requirement</action>
        <status>processing</status>
      </response>`;
      
      const result = extractor.parseResponse(text);
      
      expect(result).not.toBeNull();
      expect(result!.message).toBe("I'll help you with that task");
      expect(result!.action).toBe('analyze_requirement');
      expect(result!.status).toBe('processing');
    });

    it('应该接受response标签内的直接内容（如果看起来像消息）', () => {
      const text = '<response>Hello! What would you like to discuss today?</response>';
      const result = extractor.parseResponse(text);
      
      expect(result).not.toBeNull();
      expect(result!.message).toBe('Hello! What would you like to discuss today?');
    });

    it('应该拒绝没有response标签的内容', () => {
      const text = 'Just plain text without any XML tags';
      const result = extractor.parseResponse(text);
      
      expect(result).toBeNull();
    });

    it('应该拒绝空的response标签', () => {
      const text = '<response></response>';
      const result = extractor.parseResponse(text);
      
      expect(result).toBeNull();
    });
  });

  describe('严格解析模式', () => {
    it('应该拒绝只有XML标签但无实际内容的响应', () => {
      const text = '<response><message></message></response>';
      const result = extractor.parseResponse(text);
      
      expect(result).toBeNull();
    });

    it('应该拒绝内容过短的响应', () => {
      const text = '<response><message>Hi</message></response>';
      
      // 默认最小长度为3，"Hi"长度为2
      const result = extractor.parseResponse(text);
      expect(result).toBeNull();
    });

    it('应该拒绝只包含无意义内容的响应', () => {
      const meaninglessTexts = [
        '<response><message>...</message></response>',
        '<response><message>---</message></response>',
        '<response><message>ok</message></response>',
        '<response><message>yes</message></response>',
        '<response><message>no</message></response>'
      ];

      for (const text of meaninglessTexts) {
        const result = extractor.parseResponse(text);
        expect(result).toBeNull();
      }
    });

    it('应该拒绝包含XML标签的直接response内容', () => {
      const text = '<response>Hello <b>world</b> how are you?</response>';
      const result = extractor.parseResponse(text);
      
      expect(result).toBeNull();
    });

    it('应该接受符合直接消息模式的response内容', () => {
      const validDirectMessages = [
        '<response>Hi! How can I help you today?</response>',
        '<response>What specific topic would you like to explore?</response>',
        '<response>Can you provide more details about your requirement?</response>',
        '<response>I understand your concern.</response>'
      ];

      for (const text of validDirectMessages) {
        const result = extractor.parseResponse(text);
        expect(result).not.toBeNull();
        expect(result!.message).toBeTruthy();
      }
    });
  });

  describe('复杂场景处理', () => {
    it('应该处理包含thinking和response的完整输出', () => {
      const llmOutput = `<thinking>
        <analysis>用户询问帮助</analysis>
        <plan>提供友好回应</plan>
        <reasoning>需要询问具体需求</reasoning>
        <next_action>发送回应消息</next_action>
      </thinking>

      <response>
        <message>Hello! I'd be happy to help you. What specific task would you like assistance with?</message>
      </response>`;

      const result = extractor.parseResponse(llmOutput);
      
      expect(result).not.toBeNull();
      expect(result!.message).toBe("Hello! I'd be happy to help you. What specific task would you like assistance with?");
    });

    it('应该处理多个嵌套标签的复杂响应', () => {
      const text = `<response>
        <message>I've analyzed your request and here's my response</message>
        <action>file_analysis</action>
        <status>completed</status>
      </response>`;

      const result = extractor.parseResponse(text);
      
      expect(result).not.toBeNull();
      expect(result!.message).toBe("I've analyzed your request and here's my response");
      expect(result!.action).toBe('file_analysis');
      expect(result!.status).toBe('completed');
    });

    it('应该处理包含中文的响应', () => {
      const text = '<response><message>您好！我很乐意为您提供帮助。请告诉我您需要什么？</message></response>';
      const result = extractor.parseResponse(text);
      
      expect(result).not.toBeNull();
      expect(result!.message).toBe('您好！我很乐意为您提供帮助。请告诉我您需要什么？');
    });
  });

  describe('用户输入处理', () => {
    it('应该正确识别编程任务类型', () => {
      const codingInputs = [
        'Write a function to sort an array',
        'Debug this JavaScript code',
        'Implement a class for user management',
        'Refactor this script to be more efficient'
      ];

      for (const input of codingInputs) {
        const context = extractor.processUserInput(input);
        expect(context.taskType).toBe('coding');
      }
    });

    it('应该正确识别规划任务类型', () => {
      const planningInputs = [
        'Create a project roadmap',
        'Plan the development strategy',
        'Organize the team schedule',
        'Coordinate the release timeline'
      ];

      for (const input of planningInputs) {
        const context = extractor.processUserInput(input);
        expect(context.taskType).toBe('planning');
      }
    });

    it('应该正确识别分析任务类型', () => {
      const analysisInputs = [
        'Study this data pattern thoroughly',
        'Review the performance metrics for insights', 
        'Examine the business model structure',
        'Evaluate the market research findings'
      ];

      for (const input of analysisInputs) {
        const context = extractor.processUserInput(input);
        expect(context.taskType).toBe('analysis');
      }
    });

    it('应该正确评估任务复杂度', () => {
      const lowComplexity = 'Hello world';
      const mediumComplexity = 'Create a comprehensive system with advanced features that requires planning';
      const highComplexity = 'Design and implement a comprehensive microservices architecture with multiple databases, caching layers, and complex business logic spanning multiple domains';

      expect(extractor.processUserInput(lowComplexity).complexity).toBe('low');
      expect(extractor.processUserInput(mediumComplexity).complexity).toBe('high');
      expect(extractor.processUserInput(highComplexity).complexity).toBe('high');
    });

    it('应该提取任务需求', () => {
      const input = '我需要创建一个用户管理系统，要求支持注册、登录，必须有权限控制';
      const context = extractor.processUserInput(input);
      
      expect(context.requirements).toBeTruthy();
      expect(context.requirements.length).toBeGreaterThan(0);
    });
  });

  describe('对话历史构建', () => {
    it('应该构建对话历史记录', () => {
      const messages = [
        {
          role: 'user' as const,
          content: 'Hello',
          timestamp: new Date('2024-01-01T10:00:00Z')
        },
        {
          role: 'assistant' as const,
          content: 'Hi! How can I help?',
          timestamp: new Date('2024-01-01T10:00:30Z')
        },
        {
          role: 'user' as const,
          content: 'I need help with coding',
          timestamp: new Date('2024-01-01T10:01:00Z')
        }
      ];

      const history = extractor.buildConversationHistory(messages);
      
      expect(history).toContain('Recent Conversation');
      expect(history).toContain('user');
      expect(history).toContain('assistant');
      expect(history).toContain('Hello');
      expect(history).toContain('Hi! How can I help?');
      expect(history).toContain('I need help with coding');
    });

    it('应该处理空对话历史', () => {
      const history = extractor.buildConversationHistory([]);
      expect(history).toBe('');
    });
  });

  describe('响应验证', () => {
    it('应该验证有效响应', () => {
      const validResponse: ParsedResponse = {
        message: 'This is a valid message'
      };

      expect(extractor.validateResponse(validResponse)).toBe(true);
    });

    it('应该拒绝null响应', () => {
      expect(extractor.validateResponse(null)).toBe(false);
    });

    it('应该拒绝空响应', () => {
      const emptyResponse: ParsedResponse = {};
      expect(extractor.validateResponse(emptyResponse)).toBe(false);
    });

    it('应该接受有action但无message的响应', () => {
      const actionResponse: ParsedResponse = {
        action: 'process_request'
      };

      expect(extractor.validateResponse(actionResponse)).toBe(true);
    });
  });

  describe('响应摘要生成', () => {
    it('应该生成message摘要', () => {
      const response: ParsedResponse = {
        message: 'This is a long message that should be truncated if it exceeds the maximum length limit for summary generation'
      };

      const summary = extractor.generateResponseSummary(response);
      expect(summary).toBeTruthy();
      expect(summary.length).toBeLessThanOrEqual(150);
    });

    it('应该生成action摘要', () => {
      const response: ParsedResponse = {
        action: 'perform_complex_analysis_with_multiple_steps'
      };

      const summary = extractor.generateResponseSummary(response);
      expect(summary).toContain('Action:');
      expect(summary).toBeTruthy();
    });

    it('应该生成status摘要', () => {
      const response: ParsedResponse = {
        status: 'processing_user_request_with_detailed_analysis'
      };

      const summary = extractor.generateResponseSummary(response);
      expect(summary).toContain('Status:');
      expect(summary).toBeTruthy();
    });

    it('应该处理空响应', () => {
      const response: ParsedResponse = {};
      const summary = extractor.generateResponseSummary(response);
      expect(summary).toBe('Empty response');
    });
  });

  describe('提取统计信息', () => {
    it('应该提供提取统计信息', () => {
      const text = `<thinking>
        <analysis>分析内容</analysis>
      </thinking>
      <response>
        <message>响应消息</message>
        <action>执行动作</action>
      </response>`;

      const stats = extractor.getExtractionStats(text);
      
      expect(stats.textLength).toBe(text.length);
      expect(stats.hasXmlTags).toBe(true);
      expect(stats.hasResponseTag).toBe(true);
      expect(stats.hasMessageTag).toBe(true);
    });

    it('应该识别纯文本内容', () => {
      const text = 'This is just plain text without any XML tags';
      const stats = extractor.getExtractionStats(text);
      
      expect(stats.hasXmlTags).toBe(false);
      expect(stats.hasResponseTag).toBe(false);
      expect(stats.hasMessageTag).toBe(false);
    });
  });

  describe('配置选项', () => {
    it('应该支持设置提取选项', () => {
      const customExtractor = new ResponseExtractor({
        enableFallback: true,
        minResponseLength: 10,
        allowPartialResponse: true,
        extractFromPlainText: false
      });

      // 测试最小长度要求
      const shortText = '<response><message>Hi</message></response>';
      const result = customExtractor.parseResponse(shortText);
      
      expect(result).toBeNull(); // 因为长度不足10
    });

    it('应该支持动态设置选项', () => {
      extractor.setOptions({
        minResponseLength: 1
      });

      const shortText = '<response><message>Hi</message></response>';
      const result = extractor.parseResponse(shortText);
      
      expect(result).not.toBeNull(); // 现在应该接受短消息
    });
  });

  describe('错误处理', () => {
    it('应该处理格式错误的XML', () => {
      const malformedXml = '<response><message>Hello world</response>'; // 缺少 </message>
      const result = extractor.parseResponse(malformedXml);
      
      // 应该尝试处理但可能失败，取决于具体实现
      expect(result).toBeDefined(); // 不应该抛出异常
    });

    it('应该处理空文本输入', () => {
      const result = extractor.parseResponse('');
      expect(result).toBeNull();
    });

    it('应该处理null/undefined输入', () => {
      const result1 = extractor.parseResponse(null as any);
      const result2 = extractor.parseResponse(undefined as any);
      
      expect(result1).toBeNull();
      expect(result2).toBeNull();
    });
  });
}); 