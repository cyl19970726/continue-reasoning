/**
 * Vitest测试设置文件
 */

import * as fs from 'fs';
import * as path from 'path';

// 设置测试环境
(process.env as any).NODE_ENV = 'test';

// 创建测试用的临时目录结构
export const testWorkspaceDir = path.join(__dirname, 'temp-workspace');

// 在测试开始前创建测试环境
beforeAll(() => {
  // 确保测试工作目录存在
  if (!fs.existsSync(testWorkspaceDir)) {
    fs.mkdirSync(testWorkspaceDir, { recursive: true });
    
    // 创建一些测试文件和目录
    fs.writeFileSync(path.join(testWorkspaceDir, 'package.json'), JSON.stringify({
      name: 'test-project',
      version: '1.0.0'
    }, null, 2));
    
    fs.writeFileSync(path.join(testWorkspaceDir, 'README.md'), '# Test Project\n\nThis is a test project.');
    
    fs.writeFileSync(path.join(testWorkspaceDir, 'index.js'), 'console.log("Hello World");');
    
    // 创建带空格的文件名
    fs.writeFileSync(path.join(testWorkspaceDir, 'file with spaces.txt'), 'This file has spaces in its name.');
    
    // 创建src目录和文件
    const srcDir = path.join(testWorkspaceDir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });
    
    fs.writeFileSync(path.join(srcDir, 'index.ts'), 'export function main() { console.log("Hello"); }');
    fs.writeFileSync(path.join(srcDir, 'types.ts'), 'export interface Config { name: string; }');
    
    // 创建utils子目录
    const utilsDir = path.join(srcDir, 'utils');
    fs.mkdirSync(utilsDir, { recursive: true });
    fs.writeFileSync(path.join(utilsDir, 'helper.ts'), 'export function help() { return "help"; }');
    
    // 创建测试用的大文件
    const largeContent = 'x'.repeat(20 * 1024); // 20KB
    fs.writeFileSync(path.join(testWorkspaceDir, 'large.txt'), largeContent);
  }
});

// 在测试结束后清理测试环境
afterAll(() => {
  if (fs.existsSync(testWorkspaceDir)) {
    fs.rmSync(testWorkspaceDir, { recursive: true, force: true });
  }
}); 