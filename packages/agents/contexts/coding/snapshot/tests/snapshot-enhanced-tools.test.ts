import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ApplyWholeFileEditTool } from '../snapshot-enhanced-tools';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('ApplyWholeFileEditTool', () => {
  let testDir: string;
  let mockAgent: any;
  let mockRuntime: any;
  let mockSnapshotManager: any;
  let createdSnapshotId: string;

  beforeEach(() => {
    // Create temporary test directory
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'apply-whole-file-edit-test-'));
    createdSnapshotId = 'snapshot-123';

    // Mock runtime
    mockRuntime = {
      getFileStatus: vi.fn().mockImplementation(async (filePath: string) => {
        try {
          const stats = fs.statSync(filePath);
          return {
            exists: true,
            type: stats.isDirectory() ? 'dir' : 'file',
            size: stats.size
          };
        } catch (e: any) {
          if (e.code === 'ENOENT') {
            return { exists: false };
          }
          throw e;
        }
      }),
      readFile: vi.fn().mockImplementation(async (filePath: string) => {
        return fs.readFileSync(filePath, 'utf-8');
      }),
      writeFile: vi.fn().mockImplementation(async (filePath: string, content: string) => {
        // Create directory if it doesn't exist
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(filePath, content, 'utf-8');
        return { success: true };
      })
    };

    // Mock snapshot manager
    mockSnapshotManager = {
      createSnapshot: vi.fn().mockResolvedValue(createdSnapshotId),
      readSnapshotDiff: vi.fn().mockResolvedValue({
        success: true,
        snapshot: {
          diffPath: `/snapshots/${createdSnapshotId}.diff`
        }
      })
    };

    // Mock coding context
    const mockCodingContext = {
      getData: () => ({ current_workspace: testDir }),
      getRuntime: () => mockRuntime,
      getSnapshotManager: () => mockSnapshotManager
    };

    // Mock agent
    mockAgent = {
      contextManager: {
        findContextById: (id: string) => {
          if (id === 'coding-context') {
            return mockCodingContext;
          }
          return null;
        }
      }
    } as unknown as IAgent;
  });

  afterEach(() => {
    // Clean up test directory
    fs.rmSync(testDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  describe('Creating new files', () => {
    it('should create a new file with content', async () => {
      const params = {
        path: 'newfile.txt',
        content: 'Hello, World!',
        goal: 'Create a greeting file'
      };

      const result = await ApplyWholeFileEditTool.execute(params, mockAgent);

      expect(result.success).toBe(true);
      expect(result.message).toContain('Successfully created file');
      expect(result.message).toContain('newfile.txt');
      expect(result.message).toContain('Create a greeting file');
      expect(result.snapshotId).toBe(createdSnapshotId);
      expect(result.diffPath).toBe(`/snapshots/${createdSnapshotId}.diff`);

      // Verify file was created
      const filePath = path.join(testDir, 'newfile.txt');
      expect(fs.existsSync(filePath)).toBe(true);
      expect(fs.readFileSync(filePath, 'utf-8')).toBe('Hello, World!');

      // Verify snapshot was created with correct parameters
      expect(mockSnapshotManager.createSnapshot).toHaveBeenCalledWith({
        tool: 'ApplyWholeFileEdit',
        description: 'Create a greeting file',
        affectedFiles: ['newfile.txt'],
        diff: expect.stringMatching(/--- \/dev\/null[\s\S]*\+\+\+ b\/newfile\.txt/),
        context: {
          sessionId: 'default',
          toolParams: { path: 'newfile.txt', contentLength: 13 }
        },
        metadata: expect.objectContaining({
          filesSizeBytes: 13,
          linesChanged: expect.any(Number),
          executionTimeMs: expect.any(Number)
        })
      });
    });

    it('should create a file in a nested directory', async () => {
      const params = {
        path: 'src/components/Button.tsx',
        content: 'export const Button = () => <button>Click me</button>;',
        goal: 'Create Button component'
      };

      const result = await ApplyWholeFileEditTool.execute(params, mockAgent);

      expect(result.success).toBe(true);
      expect(result.message).toContain('Successfully created file');
      expect(result.message).toContain('src/components/Button.tsx');

      // Verify file and directories were created
      const filePath = path.join(testDir, 'src/components/Button.tsx');
      expect(fs.existsSync(filePath)).toBe(true);
      expect(fs.readFileSync(filePath, 'utf-8')).toBe(params.content);
    });

    it('should handle empty content for new file', async () => {
      const params = {
        path: 'empty.txt',
        content: '',
        goal: 'Create empty file'
      };

      const result = await ApplyWholeFileEditTool.execute(params, mockAgent);

      expect(result.success).toBe(true);
      expect(result.message).toContain('Successfully created file');

      const filePath = path.join(testDir, 'empty.txt');
      expect(fs.existsSync(filePath)).toBe(true);
      expect(fs.readFileSync(filePath, 'utf-8')).toBe('');
    });
  });

  describe('Updating existing files', () => {
    it('should update an existing file', async () => {
      // Create initial file
      const filePath = path.join(testDir, 'existing.txt');
      fs.writeFileSync(filePath, 'Original content');

      const params = {
        path: 'existing.txt',
        content: 'Updated content',
        goal: 'Update file content'
      };

      const result = await ApplyWholeFileEditTool.execute(params, mockAgent);

      expect(result.success).toBe(true);
      expect(result.message).toContain('Successfully updated file');
      expect(result.message).toContain('existing.txt');
      expect(result.message).toContain('Update file content');

      // Verify file was updated
      expect(fs.readFileSync(filePath, 'utf-8')).toBe('Updated content');

      // Verify diff was generated correctly
      expect(mockSnapshotManager.createSnapshot).toHaveBeenCalledWith(
        expect.objectContaining({
          diff: expect.stringMatching(/--- a\/existing\.txt[\s\S]*\+\+\+ b\/existing\.txt[\s\S]*-Original content[\s\S]*\+Updated content/)
        })
      );
    });

    it('should handle replacing file with empty content', async () => {
      const filePath = path.join(testDir, 'to-empty.txt');
      fs.writeFileSync(filePath, 'Some content to be removed');

      const params = {
        path: 'to-empty.txt',
        content: '',
        goal: 'Empty the file'
      };

      const result = await ApplyWholeFileEditTool.execute(params, mockAgent);

      expect(result.success).toBe(true);
      expect(fs.readFileSync(filePath, 'utf-8')).toBe('');
    });
  });

  describe('Error handling', () => {
    it('should fail when content parameter is missing', async () => {
      const params = {
        path: 'missing-content.txt',
        // content is missing
        goal: 'Test missing content'
      } as any;

      const result = await ApplyWholeFileEditTool.execute(params, mockAgent);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Content parameter is required but was not provided');
    });

    it('should fail when content is undefined', async () => {
      const params = {
        path: 'undefined-content.txt',
        content: undefined as any,
        goal: 'Test undefined content'
      };

      const result = await ApplyWholeFileEditTool.execute(params, mockAgent);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Content parameter is required but was not provided');
    });

    it('should fail when coding context is not found', async () => {
      const invalidAgent = {
        contextManager: {
          findContextById: () => null
        }
      } as any;

      const params = {
        path: 'test.txt',
        content: 'test',
        goal: 'Test missing context'
      };

      const result = await ApplyWholeFileEditTool.execute(params, invalidAgent);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Coding context not found');
    });

    it('should fail when runtime is not found', async () => {
      const mockCodingContextNoRuntime = {
        getData: () => ({ current_workspace: testDir }),
        getRuntime: () => null,
        getSnapshotManager: () => mockSnapshotManager
      };

      const agentWithNoRuntime = {
        contextManager: {
          findContextById: (id: string) => {
            if (id === 'coding-context') {
              return mockCodingContextNoRuntime;
            }
            return null;
          }
        }
      } as any;

      const params = {
        path: 'test.txt',
        content: 'test',
        goal: 'Test missing runtime'
      };

      const result = await ApplyWholeFileEditTool.execute(params, agentWithNoRuntime);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Runtime not found');
    });

    it('should handle write failures gracefully', async () => {
      mockRuntime.writeFile.mockResolvedValueOnce({
        success: false,
        message: 'Permission denied'
      });

      const params = {
        path: 'readonly.txt',
        content: 'test content',
        goal: 'Test write failure'
      };

      const result = await ApplyWholeFileEditTool.execute(params, mockAgent);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Permission denied');
    });
  });

  describe('Path handling', () => {
    it('should handle absolute paths', async () => {
      const absolutePath = path.join(testDir, 'absolute.txt');
      const params = {
        path: absolutePath,
        content: 'Absolute path content',
        goal: 'Test absolute path'
      };

      const result = await ApplyWholeFileEditTool.execute(params, mockAgent);

      expect(result.success).toBe(true);
      expect(fs.existsSync(absolutePath)).toBe(true);
      expect(fs.readFileSync(absolutePath, 'utf-8')).toBe('Absolute path content');
    });

    it('should handle relative paths', async () => {
      const params = {
        path: './relative/path/file.txt',
        content: 'Relative path content',
        goal: 'Test relative path'
      };

      const result = await ApplyWholeFileEditTool.execute(params, mockAgent);

      expect(result.success).toBe(true);
      const expectedPath = path.join(testDir, 'relative/path/file.txt');
      expect(fs.existsSync(expectedPath)).toBe(true);
      expect(fs.readFileSync(expectedPath, 'utf-8')).toBe('Relative path content');
    });
  });

  describe('Goal parameter handling', () => {
    it('should include goal in success message', async () => {
      const params = {
        path: 'with-goal.txt',
        content: 'content',
        goal: 'Testing goal parameter'
      };

      const result = await ApplyWholeFileEditTool.execute(params, mockAgent);

      expect(result.success).toBe(true);
      expect(result.message).toContain('Testing goal parameter');
    });

    it('should handle missing goal parameter', async () => {
      const params = {
        path: 'no-goal.txt',
        content: 'content'
        // goal is optional and missing
      };

      const result = await ApplyWholeFileEditTool.execute(params, mockAgent);

      expect(result.success).toBe(true);
      expect(mockSnapshotManager.createSnapshot).toHaveBeenCalledWith(
        expect.objectContaining({
          description: 'No goal provided'
        })
      );
    });
  });

  describe('Large file handling', () => {
    it('should handle large content', async () => {
      const largeContent = 'x'.repeat(1000000); // 1MB of 'x'
      const params = {
        path: 'large.txt',
        content: largeContent,
        goal: 'Create large file'
      };

      const result = await ApplyWholeFileEditTool.execute(params, mockAgent);

      expect(result.success).toBe(true);
      const filePath = path.join(testDir, 'large.txt');
      expect(fs.existsSync(filePath)).toBe(true);
      expect(fs.readFileSync(filePath, 'utf-8').length).toBe(1000000);
    });
  });

  describe('Special content handling', () => {
    it('should handle content with special characters', async () => {
      const specialContent = `Line 1
Line with "quotes" and 'apostrophes'
Line with \t tabs and \\ backslashes
Line with ${String.fromCharCode(0)} null character`;

      const params = {
        path: 'special.txt',
        content: specialContent,
        goal: 'Test special characters'
      };

      const result = await ApplyWholeFileEditTool.execute(params, mockAgent);

      expect(result.success).toBe(true);
      const filePath = path.join(testDir, 'special.txt');
      expect(fs.readFileSync(filePath, 'utf-8')).toBe(specialContent);
    });

    it('should handle UTF-8 content', async () => {
      const utf8Content = 'Hello 世界 🌍 Здравствуй мир';
      const params = {
        path: 'utf8.txt',
        content: utf8Content,
        goal: 'Test UTF-8 content'
      };

      const result = await ApplyWholeFileEditTool.execute(params, mockAgent);

      expect(result.success).toBe(true);
      const filePath = path.join(testDir, 'utf8.txt');
      expect(fs.readFileSync(filePath, 'utf-8')).toBe(utf8Content);
    });
  });
});