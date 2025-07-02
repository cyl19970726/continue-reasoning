import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GrepTool } from './grep';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('GrepTool', () => {
  let testDir: string;
  let mockAgent: any;

  beforeEach(async () => {
    // Create a temporary test directory
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grep-test-'));
    
    // Create test file structure with content for searching
    const structure = {
      'main.ts': `
        import { createApp } from 'vue';
        import App from './App.vue';
        
        function main() {
          const app = createApp(App);
          app.mount('#app');
        }
        
        main();
      `,
      'utils/helper.ts': `
        export function helper(input: string): string {
          return input.toUpperCase();
        }
        
        export class Helper {
          process(data: any) {
            return helper(data.toString());
          }
        }
      `,
      'components/Button.tsx': `
        import React from 'react';
        
        interface ButtonProps {
          onClick: () => void;
          children: React.ReactNode;
        }
        
        export const Button: React.FC<ButtonProps> = ({ onClick, children }) => {
          return <button onClick={onClick}>{children}</button>;
        };
      `,
      'README.md': `
        # Test Project
        
        This is a test project for grep functionality.
        
        ## Features
        - Search functionality
        - File patterns
        - Context lines
      `,
      'config.json': `
        {
          "name": "test-project",
          "version": "1.0.0",
          "description": "A test project"
        }
      `,
      'tests/helper.test.ts': `
        import { helper, Helper } from '../utils/helper';
        
        describe('helper', () => {
          it('should convert to uppercase', () => {
            expect(helper('hello')).toBe('HELLO');
          });
        });
      `
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

    // Mock agent with coding context and runtime
    mockAgent = {
      contextManager: {
        findContextById: (id: string) => {
          if (id === 'coding-context') {
            return {
              getData: () => ({
                current_workspace: testDir
              }),
              getRuntime: () => ({
                execute: async (command: string, options: any) => {
                  // Mock grep command execution
                  if (command.includes('grep')) {
                    // Simple mock implementation for testing
                    const pattern = command.match(/'([^']+)'/)?.[1] || '';
                    const files = fs.readdirSync(testDir, { recursive: true, withFileTypes: true })
                      .filter(dirent => dirent.isFile())
                      .map(dirent => path.join(dirent.path || testDir, dirent.name));
                    
                    let output = '';
                    let lineNum = 1;
                    
                    for (const file of files) {
                      try {
                        const content = fs.readFileSync(file, 'utf-8');
                        const lines = content.split('\n');
                        const relativePath = path.relative(testDir, file);
                        
                        lines.forEach((line, index) => {
                          if (line.toLowerCase().includes(pattern.toLowerCase())) {
                            output += `${relativePath}:${index + 1}:${line}\n`;
                          }
                        });
                      } catch (e) {
                        // Skip files that can't be read
                      }
                    }
                    
                    return {
                      exitCode: output ? 0 : 1,
                      stdout: output,
                      stderr: ''
                    };
                  }
                  
                  return {
                    exitCode: 1,
                    stdout: '',
                    stderr: 'Command not found'
                  };
                }
              })
            };
          }
          return null;
        }
      }
    } as any;
  });

  afterEach(() => {
    // Clean up test directory
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('should find pattern in files', async () => {
    const result = await GrepTool.execute({ 
      pattern: 'helper',
      max_results: 10
    }, mockAgent);
    
    expect(result.success).toBe(true);
    expect(result.search_pattern).toBe('helper');
    expect(Array.isArray(result.matches)).toBe(true);
  });

  it('should find React components', async () => {
    const result = await GrepTool.execute({ 
      pattern: 'React',
      max_results: 10
    }, mockAgent);
    
    expect(result.success).toBe(true);
    expect(result.search_pattern).toBe('React');
    expect(Array.isArray(result.matches)).toBe(true);
  });

  it('should find function definitions', async () => {
    const result = await GrepTool.execute({ 
      pattern: 'function',
      max_results: 10
    }, mockAgent);
    
    expect(result.success).toBe(true);
    expect(result.search_pattern).toBe('function');
    expect(Array.isArray(result.matches)).toBe(true);
  });

  it('should handle case sensitivity', async () => {
    const caseInsensitiveResult = await GrepTool.execute({ 
      pattern: 'HELPER',
      case_sensitive: false,
      max_results: 10
    }, mockAgent);
    
    const caseSensitiveResult = await GrepTool.execute({ 
      pattern: 'HELPER',
      case_sensitive: true,
      max_results: 10
    }, mockAgent);
    
    expect(caseInsensitiveResult.total_matches).toBeGreaterThanOrEqual(caseSensitiveResult.total_matches);
  });

  it('should respect max_results limit', async () => {
    const result = await GrepTool.execute({ 
      pattern: 'import',
      max_results: 2
    }, mockAgent);
    
    expect(result.success).toBe(true);
    expect(result.matches.length).toBeLessThanOrEqual(2);
  });

  it('should handle non-existent pattern', async () => {
    const result = await GrepTool.execute({ 
      pattern: 'nonexistentpattern12345',
      max_results: 10
    }, mockAgent);
    
    expect(result.success).toBe(true);
    expect(result.total_matches).toBe(0);
    expect(result.matches).toEqual([]);
  });

  it('should include file path and line numbers', async () => {
    const result = await GrepTool.execute({ 
      pattern: 'export',
      max_results: 5
    }, mockAgent);
    
    expect(result.success).toBe(true);
    if (result.matches.length > 0) {
      result.matches.forEach(match => {
        expect(match.file_path).toBeDefined();
        expect(typeof match.file_path).toBe('string');
        expect(match.line_number).toBeDefined();
        expect(typeof match.line_number).toBe('number');
        expect(match.line_content).toBeDefined();
        expect(typeof match.line_content).toBe('string');
      });
    }
  });

  it('should handle missing coding context', async () => {
    const invalidAgent = {
      contextManager: {
        findContextById: () => null
      }
    };

    await expect(GrepTool.execute({ pattern: 'test' }, invalidAgent as any))
      .rejects.toThrow('Coding context not found');
  });

  it('should search in specific file types', async () => {
    const result = await GrepTool.execute({ 
      pattern: 'import',
      include_patterns: ['*.ts', '*.tsx'],
      max_results: 10
    }, mockAgent);
    
    expect(result.success).toBe(true);
    if (result.matches.length > 0) {
      result.matches.forEach(match => {
        expect(match.file_path).toMatch(/\.(ts|tsx)$/);
      });
    }
  });

  it('should exclude specific patterns', async () => {
    const result = await GrepTool.execute({ 
      pattern: 'test',
      exclude_patterns: ['*.md'],
      max_results: 10
    }, mockAgent);
    
    expect(result.success).toBe(true);
    result.matches.forEach(match => {
      expect(match.file_path).not.toMatch(/\.md$/);
    });
  });
}); 