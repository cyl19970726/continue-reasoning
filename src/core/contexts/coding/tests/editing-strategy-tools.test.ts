// Test suite for Editing Strategy Tools
import { expect, describe, it, beforeEach, afterEach, vi } from 'vitest';
import { 
  ApplyWholeFileEditTool
} from '../toolsets/editing-strategy-tools';
import { IAgent } from '../../../interfaces';
import { IRuntime } from '../runtime/interface';
import path from 'path';

describe('Editing Strategy Tools', () => {
  let mockAgent: Partial<IAgent>;
  let mockRuntime: Partial<IRuntime>;
  let mockCodingContext: any;
  
  beforeEach(() => {
    // Create mock runtime
    mockRuntime = {
      readFile: vi.fn().mockResolvedValue('old file content'),
      writeFile: vi.fn().mockResolvedValue({ success: true, message: 'Write successful' }),
      getFileStatus: vi.fn().mockResolvedValue({
        size: 100,
        type: 'file',
        modifiedAt: new Date(),
        exists: true
      }),
      generateDiff: vi.fn().mockResolvedValue('mock diff content')
    };
    
    // Create mock coding context
    mockCodingContext = {
      getData: vi.fn().mockReturnValue({
        current_workspace: '/test/workspace',
        open_files: {},
        active_diffs: {}
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
  
  describe('ApplyWholeFileEditTool', () => {
    it('should apply edit to an existing file', async () => {
      const params = {
        path: 'test.txt',
        content: 'new file content'
      };
      
      const result = await ApplyWholeFileEditTool.execute(params, mockAgent as any);
      
      expect(result).toHaveProperty('success', true);
      expect(result).toHaveProperty('diff', 'mock diff content');
      expect(mockRuntime.getFileStatus).toHaveBeenCalledTimes(1);
      expect(mockRuntime.readFile).toHaveBeenCalledTimes(1);
      expect(mockRuntime.writeFile).toHaveBeenCalledTimes(1);
      expect(mockRuntime.generateDiff).toHaveBeenCalledTimes(1);
      expect(mockCodingContext.setData).toHaveBeenCalledTimes(1);
    });
    
    it('should create a new file if file does not exist', async () => {
      // Mock file not existing
      mockRuntime.getFileStatus = vi.fn().mockResolvedValue({
        exists: false,
        type: 'file',
        size: 0,
        modifiedAt: new Date()
      });
      
      const params = {
        path: 'newfile.txt',
        content: 'new file content'
      };
      
      const result = await ApplyWholeFileEditTool.execute(params, mockAgent as any);
      
      expect(result).toHaveProperty('success', true);
      expect(result).toHaveProperty('message');
      expect(result.message).toContain('created');
      expect(mockRuntime.readFile).not.toHaveBeenCalled();
      expect(mockRuntime.writeFile).toHaveBeenCalledTimes(1);
      // For a new file we don't need to generate a diff with the runtime
      // but we still generate a simple diff ourselves
      expect(result).toHaveProperty('diff');
      expect(typeof result.diff).toBe('string');
    });
    
    it('should handle write failure gracefully', async () => {
      mockRuntime.writeFile = vi.fn().mockResolvedValue({ 
        success: false, 
        message: 'Failed to write file' 
      });
      
      const params = {
        path: 'test.txt',
        content: 'new file content'
      };
      
      const result = await ApplyWholeFileEditTool.execute(params, mockAgent as any);
      
      expect(result).toHaveProperty('success', false);
      expect(result).toHaveProperty('message');
      expect(result.message).toContain('Failed to write');
    });
    
    it('should handle runtime exceptions gracefully', async () => {
      mockRuntime.getFileStatus = vi.fn().mockRejectedValue(new Error('Runtime error'));
      
      const params = {
        path: 'test.txt',
        content: 'new file content'
      };
      
      const result = await ApplyWholeFileEditTool.execute(params, mockAgent as any);
      
      expect(result).toHaveProperty('success', false);
      expect(result).toHaveProperty('message');
      expect(result.message).toContain('Runtime error');
    });
    
    it('should update context data with diff and file content', async () => {
      const params = {
        path: 'test.txt',
        content: 'new file content'
      };
      
      await ApplyWholeFileEditTool.execute(params, mockAgent as any);
      
      // Check that setData was called with the right arguments
      expect(mockCodingContext.setData).toHaveBeenCalledTimes(1);
      const setDataArg = mockCodingContext.setData.mock.calls[0][0];
      
      // Check that active_diffs has been updated with our file
      expect(setDataArg).toHaveProperty('active_diffs');
      expect(setDataArg.active_diffs).toHaveProperty('test.txt');
      
      // Check that open_files has been updated with our file
      expect(setDataArg).toHaveProperty('open_files');
      expect(setDataArg.open_files).toHaveProperty('test.txt');
      expect(setDataArg.open_files['test.txt']).toHaveProperty('last_read_content', 'new file content');
    });
  });
}); 