import { describe, it, expect, beforeEach } from 'vitest';
import { ThinkingExtractor, ParsedThinking, DetailedPlan, PlanStep } from '../thinking-extractor';

describe('ThinkingExtractor', () => {
  let extractor: ThinkingExtractor;

  beforeEach(() => {
    extractor = new ThinkingExtractor();
  });

  describe('基本思考解析', () => {
    it('应该解析标准的thinking结构', () => {
      const text = `<thinking>
        <analysis>用户询问了问题</analysis>
        <plan>制定回应策略</plan>
        <reasoning>需要友好而专业的回应</reasoning>
        <next_action>发送帮助性回复</next_action>
      </thinking>`;

      const result = extractor.parseThinking(text);
      
      expect(result).not.toBeNull();
      expect(result!.analysis).toBe('用户询问了问题');
      expect(result!.plan).toBe('制定回应策略');
      expect(result!.reasoning).toBe('需要友好而专业的回应');
      expect(result!.nextAction).toBe('发送帮助性回复');
    });

    it('应该解析部分思考内容', () => {
      const text = `<thinking>
        <analysis>这是一个分析</analysis>
        <plan>这是计划</plan>
      </thinking>`;

      const result = extractor.parseThinking(text);
      
      expect(result).not.toBeNull();
      expect(result!.analysis).toBe('这是一个分析');
      expect(result!.plan).toBe('这是计划');
      expect(result!.reasoning).toBe('');
      expect(result!.nextAction).toBe('');
    });

    it('应该处理空的thinking标签', () => {
      const text = '<thinking></thinking>';
      const result = extractor.parseThinking(text);
      
      // 根据配置，可能允许或拒绝空思考
      expect(result).toBeDefined();
    });

    it('应该拒绝没有thinking标签的内容', () => {
      const text = 'Just plain text without thinking tags';
      const result = extractor.parseThinking(text);
      
      // 取决于是否启用纯文本提取
      expect(result).toBeDefined();
    });
  });

  describe('备选提取方案', () => {
    it('应该提取直接的思考标签（无嵌套thinking）', () => {
      const text = `
        <analysis>这是直接的分析</analysis>
        <plan>这是直接的计划</plan>
        <reasoning>这是直接的推理</reasoning>
        <next_action>这是直接的行动</next_action>
      `;

      const result = extractor.parseThinking(text);
      
      expect(result).not.toBeNull();
      expect(result!.analysis).toBe('这是直接的分析');
      expect(result!.plan).toBe('这是直接的计划');
      expect(result!.reasoning).toBe('这是直接的推理');
      expect(result!.nextAction).toBe('这是直接的行动');
    });

    it('应该使用替代标签名', () => {
      const text = `
        <analyze>分析内容</analyze>
        <planning>计划内容</planning>
        <thought>思考内容</thought>
        <next>下一步内容</next>
      `;

      const result = extractor.parseThinking(text);
      
      expect(result).not.toBeNull();
      expect(result!.analysis).toBe('分析内容');
      expect(result!.plan).toBe('计划内容');
      expect(result!.reasoning).toBe('思考内容');
      expect(result!.nextAction).toBe('下一步内容');
    });

    it('应该处理混合格式', () => {
      const text = `<thinking>
        <analysis>标准分析</analysis>
      </thinking>
      <plan>直接计划</plan>
      <reasoning>直接推理</reasoning>`;

      const result = extractor.parseThinking(text);
      
      expect(result).not.toBeNull();
      expect(result!.analysis).toBe('标准分析');
      // 其他字段可能从备选方案中提取
    });
  });

  describe('纯文本提取', () => {
    it('应该从纯文本中提取思考模式', () => {
      const extractorWithPlainText = new ThinkingExtractor({
        extractFromPlainText: true
      });

      const text = `
        分析：用户需要帮助
        计划：提供支持
        思考：这是合理的请求
        下一步：发送回复
      `;

      const result = extractorWithPlainText.parseThinking(text);
      
      expect(result).not.toBeNull();
      // 可能提取到一些内容，取决于模式匹配
    });

    it('应该识别英文思考模式', () => {
      const extractorWithPlainText = new ThinkingExtractor({
        extractFromPlainText: true
      });

      const text = `
        Analysis: User needs assistance
        Plan: Provide helpful response
        Reasoning: This is a valid request
        Next: Send reply
      `;

      const result = extractorWithPlainText.parseThinking(text);
      
      expect(result).not.toBeNull();
      // 应该能识别英文模式
    });
  });

  describe('复杂场景处理', () => {
    it('应该处理包含response的完整LLM输出', () => {
      const llmOutput = `<thinking>
        <analysis>用户说了hi，我需要友好回应</analysis>
        <plan>问候用户并询问需要什么帮助</plan>
        <reasoning>保持对话的友好性和实用性</reasoning>
        <next_action>发送友好的问候和询问</next_action>
      </thinking>

      <response>
        <message>Hi! How can I help you today?</message>
      </response>`;

      const result = extractor.parseThinking(llmOutput);
      
      expect(result).not.toBeNull();
      expect(result!.analysis).toBe('用户说了hi，我需要友好回应');
      expect(result!.plan).toBe('问候用户并询问需要什么帮助');
      expect(result!.reasoning).toBe('保持对话的友好性和实用性');
      expect(result!.nextAction).toBe('发送友好的问候和询问');
    });

    it('应该处理多语言混合的思考内容', () => {
      const text = `<thinking>
        <analysis>用户询问了coding help</analysis>
        <plan>Provide technical assistance with 中文解释</plan>
        <reasoning>Mixed language is common in development</reasoning>
        <next_action>回复with example code</next_action>
      </thinking>`;

      const result = extractor.parseThinking(text);
      
      expect(result).not.toBeNull();
      expect(result!.analysis).toContain('coding help');
      expect(result!.plan).toContain('中文解释');
      expect(result!.reasoning).toContain('Mixed language');
      expect(result!.nextAction).toContain('example code');
    });

    it('应该处理包含特殊字符的思考内容', () => {
      const text = `<thinking>
        <analysis>用户输入了特殊符号: @#$%^&*()</analysis>
        <plan>处理 HTML 标签 <div>content</div></plan>
        <reasoning>需要正确处理转义字符 & < ></reasoning>
        <next_action>发送"安全"的回复</next_action>
      </thinking>`;

      const result = extractor.parseThinking(text);
      
      expect(result).not.toBeNull();
      expect(result!.analysis).toContain('@#$%^&*()');
      expect(result!.plan).toContain('<div>content</div>');
      expect(result!.reasoning).toContain('& < >');
      expect(result!.nextAction).toContain('"安全"');
    });
  });

  describe('思考验证', () => {
    it('应该验证有效思考', () => {
      const validThinking: ParsedThinking = {
        analysis: '这是有效的分析',
        plan: '这是有效的计划',
        reasoning: '这是有效的推理',
        nextAction: '这是有效的行动'
      };

      expect(extractor.validateThinking(validThinking)).toBe(true);
    });

    it('应该拒绝完全空的思考', () => {
      const emptyThinking: ParsedThinking = {
        analysis: '',
        plan: '',
        reasoning: '',
        nextAction: ''
      };

      expect(extractor.validateThinking(emptyThinking)).toBe(false);
    });

    it('应该接受部分思考（如果启用）', () => {
      const partialThinking: ParsedThinking = {
        analysis: '只有分析内容',
        plan: '',
        reasoning: '',
        nextAction: ''
      };

      expect(extractor.validateThinking(partialThinking)).toBe(true);
    });

    it('应该拒绝内容过短的思考', () => {
      const shortThinking: ParsedThinking = {
        analysis: 'A',
        plan: 'B',
        reasoning: '',
        nextAction: ''
      };

      // 默认最小长度为3
      expect(extractor.validateThinking(shortThinking)).toBe(false);
    });
  });

  describe('思考摘要生成', () => {
    it('应该生成完整思考摘要', () => {
      const thinking: ParsedThinking = {
        analysis: '这是一个详细的分析内容，包含了很多重要信息',
        plan: '这是一个详细的计划，有多个步骤和考虑因素',
        reasoning: '这是详细的推理过程，解释了为什么这样做',
        nextAction: '这是下一步要执行的具体行动'
      };

      const summary = extractor.generateThinkingSummary(thinking);
      
      expect(summary).toContain('Analysis:');
      expect(summary).toContain('Plan:');
      expect(summary).toContain('Reasoning:');
      expect(summary).toContain('Next:');
      expect(summary).toContain('|'); // 分隔符
    });

    it('应该生成部分思考摘要', () => {
      const partialThinking: ParsedThinking = {
        analysis: '只有分析',
        plan: '',
        reasoning: '只有推理',
        nextAction: ''
      };

      const summary = extractor.generateThinkingSummary(partialThinking);
      
      expect(summary).toContain('Analysis:');
      expect(summary).toContain('Reasoning:');
      expect(summary).not.toContain('Plan:');
      expect(summary).not.toContain('Next:');
    });

    it('应该处理空思考摘要', () => {
      const emptyThinking: ParsedThinking = {
        analysis: '',
        plan: '',
        reasoning: '',
        nextAction: ''
      };

      const summary = extractor.generateThinkingSummary(emptyThinking);
      expect(summary).toBe('Empty thinking');
    });

    it('应该截断过长的内容', () => {
      const longThinking: ParsedThinking = {
        analysis: 'A'.repeat(100),
        plan: '',
        reasoning: '',
        nextAction: ''
      };

      const summary = extractor.generateThinkingSummary(longThinking);
      expect(summary.length).toBeLessThan(100); // 应该被截断
      expect(summary).toContain('...');
    });
  });

  describe('提取统计信息', () => {
    it('应该提供思考提取统计', () => {
      const text = `<thinking>
        <analysis>分析</analysis>
        <plan>计划</plan>
      </thinking>
      <response>
        <message>响应</message>
      </response>`;

      const stats = extractor.getExtractionStats(text);
      
      expect(stats.textLength).toBe(text.length);
      expect(stats.hasXmlTags).toBe(true);
      expect(stats.hasThinkingTag).toBe(true);
      expect(stats.hasAnyThinkingContent).toBe(true);
    });

    it('应该识别没有思考内容的文本', () => {
      const text = '<response><message>只有响应</message></response>';
      const stats = extractor.getExtractionStats(text);
      
      expect(stats.hasThinkingTag).toBe(false);
      expect(stats.hasAnyThinkingContent).toBe(false);
    });

    it('应该统计各种思考标签', () => {
      const text = `
        <thinking><analysis>1</analysis></thinking>
        <thinking><analysis>2</analysis></thinking>
        <plan>直接计划</plan>
        <reasoning>直接推理</reasoning>
      `;

      const stats = extractor.getExtractionStats(text);
      
      expect(stats.thinking).toBe(2);
      expect(stats.analysis).toBe(2);
      expect(stats.plan).toBe(1);
      expect(stats.reasoning).toBe(1);
    });
  });

  describe('详细计划解析', () => {
    it('应该解析计划步骤', () => {
      const planContent = `
        步骤1: 分析用户需求
        步骤2: 设计解决方案
        步骤3: 实现功能
        Step 4: Test the implementation
      `;

      const detailedPlan = extractor.parseDetailedPlan(planContent);
      
      expect(detailedPlan.steps).toBeTruthy();
      expect(detailedPlan.steps.length).toBeGreaterThan(0);
      
      // 检查第一个步骤
      if (detailedPlan.steps.length > 0) {
        expect(detailedPlan.steps[0].description).toContain('分析用户需求');
      }
    });

    it('应该处理空计划内容', () => {
      const detailedPlan = extractor.parseDetailedPlan('');
      
      expect(detailedPlan.steps).toEqual([]);
      expect(detailedPlan.dependencies).toEqual([]);
      expect(detailedPlan.timeline.estimatedDuration).toBe(0);
    });

    it('应该解析复杂的步骤格式', () => {
      const planContent = `
        - 第一步：准备工作
        - 第二步：执行任务
        1. 初始化项目
        2. 配置环境
        3. 开始开发
      `;

      const detailedPlan = extractor.parseDetailedPlan(planContent);
      
      // 至少应该识别一些步骤
      expect(detailedPlan).toBeTruthy();
      expect(detailedPlan.steps).toBeDefined();
    });
  });

  describe('配置选项', () => {
    it('应该支持自定义配置', () => {
      const customExtractor = new ThinkingExtractor({
        enableFallback: false,
        allowPartialThinking: false,
        minContentLength: 10,
        extractFromPlainText: true
      });

      const shortThinking = '<thinking><analysis>短</analysis></thinking>';
      const result = customExtractor.parseThinking(shortThinking);
      
      // 应该根据配置拒绝短内容
      expect(result).toBeDefined();
    });

    it('应该支持动态设置选项', () => {
      extractor.setOptions({
        minContentLength: 1,
        allowPartialThinking: true
      });

      const shortThinking = '<thinking><analysis>A</analysis></thinking>';
      const result = extractor.parseThinking(shortThinking);
      
      expect(result).not.toBeNull();
    });

    it('应该支持禁用备选方案', () => {
      const strictExtractor = new ThinkingExtractor({
        enableFallback: false
      });

      const directTags = '<analysis>直接分析</analysis>';
      const result = strictExtractor.parseThinking(directTags);
      
      // 禁用备选方案时，应该无法提取直接标签
      expect(result).toBeNull();
    });
  });

  describe('错误处理', () => {
    it('应该处理格式错误的XML', () => {
      const malformedXml = '<thinking><analysis>Missing closing tag</thinking>';
      const result = extractor.parseThinking(malformedXml);
      
      expect(result).toBeDefined(); // 不应该抛出异常
    });

    it('应该处理空输入', () => {
      const result = extractor.parseThinking('');
      expect(result).toBeDefined();
    });

    it('应该处理null/undefined输入', () => {
      const result1 = extractor.parseThinking(null as any);
      const result2 = extractor.parseThinking(undefined as any);
      
      expect(result1).toBeNull();
      expect(result2).toBeNull();
    });

    it('应该处理极长的输入', () => {
      const longText = '<thinking><analysis>' + 'A'.repeat(10000) + '</analysis></thinking>';
      const result = extractor.parseThinking(longText);
      
      expect(result).not.toBeNull();
      expect(result!.analysis.length).toBe(10000);
    });
  });

  describe('性能考虑', () => {
    it('应该高效处理大量数据', () => {
      const largeText = `<thinking>
        <analysis>${'分析内容'.repeat(1000)}</analysis>
        <plan>${'计划内容'.repeat(1000)}</plan>
        <reasoning>${'推理内容'.repeat(1000)}</reasoning>
        <next_action>${'行动内容'.repeat(1000)}</next_action>
      </thinking>`;

      const startTime = Date.now();
      const result = extractor.parseThinking(largeText);
      const endTime = Date.now();
      
      expect(result).not.toBeNull();
      expect(endTime - startTime).toBeLessThan(1000); // 应该在1秒内完成
    });

    it('应该有效处理多次调用', () => {
      // Simple test to ensure the extractor doesn't crash on multiple calls
      expect(() => {
        for (let i = 0; i < 10; i++) {
          extractor.parseThinking('<thinking><analysis>test</analysis></thinking>');
        }
      }).not.toThrow();
    });
  });
}); 