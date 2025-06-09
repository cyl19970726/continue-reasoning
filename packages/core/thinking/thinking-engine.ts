import { ThinkingExtractor, ParsedThinking } from './thinking-extractor';
import { ResponseExtractor, ParsedResponse } from './response-extractor';
import { ILLM, ToolCallDefinition, ToolCallParams } from '../interfaces';
import { logger } from '../context';

export interface LLMResponse {
  thinking: ParsedThinking | null;
  response: ParsedResponse | null;
  toolCalls: ToolCallParams[];
  rawText: string;
}

export class ThinkingEngine {
  private thinkingExtractor: ThinkingExtractor;
  private responseExtractor: ResponseExtractor;
  private llm: ILLM;

  constructor(llm: ILLM) {
    this.llm = llm;
    this.thinkingExtractor = new ThinkingExtractor();
    this.responseExtractor = new ResponseExtractor();
  }

  /**
   * 包装的 LLM 调用，自动解析思考和响应
   * 支持流式和非流式调用
   */
  async call(prompt: string, tools: ToolCallDefinition[] = []): Promise<LLMResponse> {
    try {
      // 根据 LLM 的 streaming 属性选择调用方式
      const { text, toolCalls } = this.llm.streaming ? 
                                 await this.llm.streamCall(prompt, tools) : 
                                 await this.llm.call(prompt, tools);
      
      // 解析思考内容
      const thinking = this.thinkingExtractor.parseThinking(text);
      
      // 解析响应内容
      const response = this.responseExtractor.parseResponse(text);
      
      // 验证解析结果
      this.validateParsedContent(thinking, response, text);
      
      return {
        thinking,
        response,
        toolCalls: toolCalls || [],
        rawText: text
      };
    } catch (error) {
      console.error('ThinkingEngine call failed:', error);
      throw error;
    }
  }

  /**
   * 获取思考摘要
   */
  getThinkingSummary(thinking: ParsedThinking): string {
    return this.thinkingExtractor.generateThinkingSummary(thinking);
  }

  /**
   * 获取响应摘要
   */
  getResponseSummary(response: ParsedResponse): string {
    return this.responseExtractor.generateResponseSummary(response);
  }

  /**
   * 生成对话历史（公共方法，供 ThinkingOrchestrator 使用）
   */
  buildConversationHistory(messages: any[]): string {
    return this.responseExtractor.buildConversationHistory(messages);
  }

  /**
   * 验证思考质量
   */
  assessThinkingQuality(thinking: ParsedThinking): ThinkingQuality {
    const completeness = this.thinkingExtractor.validateThinking(thinking);
    const analysisDepth = this.assessAnalysisDepth(thinking.analysis);
    const planClarity = this.assessPlanClarity(thinking.plan);
    const reasoningLogic = this.assessReasoningLogic(thinking.reasoning);
    
    return {
      completeness,
      analysisDepth,
      planClarity,
      reasoningLogic,
      overallScore: this.calculateOverallScore(completeness, analysisDepth, planClarity, reasoningLogic)
    };
  }

  /**
   * 生成思考改进建议
   */
  generateImprovementSuggestions(thinking: ParsedThinking): string[] {
    const suggestions: string[] = [];
    
    if (!thinking.analysis || thinking.analysis.length < 50) {
      suggestions.push('分析部分需要更详细，应包含对当前任务、约束条件和可用资源的深入分析');
    }
    
    if (!thinking.plan || thinking.plan.split('\n').length < 3) {
      suggestions.push('计划部分需要更具体，应包含清晰的步骤和验证方法');
    }
    
    if (!thinking.reasoning || thinking.reasoning.length < 30) {
      suggestions.push('推理部分需要更充分，应解释为什么选择这种方法以及考虑的替代方案');
    }
    
    if (!thinking.nextAction || thinking.nextAction.length < 30) {
      suggestions.push('下一步行动需要更明确，应指出具体要使用的工具类型和执行策略');
    }
    
    return suggestions;
  }

