import { z } from "zod";
import { IAgent, IMemoryManager, MemoryData } from "./interfaces"; // Assuming interfaces is in the parent dir
import { randomUUID } from "crypto";


// --- ResourceManager Abstraction ---

/**
 * Generic Zod schema for the state managed by ResourceManager.
 */
export const ResourceManagerStateSchema = <T extends z.ZodTypeAny, U extends z.ZodTypeAny>(infoSchema: T, dataSchema: U) => z.object({
    activeItems: z.array(dataSchema).describe("List of currently active items (full data)."),
    inactiveItemsInfo: z.array(infoSchema).describe("List of info objects for inactive items."),

    // resolved and rejected items
    resolvedItems: z.array(infoSchema).describe("List of info objects for resolved items."),
    rejectedItems: z.array(infoSchema).describe("List of info objects for rejected items."),
});

/**
 * Represents the type of the state managed by ResourceManager.
 */
export type ResourceManagerStateType<InfoType, DataType> = {
    activeItems: DataType[];
    inactiveItemsInfo: InfoType[];

    // resolved and rejected items
    resolvedItems: InfoType[];
    rejectedItems: InfoType[];
};

type IInfoType = { id: string, memoryId?: string };
/**
 * Configuration options for the ResourceManager.
 */
export interface ResourceManagerOptions<InfoType extends IInfoType, DataType extends { info: InfoType}> {
    resourceName: string;
    memoryManager: IMemoryManager;
    containerId: string;
    infoSchema: z.ZodType<InfoType>; // Schema for Info object (used for inactive list)
    dataSchema: z.ZodType<DataType>; // Schema for the full Data object (used for active list & memory)
    stateSchema: z.ZodType<ResourceManagerStateType<InfoType, DataType>>; // Specific Zod instance for the manager state
    maxActive: number;
    comparePriorityFn?: (itemA: DataType, itemB: DataType) => number; // Optional priority comparison
}

/**
 * Generic class to manage the lifecycle (active/inactive/memory) of resources like Plans or Problems.
 */
export class ResourceManager<InfoType extends IInfoType, DataType extends { info: InfoType}> {
    private resourceName: string;
    public memoryManager: IMemoryManager;
    private containerId: string;
    private dataSchema: z.ZodType<DataType>;
    private stateSchema: z.ZodType<ResourceManagerStateType<InfoType, DataType>>;
    private maxActive: number;
    private comparePriorityFn?: (itemA: DataType, itemB: DataType) => number;

    // Public state - this is what gets saved/loaded by the context
    public state: ResourceManagerStateType<InfoType, DataType>;

    constructor(options: ResourceManagerOptions<InfoType, DataType>, initialState?: ResourceManagerStateType<InfoType, DataType>) {
        this.resourceName = options.resourceName;
        this.memoryManager = options.memoryManager;
        this.containerId = options.containerId;
        this.dataSchema = options.dataSchema;
        this.stateSchema = options.stateSchema;
        this.maxActive = options.maxActive;
        this.comparePriorityFn = options.comparePriorityFn;

        // Initialize state - ensure arrays exist
        this.state = initialState || { activeItems: [], inactiveItemsInfo: [], resolvedItems: [], rejectedItems: [] };
        this.state.activeItems = this.state.activeItems || [];
        this.state.inactiveItemsInfo = this.state.inactiveItemsInfo || [];
    }

    // --- Core Public Methods --- 

    /**
     * Registers a new, fully-formed resource item, saves it, and manages active state.
     * Assumes newItem conforms to DataType schema.
     */
    async create(newItem: DataType): Promise<{ newItem: DataType, isActive: boolean }> {
        console.log(`[${this.resourceName}Manager] Registering & saving new item ${newItem.info.id}`);
        
        // 1. Validate & Save (save method also validates)
        let memoryId = await this.save(newItem); 
        newItem.info.memoryId = memoryId;

        // Call helper to manage activation state
        const isActive = this.addDataToActive(newItem);

        if (!isActive) {
            console.log(`[${this.resourceName}Manager] Adding item ${newItem.info.id} info to inactive list.`);
            this.addInfoToInactive(newItem.info); // Add to inactive if not activated
        }
        return { newItem, isActive };
    }

