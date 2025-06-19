import * as fs from 'fs';
import * as path from 'path';
import { getWorkspaceDirectory } from './workspace';

/**
 * 文件导入配置
 */
export interface FileImporterConfig {
  /** 允许的文件扩展名，为空则允许所有 */
  allowedExtensions?: string[];
  /** 最大文件大小（字节），默认 1MB */
  maxFileSize?: number;
  /** 最大目录深度，默认 3 */
  maxDepth?: number;
  /** 是否显示文件路径 */
  showFilePath?: boolean;
  /** 工作目录，默认为workspace目录 */
  workingDirectory?: string;
}

/**
 * 文件导入结果
 */
export interface FileImportResult {
  /** 导入的内容 */
  content: string;
  /** 处理的文件列表 */
  files: string[];
  /** 是否有文件被跳过 */
  hasSkippedFiles: boolean;
  /** 跳过的原因 */
  skippedReasons: string[];
}

/**
 * 默认配置
 */
const DEFAULT_CONFIG: Required<FileImporterConfig> = {
  allowedExtensions: [],
  maxFileSize: 1024 * 1024, // 1MB
  maxDepth: 3,
  showFilePath: true,
  workingDirectory: getWorkspaceDirectory() // 使用workspace目录
};

/**
 * 文件导入器类
 */
export class FileImporter {
  private config: Required<FileImporterConfig>;

