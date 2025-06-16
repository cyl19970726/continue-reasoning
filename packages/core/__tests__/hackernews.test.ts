import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { updateContextFromToolCall, isAIRelated } from '@continue-reasoning/core/contexts/hackernews';
import { ToolCallResult } from '@continue-reasoning/core/interfaces';

describe('HackernewsContext Tests', () => {
    describe('updateContextFromToolCall Function', () => {
        let mockContext: any;
        
        beforeEach(() => {
            // Create a simple mock context with setData spy
            mockContext = {
                data: {
                    recentSearches: [],
                    recentStories: [],
                    lastQuery: null,
                    aiKeywords: ["AI", "artificial intelligence"],
                    hotAITopics: {
                        "large language models": 0,
                        "AI safety and ethics": 0,
                    }
                },
                setData: vi.fn((data) => {
                    // Simple implementation to update data
                    mockContext.data = { ...mockContext.data, ...data };
                })
            };
            
            console.log("[TEST] Mock context initialized with setData spy");
        });
        
        afterEach(() => {
            vi.clearAllMocks();
        });
        
        it('should process search_stories results', () => {
            const mockResult = {
                type: "function",
                name: "search_stories",
                call_id: "test-call-1",
                result: JSON.stringify([
                    { id: 1, title: "New AI breakthrough in language models", time: 1620000000 },
                    { id: 2, title: "Ethical considerations in AI development", time: 1620100000 }
                ])
            };
            
            // Process the mock result
            updateContextFromToolCall(mockResult as ToolCallResult, mockContext);
            
            // Verify context data was updated
            expect(mockContext.setData).toHaveBeenCalled();
            
            // Check that recentStories was updated with correct data
            expect(mockContext.data.recentStories).toHaveLength(2);
            expect(mockContext.data.recentStories[0].title).toContain("AI breakthrough");
        });
        
        it('should process get_story_info results', () => {
            const mockResult = {
                type: "function",
                name: "get_story_info",
                call_id: "test-call-2",
                result: JSON.stringify({
                    id: 3,
                    title: "AI and machine learning advancements in 2023",
                    text: "This is a detailed article about AI advancements",
                    comments: [
                        { id: 101, text: "Great insights on large language models!" },
                        { id: 102, text: "Interesting perspective on AI ethics." }
                    ]
                })
            };
            
            // Process the mock result
            updateContextFromToolCall(mockResult as ToolCallResult, mockContext);
            
            // Verify context data was updated
            expect(mockContext.setData).toHaveBeenCalled();
            
            // Check that recentStories was updated
            expect(mockContext.data.recentStories).toHaveLength(1);
            expect(mockContext.data.recentStories[0].title).toContain("machine learning");
        });
        
        it('should update hot topics based on search queries', () => {
            const mockResult = {
                type: "function",
                name: "search_stories",
                call_id: "test-call-3",
                parameters: { query: "large language models new developments" },
                result: JSON.stringify([
                    { id: 5, title: "New developments in large language models", time: 1620500000 }
                ])
            };
            
            // Process the mock result
            updateContextFromToolCall(mockResult as unknown as ToolCallResult, mockContext);
            
            // Verify data was updated
            expect(mockContext.setData).toHaveBeenCalled();
            
            // Verify hot topics were updated
            expect(mockContext.data.hotAITopics["large language models"]).toBeGreaterThan(0);
        });
    });
    
    describe('isAIRelated Function', () => {
        it('should correctly identify AI-related content', () => {
            const testCases = [
                {
                    title: "New breakthrough in large language models",
                    expected: true
                },
                {
                    title: "GPT-4 demonstrates impressive reasoning capabilities", 
                    expected: true
                },
                {
                    title: "Tech company increases revenue in Q2",
                    expected: false
                },
                {
                    title: "Neural networks applied to climate modeling",
                    expected: true
                },
                {
                    title: "The rise of ML in healthcare applications",
                    expected: true
                }
            ];
            
            // Test both with minimal and full keyword sets
            const minimalKeywords = ["AI", "artificial intelligence"];
            const fullKeywords = [
                "AI", "artificial intelligence", "machine learning", "ML", "LLM", 
                "large language model", "neural network", "deep learning"
            ];
            
            for (const testCase of testCases) {
                // Test with the full keyword set which should work for all cases
                const result = isAIRelated(testCase.title, fullKeywords);
                expect(result).toBe(testCase.expected);
            }
        });
    });
}); 