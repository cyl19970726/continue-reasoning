import * as fs from 'fs';
import * as path from 'path';
import { getWorkspaceDirectory } from './workspace';

/**
 * 文件补全配置
 */
export interface FileCompleterConfig {
  /** 工作目录，默认为workspace目录 */
  workingDirectory?: string;
  /** 最大搜索深度 */
  maxDepth?: number;
  /** 是否显示隐藏文件 */
  showHidden?: boolean;
  /** 允许的文件扩展名，为空则显示所有 */
  allowedExtensions?: string[];
  /** 最大补全结果数量 */
  maxResults?: number;
}

/**
 * 补全结果项
 */
export interface CompletionItem {
  /** 显示的文本 */
  display: string;
  /** 实际插入的文本 */
  insert: string;
  /** 是否为目录 */
  isDirectory: boolean;
  /** 相对路径 */
  relativePath: string;
}

/**
 * 默认配置
 */
const DEFAULT_CONFIG: Required<FileCompleterConfig> = {
  workingDirectory: getWorkspaceDirectory(), // 使用workspace目录
  maxDepth: 3,
  showHidden: false,
  allowedExtensions: [],
  maxResults: 20
};

/**
 * 文件补全器类
 */
export class FileCompleter {
  private config: Required<FileCompleterConfig>;
  private fileCache: Map<string, CompletionItem[]> = new Map();
  private lastCacheTime: number = 0;
  private readonly CACHE_TTL = 5000; // 5秒缓存

