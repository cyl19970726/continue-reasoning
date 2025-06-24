# Enhanced Thinking Architecture Design v2.0

## Overview

Based on the analysis of the current `<think>` tag being too generic, this design proposes a configurable and recursive XML tag extraction architecture that precisely decomposes the thinking process into `<analysis>`, `<plan>`, and `<reasoning>` sub-parts, and restructures the interaction mode into an `<interactive>` structure with a stop signal mechanism for clearer AI reasoning process expression.

## Design Objectives

1. **Precise Thinking Process**: Decompose generic thinking content into clear analysis, planning, and reasoning stages
2. **Separate Internal Thinking from User Interaction**: Clearly distinguish AI's internal reasoning from external user communication  
3. **Flexible Configuration**: Support different thinking modes (standard, enhanced, custom) through configurable extraction rules
4. **Recursive Structure Support**: Support nested XML tag structures for complex reasoning scenarios
5. **Type-Safe Data Extraction**: Support attribute type extraction with default string type handling

## Core Architecture

### 1. Three Thinking Modes

#### Standard Mode
- Simple `<think>` and `<interactive>` structure
- Compatible with existing implementations
- Minimal configuration overhead

```xml
<think>
General thinking content mixed together
</think>

<interactive>
<response>User response content</response>
<stop_signal type="boolean">true</stop_signal>
</interactive>
```

#### Enhanced Mode (Focus of this design)
- Structured thinking with clear separation
- Decomposes thinking into: analysis, plan, reasoning
- Interactive section with typed stop signal

```xml
<think>
<analysis>Current situation analysis and problem understanding</analysis>
<plan>Specific action steps and strategy formulation</plan>
<reasoning>Logic chain and decision reasoning process</reasoning>
</think>

<interactive>
<response>Response content for user</response>
<stop_signal type="boolean">true</stop_signal>
</interactive>
```

#### Custom Mode
- Completely flexible tag configuration
- User-defined tag structures and extraction rules
- Reserved for future implementation and specific use cases

### 2. Core Components

#### TextExtractors Interface
Provides recursive XML tag extraction capability:

```typescript
export interface TextExtractors<Result> {
    tags: string[];                                    // List of tags to extract
    tagToExtractor?: (tag: string) => AnyTextExtractors; // Sub-tag extractor mapping function
    textExtract(text: string): Result;                // Recursive extraction method
}
```

#### Tag Configuration System
Supports flexible tag structure definition:

```typescript
export interface TagConfig {
    tag: string;                    // Tag name
    optional: boolean;              // Whether optional
    allowEmpty: boolean;            // Whether to allow empty content
    childTags?: TagConfig[];        // Child tag configurations
    validator?: (content: string) => boolean; // Content validation function
    supportedTypes?: string[];      // Supported attribute types
}
```

#### Type-Safe Attribute Extraction
Supports extracting and parsing type attributes from XML tags:

- Default type: `string` (if no type attribute specified)
- Supported types: `string`, `boolean`, `number`, `json`
- Type conversion and validation support

```xml
<stop_signal type="boolean">true</stop_signal>  <!-- Parsed as boolean -->
<count type="number">42</count>                 <!-- Parsed as number -->
<data type="json">{"key": "value"}</data>       <!-- Parsed as object -->
<message>Hello</message>                        <!-- Parsed as string (default) -->
```

### 3. Result Interface System

#### Base ExtractorResult
```typescript
export interface ExtractorResult {
    stopSignal?: boolean;
}
```

#### StandardExtractorResult
```typescript
export interface StandardExtractorResult extends ExtractorResult {
    thinking?: string;
    stopSignal?: boolean;
}
```

#### EnhancedThinkingExtractorResult
```typescript
export interface EnhancedThinkingExtractorResult extends ExtractorResult {
    // Thinking related content
    analysis?: string;        // Analysis content
    plan?: string;           // Plan content  
    reasoning?: string;      // Reasoning content
    
    // Interactive related content
    response?: string;       // Interactive response with user
    stopSignal?: boolean;    // Stop signal (replaces finalAnswer)
}
```

