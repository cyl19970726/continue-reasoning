/**
 * Core Snapshot Manager - Handles basic snapshot operations
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { SnapshotData, SnapshotConfig } from '../interfaces';

export interface SnapshotIndexEntry {
  id: string;
  timestamp: string;
  tool: string;
  affectedFiles: string[];
  sequenceNumber: number;
  previousSnapshotId?: string;
}

export class CoreSnapshotManager {
  private workspacePath: string;
  private snapshotsDir: string;
  private snapshotIndexPath: string;
  private config: SnapshotConfig;

  // Memory cache for performance
  private snapshotIndexCache: Map<string, SnapshotIndexEntry> = new Map();
  private snapshotIdsByTime: string[] = [];
  private snapshotIdsBySequence: string[] = [];
  private cacheLoaded: boolean = false;

  constructor(workspacePath: string, config: SnapshotConfig) {
    this.workspacePath = workspacePath;
    this.snapshotsDir = path.join(workspacePath, '.continue-reasoning', 'snapshots');
    this.snapshotIndexPath = path.join(this.snapshotsDir, 'index.json');
    this.config = config;
  }

  /**
   * Initialize snapshot storage
   */
  async initialize(): Promise<void> {
    await fs.mkdir(this.snapshotsDir, { recursive: true });
    
    // Create snapshot index if it doesn't exist
    try {
      await fs.access(this.snapshotIndexPath);
    } catch {
      await fs.writeFile(this.snapshotIndexPath, JSON.stringify({ snapshots: [] }, null, 2));
    }
    
    await this.loadCache();
  }

  /**
   * Load snapshot index cache
   */
  async loadCache(): Promise<void> {
    if (this.cacheLoaded) {
      return;
    }

    try {
      const snapshotIndexContent = await fs.readFile(this.snapshotIndexPath, 'utf-8');
      const snapshotIndex = JSON.parse(snapshotIndexContent);
      
      this.snapshotIndexCache.clear();
      this.snapshotIdsByTime = [];
      this.snapshotIdsBySequence = [];
      
      for (const snapshot of snapshotIndex.snapshots || []) {
        this.snapshotIndexCache.set(snapshot.id, snapshot);
        this.snapshotIdsByTime.push(snapshot.id);
      }
      
      // Sort by timestamp
      this.snapshotIdsByTime.sort((a, b) => {
        const snapshotA = this.snapshotIndexCache.get(a)!;
        const snapshotB = this.snapshotIndexCache.get(b)!;
        return new Date(snapshotA.timestamp).getTime() - new Date(snapshotB.timestamp).getTime();
      });
      
      // Sort by sequence number
      this.snapshotIdsBySequence = [...this.snapshotIdsByTime].sort((a, b) => {
        const snapshotA = this.snapshotIndexCache.get(a)!;
        const snapshotB = this.snapshotIndexCache.get(b)!;
        return snapshotA.sequenceNumber - snapshotB.sequenceNumber;
      });

      this.cacheLoaded = true;
    } catch (error) {
      console.warn('Failed to load snapshot cache:', error);
      this.snapshotIndexCache.clear();
      this.snapshotIdsByTime = [];
      this.snapshotIdsBySequence = [];
      this.cacheLoaded = true;
    }
  }

  /**
   * Save snapshot to storage
   */
  async saveSnapshot(snapshot: SnapshotData): Promise<void> {
    const snapshotPath = this.getSnapshotPath(snapshot.timestamp, snapshot.id);
    await fs.mkdir(path.dirname(snapshotPath), { recursive: true });
    await fs.writeFile(snapshotPath, JSON.stringify(snapshot, null, 2));

    // Update cache
    const indexEntry: SnapshotIndexEntry = {
      id: snapshot.id,
      timestamp: snapshot.timestamp,
      tool: snapshot.tool,
      affectedFiles: snapshot.affectedFiles,
      sequenceNumber: snapshot.sequenceNumber,
      previousSnapshotId: snapshot.previousSnapshotId
    };

    await this.updateCache(indexEntry);
  }

  /**
   * Load snapshot by ID
   */
  async loadSnapshot(id: string): Promise<SnapshotData | null> {
    try {
      const snapshotPath = await this.findSnapshotPath(id);
      if (!snapshotPath) return null;
      
      const content = await fs.readFile(snapshotPath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      console.warn(`Failed to load snapshot ${id}:`, error);
      return null;
    }
  }

  /**
   * Get snapshot index entries
   */
  getSnapshotIndex(): SnapshotIndexEntry[] {
    return Array.from(this.snapshotIndexCache.values());
  }

  /**
   * Get snapshots sorted by time
   */
  getSnapshotIdsByTime(): string[] {
    return [...this.snapshotIdsByTime];
  }

  /**
   * Get snapshots sorted by sequence
   */
  getSnapshotIdsBySequence(): string[] {
    return [...this.snapshotIdsBySequence];
  }

  /**
   * Get latest snapshot
   */
  getLatestSnapshot(): SnapshotIndexEntry | null {
    if (this.snapshotIdsByTime.length === 0) return null;
    const latestId = this.snapshotIdsByTime[this.snapshotIdsByTime.length - 1];
    return this.snapshotIndexCache.get(latestId) || null;
  }

  /**
   * Remove snapshot from index
   */
  async removeSnapshot(id: string): Promise<void> {
    // Remove from cache
    this.snapshotIndexCache.delete(id);
    
    // Remove from sorted arrays
    this.snapshotIdsByTime = this.snapshotIdsByTime.filter(snapshotId => snapshotId !== id);
    this.snapshotIdsBySequence = this.snapshotIdsBySequence.filter(snapshotId => snapshotId !== id);
    
    // Persist updated index to disk
    const snapshotArray = Array.from(this.snapshotIndexCache.values());
    await fs.writeFile(this.snapshotIndexPath, JSON.stringify({ snapshots: snapshotArray }, null, 2));
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.snapshotIndexCache.clear();
    this.snapshotIdsByTime = [];
    this.snapshotIdsBySequence = [];
    this.cacheLoaded = false;
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return {
      cacheLoaded: this.cacheLoaded,
      snapshotCount: this.snapshotIndexCache.size,
      memoryUsage: {
        snapshotCacheSize: this.snapshotIndexCache.size,
        arraySize: this.snapshotIdsByTime.length + this.snapshotIdsBySequence.length
      }
    };
  }

  // Private helper methods

  private async updateCache(indexEntry: SnapshotIndexEntry): Promise<void> {
    this.snapshotIndexCache.set(indexEntry.id, indexEntry);
    
    // Remove existing entry from arrays if it exists (to avoid duplicates)
    this.snapshotIdsByTime = this.snapshotIdsByTime.filter(id => id !== indexEntry.id);
    this.snapshotIdsBySequence = this.snapshotIdsBySequence.filter(id => id !== indexEntry.id);
    
    // Add new entry to arrays
    this.snapshotIdsByTime.push(indexEntry.id);
    this.snapshotIdsByTime.sort((a, b) => {
      const snapshotA = this.snapshotIndexCache.get(a)!;
      const snapshotB = this.snapshotIndexCache.get(b)!;
      return new Date(snapshotA.timestamp).getTime() - new Date(snapshotB.timestamp).getTime();
    });
    
    this.snapshotIdsBySequence.push(indexEntry.id);
    this.snapshotIdsBySequence.sort((a, b) => {
      const snapshotA = this.snapshotIndexCache.get(a)!;
      const snapshotB = this.snapshotIndexCache.get(b)!;
      return snapshotA.sequenceNumber - snapshotB.sequenceNumber;
    });
    
    // Persist to disk
    const snapshotArray = Array.from(this.snapshotIndexCache.values());
    await fs.writeFile(this.snapshotIndexPath, JSON.stringify({ snapshots: snapshotArray }, null, 2));
  }

  private getSnapshotPath(timestamp: string, id: string): string {
    const date = new Date(timestamp);
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const time = date.toTimeString().substring(0, 8).replace(/:/g, '');
    
    return path.join(this.snapshotsDir, `${year}`, `${month}`, `${day}`, `${time}_${id}.json`);
  }

  private async findSnapshotPath(id: string): Promise<string | null> {
    const snapshotRef = this.snapshotIndexCache.get(id);
    if (snapshotRef) {
      return this.getSnapshotPath(snapshotRef.timestamp, id);
    }
    return null;
  }
} 