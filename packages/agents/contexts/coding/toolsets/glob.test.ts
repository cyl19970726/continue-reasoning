import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GlobTool } from './glob';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('GlobTool', () => {
  let testDir: string;
  let mockAgent: any;

  beforeEach(async () => {
    // Create a temporary test directory
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'glob-test-'));
    
    // Create test file structure
    const structure = {
      'file1.ts': 'export const test1 = "hello";',
      'file2.js': 'console.log("world");',
      'README.md': '# Test Project',
      'src/components/Button.tsx': 'export const Button = () => <button>Click</button>;',
      'src/utils/helper.ts': 'export function helper() { return true; }',
      'src/index.ts': 'export * from "./utils/helper";',
      'tests/unit/helper.test.ts': 'import { helper } from "../../src/utils/helper";',
      'tests/integration/app.test.js': 'describe("app", () => {});',
      'dist/bundle.js': '// Generated bundle',
      'node_modules/package/index.js': '// External dependency',
      '.git/config': '[core]',
    };

    // Create directories and files
    for (const [filePath, content] of Object.entries(structure)) {
      const fullPath = path.join(testDir, filePath);
      const dir = path.dirname(fullPath);
      
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      fs.writeFileSync(fullPath, content);
    }

    // Mock agent with coding context
    mockAgent = {
      contextManager: {
        findContextById: (id: string) => {
          if (id === 'coding-context') {
            return {
              getData: () => ({
                current_workspace: testDir
              })
            };
          }
          return null;
        }
      }
    };
  });

  afterEach(() => {
    // Clean up test directory
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('should find all TypeScript files', async () => {
    const result = await GlobTool.execute({ pattern: '*.ts' }, mockAgent);
    
    expect(result.success).toBe(true);
    expect(result.total_matches).toBe(1);
    expect(result.files).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ file_path: 'file1.ts' })
      ])
    );
  });

  it('should find TypeScript files recursively with **', async () => {
    const result = await GlobTool.execute({ pattern: '**/*.ts' }, mockAgent);
    
    expect(result.success).toBe(true);
    // Should find at least the TypeScript files we created
    expect(result.total_matches).toBeGreaterThan(0);
    const filePaths = result.files.map(f => f.file_path);
    expect(filePaths.some(path => path.includes('.ts'))).toBe(true);
  });

  it('should find React components', async () => {
    const result = await GlobTool.execute({ pattern: '**/*.tsx' }, mockAgent);
    
    expect(result.success).toBe(true);
    expect(result.total_matches).toBe(1);
    expect(result.files[0].file_path).toBe('src/components/Button.tsx');
  });

  it('should find test files', async () => {
    const result = await GlobTool.execute({ pattern: '**/*.test.*' }, mockAgent);
    
    expect(result.success).toBe(true);
    expect(result.total_matches).toBeGreaterThanOrEqual(1);
    const hasTestFile = result.files.some(f => f.file_path.includes('.test.'));
    expect(hasTestFile).toBe(true);
  });

  it('should respect exclude patterns', async () => {
    const result = await GlobTool.execute({ 
      pattern: '**/*.js',
      exclude_patterns: ['node_modules/**', 'dist/**']
    }, mockAgent);
    
    expect(result.success).toBe(true);
    // May find JS files but should exclude those in specified directories
    expect(result.files.every(f => !f.file_path.includes('node_modules/'))).toBe(true);
    expect(result.files.every(f => !f.file_path.includes('dist/'))).toBe(true);
  });

  it('should respect max_results limit', async () => {
    const result = await GlobTool.execute({ 
      pattern: '**/*',
      max_results: 3
    }, mockAgent);
    
    expect(result.success).toBe(true);
    // Should respect max_results limit
    expect(result.files.length).toBeLessThanOrEqual(3);
  });

  it('should handle case sensitivity', async () => {
    // Create a file with mixed case
    fs.writeFileSync(path.join(testDir, 'MixedCase.TS'), 'test content');
    
    const caseInsensitiveResult = await GlobTool.execute({ 
      pattern: '*.ts',
      case_sensitive: false
    }, mockAgent);
    
    const caseSensitiveResult = await GlobTool.execute({ 
      pattern: '*.ts',
      case_sensitive: true
    }, mockAgent);
    
    expect(caseInsensitiveResult.total_matches).toBeGreaterThan(caseSensitiveResult.total_matches);
  });

  it('should search in specific paths', async () => {
    const result = await GlobTool.execute({ 
      pattern: '**/*.ts',
      paths: ['src']
    }, mockAgent);
    
    expect(result.success).toBe(true);
    expect(result.total_matches).toBeGreaterThanOrEqual(1);
    expect(result.files.some(f => f.file_path.includes('src/'))).toBe(true);
  });

  it('should return empty result for non-matching pattern', async () => {
    const result = await GlobTool.execute({ pattern: '*.nonexistent' }, mockAgent);
    
    expect(result.success).toBe(true);
    expect(result.total_matches).toBe(0);
    expect(result.files).toEqual([]);
    expect(result.message).toBe('No files matched');
  });

  it('should handle missing coding context', async () => {
    const invalidAgent = {
      contextManager: {
        findContextById: () => null
      }
    } as any;

    await expect(GlobTool.execute({ pattern: '*.ts' }, invalidAgent))
      .rejects.toThrow('Coding context not found');
  });

  it('should include file sizes', async () => {
    const result = await GlobTool.execute({ pattern: '*.ts' }, mockAgent);
    
    expect(result.success).toBe(true);
    result.files.forEach(file => {
      expect(file.size_bytes).toBeDefined();
      expect(typeof file.size_bytes).toBe('number');
      expect(file.size_bytes).toBeGreaterThan(0);
    });
  });
}); 