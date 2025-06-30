// File path: packages/cli-client/src/utils/file-importer.ts
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
      const originalFilePath = match[1].replace(/^["']|["']$/g, ''); // 移除引号
      
      try {
        // 标准化路径用于显示
        const normalizedDisplayPath = this.normalizePathFromWorkspace(originalFilePath);
        
        const importResult = await this.importFileOrDirectory(originalFilePath);
        
        if (importResult.content) {
          // 替换 @file_path 为实际内容
          const replacement = this.formatImportedContent(importResult);
          processedInput = processedInput.substring(0, match.index!) + 
                          replacement + 
                          processedInput.substring(match.index! + fullMatch.length);
          
          console.log(`✅ Imported: ${normalizedDisplayPath} (${importResult.files.length} files)`);
        } else {
          console.log(`⚠️  No content imported from: ${normalizedDisplayPath}`);
        }
      } catch (error) {
        const normalizedDisplayPath = this.normalizePathFromWorkspace(originalFilePath);
        console.error(`❌ Failed to import ${normalizedDisplayPath}:`, (error as Error).message);
        // 保留原始的 @file_path，不替换
      }
    }

    return processedInput;
  }

  /**
   * 导入文件或目录
   */
  private async importFileOrDirectory(filePath: string): Promise<FileImportResult> {
    // 标准化路径：确保相对于workspace根目录
    const normalizedPath = this.normalizePathFromWorkspace(filePath);
    const absolutePath = path.resolve(this.config.workingDirectory, normalizedPath);
    
    if (!fs.existsSync(absolutePath)) {
      throw new Error(`Path does not exist: ${normalizedPath} (resolved from workspace: ${this.config.workingDirectory})`);
    }

    const stats = fs.statSync(absolutePath);
    
    if (stats.isFile()) {
      return await this.importFile(absolutePath, normalizedPath);
    } else if (stats.isDirectory()) {
      return await this.importDirectory(absolutePath, normalizedPath);
    } else {
      throw new Error(`Unsupported file type: ${normalizedPath}`);
    }
  }

  /**
   * 标准化文件路径，确保相对于workspace根目录
   */
  private normalizePathFromWorkspace(filePath: string): string {
    // 移除开头的 ./ 或 /
    let normalized = filePath.replace(/^\.?\//, '');
    
    // 如果路径已经是绝对路径，计算相对于workspace的路径
    if (path.isAbsolute(filePath)) {
      normalized = path.relative(this.config.workingDirectory, filePath);
    }
    
    return normalized;
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
        // 计算相对于workspace根目录的路径
        const workspaceRelativePath = path.relative(this.config.workingDirectory, filePath);
        const normalizedPath = this.normalizePathFromWorkspace(workspaceRelativePath);
        
        const fileResult = await this.importFile(filePath, normalizedPath);
        
        if (fileResult.content) {
          // 添加文件分隔符
          if (result.content) result.content += '\n\n';
          result.content += this.formatFileContent(normalizedPath, fileResult.content);
          result.files.push(normalizedPath);
        }
      } catch (error) {
        result.hasSkippedFiles = true;
        const errorPath = path.relative(this.config.workingDirectory, filePath);
        result.skippedReasons.push(`${errorPath}: ${(error as Error).message}`);
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

    // 确保路径是相对于workspace的标准格式
    const workspaceRelativePath = this.normalizePathFromWorkspace(filePath);
    
    // 根据文件扩展名确定注释格式
    const ext = path.extname(filePath).toLowerCase();
    let pathComment = '';
    
    // 支持不同类型文件的注释格式
    if (['.ts', '.js', '.tsx', '.jsx', '.mjs', '.cjs'].includes(ext)) {
      pathComment = `// File path: ${workspaceRelativePath}`;
    } else if (['.py'].includes(ext)) {
      pathComment = `# File path: ${workspaceRelativePath}`;
    } else if (['.css', '.scss', '.less'].includes(ext)) {
      pathComment = `/* File path: ${workspaceRelativePath} */`;
    } else if (['.html', '.xml', '.svg'].includes(ext)) {
      pathComment = `<!-- File path: ${workspaceRelativePath} -->`;
    } else if (['.md', '.markdown'].includes(ext)) {
      pathComment = `<!-- File path: ${workspaceRelativePath} -->\n`;
    } else {
      // 默认使用 # 注释
      pathComment = `# File path: ${workspaceRelativePath}`;
    }
    
    // 检查文件内容是否已经包含路径注释
    const firstLine = content.split('\n')[0];
    const hasPathComment = firstLine.includes('File path:') || firstLine.includes('file path:');
    
    if (hasPathComment) {
      // 如果已经有路径注释，替换第一行
      const lines = content.split('\n');
      lines[0] = pathComment;
      return lines.join('\n');
    } else {
      // 添加路径注释到文件开头
      return `${pathComment}\n${content}`;
    }
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

  /**
   * 显示当前workspace配置信息
   */
  public showWorkspaceInfo(): void {
    console.log('\n📂 File Importer Workspace Configuration:');
    console.log(`   Working Directory: ${this.config.workingDirectory}`);
    console.log(`   Max File Size: ${this.formatFileSize(this.config.maxFileSize)}`);
    console.log(`   Max Depth: ${this.config.maxDepth}`);
    console.log(`   Show File Path: ${this.config.showFilePath}`);
    if (this.config.allowedExtensions.length > 0) {
      console.log(`   Allowed Extensions: ${this.config.allowedExtensions.join(', ')}`);
    } else {
      console.log(`   Allowed Extensions: All types`);
    }
    console.log('');
  }

  /**
   * 验证workspace目录是否有效
   */
  public validateWorkspace(): boolean {
    try {
      const stats = fs.statSync(this.config.workingDirectory);
      if (!stats.isDirectory()) {
        console.error(`❌ Workspace path is not a directory: ${this.config.workingDirectory}`);
        return false;
      }
      
      // 检查是否可读
      fs.accessSync(this.config.workingDirectory, fs.constants.R_OK);
      console.log(`✅ Workspace directory is valid: ${this.config.workingDirectory}`);
      return true;
    } catch (error) {
      console.error(`❌ Workspace directory is not accessible: ${this.config.workingDirectory}`);
      console.error(`   Error: ${(error as Error).message}`);
      return false;
    }
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