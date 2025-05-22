// Test suite for Filesystem Tools
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import path from 'path';
import {
  ReadFileTool,
  WriteFileTool,
  ListDirectoryTool,
  GetFileStatusTool,
  DeleteFileTool,
  CreateDirectoryTool
} from '../toolsets/filesystem-tools';
import { IAgent } from '../../../interfaces';
import { IRuntime } from '../runtime/interface';

describe('Filesystem Tools', () => {
  let mockAgent: Partial<IAgent>;
  let mockRuntime: Partial<IRuntime>;
  let mockCodingContext: any;
  const testWorkspace = '/test/workspace';
  
  beforeEach(() => {
    // Create mock runtime
    mockRuntime = {
      readFile: vi.fn().mockResolvedValue('mock file content'),
      writeFile: vi.fn().mockResolvedValue({ success: true, message: 'Write successful' }),
      listDirectory: vi.fn().mockResolvedValue([
        { name: 'file1.txt', type: 'file' },
        { name: 'dir1', type: 'dir' }
      ]),
      getFileStatus: vi.fn().mockResolvedValue({
        size: 100,
        type: 'file',
        modifiedAt: new Date('2023-01-01'),
        exists: true
      }),
      deleteFile: vi.fn().mockResolvedValue(true),
      createDirectory: vi.fn().mockResolvedValue(true)
    };
    
    // Create mock coding context
    mockCodingContext = {
      getData: vi.fn().mockReturnValue({
        current_workspace: testWorkspace,
        open_files: {}
      }),
      setData: vi.fn(),
      getRuntime: vi.fn().mockReturnValue(mockRuntime)
    };
    
    // Create mock agent
    mockAgent = {
      contextManager: {
        findContextById: vi.fn().mockReturnValue(mockCodingContext)
      } as any
    };
  });
  
  afterEach(() => {
    vi.restoreAllMocks();
  });
  
  describe('ReadFileTool', () => {
    it('should read a file and return its content', async () => {
      const params = { path: 'test.txt' };
      const result = await ReadFileTool.execute(params, mockAgent as any);
      
      // Check output
      expect(result.content).toEqual('mock file content');
      expect(result.lines_read).toBeGreaterThan(0);
      
      // Verify runtime was called properly
      expect(mockRuntime.readFile).toHaveBeenCalledTimes(1);
      expect(mockRuntime.readFile).toHaveBeenCalledWith(
        path.join(testWorkspace, 'test.txt'),
        { startLine: undefined, endLine: undefined }
      );
      
      // Verify context was updated
      expect(mockCodingContext.setData).toHaveBeenCalledTimes(1);
      const setDataArg = mockCodingContext.setData.mock.calls[0][0];
      expect(setDataArg.open_files).toHaveProperty('test.txt');
      expect(setDataArg.open_files['test.txt']).toHaveProperty('last_read_content', 'mock file content');
    });
    
    it('should handle a line range correctly', async () => {
      const params = { 
        path: 'test.txt',
        start_line: 5,
        end_line: 10
      };
      await ReadFileTool.execute(params, mockAgent as any);
      
      // Verify correct line range was passed to runtime
      expect(mockRuntime.readFile).toHaveBeenCalledWith(
        path.join(testWorkspace, 'test.txt'),
        { startLine: 5, endLine: 10 }
      );
    });
    
    it('should handle absolute paths', async () => {
      const absolutePath = '/absolute/path/to/test.txt';
      const params = { path: absolutePath };
      await ReadFileTool.execute(params, mockAgent as any);
      
      // Verify path was not prefixed with workspace
      expect(mockRuntime.readFile).toHaveBeenCalledWith(
        absolutePath,
        expect.anything()
      );
    });
    
    it('should handle errors from the runtime', async () => {
      // Mock a failure
      mockRuntime.readFile = vi.fn().mockRejectedValue(new Error('File not found'));
      
      const params = { path: 'nonexistent.txt' };
      
      await expect(ReadFileTool.execute(params, mockAgent as any))
        .rejects.toThrow('Failed to read file nonexistent.txt: File not found');
    });
  });
  
  describe('WriteFileTool', () => {
    it('should write to a file and return success', async () => {
      const params = { 
        path: 'test.txt',
        content: 'new content',
        mode: 'create_or_overwrite' as const
      };
      const result = await WriteFileTool.execute(params, mockAgent as any);
      
      // Check output
      expect(result.success).toBe(true);
      expect(result.message).toMatch(/Successfully wrote|Write successful/);
      
      // Verify runtime was called properly
      expect(mockRuntime.writeFile).toHaveBeenCalledTimes(1);
      expect(mockRuntime.writeFile).toHaveBeenCalledWith(
        path.join(testWorkspace, 'test.txt'),
        'new content',
        { mode: 'create_or_overwrite', startLine: undefined, endLine: undefined }
      );
    });
    
    it('should handle line range for overwrite_range mode', async () => {
      const params = { 
        path: 'test.txt',
        content: 'replacement content',
        mode: 'overwrite_range' as const,
        start_line: 5,
        end_line: 8
      };
      await WriteFileTool.execute(params, mockAgent as any);
      
      // Verify correct params passed to runtime
      expect(mockRuntime.writeFile).toHaveBeenCalledWith(
        path.join(testWorkspace, 'test.txt'),
        'replacement content',
        { mode: 'overwrite_range', startLine: 5, endLine: 8 }
      );
    });
    
    it('should handle write failures gracefully', async () => {
      // Mock a write failure
      mockRuntime.writeFile = vi.fn().mockResolvedValue({ 
        success: false, 
        message: 'Permission denied' 
      });
      
      const params = { 
        path: 'readonly.txt',
        content: 'cannot write',
        mode: 'create_or_overwrite' as const
      };
      const result = await WriteFileTool.execute(params, mockAgent as any);
      
      expect(result.success).toBe(false);
      expect(result.message).toContain('Failed to write');
    });
  });
  
  describe('ListDirectoryTool', () => {
    it('should list directory contents', async () => {
      const params = { path: 'dir1' };
      const result = await ListDirectoryTool.execute(params, mockAgent as any);
      
      // Check output format
      expect(result.entries).toHaveLength(2);
      expect(result.entries[0]).toHaveProperty('name', 'file1.txt');
      expect(result.entries[0]).toHaveProperty('type', 'file');
      expect(result.entries[1]).toHaveProperty('name', 'dir1');
      expect(result.entries[1]).toHaveProperty('type', 'dir');
      
      // Verify runtime was called properly
      expect(mockRuntime.listDirectory).toHaveBeenCalledTimes(1);
      expect(mockRuntime.listDirectory).toHaveBeenCalledWith(
        path.join(testWorkspace, 'dir1'),
        { recursive: undefined, maxDepth: undefined }
      );
    });
    
    it('should support recursive listing', async () => {
      const params = { 
        path: 'dir1', 
        recursive: true,
        max_depth: 3
      };
      await ListDirectoryTool.execute(params, mockAgent as any);
      
      // Verify recursive params passed correctly
      expect(mockRuntime.listDirectory).toHaveBeenCalledWith(
        path.join(testWorkspace, 'dir1'),
        { recursive: true, maxDepth: 3 }
      );
    });
  });
  
  describe('GetFileStatusTool', () => {
    it('should get file status information', async () => {
      const params = { path: 'test.txt' };
      const result = await GetFileStatusTool.execute(params, mockAgent as any);
      
      // Check output format
      expect(result.size).toBe(100);
      expect(result.type).toBe('file');
      expect(result.exists).toBe(true);
      expect(result.modified_at).toBe(new Date('2023-01-01').toISOString());
      
      // Verify runtime was called properly
      expect(mockRuntime.getFileStatus).toHaveBeenCalledTimes(1);
      expect(mockRuntime.getFileStatus).toHaveBeenCalledWith(
        path.join(testWorkspace, 'test.txt')
      );
    });
    
    it('should handle files that do not exist', async () => {
      // Mock file not existing
      mockRuntime.getFileStatus = vi.fn().mockResolvedValue({
        size: 0,
        type: 'file',
        modifiedAt: new Date(),
        exists: false
      });
      
      const params = { path: 'nonexistent.txt' };
      const result = await GetFileStatusTool.execute(params, mockAgent as any);
      
      expect(result.exists).toBe(false);
    });
  });
  
  describe('DeleteFileTool', () => {
    it('should delete a file and return success', async () => {
      const params = { path: 'to_delete.txt' };
      const result = await DeleteFileTool.execute(params, mockAgent as any);
      
      // Check output
      expect(result.success).toBe(true);
      
      // Verify runtime was called properly
      expect(mockRuntime.deleteFile).toHaveBeenCalledTimes(1);
      expect(mockRuntime.deleteFile).toHaveBeenCalledWith(
        path.join(testWorkspace, 'to_delete.txt')
      );
    });
    
    it('should handle deletion failures', async () => {
      // Mock deletion failure
      mockRuntime.deleteFile = vi.fn().mockResolvedValue(false);
      
      const params = { path: 'cannot_delete.txt' };
      const result = await DeleteFileTool.execute(params, mockAgent as any);
      
      expect(result.success).toBe(false);
    });
  });
  
  describe('CreateDirectoryTool', () => {
    it('should create a directory and return success', async () => {
      const params = { path: 'new_dir' };
      const result = await CreateDirectoryTool.execute(params, mockAgent as any);
      
      // Check output
      expect(result.success).toBe(true);
      
      // Verify runtime was called properly
      expect(mockRuntime.createDirectory).toHaveBeenCalledTimes(1);
      expect(mockRuntime.createDirectory).toHaveBeenCalledWith(
        path.join(testWorkspace, 'new_dir'),
        { recursive: undefined }
      );
    });
    
    it('should support recursive directory creation', async () => {
      const params = { path: 'deep/nested/dir', recursive: true };
      await CreateDirectoryTool.execute(params, mockAgent as any);
      
      // Verify recursive param passed correctly
      expect(mockRuntime.createDirectory).toHaveBeenCalledWith(
        path.join(testWorkspace, 'deep/nested/dir'),
        { recursive: true }
      );
    });
    
    it('should handle creation failures', async () => {
      // Mock creation failure
      mockRuntime.createDirectory = vi.fn().mockResolvedValue(false);
      
      const params = { path: 'cannot_create' };
      const result = await CreateDirectoryTool.execute(params, mockAgent as any);
      
      expect(result.success).toBe(false);
    });
  });
}); 