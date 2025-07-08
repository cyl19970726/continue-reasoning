import * as fs from 'fs/promises';
import * as path from 'path';
import mime from 'mime-types';
import { ImportedFile } from '../interfaces/index.js';

/**
 * 文件导入器接口
 */
export interface IFileImporter {
  name: string;
  supportedExtensions: string[];
  supportedMimeTypes: string[];
  canImport(filePath: string, mimeType?: string): boolean;
  import(filePath: string, options?: ImportOptions): Promise<ImportedFile>;
}

/**
 * 导入选项
 */
export interface ImportOptions {
  encoding?: BufferEncoding;
  maxSize?: number;
  preview?: boolean;
  includeMetadata?: boolean;
}

/**
 * 文件导入器注册表
 */
export class FileImporterRegistry {
  private importers: Map<string, IFileImporter> = new Map();
  private defaultImporter: IFileImporter;

  constructor() {
    this.defaultImporter = new TextFileImporter();
    this.registerBuiltinImporters();
  }

  /**
   * 注册内置导入器
   */
  private registerBuiltinImporters(): void {
    const builtinImporters = [
      new TextFileImporter(),
      new ImageFileImporter(),
      new JsonFileImporter(),
      new BinaryFileImporter()
    ];

    builtinImporters.forEach(importer => {
      this.register(importer);
    });
  }

  /**
   * 注册导入器
   */
  register(importer: IFileImporter): void {
    // 按扩展名注册
    importer.supportedExtensions.forEach(ext => {
      this.importers.set(ext.toLowerCase(), importer);
    });
    
    // 按 MIME 类型注册
    importer.supportedMimeTypes.forEach(mimeType => {
      this.importers.set(mimeType.toLowerCase(), importer);
    });
  }

  /**
   * 获取适合的导入器
   */
  getImporter(filePath: string): IFileImporter {
    const ext = path.extname(filePath).toLowerCase();
    const mimeType = mime.lookup(filePath);
    
    // 先按扩展名查找
    if (ext && this.importers.has(ext)) {
      const importer = this.importers.get(ext)!;
      if (importer.canImport(filePath, mimeType || undefined)) {
        return importer;
      }
    }
    
    // 再按 MIME 类型查找
    if (mimeType && this.importers.has(mimeType.toLowerCase())) {
      const importer = this.importers.get(mimeType.toLowerCase())!;
      if (importer.canImport(filePath, mimeType)) {
        return importer;
      }
    }
    
    return this.defaultImporter;
  }

  /**
   * 导入文件
   */
  async import(filePath: string, options?: ImportOptions): Promise<ImportedFile> {
    const importer = this.getImporter(filePath);
    return importer.import(filePath, options);
  }

  /**
   * 批量导入文件
   */
  async importFiles(filePaths: string[], options?: ImportOptions): Promise<ImportedFile[]> {
    const results = await Promise.allSettled(
      filePaths.map(filePath => this.import(filePath, options))
    );
    
    return results
      .filter((result): result is PromiseFulfilledResult<ImportedFile> => 
        result.status === 'fulfilled'
      )
      .map(result => result.value);
  }

  /**
   * 获取支持的扩展名
   */
  getSupportedExtensions(): string[] {
    const extensions = new Set<string>();
    this.importers.forEach((importer, key) => {
      if (key.startsWith('.')) {
        extensions.add(key);
      }
    });
    return Array.from(extensions).sort();
  }

  /**
   * 获取导入器信息
   */
  getImporterInfo(): Array<{ name: string; extensions: string[]; mimeTypes: string[] }> {
    const importersInfo: Array<{ name: string; extensions: string[]; mimeTypes: string[] }> = [];
    const seen = new Set<string>();

    this.importers.forEach(importer => {
      if (!seen.has(importer.name)) {
        importersInfo.push({
          name: importer.name,
          extensions: importer.supportedExtensions,
          mimeTypes: importer.supportedMimeTypes
        });
        seen.add(importer.name);
      }
    });

    return importersInfo;
  }
}

/**
 * 文本文件导入器
 */
export class TextFileImporter implements IFileImporter {
  name = 'TextFileImporter';
  supportedExtensions = ['.txt', '.md', '.json', '.js', '.ts', '.tsx', '.jsx', '.py', '.java', '.cpp', '.c', '.h', '.css', '.html', '.xml', '.yml', '.yaml', '.toml', '.ini', '.cfg', '.conf'];
  supportedMimeTypes = ['text/plain', 'text/markdown', 'application/json', 'text/javascript', 'text/css', 'text/html', 'application/xml', 'text/xml'];

  canImport(filePath: string, mimeType?: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    return this.supportedExtensions.includes(ext) || 
           (!!mimeType && (mimeType.startsWith('text/') || this.supportedMimeTypes.includes(mimeType)));
  }

