import { describe, it, expect, beforeEach } from 'vitest';
import { EnhancedPromptProcessor } from '../enhanced-prompt-processor';
import { getSystemPromptForMode, validateSystemPromptCompatibility } from '../prompts/enhanced-thinking-system-prompt';

describe('EnhancedPromptProcessor', () => {
    let processor: EnhancedPromptProcessor;
    
    beforeEach(() => {
        processor = new EnhancedPromptProcessor();
    });
    
    describe('Thinking Mode Management', () => {
        it('should default to enhanced mode', () => {
            expect(processor.thinkingMode).toBe('enhanced');
        });
        
        it('should allow changing thinking mode', () => {
            processor.setThinkingMode('standard');
            expect(processor.thinkingMode).toBe('standard');
            
            processor.setThinkingMode('custom');
            expect(processor.thinkingMode).toBe('custom');
        });
    });
    
    describe('Enhanced Mode Extraction', () => {
        it('should extract structured thinking components', () => {
            const responseText = `
<think>
<analysis>This is the analysis section</analysis>
<plan>This is the plan section</plan>
<reasoning>This is the reasoning section</reasoning>
</think>

<interactive>
<response>This is the response</response>
<stop_signal type="boolean">false</stop_signal>
</interactive>
            `;
            
            processor.setThinkingMode('enhanced');
            const result = processor.textExtractor(responseText);
            
            expect(result.analysis).toBe('This is the analysis section');
            expect(result.plan).toBe('This is the plan section');
            expect(result.reasoning).toBe('This is the reasoning section');
            expect(result.response).toBe('This is the response');
            expect(result.stopSignal).toBe(false);
        });
        
        it('should handle missing thinking components gracefully', () => {
            const responseText = `
<think>
<analysis>Only analysis here</analysis>
</think>

<interactive>
<response>Just a response</response>
<stop_signal type="boolean">true</stop_signal>
</interactive>
            `;
            
            processor.setThinkingMode('enhanced');
            const result = processor.textExtractor(responseText);
            
            expect(result.analysis).toBe('Only analysis here');
            expect(result.plan).toBeUndefined();
            expect(result.reasoning).toBeUndefined();
            expect(result.response).toBe('Just a response');
            expect(result.stopSignal).toBe(true);
        });
    });
    
    describe('Standard Mode Extraction', () => {
        it('should extract content in standard mode', () => {
            const responseText = `
<think>
General thinking content here
</think>

<interactive>
<response>Standard response</response>
<stop_signal type="boolean">false</stop_signal>
</interactive>
            `;
            
            processor.setThinkingMode('standard');
            const result = processor.textExtractor(responseText);
            
            expect(result.analysis).toBe('General thinking content here');
            expect(result.plan).toBeUndefined();
            expect(result.reasoning).toBeUndefined();
            expect(result.response).toBe('Standard response');
            expect(result.stopSignal).toBe(false);
        });
    });
    
    describe('Type Extraction for Stop Signal', () => {
        it('should correctly parse boolean stop signal', () => {
            const responseText = `
<interactive>
<response>Test response</response>
<stop_signal type="boolean">true</stop_signal>
</interactive>
            `;
            
            const interactive = processor.extractInteractiveContent(responseText);
            expect(interactive.stopSignal).toBe(true);
        });
        
        it('should parse string stop signal as boolean', () => {
            const responseText = `
<interactive>
<response>Test response</response>
<stop_signal>true</stop_signal>
</interactive>
            `;
            
            const interactive = processor.extractInteractiveContent(responseText);
            expect(interactive.stopSignal).toBe(true);
        });
        
        it('should handle false stop signal', () => {
            const responseText = `
<interactive>
<response>Test response</response>
<stop_signal type="boolean">false</stop_signal>
</interactive>
            `;
            
            const interactive = processor.extractInteractiveContent(responseText);
            expect(interactive.stopSignal).toBe(false);
        });
    });
    
    describe('Structured Thinking Extraction', () => {
        it('should extract individual thinking components', () => {
            const responseText = `
<think>
<analysis>Detailed analysis here</analysis>
<plan>
- [ ] Task 1
- [ ] Task 2  
- [ ] Task 3
</plan>
<reasoning>Logical reasoning process</reasoning>
</think>
            `;
            
            const thinking = processor.extractStructuredThinking(responseText);
            
            expect(thinking.analysis).toBe('Detailed analysis here');
            expect(thinking.plan).toContain('Task 1');
            expect(thinking.plan).toContain('Task 2');
            expect(thinking.plan).toContain('Task 3');
            expect(thinking.reasoning).toBe('Logical reasoning process');
        });
        
        it('should return empty object when no thinking tag found', () => {
            const responseText = `
<interactive>
<response>Just a response</response>
<stop_signal type="boolean">false</stop_signal>
</interactive>
            `;
            
            const thinking = processor.extractStructuredThinking(responseText);
            
            expect(thinking.analysis).toBeUndefined();
            expect(thinking.plan).toBeUndefined();
            expect(thinking.reasoning).toBeUndefined();
        });
    });
    
    describe('Interactive Content Extraction', () => {
        it('should extract response and stop signal', () => {
            const responseText = `
<interactive>
<response>User interaction response</response>
<stop_signal type="boolean">true</stop_signal>
</interactive>
            `;
            
            const interactive = processor.extractInteractiveContent(responseText);
            
            expect(interactive.response).toBe('User interaction response');
            expect(interactive.stopSignal).toBe(true);
        });
        
        it('should handle missing interactive components', () => {
            const responseText = `
<interactive>
<stop_signal type="boolean">false</stop_signal>
</interactive>
            `;
            
            const interactive = processor.extractInteractiveContent(responseText);
            
            expect(interactive.response).toBeUndefined();
            expect(interactive.stopSignal).toBe(false);
        });
    });
    
    describe('Prompt Rendering', () => {
        it('should render thinking content to chat history', () => {
            const thinking = {
                analysis: 'Test analysis',
                plan: 'Test plan',
                reasoning: 'Test reasoning'
            };
            
            processor.renderThinkingToPrompt(thinking, 1);
            
            const history = processor.getChatHistory();
            expect(history).toHaveLength(1);
            expect(history[0].role).toBe('agent');
            expect(history[0].type).toBe('thinking');
            expect(history[0].step).toBe(1);
            expect(history[0].content).toContain('Test analysis');
            expect(history[0].content).toContain('Test plan');
            expect(history[0].content).toContain('Test reasoning');
        });
        
        it('should render interactive content to chat history', () => {
            const interactive = {
                response: 'Test response',
                stopSignal: true
            };
            
            processor.renderInteractiveToPrompt(interactive, 2);
            
            const history = processor.getChatHistory();
            expect(history).toHaveLength(1);
            expect(history[0].role).toBe('agent');
            expect(history[0].type).toBe('message');
            expect(history[0].step).toBe(2);
            expect(history[0].content).toBe('Test response');
            expect(processor.getStopSignal()).toBe(true);
        });
        
        it('should not render empty thinking content', () => {
            const thinking = {};
            
            processor.renderThinkingToPrompt(thinking, 1);
            
            const history = processor.getChatHistory();
            expect(history).toHaveLength(0);
        });
    });
    
    describe('Prompt Formatting', () => {
        it('should format complete prompt with system prompt and history', () => {
            processor.updateSystemPrompt('Test system prompt');
            processor.renderThinkingToPrompt({
                analysis: 'Test analysis'
            }, 1);
            
            const prompt = processor.formatPrompt(2);
            
            expect(prompt).toContain('Test system prompt');
            expect(prompt).toContain('## Chat History');
            expect(prompt).toContain('Test analysis');
            expect(prompt).toContain('## Current Step: 2');
        });
        
        it('should handle empty chat history', () => {
            processor.updateSystemPrompt('Test system prompt');
            
            const prompt = processor.formatPrompt(1);
            
            expect(prompt).toContain('Test system prompt');
            expect(prompt).toContain('## Current Step: 1');
            expect(prompt).not.toContain('## Chat History');
        });
    });
    
    describe('Step Prompts', () => {
        beforeEach(() => {
            // Add some test messages
            processor.renderThinkingToPrompt({ analysis: 'Step 1 analysis' }, 1);
            processor.renderInteractiveToPrompt({ response: 'Step 1 response' }, 1);
            processor.renderThinkingToPrompt({ analysis: 'Step 2 analysis' }, 2);
            processor.renderInteractiveToPrompt({ response: 'Step 2 response' }, 2);
        });
        
        it('should get all step prompts', () => {
            const prompts = processor.getStepPrompts();
            
            expect(prompts).toHaveLength(2);
            expect(prompts[0]).toContain('## Step 1');
            expect(prompts[0]).toContain('Step 1 analysis');
            expect(prompts[0]).toContain('Step 1 response');
            expect(prompts[1]).toContain('## Step 2');
            expect(prompts[1]).toContain('Step 2 analysis');
            expect(prompts[1]).toContain('Step 2 response');
        });
        
        it('should filter step prompts by range', () => {
            const prompts = processor.getStepPrompts({ start: 2, end: 2 });
            
            expect(prompts).toHaveLength(1);
            expect(prompts[0]).toContain('## Step 2');
            expect(prompts[0]).toContain('Step 2 analysis');
            expect(prompts[0]).not.toContain('Step 1');
        });
    });
});

