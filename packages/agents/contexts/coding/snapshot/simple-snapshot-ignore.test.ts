import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SimpleSnapshotManager } from './simple-snapshot-manager';
import { ApplyWholeFileEditTool } from '../toolsets/snapshot-enhanced-tools';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

describe('SimpleSnapshotManager Ignore Functionality', () => {
  let tempDir: string;
  let snapshotManager: SimpleSnapshotManager;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'snapshot-ignore-test-'));
    snapshotManager = new SimpleSnapshotManager(tempDir);
    await snapshotManager.initialize();
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      console.warn('Failed to cleanup temp directory:', error);
    }
  });

  describe('Default Ignore Rules', () => {
    it('should load default ignore rules when no .snapshotignore file exists', async () => {
      const ignoreInfo = snapshotManager.getIgnoreInfo();
      
      expect(ignoreInfo.ignoreFileExists).toBe(false);
      expect(ignoreInfo.isLoaded).toBe(true);
      expect(ignoreInfo.patterns.length).toBeGreaterThan(0);
      
      // 检查一些默认规则
      expect(ignoreInfo.patterns).toContain('.continue-reasoning/**');
      expect(ignoreInfo.patterns).toContain('.snapshotignore');
      expect(ignoreInfo.patterns).toContain('*.log');
      expect(ignoreInfo.patterns).toContain('*.json');
      expect(ignoreInfo.patterns).toContain('node_modules/**');
    });

    it('should ignore files matching default patterns', async () => {
      // 测试内部方法（这里我们通过反射访问private方法）
      const manager = snapshotManager as any;
      
      expect(manager.filterIgnoredFiles(['test.json', 'test.py'])).toEqual(['test.py']);
      expect(manager.filterIgnoredFiles(['app.log', 'app.js'])).toEqual(['app.js']);
      expect(manager.filterIgnoredFiles(['node_modules/express/index.js', 'src/app.js'])).toEqual(['src/app.js']);
    });
  });

  describe('.snapshotignore File Management', () => {
    it('should create default .snapshotignore file', async () => {
      await snapshotManager.createDefaultSnapshotIgnore();
      
      const ignoreFilePath = path.join(tempDir, '.snapshotignore');
      const exists = await fs.access(ignoreFilePath).then(() => true).catch(() => false);
      
      expect(exists).toBe(true);
      
      const content = await fs.readFile(ignoreFilePath, 'utf-8');
      expect(content).toContain('.continue-reasoning/**');
      expect(content).toContain('.snapshotignore');
      expect(content).toContain('*.json');
      expect(content).toContain('node_modules/**');
    });

    it('should reload ignore rules from file', async () => {
      // 创建自定义 .snapshotignore 文件
      const ignoreFilePath = path.join(tempDir, '.snapshotignore');
      const customRules = `# Custom test rules
*.custom
test_*
special_dir/**`;
      
      await fs.writeFile(ignoreFilePath, customRules);
      await snapshotManager.reloadIgnoreRules();
      
      const ignoreInfo = snapshotManager.getIgnoreInfo();
      expect(ignoreInfo.ignoreFileExists).toBe(true);
      expect(ignoreInfo.patterns).toContain('*.custom');
      expect(ignoreInfo.patterns).toContain('test_*');
      expect(ignoreInfo.patterns).toContain('special_dir/**');
    });

    it('should handle comments and empty lines in .snapshotignore', async () => {
      const ignoreFilePath = path.join(tempDir, '.snapshotignore');
      const contentWithComments = `# This is a comment
*.temp

# Another comment
*.cache
# Empty line above and below should be ignored

*.log`;
      
      await fs.writeFile(ignoreFilePath, contentWithComments);
      await snapshotManager.reloadIgnoreRules();
      
      const ignoreInfo = snapshotManager.getIgnoreInfo();
      expect(ignoreInfo.patterns).toEqual(['*.temp', '*.cache', '*.log']);
      expect(ignoreInfo.patterns).not.toContain('# This is a comment');
      expect(ignoreInfo.patterns).not.toContain('');
    });
  });

  describe('Pattern Matching', () => {
    beforeEach(async () => {
      // 创建测试用的 .snapshotignore 文件
      const ignoreFilePath = path.join(tempDir, '.snapshotignore');
      const testRules = `*.json
*.log
test_*
**/cache/**
temp/*.tmp
outputs/**
node_modules/**
.git/**`;
      
      await fs.writeFile(ignoreFilePath, testRules);
      await snapshotManager.reloadIgnoreRules();
    });

    it('should match wildcard patterns correctly', async () => {
      const manager = snapshotManager as any;
      
      // 测试简单通配符
      expect(manager.filterIgnoredFiles(['data.json', 'script.py'])).toEqual(['script.py']);
      expect(manager.filterIgnoredFiles(['app.log', 'app.js'])).toEqual(['app.js']);
      
      // 测试前缀模式
      expect(manager.filterIgnoredFiles(['test_data.py', 'main.py'])).toEqual(['main.py']);
      expect(manager.filterIgnoredFiles(['test_1', 'test_2', 'prod_1'])).toEqual(['prod_1']);
    });

    it('should match directory patterns correctly', async () => {
      const manager = snapshotManager as any;
      
      // 测试目录通配符
      expect(manager.filterIgnoredFiles(['src/cache/data.json', 'src/main.py'])).toEqual(['src/main.py']);
      expect(manager.filterIgnoredFiles(['node_modules/express/index.js', 'src/app.js'])).toEqual(['src/app.js']);
      
      // 测试深层目录
      expect(manager.filterIgnoredFiles(['a/b/cache/c/file.txt', 'a/b/src/file.txt'])).toEqual(['a/b/src/file.txt']);
    });

    it('should handle path patterns correctly', async () => {
      const manager = snapshotManager as any;
      
      // 测试路径前缀
      expect(manager.filterIgnoredFiles(['temp/file.tmp', 'temp/file.js', 'src/temp/file.tmp'])).toEqual(['temp/file.js', 'src/temp/file.tmp']);
      
      // 测试输出目录
      expect(manager.filterIgnoredFiles(['outputs/result.txt', 'src/outputs.txt'])).toEqual(['src/outputs.txt']);
    });
  });

  describe('State Continuity with Ignore Rules', () => {
    beforeEach(async () => {
      // 设置ignore规则
      const ignoreFilePath = path.join(tempDir, '.snapshotignore');
      await fs.writeFile(ignoreFilePath, '*.json\n*.log\ntemp/**');
      await snapshotManager.reloadIgnoreRules();
    });

    it('should not track ignored files in snapshots', async () => {
      // 创建一些测试文件
      await fs.writeFile(path.join(tempDir, 'app.py'), 'print("hello")');
      await fs.writeFile(path.join(tempDir, 'data.json'), '{"test": true}');
      await fs.writeFile(path.join(tempDir, 'debug.log'), 'debug info');
      
      const snapshotId = await snapshotManager.createSnapshot({
        tool: 'TestTool',
        description: 'Test ignore in snapshot',
        affectedFiles: ['app.py', 'data.json', 'debug.log'],
        diff: `diff --git a/app.py b/app.py
new file mode 100644
index 0000000..8b13789
--- /dev/null
+++ b/app.py
@@ -0,0 +1 @@
+print("hello")`,
        context: {
          sessionId: 'test'
        },
        metadata: {
          filesSizeBytes: 100,
          linesChanged: 1,
          executionTimeMs: 10
        }
      });

      expect(snapshotId).toBeDefined();
      
      // 快照应该成功创建，因为忽略的文件不会导致状态连续性问题
    });

    it('should work correctly when ignored files exist in workspace', async () => {
      // 创建mock agent
      const mockAgent = createMockAgent(snapshotManager, tempDir);
      
      // 创建一个包含被忽略文件的工作区
      await fs.writeFile(path.join(tempDir, 'config.json'), '{"setting": "value"}');
      await fs.writeFile(path.join(tempDir, 'app.log'), 'log entry');
      
      // 使用快照工具创建文件
      const result = await ApplyWholeFileEditTool.execute({
        path: 'main.py',
        content: 'def main(): pass',
        goal: 'Create main.py file'
      }, mockAgent);
      
      expect(result.success).toBe(true);
      expect(result.snapshotId).toBeDefined();
      
      // 模拟外部进程修改被忽略的文件（这在现实中很常见）
      await fs.writeFile(path.join(tempDir, 'config.json'), '{"setting": "updated"}');
      await fs.writeFile(path.join(tempDir, 'app.log'), 'new log entry');
      
      // 验证过滤功能正常工作
      expect(snapshotManager.filterIgnoredFiles(['main.py', 'config.json', 'app.log'])).toEqual(['main.py']);
      
      // 验证快照只跟踪了非忽略的文件
      const snapshot = await (snapshotManager as any).loadSnapshot(result.snapshotId);
      expect(snapshot).toBeTruthy();
      expect(snapshot.baseFileHashes).toHaveProperty('main.py');
      expect(snapshot.baseFileHashes).not.toHaveProperty('config.json');
      expect(snapshot.baseFileHashes).not.toHaveProperty('app.log');
    });
  });

  describe('File Hash Calculation', () => {
    beforeEach(async () => {
      const ignoreFilePath = path.join(tempDir, '.snapshotignore');
      await fs.writeFile(ignoreFilePath, '*.ignore\n*.temp');
      await snapshotManager.reloadIgnoreRules();
    });

    it('should exclude ignored files from hash calculation', async () => {
      // 创建测试文件
      await fs.writeFile(path.join(tempDir, 'tracked.txt'), 'tracked content');
      await fs.writeFile(path.join(tempDir, 'ignored.ignore'), 'ignored content');
      
      // 通过反射访问私有方法进行测试
      const manager = snapshotManager as any;
      const hashes = await manager.calculateFileHashes(['tracked.txt', 'ignored.ignore']);
      
      expect(hashes).toHaveProperty('tracked.txt');
      expect(hashes).not.toHaveProperty('ignored.ignore');
    });
  });

  describe('Error Handling', () => {
    it('should gracefully handle missing .snapshotignore file', async () => {
      // 确保文件不存在
      const ignoreFilePath = path.join(tempDir, '.snapshotignore');
      try {
        await fs.unlink(ignoreFilePath);
      } catch {
        // 文件可能本来就不存在
      }
      
      await snapshotManager.reloadIgnoreRules();
      
      const ignoreInfo = snapshotManager.getIgnoreInfo();
      expect(ignoreInfo.ignoreFileExists).toBe(false);
      expect(ignoreInfo.isLoaded).toBe(true);
      expect(ignoreInfo.patterns.length).toBeGreaterThan(0); // 应该有默认规则
    });

    it('should handle malformed .snapshotignore file gracefully', async () => {
      // 创建格式有问题的文件（实际上任何文本都是有效的，因为只是简单的行匹配）
      const ignoreFilePath = path.join(tempDir, '.snapshotignore');
      await fs.writeFile(ignoreFilePath, 'valid_pattern\n\n   \n# comment\nvalid_pattern_2');
      
      await snapshotManager.reloadIgnoreRules();
      
      const ignoreInfo = snapshotManager.getIgnoreInfo();
      expect(ignoreInfo.patterns).toContain('valid_pattern');
      expect(ignoreInfo.patterns).toContain('valid_pattern_2');
      expect(ignoreInfo.patterns).not.toContain('');
      expect(ignoreInfo.patterns).not.toContain('   ');
    });
  });

  describe('Performance', () => {
    it('should efficiently handle large numbers of files', async () => {
      const ignoreFilePath = path.join(tempDir, '.snapshotignore');
      await fs.writeFile(ignoreFilePath, '*.ignore');
      await snapshotManager.reloadIgnoreRules();
      
      // 创建大量文件路径进行测试
      const testFiles = [];
      for (let i = 0; i < 1000; i++) {
        testFiles.push(`file${i}.txt`);
        testFiles.push(`ignored${i}.ignore`);
      }
      
      const start = Date.now();
      const manager = snapshotManager as any;
      const filtered = manager.filterIgnoredFiles(testFiles);
      const duration = Date.now() - start;
      
      expect(filtered.length).toBe(1000); // 只有 .txt 文件
      expect(duration).toBeLessThan(100); // 应该在100ms内完成
    });
  });

  describe('Integration with Real Scenario', () => {
    it('should solve the news_headlines.json problem from step-prompt-saving-example', async () => {
      // 模拟真实的开发场景
      
      // 1. 首先创建 .snapshotignore 文件
      await snapshotManager.createDefaultSnapshotIgnore();
      // 🔧 重新加载规则到内存中
      await snapshotManager.reloadIgnoreRules();
      
      // 创建mock agent
      const mockAgent = createMockAgent(snapshotManager, tempDir);
      
      // 2. 开发者使用快照工具创建初始的 Python 爬虫脚本
      const initialScript = `import requests
from bs4 import BeautifulSoup
import json

def scrape_news():
    # 爬取新闻并保存到 news_headlines.json
    pass
`;
      
      const result = await ApplyWholeFileEditTool.execute({
        path: 'news_scraper.py',
        content: initialScript,
        goal: 'Create Python news scraper'
      }, mockAgent);
      
      expect(result.success).toBe(true);
      expect(result.snapshotId).toBeDefined();
      
      // 3. 模拟开发者运行脚本，脚本生成了 news_headlines.json
      // 这个文件应该被 .snapshotignore 中的 *.json 规则忽略
      const newsData = {
        headlines: [
          { title: "Test News 1", url: "http://example.com/1" },
          { title: "Test News 2", url: "http://example.com/2" }
        ]
      };
      await fs.writeFile(path.join(tempDir, 'news_headlines.json'), JSON.stringify(newsData, null, 2));
      
      // 验证 ignore 规则正确工作
      const ignoreInfo = snapshotManager.getIgnoreInfo();
      expect(ignoreInfo.patterns).toContain('*.json');
      
      // 验证过滤功能
      expect(snapshotManager.filterIgnoredFiles(['news_headlines.json'])).toEqual([]);
      expect(snapshotManager.filterIgnoredFiles(['news_scraper.py'])).toEqual(['news_scraper.py']);
      
      // 验证被忽略的文件确实存在
      const jsonExists = await fs.access(path.join(tempDir, 'news_headlines.json')).then(() => true).catch(() => false);
      expect(jsonExists).toBe(true);
      
      // 验证快照只跟踪了非忽略的文件
      const snapshot = await (snapshotManager as any).loadSnapshot(result.snapshotId);
      expect(snapshot).toBeTruthy();
      expect(snapshot.baseFileHashes).toHaveProperty('news_scraper.py');
      expect(snapshot.baseFileHashes).not.toHaveProperty('news_headlines.json');
      
      // 🔧 关键验证：即使外部进程修改被忽略的文件，过滤功能依然正常
      await fs.writeFile(path.join(tempDir, 'news_headlines.json'), JSON.stringify({
        headlines: [
          { title: "Updated News 1", url: "http://example.com/updated1" },
          { title: "Updated News 2", url: "http://example.com/updated2" },
          { title: "New News 3", url: "http://example.com/new3" }
        ]
      }, null, 2));
      
      // 过滤功能应该仍然正常工作
      expect(snapshotManager.filterIgnoredFiles(['news_headlines.json', 'news_scraper.py'])).toEqual(['news_scraper.py']);
    });
  });

  describe('Normal Operations', () => {
    it('should handle ignored files correctly during normal operations', async () => {
      // 设置 ignore 规则
      const ignoreContent = '*.json\n*.tmp\ntemp/**';
      await fs.writeFile(path.join(tempDir, '.snapshotignore'), ignoreContent);
      await snapshotManager.reloadIgnoreRules();
      
      // 创建一些文件，包括被忽略的文件
      await fs.writeFile(path.join(tempDir, 'app.py'), 'print("hello")');
      await fs.writeFile(path.join(tempDir, 'data.json'), '{"initial": "data"}');
      await fs.writeFile(path.join(tempDir, 'temp.tmp'), 'temp data');
      
      // 创建快照 - 只有非忽略的文件会被跟踪
      const snapshotId = await snapshotManager.createSnapshot({
        tool: 'CreateFile',
        description: 'Create Python file',
        affectedFiles: ['app.py', 'data.json', 'temp.tmp'], // 包含所有文件，但系统会过滤
        diff: `diff --git a/app.py b/app.py
new file mode 100644
index 0000000..8b13789
--- /dev/null
+++ b/app.py
@@ -0,0 +1 @@
+print("hello")`,
        context: { sessionId: 'test' },
        metadata: { filesSizeBytes: 100, linesChanged: 1, executionTimeMs: 10 }
      });

      expect(snapshotId).toBeDefined();
      
      // 验证过滤功能正常工作
      expect(snapshotManager.filterIgnoredFiles(['app.py', 'data.json', 'temp.tmp'])).toEqual(['app.py']);
      
      // 验证快照只跟踪了非忽略的文件
      const snapshot = await (snapshotManager as any).loadSnapshot(snapshotId);
      expect(snapshot).toBeTruthy();
      expect(snapshot.baseFileHashes).toHaveProperty('app.py');
      expect(snapshot.baseFileHashes).not.toHaveProperty('data.json');
      expect(snapshot.baseFileHashes).not.toHaveProperty('temp.tmp');
    });
  });
});

// Mock agent for testing
const createMockAgent = (snapshotManager: SimpleSnapshotManager, workspacePath: string) => {
  return {
    contextManager: {
      findContextById: (id: string) => {
        if (id === 'coding-context') {
          return {
            getSnapshotManager: () => snapshotManager,
            getRuntime: () => ({
              writeFile: async (filePath: string, content: string) => {
                await fs.writeFile(filePath, content);
                return { success: true };
              },
              readFile: async (filePath: string) => {
                return await fs.readFile(filePath, 'utf-8');
              },
              getFileStatus: async (filePath: string) => {
                try {
                  const stats = await fs.stat(filePath);
                  return {
                    exists: true,
                    type: stats.isFile() ? 'file' : 'dir'
                  };
                } catch {
                  return { exists: false };
                }
              }
            }),
            getData: () => ({ current_workspace: workspacePath })
          };
        }
        return null;
      }
    }
  } as any;
}; 