  constructor(config: FileCompleterConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 获取文件补全建议
   */
  public getCompletions(input: string): CompletionItem[] {
    // 解析输入，找到 @ 符号的位置和路径部分
    const atMatch = this.findAtPattern(input);
    if (!atMatch) {
      return [];
    }

    const { prefix, pathPart } = atMatch;
    
    // 获取匹配的文件和目录
    const matches = this.findMatchingPaths(pathPart);
    
    // 转换为补全项
    return matches.map(item => ({
      ...item,
      display: `@${item.relativePath}${item.isDirectory ? '/' : ''}`,
      insert: `@${item.relativePath}${item.isDirectory ? '/' : ''}`
    }));
  }

  /**
   * 查找输入中的 @ 模式
   */
  private findAtPattern(input: string): { prefix: string; pathPart: string } | null {
    // 找到最后一个 @ 符号的位置
    const lastAtIndex = input.lastIndexOf('@');
    if (lastAtIndex === -1) {
      return null;
    }

    // 提取 @ 后面的路径部分
    const afterAt = input.substring(lastAtIndex + 1);
    
    // 检查是否有空格（表示这个@引用已经结束）
    const spaceIndex = afterAt.indexOf(' ');
    if (spaceIndex !== -1) {
      return null;
    }

    return {
      prefix: input.substring(0, lastAtIndex),
      pathPart: afterAt
    };
  }

  /**
   * 查找匹配的路径
   */
  private findMatchingPaths(pathPart: string): CompletionItem[] {
    const now = Date.now();
    const cacheKey = `${this.config.workingDirectory}:${pathPart}`;
    
    // 检查缓存
    if (this.fileCache.has(cacheKey) && (now - this.lastCacheTime) < this.CACHE_TTL) {
      return this.fileCache.get(cacheKey)!;
    }

    const results: CompletionItem[] = [];
    
    // 解析路径部分
    const { searchDir, searchPattern } = this.parsePathPart(pathPart);
    
    try {
      // 获取目录内容
      const entries = this.getDirectoryEntries(searchDir);
      
      // 过滤和排序结果
      const filtered = entries
        .filter(entry => this.shouldIncludeEntry(entry, searchPattern))
        .filter(entry => this.passesExtensionFilter(entry.relativePath, entry.isDirectory))
        .sort((a, b) => {
          // 目录优先，然后按名称排序
          if (a.isDirectory && !b.isDirectory) return -1;
          if (!a.isDirectory && b.isDirectory) return 1;
          return a.relativePath.localeCompare(b.relativePath);
        })
        .slice(0, this.config.maxResults);

      results.push(...filtered);
    } catch (error) {
      // 忽略读取错误
    }

    // 更新缓存
    this.fileCache.set(cacheKey, results);
    this.lastCacheTime = now;

    return results;
  }

  /**
   * 解析路径部分
   */
  private parsePathPart(pathPart: string): { searchDir: string; searchPattern: string } {
    // 移除引号
    const cleanPath = pathPart.replace(/^["']|["']$/g, '');
    
    if (!cleanPath) {
      return {
        searchDir: this.config.workingDirectory,
        searchPattern: ''
      };
    }

    const fullPath = path.resolve(this.config.workingDirectory, cleanPath);
    
    // 检查是否是现有目录
    try {
      const stats = fs.statSync(fullPath);
      if (stats.isDirectory()) {
        return {
          searchDir: fullPath,
          searchPattern: ''
        };
      }
    } catch (error) {
      // 路径不存在，可能是部分输入
    }

    // 分离目录和文件名部分
    const dir = path.dirname(fullPath);
    const pattern = path.basename(fullPath);

    return {
      searchDir: dir === '.' ? this.config.workingDirectory : dir,
      searchPattern: pattern
    };
  }

  /**
   * 获取目录条目
   */
  private getDirectoryEntries(dirPath: string): CompletionItem[] {
    const entries: CompletionItem[] = [];
    
    try {
      const items = fs.readdirSync(dirPath);
      
      for (const item of items) {
        // 跳过隐藏文件（除非配置允许）
        if (!this.config.showHidden && item.startsWith('.')) {
          continue;
        }

        // 跳过常见的忽略目录
        if (item === 'node_modules' || item === 'dist' || item === '.git') {
          continue;
        }

        const fullPath = path.join(dirPath, item);
        const relativePath = path.relative(this.config.workingDirectory, fullPath);
        
        try {
          const stats = fs.statSync(fullPath);
          
          entries.push({
            display: item,
            insert: relativePath,
            isDirectory: stats.isDirectory(),
            relativePath: relativePath
          });
        } catch (error) {
          // 跳过无法访问的文件
        }
      }
    } catch (error) {
      // 无法读取目录
    }

    return entries;
  }

  /**
   * 检查条目是否应该包含在结果中
   */
  private shouldIncludeEntry(entry: CompletionItem, pattern: string): boolean {
    if (!pattern) {
      return true;
    }

    const fileName = path.basename(entry.relativePath);
    
    // 简单的前缀匹配
    return fileName.toLowerCase().startsWith(pattern.toLowerCase());
  }

  /**
   * 检查文件是否通过扩展名过滤
   */
  private passesExtensionFilter(filePath: string, isDirectory: boolean): boolean {
    if (isDirectory) {
      return true;
    }

    if (this.config.allowedExtensions.length === 0) {
      return true;
    }

    const ext = path.extname(filePath).toLowerCase();
    return this.config.allowedExtensions.includes(ext);
  }

  /**
   * 清理缓存
   */
  public clearCache(): void {
    this.fileCache.clear();
    this.lastCacheTime = 0;
  }

  /**
   * 更新配置
   */
  public updateConfig(config: Partial<FileCompleterConfig>): void {
    this.config = { ...this.config, ...config };
    this.clearCache();
  }

  /**
   * 获取配置
   */
  public getConfig(): Required<FileCompleterConfig> {
    return { ...this.config };
  }
}

/**
 * Readline 补全函数
 */
export function createFileCompleter(config?: FileCompleterConfig) {
  const completer = new FileCompleter(config);
  
  return (line: string): [string[], string] => {
    try {
      const completions = completer.getCompletions(line);
      
      if (completions.length === 0) {
        return [[], line];
      }

      // 找到当前输入的 @ 模式
      const atMatch = completer['findAtPattern'](line);
      if (!atMatch) {
        return [[], line];
      }

      // 构建补全选项
      const suggestions = completions.map(item => item.display);
      
      // 返回建议和当前匹配的部分
      return [suggestions, `@${atMatch.pathPart}`];
    } catch (error) {
      return [[], line];
    }
  };
}

/**
 * 创建默认的文件补全器
 */
export function createDefaultFileCompleter(): FileCompleter {
  return new FileCompleter();
} 