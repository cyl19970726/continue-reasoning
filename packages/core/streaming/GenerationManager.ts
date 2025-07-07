/**
 * 代际管理系统 - 解决并发和中断问题
 * 基于Codex CLI的generation模式实现
 */

import { logger } from '../utils/logger';

/**
 * 代际管理器接口
 */
export interface IGenerationManager {
  /**
   * 获取当前代际
   */
  getCurrentGeneration(): number;
  
  /**
   * 推进到下一代际（通常在取消时调用）
   */
  nextGeneration(): number;
  
  /**
   * 检查指定代际是否仍然有效
   */
  isValidGeneration(generation: number): boolean;
  
  /**
   * 注册代际相关的清理函数
   */
  onGenerationChange(callback: (newGeneration: number, oldGeneration: number) => void): () => void;
}

/**
 * 代际感知的操作接口
 */
export interface IGenerationAware {
  /**
   * 设置代际管理器
   */
  setGenerationManager(manager: IGenerationManager): void;
  
  /**
   * 获取当前操作的代际
   */
  getGeneration(): number;
  
  /**
   * 检查当前操作是否仍然有效
   */
  isCurrentGeneration(): boolean;
}

/**
 * 代际管理器实现
 */
export class GenerationManager implements IGenerationManager {
  private currentGeneration = 0;
  private changeCallbacks: Array<(newGen: number, oldGen: number) => void> = [];
  
  constructor(private readonly name: string = 'default') {
    logger.debug(`GenerationManager '${this.name}' created`);
  }
  
  getCurrentGeneration(): number {
    return this.currentGeneration;
  }
  
  nextGeneration(): number {
    const oldGeneration = this.currentGeneration;
    this.currentGeneration += 1;
    
    logger.debug(`GenerationManager '${this.name}': ${oldGeneration} -> ${this.currentGeneration}`);
    
    // 通知所有监听器
    this.changeCallbacks.forEach(callback => {
      try {
        callback(this.currentGeneration, oldGeneration);
      } catch (error) {
        logger.error(`Error in generation change callback:`, error);
      }
    });
    
    return this.currentGeneration;
  }
  
  isValidGeneration(generation: number): boolean {
    return generation === this.currentGeneration;
  }
  
  onGenerationChange(callback: (newGeneration: number, oldGeneration: number) => void): () => void {
    this.changeCallbacks.push(callback);
    
    // 返回取消订阅函数
    return () => {
      const index = this.changeCallbacks.indexOf(callback);
      if (index !== -1) {
        this.changeCallbacks.splice(index, 1);
      }
    };
  }
  
  /**
   * 清理所有监听器
   */
  cleanup(): void {
    this.changeCallbacks = [];
    logger.debug(`GenerationManager '${this.name}' cleaned up`);
  }
}

/**
 * 代际感知的基类
 */
export abstract class GenerationAwareBase implements IGenerationAware {
  protected generationManager?: IGenerationManager;
  protected generation: number = 0;
  private unsubscribe?: () => void;
  
  setGenerationManager(manager: IGenerationManager): void {
    // 清理旧的订阅
    if (this.unsubscribe) {
      this.unsubscribe();
    }
    
    this.generationManager = manager;
    this.generation = manager.getCurrentGeneration();
    
    // 监听代际变化
    this.unsubscribe = manager.onGenerationChange((newGen, oldGen) => {
      this.onGenerationChanged(newGen, oldGen);
    });
  }
  
  getGeneration(): number {
    return this.generation;
  }
  
  isCurrentGeneration(): boolean {
    return this.generationManager?.isValidGeneration(this.generation) ?? true;
  }
  
  /**
   * 代际变化时的回调（子类可以重写）
   */
  protected onGenerationChanged(newGeneration: number, oldGeneration: number): void {
    // 默认实现：不更新当前generation，让现有操作自然失效
    logger.debug(`Generation changed: ${oldGeneration} -> ${newGeneration}, current: ${this.generation}`);
  }
  
  /**
   * 清理代际相关资源
   */
  protected cleanupGeneration(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = undefined;
    }
  }
}

/**
 * 代际感知的延迟执行器
 */
export class GenerationAwareDelayedExecutor extends GenerationAwareBase {
  private pendingTimeouts = new Set<NodeJS.Timeout>();
  
  /**
   * 延迟执行函数，如果代际失效则不执行
   */
  delayedExecute(
    fn: () => void | Promise<void>,
    delayMs: number = 0,
    description?: string
  ): void {
    const executionGeneration = this.generation;
    
    const timeout = setTimeout(async () => {
      this.pendingTimeouts.delete(timeout);
      
      // 检查代际是否仍然有效
      if (!this.generationManager?.isValidGeneration(executionGeneration)) {
        logger.debug(`Skipping delayed execution '${description}' - generation ${executionGeneration} is outdated`);
        return;
      }
      
      try {
        await fn();
      } catch (error) {
        logger.error(`Error in delayed execution '${description}':`, error);
      }
    }, delayMs);
    
    this.pendingTimeouts.add(timeout);
  }
  
