/**
 * Text extractors interface for recursive XML tag extraction
 */
export type AnyTextExtractors = TextExtractors<any>;

export interface TextExtractors<Result> {
    tags: string[];                                    // List of tags to extract
    tagToExtractor?: (tag: string) => AnyTextExtractors; // Sub-tag extractor mapping function
    textExtract(text: string): Result;                // Recursive extraction method
}

/**
 * Tag configuration interface
 */
export interface TagConfig {
    tag: string;                    // Tag name
    optional: boolean;              // Whether optional
    allowEmpty: boolean;            // Whether to allow empty content
    childTags?: TagConfig[];        // Child tag configurations
    validator?: (content: string) => boolean; // Content validation function
    supportedTypes?: string[];      // Supported attribute types
}

/**
 * Extractor configuration interface
 */
export interface ExtractorConfig {
    mode: 'standard' | 'enhanced' | 'custom';
    tagConfigs: TagConfig[];
    caseSensitive?: boolean;
    preserveWhitespace?: boolean;
    fallbackToRegex?: boolean;
    enableTypeExtraction?: boolean;
} 