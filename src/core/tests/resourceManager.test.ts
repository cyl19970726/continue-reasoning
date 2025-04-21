import { vi, describe, it, expect, beforeEach } from 'vitest';
import { z } from 'zod';
import { IMemoryManager, MemoryData } from '../interfaces'; // Adjust path if needed
import { MapMemoryManager } from '../memory/baseMemory'; // Import the actual MapMemoryManager
import { ResourceManager, ResourceManagerOptions, ResourceManagerStateSchema, ResourceManagerStateType } from '../resourceManager'; // Adjust path

// --- Test Schemas (Simplify slightly for testing) ---

const TestInfoSchema = z.object({
    id: z.string(),
    memoryId: z.string().optional(), 
    priority: z.number(),
    description: z.string().optional(),
    status: z.enum(["pending", "resolved", "rejected"]).optional(), 
    createdAt: z.date().optional(), 
    updatedAt: z.date().optional(), 
});
type TestInfo = z.infer<typeof TestInfoSchema>;

// Simplify trace further: Make trace and currentSteps explicitly required
const TestDataSchema = z.object({
    info: TestInfoSchema, 
    extraData: z.string(),
    trace: z.object({ 
        currentSteps: z.array(z.number()) // Removed .default([])
    }), // Removed optional()
})
type TestData = z.infer<typeof TestDataSchema>;

// Specific State Schema for testing
const TestManagerStateSchema = ResourceManagerStateSchema(TestInfoSchema, TestDataSchema);

// Helper - Ensure created data matches new schema (trace is required)
const createTestData = (idNum: number, priority: number, extra: string): TestData => {
    const id = `item-${idNum}`;
    return {
        info: { id, memoryId: id, priority, description: `Test ${idNum}`, status: 'pending' },
        extraData: extra,
        trace: { currentSteps: [] } // Explicitly provide trace object
    };
};