#### RecursiveExtractorResult  
```typescript
export interface RecursiveExtractorResult extends ExtractorResult {
    [key: string]: any | {
        text?: string;
        type?: string;       // Type attribute from XML
        value?: any;         // Parsed typed value
        [nestedKey: string]: any;
    };
}
```

### 4. Enhanced Prompt Processor Interface

Updated interface methods to use stop signal instead of final answer:

```typescript
export interface IPromptProcessor<TExtractorResult extends ExtractorResult> {
    // ... other methods ...
    
    // Stop signal management (replaces final answer methods)
    resetStopSignal(): void;
    setStopSignal(stopSignal: boolean): void;
    getStopSignal(): boolean | null;
}

export interface IEnhancedPromptProcessor<TExtractorResult extends ExtractorResult> 
    extends IPromptProcessor<TExtractorResult> {
    
    // Thinking mode control
    thinkingMode: 'standard' | 'enhanced' | 'custom';
    setThinkingMode(mode: 'standard' | 'enhanced' | 'custom'): void;
    
    // Structured content extraction
    extractStructuredThinking(responseText: string): {
        analysis?: string;
        plan?: string;
        reasoning?: string;
    };
    
    extractInteractiveContent(responseText: string): {
        response?: string;
        stopSignal?: boolean;
    };
}
```

## Implementation Plan

### Phase 1: Core Infrastructure
1. ✅ Define base interfaces (ExtractorResult, TextExtractors, TagConfig)
2. ✅ Update existing interface method names (stopSignal instead of finalAnswer)
3. ✅ Ensure xml-extractor supports type attribute extraction
4. ⏳ Create enhanced prompt processor implementations

### Phase 2: Standard and Enhanced Mode Implementation
1. Implement StandardPromptProcessor for standard mode
2. Implement EnhancedPromptProcessor for enhanced mode
3. Create configuration-driven extractor factories
4. Add comprehensive test coverage

### Phase 3: Integration and Testing
1. Update Agent implementation to use new prompt processors
2. Integration testing with real scenarios
3. Performance optimization and edge case handling
4. Documentation and examples

### Phase 4: Custom Mode (Future)
1. Design custom tag configuration system
2. Implement flexible extractor factories
3. Advanced validation and transformation support

## Key Benefits

1. **Clear Structure**: Separates thinking process into distinct, analyzable components
2. **Backwards Compatibility**: Standard mode maintains compatibility with existing implementations
3. **Type Safety**: Strong typing and attribute type extraction support
4. **Extensibility**: Custom mode provides unlimited flexibility for future needs
5. **Performance**: Efficient recursive extraction with configurable depth limits
6. **Maintainability**: Clear separation of concerns and modular design

## Usage Examples

### Enhanced Mode Example
```typescript
const processor = new EnhancedPromptProcessor();
processor.setThinkingMode('enhanced');

const result = processor.textExtractor(`
<think>
<analysis>The user is asking about XML parsing implementation</analysis>
<plan>1. Explain architecture 2. Provide code example 3. Show testing approach</plan>
<reasoning>This approach balances clarity with technical depth</reasoning>
</think>

<interactive>
<response>Here's the XML parsing architecture...</response>
<stop_signal type="boolean">false</stop_signal>
</interactive>
`);

// Result type: EnhancedThinkingExtractorResult
console.log(result.analysis);   // "The user is asking about..."
console.log(result.plan);       // "1. Explain architecture..."
console.log(result.reasoning);  // "This approach balances..."
console.log(result.response);   // "Here's the XML parsing..."
console.log(result.stopSignal); // false
```

### Type Extraction Example
```typescript
const xmlContent = `
<interactive>
<response>Processing complete</response>
<stop_signal type="boolean">true</stop_signal>
<confidence type="number">0.95</confidence>
<metadata type="json">{"tokens": 150, "time": "2ms"}</metadata>
</interactive>
`;

const result = extractor.textExtract(xmlContent);
// result.interactive.stop_signal.value === true (boolean)
// result.interactive.confidence.value === 0.95 (number)  
// result.interactive.metadata.value === {tokens: 150, time: "2ms"} (object)
``` 