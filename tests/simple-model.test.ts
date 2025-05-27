import { 
    OPENAI_MODELS, 
    ANTHROPIC_MODELS, 
    GOOGLE_MODELS, 
    GOOGLE_IMAGE_MODELS, 
    GOOGLE_VIDEO_MODELS,
    SupportedModel,
    getModelProvider
} from "../src/core/models";

describe('Simple Model Tests', () => {
    
    describe('getModelProvider', () => {
        test('should return correct provider for OpenAI models', () => {
            expect(getModelProvider(OPENAI_MODELS.GPT_4O)).toBe('openai');
            expect(getModelProvider(OPENAI_MODELS.GPT_4_5_PREVIEW)).toBe('openai');
            expect(getModelProvider(OPENAI_MODELS.GPT_4O_AUDIO_PREVIEW_2024_12_17)).toBe('openai');
        });

        test('should return correct provider for Anthropic models', () => {
            expect(getModelProvider(ANTHROPIC_MODELS.CLAUDE_3_5_SONNET_20241022)).toBe('anthropic');
            expect(getModelProvider(ANTHROPIC_MODELS.CLAUDE_3_OPUS_20240229)).toBe('anthropic');
        });

        test('should return correct provider for Google models', () => {
            expect(getModelProvider(GOOGLE_MODELS.GEMINI_2_5_FLASH_PREVIEW_05_20)).toBe('google');
            expect(getModelProvider(GOOGLE_MODELS.GEMINI_2_0_FLASH)).toBe('google');
            expect(getModelProvider(GOOGLE_IMAGE_MODELS.IMAGEN_3_0_GENERATE_002)).toBe('google');
            expect(getModelProvider(GOOGLE_VIDEO_MODELS.VEO_2_0_GENERATE_001)).toBe('google');
        });
    });

    describe('SupportedModel type', () => {
        test('should accept all model types', () => {
            const models: SupportedModel[] = [
                OPENAI_MODELS.GPT_4O,
                ANTHROPIC_MODELS.CLAUDE_3_5_SONNET_20241022,
                GOOGLE_MODELS.GEMINI_2_5_FLASH_PREVIEW_05_20,
                GOOGLE_IMAGE_MODELS.IMAGEN_3_0_GENERATE_002,
                GOOGLE_VIDEO_MODELS.VEO_2_0_GENERATE_001
            ];

            // Test that all models have providers
            models.forEach(model => {
                const provider = getModelProvider(model);
                expect(['openai', 'anthropic', 'google']).toContain(provider);
            });
        });
    });

    describe('Model enumeration', () => {
        test('should have expected OpenAI models', () => {
            expect(OPENAI_MODELS.GPT_4O).toBe('gpt-4o');
            expect(OPENAI_MODELS.GPT_4_5_PREVIEW).toBe('gpt-4.5-preview');
            expect(OPENAI_MODELS.GPT_4O_MINI).toBe('gpt-4o-mini');
        });

        test('should have expected Anthropic models', () => {
            expect(ANTHROPIC_MODELS.CLAUDE_3_5_SONNET_20241022).toBe('claude-3-5-sonnet-20241022');
            expect(ANTHROPIC_MODELS.CLAUDE_3_OPUS_20240229).toBe('claude-3-opus-20240229');
        });

        test('should have expected Google models', () => {
            expect(GOOGLE_MODELS.GEMINI_2_5_FLASH_PREVIEW_05_20).toBe('gemini-2.5-flash-preview-05-20');
            expect(GOOGLE_IMAGE_MODELS.IMAGEN_3_0_GENERATE_002).toBe('imagen-3.0-generate-002');
            expect(GOOGLE_VIDEO_MODELS.VEO_2_0_GENERATE_001).toBe('veo-2.0-generate-001');
        });
    });
}); 