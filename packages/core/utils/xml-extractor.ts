import { logger } from "../utils/logger.js";

export interface XmlNode {
  tag: string;
  content: string;
  attributes: Record<string, string>;
  children: XmlNode[];
  parent?: XmlNode;
  raw: string;
}

export interface ExtractionOptions {
  caseSensitive?: boolean;
  preserveWhitespace?: boolean;
  allowEmptyContent?: boolean;
  maxDepth?: number;
  fallbackToRegex?: boolean;
}

export interface ExtractionResult {
  success: boolean;
  content: string;
  node?: XmlNode;
  error?: string;
  alternativeContent?: string; // 备选内容，用于容错
}

/**
 * 🔧 XML 标签提取工具类
 * 
 * 功能特性：
 * - 支持嵌套标签解析
 * - 属性提取
 * - 容错处理
 * - 多种提取模式
 * - CDATA 支持
 * - 命名空间处理
 * 
 * 使用示例：
 * ```typescript
 * const extractor = new XmlExtractor();
 * 
 * // 基本提取
 * const result = extractor.extract(text, 'thinking');
 * 
 * // 嵌套提取
 * const analysis = extractor.extract(text, 'thinking.analysis');
 * 
 * // 多标签提取
 * const sections = extractor.extractMultiple(text, ['analysis', 'plan', 'reasoning']);
 * 
 * // 完整节点解析
 * const node = extractor.parseNode(text, 'response');
 * ```
 */
export class XmlExtractor {
  private options: ExtractionOptions;

  constructor(options: ExtractionOptions = {}) {
    this.options = {
      caseSensitive: false,
      preserveWhitespace: false,
      allowEmptyContent: true,
      maxDepth: 10,
      fallbackToRegex: true,
      ...options
    };
  }

