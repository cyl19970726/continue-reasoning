import { randomUUID } from 'crypto';

export interface ITask{
    id: string;
    execute: () => Promise<any>;
    priority: number;
    resolve: (value: any) => void;
    reject: (reason: any) => void;
}

export interface ITaskQueue{

    tasks: ITask[];     
    runningTasks: Set<string>;
    concurrency: number;
    isRunning: boolean;
    addTask<T>(taskFn: () => Promise<T>,priority: number, id?: string): Promise<T>;

    taskCount(): number;

    runningTaskCount(): number;

    taskStatus(id: string): {id: string, status: string} | 'not found';

    run(): Promise<void>;
}

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

    taskStatus(id: string): {id: string, status: string} | 'not found' {
        const task = this.tasks.find((task) => task.id === id);
        if (!task) {
            return 'not found';
        }
        return {
            id: task.id,
            status: this.runningTasks.has(task.id) ? 'running' : 'pending'
        }
    }

    addTask<T>(taskFn: () => Promise<T>,priority: number, id?: string): Promise<T> {
        return new Promise((resolve, reject) => {

            let taskId = id? id : randomUUID();
            const addTask = {
                id: taskId,
                execute: taskFn,
                priority: priority,
                resolve: resolve,
                reject: reject
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
}

