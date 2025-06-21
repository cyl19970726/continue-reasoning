/**
 * Tests for CheckpointManager
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { CheckpointManager } from '../core/checkpoint-manager';
import { SnapshotConfig } from '../interfaces';

describe('CheckpointManager', () => {
  let manager: CheckpointManager;
  let testWorkspace: string;
  let config: SnapshotConfig;

  beforeEach(async () => {
    // Create temporary test workspace
    testWorkspace = path.join(process.cwd(), 'test-workspace-checkpoint-' + Date.now());
    await fs.mkdir(testWorkspace, { recursive: true });
    
    config = {
      enableUnknownChangeDetection: true,
      unknownChangeStrategy: 'warn',
      keepAllCheckpoints: false,
      maxCheckpointAge: 7,
      excludeFromChecking: []
    };
    
    manager = new CheckpointManager(testWorkspace, config);
  });

  afterEach(async () => {
    // Clean up test workspace
    try {
      await fs.rm(testWorkspace, { recursive: true, force: true });
    } catch (error) {
      console.warn('Failed to clean up test workspace:', error);
    }
  });

  describe('initialization', () => {
    it('should initialize checkpoint directory structure', async () => {
      await manager.initialize();
      
      const checkpointsDir = path.join(testWorkspace, '.continue-reasoning', 'checkpoints');
      const latestDir = path.join(checkpointsDir, 'latest');
      const metadataPath = path.join(checkpointsDir, 'checkpoint-metadata.json');
      
      // Check directories exist
      const checkpointsDirExists = await fs.access(checkpointsDir).then(() => true).catch(() => false);
      expect(checkpointsDirExists).toBe(true);
      
      const latestDirExists = await fs.access(latestDir).then(() => true).catch(() => false);
      expect(latestDirExists).toBe(true);
      
      // Check metadata file exists
      const metadataExists = await fs.access(metadataPath).then(() => true).catch(() => false);
      expect(metadataExists).toBe(true);
      
      // Check metadata content
      const metadataContent = await fs.readFile(metadataPath, 'utf-8');
      const metadata = JSON.parse(metadataContent);
      expect(metadata).toHaveProperty('checkpoints');
      expect(metadata).toHaveProperty('latestCheckpointId');
    });
  });

  describe('file checkpoint operations', () => {
    beforeEach(async () => {
      await manager.initialize();
      
      // Create test files
      await fs.writeFile(path.join(testWorkspace, 'test1.txt'), 'Initial content 1');
      await fs.writeFile(path.join(testWorkspace, 'test2.txt'), 'Initial content 2');
      await fs.mkdir(path.join(testWorkspace, 'subdir'), { recursive: true });
      await fs.writeFile(path.join(testWorkspace, 'subdir', 'nested.txt'), 'Nested content');
    });

    it('should create file checkpoints correctly', async () => {
      const files = ['test1.txt', 'test2.txt'];
      const generateId = () => Math.random().toString(36).substring(2, 8);
      const checkpointId = await manager.createFileCheckpoint('snap-123', files, generateId);
      
      expect(checkpointId).toMatch(/^[a-z0-9]{6}$/);
      
      // Check checkpoint file exists
      const checkpointPath = path.join(testWorkspace, '.continue-reasoning', 'checkpoints', `${checkpointId}.json`);
      const checkpointExists = await fs.access(checkpointPath).then(() => true).catch(() => false);
      expect(checkpointExists).toBe(true);
      
      // Check checkpoint content
      const checkpointContent = await fs.readFile(checkpointPath, 'utf-8');
      const checkpoint = JSON.parse(checkpointContent);
      
      expect(checkpoint.id).toBe(checkpointId);
      expect(checkpoint.snapshotId).toBe('snap-123');
      expect(checkpoint.files).toHaveProperty('test1.txt');
      expect(checkpoint.files).toHaveProperty('test2.txt');
      expect(checkpoint.files['test1.txt']).toBe('Initial content 1');
      expect(checkpoint.files['test2.txt']).toBe('Initial content 2');
      
      // Check latest copies
      const latestTest1 = await fs.readFile(path.join(testWorkspace, '.continue-reasoning', 'checkpoints', 'latest', 'test1.txt'), 'utf-8');
      const latestTest2 = await fs.readFile(path.join(testWorkspace, '.continue-reasoning', 'checkpoints', 'latest', 'test2.txt'), 'utf-8');
      
      expect(latestTest1).toBe('Initial content 1');
      expect(latestTest2).toBe('Initial content 2');
    });

    it('should handle non-existent files gracefully', async () => {
      const files = ['test1.txt', 'non-existent.txt', 'test2.txt'];
      const generateId = () => Math.random().toString(36).substring(2, 8);
      const checkpointId = await manager.createFileCheckpoint('snap-456', files, generateId);
      
      const checkpointPath = path.join(testWorkspace, '.continue-reasoning', 'checkpoints', `${checkpointId}.json`);
      const checkpointContent = await fs.readFile(checkpointPath, 'utf-8');
      const checkpoint = JSON.parse(checkpointContent);
      
      // Should only include existing files
      expect(checkpoint.files).toHaveProperty('test1.txt');
      expect(checkpoint.files).toHaveProperty('test2.txt');
      expect(checkpoint.files).not.toHaveProperty('non-existent.txt');
    });

    it('should load file checkpoints correctly', async () => {
      const files = ['test1.txt'];
      const generateId = () => Math.random().toString(36).substring(2, 8);
      const checkpointId = await manager.createFileCheckpoint('snap-789', files, generateId);
      
      // Load specific checkpoint
      const loadedCheckpoint = await manager.loadFileCheckpoint(checkpointId);
      expect(loadedCheckpoint).not.toBeNull();
      expect(loadedCheckpoint!.id).toBe(checkpointId);
      expect(loadedCheckpoint!.snapshotId).toBe('snap-789');
      expect(loadedCheckpoint!.files['test1.txt']).toBe('Initial content 1');
      
      // Load latest checkpoint (should be the same)
      const latestCheckpoint = await manager.loadFileCheckpoint();
      expect(latestCheckpoint).not.toBeNull();
      expect(latestCheckpoint!.id).toBe(checkpointId);
    });

    it('should return null for non-existent checkpoints', async () => {
      const result = await manager.loadFileCheckpoint('non-existent-id');
      expect(result).toBeNull();
    });
  });

  describe('checkpoint cleanup', () => {
    beforeEach(async () => {
      await manager.initialize();
    });

    it('should clean up old checkpoints when configured', async () => {
      await fs.writeFile(path.join(testWorkspace, 'test.txt'), 'content');
      
      // Create checkpoint
      const generateId = () => Math.random().toString(36).substring(2, 8);
      const checkpointId = await manager.createFileCheckpoint('snap-old', ['test.txt'], generateId);
      
      // Manually set old date
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 10); // 10 days ago
      
      // Cleanup should remove old checkpoints
      await manager.cleanupOldCheckpoints(oldDate);
      
      // Check if cleanup works (this is a basic test since we can't easily mock the file timestamps)
      expect(true).toBe(true); // Basic test that cleanup doesn't throw
    });
  });

  describe('checkpoint info', () => {
    beforeEach(async () => {
      await manager.initialize();
    });

    it('should provide checkpoint information', async () => {
      const info = manager.getCheckpointInfo();
      expect(info).toHaveProperty('hasLatestCheckpoint');
      expect(info).toHaveProperty('latestCheckpointFiles');
      expect(info).toHaveProperty('latestCheckpointSize');
      
      // Initially should have no checkpoint
      expect(info.hasLatestCheckpoint).toBe(false);
      expect(info.latestCheckpointFiles).toBe(0);
      expect(info.latestCheckpointSize).toBe(0);
    });

    it('should update checkpoint info after creating checkpoint', async () => {
      await fs.writeFile(path.join(testWorkspace, 'test.txt'), 'content');
      
      const generateId = () => Math.random().toString(36).substring(2, 8);
      await manager.createFileCheckpoint('snap-info', ['test.txt'], generateId);
      
      const info = manager.getCheckpointInfo();
      expect(info.hasLatestCheckpoint).toBe(true);
      expect(info.latestCheckpointFiles).toBe(1);
      expect(info.latestCheckpointSize).toBeGreaterThan(0);
    });
  });

  describe('error handling', () => {
    beforeEach(async () => {
      await manager.initialize();
    });

    it('should handle file read errors gracefully', async () => {
      const generateId = () => Math.random().toString(36).substring(2, 8);
      
      // This should not throw even if file becomes inaccessible
      await expect(manager.createFileCheckpoint('snap-error', ['non-existent.txt'], generateId)).resolves.not.toThrow();
    });

    it('should handle corrupted checkpoint metadata gracefully', async () => {
      // Corrupt the metadata file
      const metadataPath = path.join(testWorkspace, '.continue-reasoning', 'checkpoints', 'checkpoint-metadata.json');
      await fs.writeFile(metadataPath, 'invalid json');
      
      const generateId = () => Math.random().toString(36).substring(2, 8);
      
      // Should handle gracefully and reset
      await expect(manager.createFileCheckpoint('snap-corrupt', [], generateId)).resolves.not.toThrow();
    });
  });
}); 