describe('ResourceManager with MapMemoryManager', () => { // Updated describe
    // let memoryManager: MapMemoryManager; // Use actual type
    let resourceManager: ResourceManager<TestInfo, TestData>; 
    const containerName = "test-resource-container";
    let containerId: string;

    const createMapMemoryManager = () => {
        const memoryManager = new MapMemoryManager("test-manager", "Test Manager", "For resource manager tests");
        containerId = memoryManager.createContainer(containerName, "Test resource container").id;
        return memoryManager;
    }
    // Helper function to create options
    const createManagerOptions = (maxActive: number): ResourceManagerOptions<TestInfo, TestData> => ({
        resourceName: "TestResource",
        memoryManager: createMapMemoryManager(), // Use the MapMemoryManager instance
        containerId: containerId,
        infoSchema: TestInfoSchema,
        dataSchema: TestDataSchema,
        stateSchema: TestManagerStateSchema,
        maxActive: maxActive, 
        comparePriorityFn: (a, b) => a.info.priority - b.info.priority, 
    });

    beforeEach(() => {
        // Instantiate MapMemoryManager
        // memoryManager = new MapMemoryManager("test-manager", "Test Manager", "For resource manager tests");
        // Create the container needed for the test
        // memoryManager.createContainer(containerId, "Test resource container");
        
        // No need to spy on real methods unless specifically testing interaction counts
        // vi.spyOn(memoryManager, 'saveMemory');
        // vi.spyOn(memoryManager, 'loadMemory');

        resourceManager = new ResourceManager(createManagerOptions(1));
        console.log("container list:",resourceManager.memoryManager.listContainer());
    });

    it('should initialize with empty state', () => {
        expect(resourceManager.state.activeItems).toEqual([]);
        expect(resourceManager.state.inactiveItemsInfo).toEqual([]);
    });

    describe('create', () => {
        it('should create, save, and activate the first item', async () => {
            const item1Data = createTestData(1, 5, "data1");
            const { newItem, isActive } = await resourceManager.create(item1Data);

            expect(isActive).toBe(true);
            expect(newItem).toEqual(item1Data); 
            expect(resourceManager.state.activeItems).toHaveLength(1);
            expect(resourceManager.state.activeItems[0]).toEqual(item1Data);
            expect(resourceManager.state.inactiveItemsInfo).toHaveLength(0);


        });

         it('should add a lower priority item to inactive list when active is full', async () => {
            const item1 = createTestData(1, 10, "data1"); 
            const { newItem: newItem1, isActive: isActive1 } = await resourceManager.create(item1); 

            const item2 = createTestData(2, 5, "data2"); 
            const { newItem: newItem2, isActive: isActive2 } = await resourceManager.create(item2);

            expect(isActive2).toBe(false);
            expect(resourceManager.state.activeItems).toHaveLength(1);
            expect(resourceManager.state.activeItems[0].info.id).toBe("item-1"); 
            expect(resourceManager.state.activeItems[0].info.memoryId).toBe(newItem1.info.memoryId);
            
            expect(resourceManager.state.inactiveItemsInfo).toHaveLength(1);
            expect(resourceManager.state.inactiveItemsInfo[0].id).toBe("item-2");
            expect(resourceManager.state.inactiveItemsInfo[0].memoryId).toBe(newItem2.info.memoryId);
        });

         it('should activate higher priority item, deactivating lower priority one', async () => {
            const item1 = createTestData(1, 5, "data1"); 
            await resourceManager.create(item1); 

            const item2 = createTestData(2, 10, "data2"); 
            const { newItem, isActive } = await resourceManager.create(item2);

            expect(isActive).toBe(true);
            expect(resourceManager.state.activeItems).toHaveLength(1);
            expect(resourceManager.state.activeItems[0].info.id).toBe("item-2"); 
            expect(resourceManager.state.inactiveItemsInfo).toHaveLength(1);
            expect(resourceManager.state.inactiveItemsInfo[0].id).toBe("item-1"); 
        });

         it('should handle multiple active items if maxActive > 1', async () => {
             // Recreate manager using helper with maxActive = 2
             resourceManager = new ResourceManager(createManagerOptions(2));

             const item1 = createTestData(1, 5, "data1");
             const item2 = createTestData(2, 10, "data2");
             await resourceManager.create(item1);
             await resourceManager.create(item2);

             expect(resourceManager.state.activeItems).toHaveLength(2);
             expect(resourceManager.state.inactiveItemsInfo).toHaveLength(0);
        });
    });

    describe('load', () => {
         it('should load an item from memory using info.id', async () => {
            const item1 = createTestData(1, 5, "data1");
            await resourceManager.create(item1); 

            const loadedItem = await resourceManager.load(item1.info.id!); 
            expect(loadedItem).toBeDefined();
            expect(loadedItem.info.id).toBe(item1.info.id);
            expect(loadedItem.extraData).toBe(item1.extraData);
        });

        it('should throw if item not found', async () => {
            await expect(resourceManager.load("non-existent-id")).rejects.toThrow();
        });
    });

    describe('update', () => {
         it('should load, update, save, and return updated item', async () => {
            const item1 = createTestData(1, 5, "data1");
            await resourceManager.create(item1); 

            const updates: Partial<TestData> = { extraData: "updated data", info: { ...item1.info, status: 'resolved' } };
            const updatedItem = await resourceManager.update(item1.info.id, updates);
            const loadedItem = await resourceManager.load(item1.info.id);

            expect(updatedItem.info.id).toBe(item1.info.id);
            // memoryId should be updated
            expect(updatedItem.info.memoryId).not.toBe(item1.info.memoryId);

            expect(updatedItem.extraData).toBe("updated data");
            expect(updatedItem.info.status).toBe("resolved");
            expect(updatedItem.info.updatedAt).toBeDefined();

            expect(resourceManager.state.activeItems[0].extraData).toBe("updated data");

            expect(loadedItem.info.memoryId).toBe(updatedItem.info.memoryId);
            expect(loadedItem.extraData).toBe("updated data");
            expect(loadedItem.info.status).toBe("resolved");
            expect(loadedItem.info.updatedAt).toBeDefined();
        });
    });

     describe('activate', () => {
         it('should activate an inactive item', async () => {
            const item1 = createTestData(1, 5, "data1");
            const item2 = createTestData(2, 10, "data2");
            let {newItem: newItem2, isActive: isActive2} = await resourceManager.create(item2); 
            let {newItem: newItem1, isActive: isActive1} = await resourceManager.create(item1); 

            let loadedItem1 = await resourceManager.load(item1.info.id);
            let loadedItem2 = await resourceManager.load(item2.info.id);

            expect(loadedItem1.info).toStrictEqual(item1.info);
            expect(loadedItem1.info).toStrictEqual(newItem1.info);
            expect(loadedItem2.info).toStrictEqual(item2.info);
            expect(loadedItem2.info).toStrictEqual(newItem2.info);

            expect(isActive1).toBe(false);
            expect(isActive2).toBe(true);

            let activatedItem = await resourceManager.resolve(item2.info.id);
            let activedItem = await resourceManager.activate(item1.info.id);
            expect(activedItem.isActive).toBe(true);
            expect(activedItem.data.info).toStrictEqual(item1.info);
            expect(activedItem.data.info).toStrictEqual(newItem1.info);
        });
     });

     describe('deactivate', () => {
         it('should deactivate an active item', async () => {
            const item1 = createTestData(1, 5, "data1");
            await resourceManager.create(item1); 

             expect(resourceManager.state.activeItems).toHaveLength(1);
             expect(resourceManager.state.inactiveItemsInfo).toHaveLength(0);

            resourceManager.deactivate(item1.info.id);

             expect(resourceManager.state.activeItems).toHaveLength(0);
             expect(resourceManager.state.inactiveItemsInfo).toHaveLength(1);
             expect(resourceManager.state.inactiveItemsInfo[0].id).toBe("item-1");
        });
     });

}); 