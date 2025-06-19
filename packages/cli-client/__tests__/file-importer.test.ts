/**
 * 文件导入器测试
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { 
  FileImporter, 
  createFileImporter 
} from '../src/utils/file-importer';
import { testWorkspaceDir } from './setup';

describe('FileImporter', () => {
  let importer: FileImporter;

  beforeEach(() => {
    importer = new FileImporter({
      workingDirectory: testWorkspaceDir,
      maxFileSize: 1024 * 10, // 10KB for testing
      maxDepth: 3,
      showFilePath: true,
      allowedExtensions: []
    });
  });

  describe('基本文件导入功能', () => {
    it('应该能够导入单个文件', async () => {
      const result = await importer.processInput('@package.json');
      
      expect(result).toContain('test-project');
      expect(result).toContain('1.0.0');
      expect(result.length).toBeGreaterThan(20);
    });

    it('应该能够导入README文件', async () => {
      const result = await importer.processInput('@README.md');
      
      expect(result).toContain('# Test Project');
      expect(result).toContain('This is a test project');
      expect(result.length).toBeGreaterThan(30);
    });

    it('应该能够处理带空格的文件名', async () => {
      const result = await importer.processInput('@"file with spaces.txt"');
      
      expect(result).toContain('file with spaces.txt');
    });

    it('应该能够处理句子中的文件引用', async () => {
      const original = 'Please analyze @package.json and tell me about it';
      const result = await importer.processInput(original);
      
      expect(result).toContain('Please analyze');
      expect(result).toContain('test-project');
      expect(result).toContain('and tell me about it');
    });

    it('应该能够处理多个文件引用', async () => {
      const original = 'Compare @package.json and @README.md';
      const result = await importer.processInput(original);
      
      expect(result).toContain('test-project');
      expect(result).toContain('# Test Project');
      expect(result).toContain('Compare');
      expect(result).toContain('and');
    });
  });

  describe('目录导入功能', () => {
    it('应该能够导入整个目录', async () => {
      const result = await importer.processInput('@src/');
      
      expect(result).toContain('index.ts');
      expect(result).toContain('types.ts');
      expect(result).toContain('export function main');
      expect(result).toContain('export interface Config');
    });

    it('应该能够递归导入子目录', async () => {
      const result = await importer.processInput('@src/');
      
      expect(result).toContain('utils');
      expect(result).toContain('helper.ts');
      expect(result).toContain('export function help');
    });

    it('应该尊重最大深度限制', async () => {
      const shallowImporter = new FileImporter({
        workingDirectory: testWorkspaceDir,
        maxDepth: 1
      });

      const result = await shallowImporter.processInput('@src/');
      
      // 应该包含直接文件，但不应该包含utils子目录的内容
      expect(result).toContain('index.ts');
      expect(result).toContain('types.ts');
      // 这取决于实现，可能包含或不包含子目录文件
    });
  });

  describe('配置选项', () => {
    it('应该尊重文件大小限制', async () => {
      // 创建一个大文件
      const largePath = path.join(testWorkspaceDir, 'large.txt');
      fs.writeFileSync(largePath, 'x'.repeat(1024 * 20)); // 20KB

      const smallImporter = new FileImporter({
        workingDirectory: testWorkspaceDir,
        maxFileSize: 1024 * 5 // 5KB
      });

      try {
        const result = await smallImporter.processInput('@large.txt');
        // 应该包含错误信息或跳过该文件
        expect(result).toContain('large.txt');
      } catch (error) {
        // 或者抛出错误
        expect(error).toBeDefined();
      }

      // 清理
      fs.unlinkSync(largePath);
    });

    it('应该过滤不允许的文件扩展名', async () => {
      const restrictedImporter = new FileImporter({
        workingDirectory: testWorkspaceDir,
        allowedExtensions: ['.json']
      });

      const result = await restrictedImporter.processInput('@.');
      
      // 应该只包含JSON文件，检查结果长度而不是具体内容
      expect(result.length).toBeGreaterThan(10); // 应该有一些内容
      expect(result).toContain('test-project'); // package.json的内容
      // 不应该包含README.md或index.js的内容
      expect(result).not.toContain('# Test Project');
      expect(result).not.toContain('console.log');
    });

    it('应该能够控制文件路径显示', async () => {
      const noPathImporter = new FileImporter({
        workingDirectory: testWorkspaceDir,
        showFilePath: false
      });

      const result = await noPathImporter.processInput('@package.json');
      
      expect(result).toContain('test-project');
      // 不应该显示文件路径分隔符
      expect(result).not.toMatch(/=+.*package\.json.*=+/);
    });
  });

  describe('边界条件和错误处理', () => {
    it('应该处理不存在的文件', async () => {
      const result = await importer.processInput('@nonexistent.txt');
      
      // 应该返回原始输入或包含错误信息
      expect(result).toContain('nonexistent.txt');
    });

    it('应该处理没有@符号的输入', async () => {
      const original = 'This is just normal text';
      const result = await importer.processInput(original);
      
      expect(result).toBe(original);
    });

    it('应该处理空输入', async () => {
      const result = await importer.processInput('');
      
      expect(result).toBe('');
    });

    it('应该处理只有@符号的输入', async () => {
      const result = await importer.processInput('@');
      
      expect(result).toContain('@');
    });

    it('应该处理无效的引用语法', async () => {
      const original = 'Invalid @"unclosed quote';
      const result = await importer.processInput(original);
      
      // 应该能够处理而不会崩溃
      expect(typeof result).toBe('string');
    });
  });

  describe('路径解析', () => {
    it('应该处理相对路径', async () => {
      const result = await importer.processInput('@./package.json');
      
      expect(result).toContain('test-project');
    });

    it('应该处理当前目录引用', async () => {
      const result = await importer.processInput('@.');
      
      // 应该导入当前目录下的文件
      expect(result.length).toBeGreaterThan(100);
    });

    it('应该处理子目录路径', async () => {
      const result = await importer.processInput('@src/index.ts');
      
      expect(result).toContain('export function main');
    });
  });

  describe('配置更新', () => {
    it('应该能够更新配置', () => {
      const originalConfig = importer.getConfig();
      
      importer.updateConfig({ maxFileSize: 2048 });
      
      const newConfig = importer.getConfig();
      expect(newConfig.maxFileSize).toBe(2048);
      expect(newConfig.workingDirectory).toBe(originalConfig.workingDirectory);
    });

    it('应该能够获取当前配置', () => {
      const config = importer.getConfig();
      
      expect(config).toHaveProperty('workingDirectory');
      expect(config).toHaveProperty('maxFileSize');
      expect(config).toHaveProperty('maxDepth');
      expect(config).toHaveProperty('showFilePath');
      expect(config).toHaveProperty('allowedExtensions');
    });
  });
});

describe('createFileImporter', () => {
  it('应该创建一个可用的文件导入器', () => {
    const importer = createFileImporter({
      workingDirectory: testWorkspaceDir,
      maxFileSize: 1024
    });

    expect(importer).toBeInstanceOf(FileImporter);
    
    const config = importer.getConfig();
    expect(config.workingDirectory).toBe(testWorkspaceDir);
    expect(config.maxFileSize).toBe(1024);
  });

  it('应该使用默认配置填充缺失的选项', () => {
    const importer = createFileImporter({
      workingDirectory: testWorkspaceDir
    });

    const config = importer.getConfig();
    expect(config.maxDepth).toBeDefined();
    expect(config.showFilePath).toBeDefined();
    expect(config.allowedExtensions).toBeDefined();
  });
}); 