    /** Loads the full data for an item from memory. */
    async load(id: string): Promise<DataType> {
        let memoryId = this.findMemoryId(id);
        console.log(`[${this.resourceName}Manager] Loading item ${memoryId}...`);
        const memoryData = await this.memoryManager.loadMemory<DataType>(memoryId, this.containerId);
        if (!memoryData?.data) { throw new Error(`${this.resourceName} ${memoryId} not found.`); }
        const validatedData = this.dataSchema.parse(memoryData.data);
        if (validatedData.info.memoryId !== memoryId) {
             console.warn(`[${this.resourceName}Manager] Loaded data MemoryID (${validatedData.info.memoryId}) does not match requested MemoryID (${memoryId})`);
        }

        validatedData.info.memoryId = memoryId;
        return validatedData;
    }

    /** Saves the full data for an item to memory. */
    private async save(itemData: DataType): Promise<string> {
        console.log(`[${this.resourceName}Manager] Saving item ${itemData.info.id}...`);
        const validatedData = this.dataSchema.parse(itemData);

        // make sure the memoryId is not included in the saved data 
        validatedData.info.memoryId = undefined; 

        const memoryData: MemoryData<DataType> = {
            description: `${this.resourceName}: ${(validatedData.info as any).description?.substring(0, 50) ?? validatedData.info.id}...`,
            data: validatedData
        };
        const savedId = this.memoryManager.saveMemory(memoryData, this.containerId);
        return savedId;
    }
    
    /** Updates specific fields of an item, handling load/save. */
    async update(id: string, updates: Partial<DataType>): Promise<DataType> {
        const currentItem = await this.load(id);
        // Deep merge might be safer for nested objects like trace
        // For simple top-level updates + date:
        const updatedItemData = { 
            ...currentItem, 
            ...updates, 
            // Ensure nested info is merged correctly and timestamp updated
            info: { ...(currentItem.info || {}), ...(updates.info || {}), id: currentItem.info.id, updatedAt: new Date() } 
        }; 
        // Note: Need a better deep merge if updating nested trace properties
        const validatedItem = this.dataSchema.parse(updatedItemData);

        // find the old memoryId 
        const oldMemoryId = this.findMemoryId(id);
        this.memoryManager.deleteMemory(oldMemoryId, this.containerId);


        // save and update the memoryId
        let memoryId = await this.save(validatedItem);
        validatedItem.info.memoryId = memoryId;

        // update the old data at the active list
        const activeIndex = this.state.activeItems.findIndex(item => item.info.id === id);
        if (activeIndex !== -1) { this.state.activeItems[activeIndex] = validatedItem; }

        // update the memoryId at the inactive list
        this.updateMemoryId(id, memoryId);

        return validatedItem;
    }

    async resolve(id: string): Promise<InfoType> {

        // 1. resolve the item at the active list
        const activeIndex = this.state.activeItems.findIndex(item => item.info.id === id);
        if (activeIndex !== -1) {
            // 2. add the item to the resolved list
            // 3. remove the item from the active list
            const [resolvedItem] = this.state.activeItems.splice(activeIndex, 1);
            this.state.resolvedItems.push(resolvedItem.info);
            return resolvedItem.info;
        } else { 
            throw new Error(`Item ${id} not active.`); 
        }
    }

    async reject(id: string): Promise<InfoType> {

        // 1. reject the item at the active list
        const activeIndex = this.state.activeItems.findIndex(item => item.info.id === id);
        if (activeIndex !== -1) {
            const [rejectedItem] = this.state.activeItems.splice(activeIndex, 1);
            this.state.rejectedItems.push(rejectedItem.info);
            return rejectedItem.info;
        } else { 
            throw new Error(`Item ${id} not active.`); 
        }
    }


    /** Activates an item by ID, managing active/inactive lists. */
    async activate(id: string): Promise<{data: DataType, isActive: Boolean}> {
        console.log(`[${this.resourceName}Manager] Activating item ${id}`);
        const existingActive = this.state.activeItems.find(item => item.info.id === id);
        if (existingActive) { return existingActive; }

        const itemToActivate = await this.load(id);

        // Manage activation using the helper (passing the loaded item)
        let isActive = this.addDataToActive(itemToActivate);

        if (isActive) {
            // Find/remove info from inactive list
            this.state.inactiveItemsInfo = this.state.inactiveItemsInfo.filter(info => info.id !== id);
            return {data: itemToActivate, isActive: true};
        }else{
            return {data: itemToActivate, isActive: false};
        }
    }

