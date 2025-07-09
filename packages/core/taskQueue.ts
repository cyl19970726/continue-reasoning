import { randomUUID } from 'crypto';
import { ITaskQueue } from './interfaces/tool.js';

export interface ITask{
    id: string;
    execute: () => Promise<any>;
    priority: number;
    type: 'processStep' | 'toolCall' | 'custom';
    resolve: (value: any) => void;
    reject: (reason: any) => void;
    createdAt: number;
}

// ITaskQueue interface is now imported from interfaces/tool.ts

export class TaskQueue implements ITaskQueue{

    tasks: ITask[];
    runningTasks: Set<string>;
    concurrency: number;
    isRunning: boolean;
    constructor(concurrency: number){
        this.tasks = [];
        this.runningTasks = new Set();
        this.concurrency = concurrency;
        this.isRunning = false;
    }

    setConcurrency(concurrency: number){
        this.concurrency = concurrency;
    }

    taskCount(): number{
        return this.tasks.length;
    }

    runningTaskCount(): number{
        return this.runningTasks.size;
    }

    taskStatus(id: string): {id: string, status: string, type?: string} | 'not found' {
        const task = this.tasks.find((task) => task.id === id);
        if (!task) {
            return 'not found';
        }
        return {
            id: task.id,
            status: this.runningTasks.has(task.id) ? 'running' : 'pending',
            type: task.type
        }
    }

    addTask<T>(taskFn: () => Promise<T>, priority: number, type?: 'processStep' | 'toolCall' | 'custom', id?: string): Promise<T> {
        return new Promise((resolve, reject) => {

            let taskId = id? id : randomUUID();
            const addTask = {
                id: taskId,
                execute: taskFn,
                priority: priority,
                type: type || 'custom',
                resolve: resolve,
                reject: reject,
                createdAt: Date.now()
            }

            this.tasks.push(addTask);
            setTimeout(() => {
                this.run();
            }, 0);
        })
    }

    async run(){
        if (this.isRunning) {
            return;
        }
        this.isRunning = true;
        try {
            while (this.tasks.length > 0 && this.runningTasks.size < this.concurrency) {

            this.tasks.sort((a, b) => b.priority - a.priority);
            const task = this.tasks.shift();
            if (!task) {
                break;
            }
            this.runningTasks.add(task.id);

            task.execute().then((result) => {
                task.resolve(result);
                this.runningTasks.delete(task.id);
            }).catch((error) => {
                task.reject(error);
                this.runningTasks.delete(task.id);
            }).finally(() => {
                    this.runningTasks.delete(task.id);
                    // Try to process more tasks after one completes
                    this.run();
                });
            }
        } catch (error) {
            console.error(error);
        } finally {
            this.isRunning = false;
        }
    } 

    addProcessStepTask<T>(taskFn: () => Promise<T>, priority?: number, id?: string): Promise<T> {
        return this.addTask(taskFn, priority || 0, 'processStep', id);
    }

    addToolCallTask<T>(taskFn: () => Promise<T>, priority?: number, id?: string): Promise<T> {
        return this.addTask(taskFn, priority || 0, 'toolCall', id);
    }

    getTasksByType(type: 'processStep' | 'toolCall' | 'custom'): ITask[] {
        return this.tasks.filter((task) => task.type === type);
    }

    clearTasks(type?: 'processStep' | 'toolCall' | 'custom'): number {
        const tasksToRemove = this.tasks.filter((task) => type ? task.type === type : true);
        const removedCount = tasksToRemove.length;
        this.tasks = this.tasks.filter((task) => !tasksToRemove.includes(task));
        return removedCount;
    }

    // Lifecycle management methods
    async start(): Promise<void> {
        // TaskQueue is already initialized, just mark as ready
        this.isRunning = false; // Reset running state
        console.log(`TaskQueue started with concurrency: ${this.concurrency}`);
    }

    async stop(): Promise<void> {
        // Wait for all running tasks to complete
        while (this.runningTasks.size > 0) {
            await new Promise(resolve => setTimeout(resolve, 10));
        }
        this.isRunning = false;
        console.log('TaskQueue stopped');
    }

    getConcurrency(): number {
        return this.concurrency;
    }
}