  private validateParsedContent(thinking: ParsedThinking | null, response: ParsedResponse | null, rawText: string): void {
    // 验证思考完整性（如果有思考内容）
    if (thinking && !this.thinkingExtractor.validateThinking(thinking)) {
      console.warn('Incomplete thinking detected in LLM response:', {
        hasAnalysis: !!thinking.analysis,
        hasPlan: !!thinking.plan,
        hasReasoning: !!thinking.reasoning,
        hasNextAction: !!thinking.nextAction
      });
    }
    
    // 检查是否包含思考标签但解析失败
    if (rawText.includes('<thinking>') && !thinking) {
      logger.warn('Found thinking tags but failed to parse thinking content');
    }
    
    // 检查是否包含响应标签但解析失败（只有在有response标签时才检查）
    if (rawText.includes('<response>') && rawText.includes('<message>') && !response?.message) {
        logger.warn('Found response tags but failed to parse response content');
    }
  }

  private assessAnalysisDepth(analysis: string): 'shallow' | 'moderate' | 'deep' {
    if (!analysis || analysis.length < 30) return 'shallow';
    
    const keywords = ['约束', '限制', '要求', '状态', '环境', '工具', '资源'];
    const keywordCount = keywords.filter(keyword => analysis.includes(keyword)).length;
    
    if (keywordCount >= 3 && analysis.length > 100) return 'deep';
    if (keywordCount >= 2 || analysis.length > 60) return 'moderate';
    return 'shallow';
  }

  private assessPlanClarity(plan: string): 'unclear' | 'basic' | 'clear' {
    if (!plan || plan.length < 20) return 'unclear';
    
    const stepMarkers = plan.match(/(?:步骤|Step|stage|phase|\d+[\.、])/gi);
    const hasValidation = /(?:验证|测试|检查|确认)/i.test(plan);
    
    if (stepMarkers && stepMarkers.length >= 3 && hasValidation) return 'clear';
    if (stepMarkers && stepMarkers.length >= 2) return 'basic';
    return 'unclear';
  }

  private assessReasoningLogic(reasoning: string): 'weak' | 'adequate' | 'strong' {
    if (!reasoning || reasoning.length < 20) return 'weak';
    
    const hasJustification = /(?:因为|原因|选择|why|because)/i.test(reasoning);
    const hasAlternatives = /(?:替代|alternative|other|另一种)/i.test(reasoning);
    const hasRisks = /(?:风险|risk|问题|issue|challenge)/i.test(reasoning);
    
    const criteriaCount = [hasJustification, hasAlternatives, hasRisks].filter(Boolean).length;
    
    if (criteriaCount >= 2 && reasoning.length > 80) return 'strong';
    if (criteriaCount >= 1 || reasoning.length > 40) return 'adequate';
    return 'weak';
  }

  private calculateOverallScore(
    completeness: boolean,
    analysisDepth: 'shallow' | 'moderate' | 'deep',
    planClarity: 'unclear' | 'basic' | 'clear',
    reasoningLogic: 'weak' | 'adequate' | 'strong'
  ): number {
    let score = 0;
    
    if (completeness) score += 25;
    
    switch (analysisDepth) {
      case 'deep': score += 25; break;
      case 'moderate': score += 15; break;
      case 'shallow': score += 5; break;
    }
    
    switch (planClarity) {
      case 'clear': score += 25; break;
      case 'basic': score += 15; break;
      case 'unclear': score += 5; break;
    }
    
    switch (reasoningLogic) {
      case 'strong': score += 25; break;
      case 'adequate': score += 15; break;
      case 'weak': score += 5; break;
    }
    
    return score;
  }
}

export interface ThinkingQuality {
  completeness: boolean;
  analysisDepth: 'shallow' | 'moderate' | 'deep';
  planClarity: 'unclear' | 'basic' | 'clear';
  reasoningLogic: 'weak' | 'adequate' | 'strong';
  overallScore: number; // 0-100
} 