  /**
   * 取消所有待执行的任务
   */
  cancelAll(): void {
    this.pendingTimeouts.forEach(timeout => {
      clearTimeout(timeout);
    });
    this.pendingTimeouts.clear();
    logger.debug(`Cancelled ${this.pendingTimeouts.size} pending delayed executions`);
  }
  
  /**
   * 重写代际变化处理
   */
  protected onGenerationChanged(newGeneration: number, oldGeneration: number): void {
    super.onGenerationChanged(newGeneration, oldGeneration);
    // 取消所有待执行的任务
    this.cancelAll();
  }
  
  /**
   * 清理资源
   */
  cleanup(): void {
    this.cancelAll();
    this.cleanupGeneration();
  }
}

/**
 * 代际感知的流式处理器
 */
export class GenerationAwareStreamProcessor extends GenerationAwareBase {
  private activeStreams = new Set<string>();
  
  /**
   * 开始处理流
   */
  startStream(streamId: string): boolean {
    if (!this.isCurrentGeneration()) {
      logger.debug(`Cannot start stream '${streamId}' - generation ${this.generation} is outdated`);
      return false;
    }
    
    this.activeStreams.add(streamId);
    logger.debug(`Started stream '${streamId}' in generation ${this.generation}`);
    return true;
  }
  
  /**
   * 结束流处理
   */
  endStream(streamId: string): void {
    this.activeStreams.delete(streamId);
    logger.debug(`Ended stream '${streamId}'`);
  }
  
  /**
   * 检查流是否仍然活跃且有效
   */
  isStreamValid(streamId: string): boolean {
    return this.activeStreams.has(streamId) && this.isCurrentGeneration();
  }
  
  /**
   * 处理流事件（代际安全）
   */
  processStreamEvent<T>(
    streamId: string,
    event: T,
    processor: (event: T) => void | Promise<void>
  ): void {
    if (!this.isStreamValid(streamId)) {
      logger.debug(`Ignoring stream event for '${streamId}' - stream invalid or generation outdated`);
      return;
    }
    
    // 使用延迟执行器确保代际安全
    const executor = new GenerationAwareDelayedExecutor();
    executor.setGenerationManager(this.generationManager!);
    
    executor.delayedExecute(
      () => processor(event),
      0, // 立即执行，但通过事件循环
      `stream-event-${streamId}`
    );
  }
  
  /**
   * 重写代际变化处理
   */
  protected onGenerationChanged(newGeneration: number, oldGeneration: number): void {
    super.onGenerationChanged(newGeneration, oldGeneration);
    
    // 记录被中断的流
    if (this.activeStreams.size > 0) {
      logger.debug(`Generation change interrupted ${this.activeStreams.size} active streams`);
    }
    
    // 清理活跃流（它们会在下次检查时被忽略）
    this.activeStreams.clear();
  }
  
  /**
   * 清理资源
   */
  cleanup(): void {
    this.activeStreams.clear();
    this.cleanupGeneration();
  }
}

/**
 * 全局代际管理器单例
 */
export class GlobalGenerationManager {
  private static managers = new Map<string, GenerationManager>();
  
  /**
   * 获取或创建指定名称的代际管理器
   */
  static getManager(name: string = 'default'): GenerationManager {
    let manager = this.managers.get(name);
    if (!manager) {
      manager = new GenerationManager(name);
      this.managers.set(name, manager);
    }
    return manager;
  }
  
  /**
   * 移除代际管理器
   */
  static removeManager(name: string): void {
    const manager = this.managers.get(name);
    if (manager) {
      manager.cleanup();
      this.managers.delete(name);
    }
  }
  
  /**
   * 清理所有代际管理器
   */
  static cleanup(): void {
    this.managers.forEach(manager => manager.cleanup());
    this.managers.clear();
  }
}

/**
 * 便捷函数：创建代际感知的延迟执行器
 */
export function createDelayedExecutor(managerName: string = 'default'): GenerationAwareDelayedExecutor {
  const executor = new GenerationAwareDelayedExecutor();
  executor.setGenerationManager(GlobalGenerationManager.getManager(managerName));
  return executor;
}

/**
 * 便捷函数：创建代际感知的流处理器
 */
export function createStreamProcessor(managerName: string = 'default'): GenerationAwareStreamProcessor {
  const processor = new GenerationAwareStreamProcessor();
  processor.setGenerationManager(GlobalGenerationManager.getManager(managerName));
  return processor;
}