    /** Deactivates an item by ID, moving its info to the inactive list. */
    deactivate(id: string, shouldSave: boolean = true): void {
        console.log(`[${this.resourceName}Manager] Deactivating item ${id}`);
        const activeIndex = this.state.activeItems.findIndex(item => item.info.id === id);
        if (activeIndex !== -1) {
            const [deactivatedItem] = this.state.activeItems.splice(activeIndex, 1);
            this.addInfoToInactive(deactivatedItem.info); // Use nested info
        } else { console.warn(`Item ${id} not active.`); }
    }

    // --- Getters --- 
    findMemoryId(id: string): string { return this.state.activeItems.find(item => item.info.id === id)?.info.memoryId ?? this.state.inactiveItemsInfo.find(info => info.id === id)?.memoryId ?? ""; }
    updateMemoryId(id: string, memoryId: string): void {
        const activeIndex = this.state.activeItems.findIndex(item => item.info.id === id);
        if (activeIndex !== -1) { this.state.activeItems[activeIndex].info.memoryId = memoryId; }
        const inactiveIndex = this.state.inactiveItemsInfo.findIndex(info => info.id === id);
        if (inactiveIndex !== -1) { this.state.inactiveItemsInfo[inactiveIndex].memoryId = memoryId; }
    }

    getActiveItems(): DataType[] { return this.state.activeItems; }
    getInactiveItemsInfo(): InfoType[] { return this.state.inactiveItemsInfo; }
    getState(): ResourceManagerStateType<InfoType, DataType> { return this.state; }
    setState(newState: ResourceManagerStateType<InfoType, DataType>): void {
        // Validate the incoming state
        try {
            this.state = this.stateSchema.parse(newState);
        } catch (e) {
            console.error(`[${this.resourceName}Manager] Failed to set state due to validation error:`, e);
            // Fallback to default state or re-throw?
            this.state = { activeItems: [], inactiveItemsInfo: [], resolvedItems: [], rejectedItems: [] }; 
        }
        // Ensure arrays exist after parsing/fallback
        this.state.activeItems = this.state.activeItems || [];
        this.state.inactiveItemsInfo = this.state.inactiveItemsInfo || [];
    }

    // --- Private Helpers --- 
    private addInfoToInactive(info: InfoType): void {
        if (!this.state.inactiveItemsInfo.some(existingInfo => existingInfo.id === info.id)) {
            this.state.inactiveItemsInfo.push(info);
        }
    }

    /**
     * Private helper to manage activation logic (deciding if item becomes active,
     * deactivating others if needed, and adding to active list).
     * Returns true if the item was activated, false otherwise.
     */
    private addDataToActive(newItem: DataType): boolean {
        let shouldActivate = false;
        const requiresPriorityCheck = this.comparePriorityFn && this.state.activeItems.length >= this.maxActive && this.maxActive > 0;

        if (this.state.activeItems.length < this.maxActive) {
            shouldActivate = true; 
        } else if (requiresPriorityCheck) {
             const lowestPriorityActive = this.state.activeItems.reduce((lowest, current) => 
                this.comparePriorityFn!(current, lowest) < 0 ? current : lowest
            );
            if (this.comparePriorityFn!(newItem, lowestPriorityActive) > 0) {
                 shouldActivate = true;
            }
        }

        if (shouldActivate) {
            console.log(`[${this.resourceName}Manager] Activating item ${newItem.info.id}`);
            while (this.state.activeItems.length >= this.maxActive && this.maxActive > 0) {
                 let itemToDeactivate = this.state.activeItems[0]; 
                 if (this.comparePriorityFn && this.state.activeItems.length > 1) {
                     itemToDeactivate = this.state.activeItems.reduce((lowest, current) => 
                         this.comparePriorityFn!(current, lowest) < 0 ? current : lowest
                     );
                 }
                 this.deactivate(itemToDeactivate.info.id, false); // Use info.id
            }
            this.state.activeItems.push(newItem);

            return true; // Activated
        }

        return false; // Not activated
    }
}

// #endregion ResourceManager Abstraction 