  /**
   * 🎯 主提取方法 - 提取单个标签内容
   * 
   * @param text 待解析文本
   * @param tagPath 标签路径，支持嵌套 (如 'thinking.analysis' 或 'response.message')
   * @param options 可选的提取选项
   * @returns 提取结果
   */
  extract(text: string, tagPath: string, options?: ExtractionOptions): ExtractionResult {
    const opts = { ...this.options, ...options };
    const tags = tagPath.split('.');
    
    try {
      // 尝试完整 XML 解析
      const result = this.extractNested(text, tags, opts);
      if (result.success) {
        return result;
      }

      // 如果启用备选方案，尝试正则表达式
      if (opts.fallbackToRegex) {
        const regexResult = this.extractWithRegex(text, tags[tags.length - 1], opts);
        if (regexResult.success) {
          return { ...regexResult, alternativeContent: regexResult.content };
        }
      }

      return {
        success: false,
        content: '',
        error: `Failed to extract ${tagPath} from text`
      };

    } catch (error) {
      logger.warn(`XmlExtractor: Error extracting ${tagPath}:`, error);
      return {
        success: false,
        content: '',
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * 🎯 批量提取多个标签
   */
  extractMultiple(text: string, tagPaths: string[], options?: ExtractionOptions): Record<string, ExtractionResult> {
    const results: Record<string, ExtractionResult> = {};
    
    for (const tagPath of tagPaths) {
      results[tagPath] = this.extract(text, tagPath, options);
    }
    
    return results;
  }

  /**
   * 🎯 解析完整节点结构
   */
  parseNode(text: string, tagName: string, options?: ExtractionOptions): XmlNode | null {
    const opts = { ...this.options, ...options };
    
    try {
      const node = this.parseXmlNode(text, tagName, opts);
      return node;
    } catch (error) {
      logger.warn(`XmlExtractor: Error parsing node ${tagName}:`, error);
      return null;
    }
  }

  /**
   * 🎯 提取所有同名标签
   */
  extractAll(text: string, tagName: string, options?: ExtractionOptions): ExtractionResult[] {
    const opts = { ...this.options, ...options };
    const results: ExtractionResult[] = [];
    
    try {
      const flags = opts.caseSensitive ? 'g' : 'gi';
      const regex = new RegExp(`<${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tagName}>`, flags);
      let match;
      
      while ((match = regex.exec(text)) !== null) {
        results.push({
          success: true,
          content: this.processContent(match[1], opts)
        });
      }
      
    } catch (error) {
      logger.warn(`XmlExtractor: Error extracting all ${tagName}:`, error);
    }
    
    return results;
  }

  /**
   * 🛠️ 嵌套标签提取
   */
  private extractNested(text: string, tags: string[], options: ExtractionOptions): ExtractionResult {
    let currentText = text;
    let currentTag = '';
    
    for (let i = 0; i < tags.length; i++) {
      currentTag = tags[i];
      const result = this.extractWithRegex(currentText, currentTag, options);
      
      if (!result.success) {
        return {
          success: false,
          content: '',
          error: `Failed to find tag '${currentTag}' in path '${tags.join('.')}'`
        };
      }
      
      currentText = result.content;
    }
    
    return {
      success: true,
      content: currentText
    };
  }

  /**
   * 🛠️ 正则表达式提取（备选方案）
   */
  private extractWithRegex(text: string, tagName: string, options: ExtractionOptions): ExtractionResult {
    try {
      // 处理自闭合标签
      const selfClosingRegex = new RegExp(`<${tagName}(?:\\s[^>]*)?\\s*\\/>`, options.caseSensitive ? 'g' : 'gi');
      if (selfClosingRegex.test(text)) {
        return {
          success: true,
          content: ''
        };
      }

      // 处理CDATA
      const cdataFlags = options.caseSensitive ? 'g' : 'gi';
      const cdataRegex = new RegExp(`<${tagName}(?:\\s[^>]*)?>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*<\\/${tagName}>`, cdataFlags);
      const cdataMatch = text.match(cdataRegex);
      if (cdataMatch) {
        return {
          success: true,
          content: cdataMatch[1]
        };
      }

      // 标准标签提取 - 改进的正则表达式
      const flags = options.caseSensitive ? '' : 'i';
      const regex = new RegExp(`<${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tagName}>`, flags);
      const match = text.match(regex);
      
      if (match) {
        const content = this.processContent(match[1], options);
        return {
          success: true,
          content
        };
      }

      // 尝试查找不完整的标签
      const incompleteRegex = new RegExp(`<${tagName}(?:\\s[^>]*)?>([\\s\\S]*)$`, flags);
      const incompleteMatch = text.match(incompleteRegex);
      if (incompleteMatch) {
        return {
          success: true,
          content: this.processContent(incompleteMatch[1], options),
          error: 'Warning: Incomplete closing tag detected'
        };
      }

      return {
        success: false,
        content: '',
        error: `Tag '${tagName}' not found`
      };

    } catch (error) {
      return {
        success: false,
        content: '',
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * 🛠️ 解析 XML 节点
   */
  private parseXmlNode(text: string, tagName: string, options: ExtractionOptions): XmlNode | null {
    // 这里可以实现更完整的 XML 节点解析
    // 包括属性、子节点等
    const result = this.extractWithRegex(text, tagName, options);
    
    if (!result.success) {
      return null;
    }

    return {
      tag: tagName,
      content: result.content,
      attributes: this.extractAttributes(text, tagName),
      children: [],
      raw: text
    };
  }

  /**
   * 🛠️ 提取标签属性
   */
  private extractAttributes(text: string, tagName: string): Record<string, string> {
    const attributes: Record<string, string> = {};
    
    try {
      const tagRegex = new RegExp(`<${tagName}([^>]*)>`, 'i');
      const match = text.match(tagRegex);
      
      if (match && match[1]) {
        const attrText = match[1];
        const attrRegex = /(\w+)\s*=\s*["']([^"']*)["']/g;
        let attrMatch;
        
        while ((attrMatch = attrRegex.exec(attrText)) !== null) {
          attributes[attrMatch[1]] = attrMatch[2];
        }
      }
    } catch (error) {
      logger.warn('XmlExtractor: Error extracting attributes:', error);
    }
    
    return attributes;
  }

  /**
   * 🛠️ 处理内容
   */
  private processContent(content: string, options: ExtractionOptions): string {
    if (!options.preserveWhitespace) {
      // 移除多余的空白字符，但保留有意义的空格
      content = content.replace(/^\s+|\s+$/g, ''); // 去除首尾空白
      content = content.replace(/\n\s*\n/g, '\n'); // 去除多余空行
      content = content.replace(/[ \t]+/g, ' '); // 合并多个空格
    }
    
    // HTML 实体解码
    content = content
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
    
    return content;
  }

  /**
   * 🛠️ 验证提取结果
   */
  validateResult(result: ExtractionResult, minLength: number = 1): boolean {
    if (!result.success) {
      return false;
    }
    
    if (!this.options.allowEmptyContent && result.content.trim().length < minLength) {
      return false;
    }
    
    return true;
  }

  /**
   * 🛠️ 获取提取统计信息
   */
  getExtractionStats(text: string, tagNames: string[]): Record<string, number> {
    const stats: Record<string, number> = {};
    
    for (const tagName of tagNames) {
      const flags = this.options.caseSensitive ? 'g' : 'gi';
      const regex = new RegExp(`<${tagName}(?:\\s[^>]*)?>`, flags);
      const matches = text.match(regex);
      stats[tagName] = matches ? matches.length : 0;
    }
    
    return stats;
  }

  /**
   * 🔧 设置提取选项
   */
  setOptions(options: Partial<ExtractionOptions>): void {
    this.options = { ...this.options, ...options };
  }

  /**
   * 🎯 Enhanced extraction with type support
   * Extracts content and parses type attributes for typed values
   */
  extractWithType(text: string, tagPath: string, options?: ExtractionOptions): {
    success: boolean;
    content: string;
    type?: string;
    value?: any;
    error?: string;
  } {
    const opts = { ...this.options, ...options };
    const tags = tagPath.split('.');
    const targetTag = tags[tags.length - 1];
    
    try {
      // First extract the content
      const result = this.extract(text, tagPath, opts);
      if (!result.success) {
        return {
          success: false,
          content: '',
          error: result.error
        };
      }

      // Extract attributes from the target tag
      const attributes = this.extractAttributes(text, targetTag);
      const type = attributes.type || 'string';
      const value = this.parseTypedValue(result.content, type);

      return {
        success: true,
        content: result.content,
        type,
        value
      };

    } catch (error) {
      return {
        success: false,
        content: '',
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * 🎯 Enhanced multiple extraction with type support
   */
  extractMultipleWithType(text: string, tagPaths: string[], options?: ExtractionOptions): Record<string, {
    success: boolean;
    content: string;
    type?: string;
    value?: any;
    error?: string;
  }> {
    const results: Record<string, any> = {};
    
    for (const tagPath of tagPaths) {
      results[tagPath] = this.extractWithType(text, tagPath, options);
    }
    
    return results;
  }

  /**
   * 🛠️ Parse typed value based on type attribute
   */
  private parseTypedValue(content: string, type: string): any {
    const trimmedContent = content.trim();
    
    switch (type.toLowerCase()) {
      case 'boolean':
        return trimmedContent.toLowerCase() === 'true';
      
      case 'number':
        const num = parseFloat(trimmedContent);
        return isNaN(num) ? trimmedContent : num;
      
      case 'json':
        try {
          return JSON.parse(trimmedContent);
        } catch {
          return trimmedContent;
        }
      
      case 'string':
      default:
        return trimmedContent;
    }
  }
}

/**
 * 🎯 便捷工厂函数
 */
export function createXmlExtractor(options?: ExtractionOptions): XmlExtractor {
  return new XmlExtractor(options);
}

/**
 * 🎯 快速提取函数（单例模式）
 */
const defaultExtractor = new XmlExtractor();

export function quickExtract(text: string, tagPath: string): string {
  const result = defaultExtractor.extract(text, tagPath);
  return result.success ? result.content : '';
}

export function quickExtractMultiple(text: string, tagPaths: string[]): Record<string, string> {
  const results = defaultExtractor.extractMultiple(text, tagPaths);
  const simplified: Record<string, string> = {};
  
  for (const [key, result] of Object.entries(results)) {
    simplified[key] = result.success ? result.content : '';
  }
  
  return simplified;
} 