import { IXmlExtractor } from './interfaces';

export class SimpleXmlExtractor implements IXmlExtractor {
  
  extract(text: string, tagPath: string): { success: boolean; content?: string; error?: string } {
    try {
      const tags = tagPath.split('.');
      let currentText = text;
      
      for (const tag of tags) {
        const match = this.extractSingleTag(currentText, tag);
        if (!match.success) {
          return match;
        }
        currentText = match.content!;
      }
      
      return { success: true, content: currentText.trim() };
    } catch (error) {
      return { 
        success: false, 
        error: `XML extraction error: ${error instanceof Error ? error.message : String(error)}` 
      };
    }
  }
  
  extractMultiple(text: string, tagPaths: string[]): Record<string, string> {
    const results: Record<string, string> = {};
    
    for (const tagPath of tagPaths) {
      const result = this.extract(text, tagPath);
      if (result.success && result.content) {
        results[tagPath] = result.content;
      }
    }
    
    return results;
  }
  
  private extractSingleTag(text: string, tag: string): { success: boolean; content?: string; error?: string } {
    // 尝试标准的 XML 标签匹配
    const openTag = `<${tag}>`;
    const closeTag = `</${tag}>`;
    
    const startIndex = text.indexOf(openTag);
    if (startIndex === -1) {
      return { success: false, error: `Opening tag <${tag}> not found` };
    }
    
    const contentStart = startIndex + openTag.length;
    const endIndex = text.indexOf(closeTag, contentStart);
    
    if (endIndex === -1) {
      // 容错：如果没有找到闭合标签，尝试到文本末尾
      const content = text.substring(contentStart).trim();
      if (content.length > 0) {
        return { success: true, content };
      }
      return { success: false, error: `Closing tag </${tag}> not found` };
    }
    
    const content = text.substring(contentStart, endIndex);
    return { success: true, content };
  }
  
  // 提取所有同名标签
  extractAll(text: string, tag: string): string[] {
    const results: string[] = [];
    const openTag = `<${tag}>`;
    const closeTag = `</${tag}>`;
    
    let searchFrom = 0;
    while (true) {
      const startIndex = text.indexOf(openTag, searchFrom);
      if (startIndex === -1) break;
      
      const contentStart = startIndex + openTag.length;
      const endIndex = text.indexOf(closeTag, contentStart);
      
      if (endIndex === -1) break;
      
      const content = text.substring(contentStart, endIndex).trim();
      if (content.length > 0) {
        results.push(content);
      }
      
      searchFrom = endIndex + closeTag.length;
    }
    
    return results;
  }
}

// 创建单例实例
export const xmlExtractor = new SimpleXmlExtractor();

// 快速提取函数
export function quickExtract(text: string, tagPath: string): string | undefined {
  const result = xmlExtractor.extract(text, tagPath);
  return result.success ? result.content : undefined;
}

export function quickExtractMultiple(text: string, tagPaths: string[]): Record<string, string> {
  return xmlExtractor.extractMultiple(text, tagPaths);
} 