describe('System Prompt Functions', () => {
    describe('getSystemPromptForMode', () => {
        it('should return different prompts for different modes', () => {
            const standardPrompt = getSystemPromptForMode('standard');
            const enhancedPrompt = getSystemPromptForMode('enhanced');
            
            expect(standardPrompt).not.toBe(enhancedPrompt);
            expect(enhancedPrompt).toContain('<analysis>');
            expect(enhancedPrompt).toContain('<plan>');
            expect(enhancedPrompt).toContain('<reasoning>');
            expect(standardPrompt).not.toContain('<analysis>');
        });
        
        it('should throw error for unknown mode', () => {
            expect(() => {
                getSystemPromptForMode('unknown' as any);
            }).toThrow('Unknown thinking mode: unknown');
        });
    });
    
    describe('validateSystemPromptCompatibility', () => {
        it('should validate enhanced mode requirements', () => {
            const validPrompt = `
<think>
<analysis></analysis>
<plan></plan>
<reasoning></reasoning>
</think>
<interactive>
<response></response>
<stop_signal type="boolean">false</stop_signal>
</interactive>
            `;
            
            const result = validateSystemPromptCompatibility(validPrompt, 'enhanced');
            
            expect(result.compatible).toBe(true);
            expect(result.missingElements).toHaveLength(0);
        });
        
        it('should detect missing elements', () => {
            const invalidPrompt = `
                <think>
                <analysis></analysis>
                </think>
                <interactive>
                <response></response>
                </interactive>
            `;
            
            const result = validateSystemPromptCompatibility(invalidPrompt, 'enhanced');
            
            expect(result.compatible).toBe(false);
            expect(result.missingElements).toContain('<plan>');
            expect(result.missingElements).toContain('<reasoning>');
            expect(result.missingElements).toContain('<stop_signal>');
        });
        
        it('should provide suggestions for improvements', () => {
            const promptWithoutType = `
                <think>
                <analysis></analysis>
                <plan></plan>
                <reasoning></reasoning>
                </think>
                <interactive>
                <response></response>
                <stop_signal></stop_signal>
                </interactive>
            `;
            
            const result = validateSystemPromptCompatibility(promptWithoutType, 'enhanced');
            
            expect(result.suggestions).toContain('Consider adding type="boolean" attribute to stop_signal for better type safety');
        });
    });
}); 