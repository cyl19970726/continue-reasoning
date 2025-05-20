import { IMemoryManager, MemoryData, Container } from "../interfaces";
import { z } from "zod";
import { randomUUID } from 'node:crypto';

// 定义类型
type MemoryStorage = Map<string, MemoryData<any>>;
type ContainerStorage = Map<string, MemoryStorage>;
type MapContainer = Container<ContainerStorage>;

export class MapMemoryManager implements IMemoryManager {
    id: string;
    name: string;
    description: string;

    private containerList: MapContainer[];
    private containerStorage: ContainerStorage;

    constructor(id: string, name: string, description: string) {
        this.id = id;
        this.name = name;
        this.description = description;
        this.containerList = [];
        this.containerStorage = new Map();
    }

    createContainer<T>(name: string, description: string): Container<T> {
        const container: MapContainer = {
            id: randomUUID(),
            name: name,
            description: description,
            storage: new Map(),
        };
        this.containerList.push(container);
        this.containerStorage.set(container.id, new Map());
        return container as unknown as Container<T>;
    }

    getContainer<T>(id: string): Container<T> {
        const container = this.containerList.find((c) => c.id === id);
        if (!container) {
            throw new Error(`Container with id ${id} not found`);
        }
        return container as unknown as Container<T>;
    }

    listContainer(): Container<any>[] {
        return this.containerList;
    }

    deleteContainer(id: string): void {
        this.containerStorage.delete(id);
        this.containerList = this.containerList.filter((c) => c.id !== id);
    }

    saveMemory<T>(memory: MemoryData<T>, containerId: string): string {
        const storage = this.containerStorage.get(containerId);
        if (!storage) {
            throw new Error(`Container with id ${containerId} not found`);
        }
        const memoryId = memory.id || randomUUID();
        storage.set(memoryId, memory);
        return memoryId;
    }

    loadMemory<T>(memoryId: string, containerId: string): MemoryData<T> {
        const storage = this.containerStorage.get(containerId);
        if (!storage) {
            throw new Error(`Container with id ${containerId} not found`);
        }
        
        const memory = storage.get(memoryId);
        if (!memory) {
            throw new Error(`Memory with id ${memoryId} not found in container ${containerId}`);
        }
        return memory as MemoryData<T>;
    }

    deleteMemory(memoryId: string, containerId: string): void {
        const storage = this.containerStorage.get(containerId);
        if (!storage) {
            throw new Error(`Container with id ${containerId} not found`);
        }
        
        if (!storage.has(memoryId)) {
            throw new Error(`Memory with id ${memoryId} not found in container ${containerId}`);
        }
        storage.delete(memoryId);
    }

    renderPrompt(): string {
        const containerCount = this.containerList.length;
        const memoryCount = Array.from(this.containerStorage.values())
            .reduce((total, storage) => total + storage.size, 0);
            
        return `
            --- Memory Manager ---
            Container Count: ${containerCount}
            Total Memory Count: ${memoryCount}
            Container IDs: ${this.containerList.map(c => c.id).join(', ')}
        `;
    }
}