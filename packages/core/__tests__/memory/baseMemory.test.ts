import { describe, it, expect, beforeEach } from 'vitest';
import { MapMemoryManager } from '../../memory/baseMemory';
import { MemoryData } from '../../interfaces';

// Sample Data Structure for testing
interface TestDataType {
  name: string;
  value: number;
}

describe('MapMemoryManager', () => {
  let memoryManager: MapMemoryManager;
  const containerName = "test-container";
  const containerDesc = "A container for testing";
  let containerId: string;

  beforeEach(() => {
    memoryManager = new MapMemoryManager("test-mm", "Test MM", "Description");
    // Reset storage implicitly by creating a new instance
    // Create a default container for most tests
    const container = memoryManager.createContainer<TestDataType>(containerName, containerDesc);
    containerId = container.id;
  });

  // --- Container Management Tests ---
  describe('Container Management', () => {
    it('should create a container correctly', () => {
      expect(containerId).toBeDefined();
      const container = memoryManager.getContainer<TestDataType>(containerId);
      expect(container).toBeDefined();
      expect(container.id).toBe(containerId);
      expect(container.name).toBe(containerName);
      expect(container.description).toBe(containerDesc);
      // Check internal storage representation if possible/needed
    });

    it('should list created containers', () => {
      const containers = memoryManager.listContainer();
      expect(containers).toHaveLength(1);
      expect(containers[0].id).toBe(containerId);
      expect(containers[0].name).toBe(containerName);
    });

    it('should get a specific container by ID', () => {
      const fetchedContainer = memoryManager.getContainer<TestDataType>(containerId);
      expect(fetchedContainer).toBeDefined();
      expect(fetchedContainer.id).toBe(containerId);
    });

    it('should throw an error when getting a non-existent container', () => {
      expect(() => memoryManager.getContainer("non-existent-id")).toThrowError('Container with id non-existent-id not found');
    });

    it('should delete a container', () => {
      memoryManager.deleteContainer(containerId);
      expect(memoryManager.listContainer()).toHaveLength(0);
      expect(() => memoryManager.getContainer(containerId)).toThrowError();
    });

    it('should handle deleting a non-existent container gracefully', () => {
       expect(() => memoryManager.deleteContainer("non-existent-id")).not.toThrow();
       expect(memoryManager.listContainer()).toHaveLength(1); // Original container still exists
    });
  });

  // --- Memory Management Tests ---
  describe('Memory Management', () => {
    let memoryItem: MemoryData<TestDataType>;

    beforeEach(() => {
        // Add an item for load/delete tests
        memoryItem = {
            id: "item-1",
            description: "Test Item 1",
            data: { name: "Test", value: 123 }
        };
        memoryManager.saveMemory(memoryItem, containerId);
    });

    it('should save memory data to a container', () => {
        // Verify item exists by loading it
        const loadedItem = memoryManager.loadMemory<TestDataType>(memoryItem.id, containerId);
        expect(loadedItem).toEqual(memoryItem);
    });

    it('should load existing memory data from a container', () => {
        const loadedItem = memoryManager.loadMemory<TestDataType>(memoryItem.id, containerId);
        expect(loadedItem).toBeDefined();
        expect(loadedItem.id).toBe(memoryItem.id);
        expect(loadedItem.description).toBe(memoryItem.description);
        expect(loadedItem.data).toEqual(memoryItem.data);
    });

     it('should throw an error when loading non-existent memory data', () => {
        expect(() => memoryManager.loadMemory("non-existent-item", containerId))
            .toThrowError(`Memory with id non-existent-item not found in container ${containerId}`);
    });

     it('should throw an error when loading from a non-existent container', () => {
        expect(() => memoryManager.loadMemory(memoryItem.id, "bad-container"))
            .toThrowError('Container with id bad-container not found');
    });

    it('should throw an error when saving to a non-existent container', () => {
         const newItem: MemoryData<TestDataType> = {
            id: "item-2", description: "New item", data: { name: "New", value: 456 }
        };
        expect(() => memoryManager.saveMemory(newItem, "bad-container"))
            .toThrowError('Container with id bad-container not found');
    });

    it('should delete existing memory data', () => {
        memoryManager.deleteMemory(memoryItem.id, containerId);
        expect(() => memoryManager.loadMemory(memoryItem.id, containerId))
            .toThrowError(`Memory with id ${memoryItem.id} not found`);
    });

     it('should throw an error when deleting non-existent memory data', () => {
        expect(() => memoryManager.deleteMemory("non-existent-item", containerId))
            .toThrowError(`Memory with id non-existent-item not found`);
    });

    it('should throw an error when deleting from a non-existent container', () => {
        expect(() => memoryManager.deleteMemory(memoryItem.id, "bad-container"))
            .toThrowError('Container with id bad-container not found');
    });
  });
  
  // --- Render Prompt Test ---
   describe('renderPrompt', () => {
       it('should render a basic prompt string', () => {
            const prompt = memoryManager.renderPrompt();
            expect(prompt).toBeTypeOf('string');
            // Add more specific checks if the format is important
            expect(prompt).toContain("--- Memory Manager ---");
            expect(prompt).toContain(`Container Count: 1`); 
            expect(prompt).toContain(`Container IDs: ${containerId}`);
       });
   });
}); 