  constructor(config: FileImporterConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 解析用户输入中的 @file_path 语法
   */
  public async processInput(input: string): Promise<string> {
    // 匹配 @file_path 模式，支持引号包围的路径
    const fileReferenceRegex = /@([^\s]+|"[^"]*"|'[^']*')/g;
    
    let processedInput = input;
    const matches = Array.from(input.matchAll(fileReferenceRegex));
    
    if (matches.length === 0) {
      return input;
    }

    console.log(`\n📁 Found ${matches.length} file reference(s), processing...`);

    // 从后往前替换，避免位置偏移问题
    for (let i = matches.length - 1; i >= 0; i--) {
      const match = matches[i];
      const fullMatch = match[0]; // 完整匹配 "@path"
      const filePath = match[1].replace(/^["']|["']$/g, ''); // 移除引号
      
      try {
        const importResult = await this.importFileOrDirectory(filePath);
        
        if (importResult.content) {
          // 替换 @file_path 为实际内容
          const replacement = this.formatImportedContent(importResult);
          processedInput = processedInput.substring(0, match.index!) + 
                          replacement + 
                          processedInput.substring(match.index! + fullMatch.length);
          
          console.log(`✅ Imported: ${filePath} (${importResult.files.length} files)`);
        } else {
          console.log(`⚠️  No content imported from: ${filePath}`);
        }
      } catch (error) {
        console.error(`❌ Failed to import ${filePath}:`, (error as Error).message);
        // 保留原始的 @file_path，不替换
      }
    }

    return processedInput;
  }

  /**
   * 导入文件或目录
   */
  private async importFileOrDirectory(filePath: string): Promise<FileImportResult> {
    const absolutePath = path.resolve(this.config.workingDirectory, filePath);
    
    if (!fs.existsSync(absolutePath)) {
      throw new Error(`Path does not exist: ${filePath}`);
    }

    const stats = fs.statSync(absolutePath);
    
    if (stats.isFile()) {
      return await this.importFile(absolutePath, filePath);
    } else if (stats.isDirectory()) {
      return await this.importDirectory(absolutePath, filePath);
    } else {
      throw new Error(`Unsupported file type: ${filePath}`);
    }
  }

  /**
   * 导入单个文件
   */
  private async importFile(absolutePath: string, originalPath: string): Promise<FileImportResult> {
    const stats = fs.statSync(absolutePath);
    
    // 检查文件大小
    if (stats.size > this.config.maxFileSize) {
      throw new Error(`File too large: ${originalPath} (${this.formatFileSize(stats.size)})`);
    }

    // 检查文件扩展名
    if (this.config.allowedExtensions.length > 0) {
      const ext = path.extname(absolutePath).toLowerCase();
      if (!this.config.allowedExtensions.includes(ext)) {
        throw new Error(`File type not allowed: ${originalPath}`);
      }
    }

    try {
      const content = fs.readFileSync(absolutePath, 'utf8');
      
      return {
        content,
        files: [originalPath],
        hasSkippedFiles: false,
        skippedReasons: []
      };
    } catch (error) {
      throw new Error(`Cannot read file: ${originalPath}`);
    }
  }

  /**
   * 导入目录
   */
  private async importDirectory(dirPath: string, originalPath: string): Promise<FileImportResult> {
    const result: FileImportResult = {
      content: '',
      files: [],
      hasSkippedFiles: false,
      skippedReasons: []
    };

    const files = this.getAllFiles(dirPath, 0);
    
    for (const filePath of files) {
      try {
        const relativePath = path.relative(this.config.workingDirectory, filePath);
        const fileResult = await this.importFile(filePath, relativePath);
        
        if (fileResult.content) {
          // 添加文件分隔符
          if (result.content) result.content += '\n\n';
          result.content += this.formatFileContent(relativePath, fileResult.content);
          result.files.push(relativePath);
        }
      } catch (error) {
        result.hasSkippedFiles = true;
        result.skippedReasons.push(`${path.relative(dirPath, filePath)}: ${(error as Error).message}`);
      }
    }

    return result;
  }

  /**
   * 递归获取所有文件
   */
  private getAllFiles(dirPath: string, depth: number): string[] {
    if (depth >= this.config.maxDepth) {
      return [];
    }

    const files: string[] = [];
    
    try {
      const entries = fs.readdirSync(dirPath);
      
      for (const entry of entries) {
        // 跳过隐藏文件和常见的忽略文件
        if (entry.startsWith('.') || entry === 'node_modules' || entry === 'dist') {
          continue;
        }

        const fullPath = path.join(dirPath, entry);
        const stats = fs.statSync(fullPath);
        
        if (stats.isFile()) {
          files.push(fullPath);
        } else if (stats.isDirectory()) {
          files.push(...this.getAllFiles(fullPath, depth + 1));
        }
      }
    } catch (error) {
      // 忽略无法读取的目录
    }

    return files;
  }

  /**
   * 格式化导入的内容
   */
  private formatImportedContent(result: FileImportResult): string {
    let formatted = result.content;

    // 如果有跳过的文件，添加说明
    if (result.hasSkippedFiles) {
      formatted += '\n\n<!-- Some files were skipped:\n';
      result.skippedReasons.forEach(reason => {
        formatted += `  - ${reason}\n`;
      });
      formatted += '-->';
    }

    return formatted;
  }

  /**
   * 格式化单个文件内容
   */
  private formatFileContent(filePath: string, content: string): string {
    if (!this.config.showFilePath) {
      return content;
    }

    const separator = '='.repeat(50);
    return `${separator}\nFile: ${filePath}\n${separator}\n${content}`;
  }

  /**
   * 格式化文件大小
   */
  private formatFileSize(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(1)} ${units[unitIndex]}`;
  }

  /**
   * 更新配置
   */
  public updateConfig(config: Partial<FileImporterConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * 获取当前配置
   */
  public getConfig(): Required<FileImporterConfig> {
    return { ...this.config };
  }
}

/**
 * 创建默认的文件导入器实例
 */
export function createFileImporter(config?: FileImporterConfig): FileImporter {
  return new FileImporter(config);
}

/**
 * 便捷函数：处理输入中的文件引用
 */
export async function processFileReferences(
  input: string, 
  config?: FileImporterConfig
): Promise<string> {
  const importer = createFileImporter(config);
  return await importer.processInput(input);
} 