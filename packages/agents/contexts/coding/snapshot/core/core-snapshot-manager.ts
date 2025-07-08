/**
 * Core Snapshot Manager - Handles basic snapshot operations
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { SnapshotData, SnapshotConfig } from '../interfaces.js';

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
    
    // Create a copy of snapshot for JSON storage
    const snapshotForJson = { ...snapshot };
    
    // Handle diff file storage if enabled
    if (this.config.saveDiffFiles !== false) { // Default to true
      const diffFormat = this.config.diffFileFormat || 'md';
      
      // Save diff content to separate file
      if (snapshot.diff) {
        const diffPath = await this.saveDiffToFile(snapshot.id, snapshot.diff, diffFormat, snapshot.timestamp);
        snapshotForJson.diffPath = diffPath;
        // Keep diff content for backward compatibility but mark it as stored externally
        snapshotForJson.diff = `[Stored in ${diffPath}]`;
      }
      
      // Save reverse diff content if exists
      if (snapshot.reverseDiff) {
        const reverseDiffPath = await this.saveDiffToFile(snapshot.id, snapshot.reverseDiff, diffFormat, snapshot.timestamp, 'reverse');
        snapshotForJson.reverseDiffPath = reverseDiffPath;
        snapshotForJson.reverseDiff = `[Stored in ${reverseDiffPath}]`;
      }
    }
    
    await fs.writeFile(snapshotPath, JSON.stringify(snapshotForJson, null, 2));

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
      const snapshot = JSON.parse(content) as SnapshotData;
      
      // Load diff content from external files if they exist
      if (snapshot.diffPath && snapshot.diff?.startsWith('[Stored in ')) {
        snapshot.diff = await this.readDiffFromFile(snapshot.diffPath);
      }
      
      if (snapshot.reverseDiffPath && snapshot.reverseDiff?.startsWith('[Stored in ')) {
        snapshot.reverseDiff = await this.readDiffFromFile(snapshot.reverseDiffPath);
      }
      
      return snapshot;
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
   * Reload cache from disk
   */
  async reloadCache(): Promise<void> {
    this.clearCache();
    await this.loadCache();
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

  /**
   * Save diff content to a separate file with readable formatting
   */
  private async saveDiffToFile(
    snapshotId: string, 
    diffContent: string, 
    format: 'md' | 'diff' | 'txt', 
    timestamp: string,
    type: 'diff' | 'reverse' = 'diff'
  ): Promise<string> {
    const date = new Date(timestamp);
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const time = date.toTimeString().substring(0, 8).replace(/:/g, '');
    
    // Create diff file name
    const suffix = type === 'reverse' ? '_reverse' : '';
    const fileName = `${time}_${snapshotId}${suffix}_diff.${format}`;
    const diffDir = path.join(this.snapshotsDir, `${year}`, `${month}`, `${day}`, 'diffs');
    const diffPath = path.join(diffDir, fileName);
    
    // Ensure diff directory exists
    await fs.mkdir(diffDir, { recursive: true });
    
    // Format content based on file type
    let formattedContent = '';
    
    if (format === 'md') {
      // Markdown format with syntax highlighting
      formattedContent = this.formatDiffAsMarkdown(diffContent, snapshotId, timestamp, type);
    } else if (format === 'diff') {
      // Plain diff format
      formattedContent = diffContent;
    } else {
      // Plain text with some formatting
      formattedContent = this.formatDiffAsText(diffContent, snapshotId, timestamp, type);
    }
    
    await fs.writeFile(diffPath, formattedContent, 'utf-8');
    
    // Return relative path from snapshots directory
    return path.relative(this.snapshotsDir, diffPath);
  }

  /**
   * Format diff content as Markdown with syntax highlighting
   */
  private formatDiffAsMarkdown(diffContent: string, snapshotId: string, timestamp: string, type: 'diff' | 'reverse'): string {
    const date = new Date(timestamp).toLocaleString();
    const title = type === 'reverse' ? 'Reverse Diff' : 'Diff';
    
    return `# ${title} - ${snapshotId}

**Timestamp:** ${date}  
**Type:** ${type === 'reverse' ? 'Reverse Operation' : 'Forward Operation'}

## Changes

\`\`\`diff
${diffContent}
\`\`\`

---
*Generated by continue-reasoning snapshot system*
`;
  }

  /**
   * Format diff content as plain text with headers
   */
  private formatDiffAsText(diffContent: string, snapshotId: string, timestamp: string, type: 'diff' | 'reverse'): string {
    const date = new Date(timestamp).toLocaleString();
    const title = type === 'reverse' ? 'Reverse Diff' : 'Diff';
    
    return `${title} - ${snapshotId}
${'='.repeat(50)}

Timestamp: ${date}
Type: ${type === 'reverse' ? 'Reverse Operation' : 'Forward Operation'}

Changes:
${'-'.repeat(20)}

${diffContent}

${'='.repeat(50)}
Generated by continue-reasoning snapshot system
`;
  }

  /**
   * Read diff content from file
   */
  async readDiffFromFile(diffPath: string): Promise<string> {
    try {
      const fullPath = path.join(this.snapshotsDir, diffPath);
      return await fs.readFile(fullPath, 'utf-8');
    } catch (error) {
      console.warn(`Failed to read diff file ${diffPath}:`, error);
      return '';
    }
  }
} 