  async import(filePath: string, options: ImportOptions = {}): Promise<ImportedFile> {
    const stats = await fs.stat(filePath);
    const encoding = options.encoding || 'utf-8';
    const maxSize = options.maxSize || 10 * 1024 * 1024; // 10MB
    
    if (stats.size > maxSize) {
      throw new Error(`File too large: ${stats.size} bytes (max: ${maxSize} bytes)`);
    }
    
    const content = await fs.readFile(filePath, encoding);
    const mimeType = mime.lookup(filePath) || 'text/plain';
    
    return {
      name: path.basename(filePath),
      path: filePath,
      type: mimeType,
      size: stats.size,
      content,
      encoding
    };
  }
}

/**
 * 图片文件导入器
 */
export class ImageFileImporter implements IFileImporter {
  name = 'ImageFileImporter';
  supportedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg'];
  supportedMimeTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/bmp', 'image/webp', 'image/svg+xml'];

  canImport(filePath: string, mimeType?: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    return this.supportedExtensions.includes(ext) || 
           (!!mimeType && mimeType.startsWith('image/'));
  }

  async import(filePath: string, options: ImportOptions = {}): Promise<ImportedFile> {
    const stats = await fs.stat(filePath);
    const maxSize = options.maxSize || 50 * 1024 * 1024; // 50MB
    
    if (stats.size > maxSize) {
      throw new Error(`Image too large: ${stats.size} bytes (max: ${maxSize} bytes)`);
    }
    
    let content: string | Buffer;
    const mimeType = mime.lookup(filePath) || 'application/octet-stream';
    
    if (options.preview || path.extname(filePath).toLowerCase() === '.svg') {
      // SVG 或预览模式，读取为文本
      content = await fs.readFile(filePath, 'utf-8');
    } else {
      // 其他图片格式，读取为 Buffer 并转换为 base64
      const buffer = await fs.readFile(filePath);
      content = `data:${mimeType};base64,${buffer.toString('base64')}`;
    }
    
    return {
      name: path.basename(filePath),
      path: filePath,
      type: mimeType,
      size: stats.size,
      content,
      encoding: typeof content === 'string' ? 'utf-8' : undefined
    };
  }
}

/**
 * JSON 文件导入器
 */
export class JsonFileImporter implements IFileImporter {
  name = 'JsonFileImporter';
  supportedExtensions = ['.json', '.jsonl', '.ndjson'];
  supportedMimeTypes = ['application/json', 'application/x-ndjson'];

  canImport(filePath: string, mimeType?: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    return this.supportedExtensions.includes(ext) || 
           (!!mimeType && (mimeType === 'application/json' || mimeType.includes('json')));
  }

  async import(filePath: string, options: ImportOptions = {}): Promise<ImportedFile> {
    const stats = await fs.stat(filePath);
    const maxSize = options.maxSize || 10 * 1024 * 1024; // 10MB
    
    if (stats.size > maxSize) {
      throw new Error(`JSON file too large: ${stats.size} bytes (max: ${maxSize} bytes)`);
    }
    
    const rawContent = await fs.readFile(filePath, 'utf-8');
    let content = rawContent;
    
    // 尝试解析和格式化 JSON
    try {
      const parsed = JSON.parse(rawContent);
      content = JSON.stringify(parsed, null, 2);
    } catch (error) {
      // 如果解析失败，保持原始内容
      console.warn(`Failed to parse JSON file ${filePath}:`, error);
    }
    
    return {
      name: path.basename(filePath),
      path: filePath,
      type: 'application/json',
      size: stats.size,
      content,
      encoding: 'utf-8'
    };
  }
}

/**
 * 二进制文件导入器
 */
export class BinaryFileImporter implements IFileImporter {
  name = 'BinaryFileImporter';
  supportedExtensions = ['.exe', '.dll', '.so', '.dylib', '.zip', '.tar', '.gz', '.7z', '.rar', '.pdf', '.doc', '.docx'];
  supportedMimeTypes = ['application/octet-stream', 'application/zip', 'application/pdf'];

  canImport(filePath: string, mimeType?: string): boolean {
    // 作为后备选项，接受所有文件
    return true;
  }

  async import(filePath: string, options: ImportOptions = {}): Promise<ImportedFile> {
    const stats = await fs.stat(filePath);
    const maxSize = options.maxSize || 100 * 1024 * 1024; // 100MB
    
    if (stats.size > maxSize) {
      throw new Error(`Binary file too large: ${stats.size} bytes (max: ${maxSize} bytes)`);
    }
    
    let content: string | Buffer;
    
    if (options.preview) {
      // 预览模式，只读取前 1KB 并转换为十六进制
      const buffer = await fs.readFile(filePath);
      const preview = buffer.subarray(0, 1024);
      content = `Binary file preview (first 1KB):\n${preview.toString('hex').match(/.{1,32}/g)?.join('\n') || ''}`;
    } else {
      // 完整读取为 Buffer
      content = await fs.readFile(filePath);
    }
    
    const mimeType = mime.lookup(filePath) || 'application/octet-stream';
    
    return {
      name: path.basename(filePath),
      path: filePath,
      type: mimeType,
      size: stats.size,
      content,
      encoding: undefined
    };
  }
}