export enum DEEPSEEK_MODELS {
    REASONER = "deepseek-reasoner",
    CHAT = "deepseek-chat",
}

export enum OPENAI_MODELS {
    // Core GPT-4 Models
    GPT_4O = "gpt-4o",
    GPT_4O_MINI = "gpt-4o-mini",
    GPT_4O_2024_08_06 = "gpt-4o-2024-08-06",
    GPT_4O_2024_05_13 = "gpt-4o-2024-05-13",
    GPT_4O_2024_11_20 = "gpt-4o-2024-11-20",
    GPT_4O_MINI_2024_07_18 = "gpt-4o-mini-2024-07-18",
    
    // GPT-4 Turbo Models
    GPT_4_TURBO = "gpt-4-turbo",
    GPT_4_TURBO_2024_04_09 = "gpt-4-turbo-2024-04-09",
    GPT_4_TURBO_PREVIEW = "gpt-4-turbo-preview",
    GPT_4_0125_PREVIEW = "gpt-4-0125-preview",
    GPT_4_1106_PREVIEW = "gpt-4-1106-preview",
    
    // GPT-4 Base Models
    GPT_4 = "gpt-4",
    GPT_4_0613 = "gpt-4-0613",
    
    // GPT-4.5 Models (Latest)
    GPT_4_5_PREVIEW = "gpt-4.5-preview",
    GPT_4_5_PREVIEW_2025_02_27 = "gpt-4.5-preview-2025-02-27",
    
    // GPT-4.1 Models (Latest)
    GPT_4_1 = "gpt-4.1",
    GPT_4_1_2025_04_14 = "gpt-4.1-2025-04-14",
    GPT_4_1_MINI = "gpt-4.1-mini",
    GPT_4_1_MINI_2025_04_14 = "gpt-4.1-mini-2025-04-14",
    GPT_4_1_NANO = "gpt-4.1-nano",
    GPT_4_1_NANO_2025_04_14 = "gpt-4.1-nano-2025-04-14",
    
    // Audio Models
    GPT_4O_AUDIO_PREVIEW = "gpt-4o-audio-preview",
    GPT_4O_AUDIO_PREVIEW_2024_10_01 = "gpt-4o-audio-preview-2024-10-01",
    GPT_4O_AUDIO_PREVIEW_2024_12_17 = "gpt-4o-audio-preview-2024-12-17",
    GPT_4O_MINI_AUDIO_PREVIEW = "gpt-4o-mini-audio-preview",
    GPT_4O_MINI_AUDIO_PREVIEW_2024_12_17 = "gpt-4o-mini-audio-preview-2024-12-17",
    
    // Realtime Models
    GPT_4O_REALTIME_PREVIEW = "gpt-4o-realtime-preview",
    GPT_4O_REALTIME_PREVIEW_2024_10_01 = "gpt-4o-realtime-preview-2024-10-01",
    GPT_4O_REALTIME_PREVIEW_2024_12_17 = "gpt-4o-realtime-preview-2024-12-17",
    GPT_4O_MINI_REALTIME_PREVIEW = "gpt-4o-mini-realtime-preview",
    GPT_4O_MINI_REALTIME_PREVIEW_2024_12_17 = "gpt-4o-mini-realtime-preview-2024-12-17",
    
    // Search Models
    GPT_4O_SEARCH_PREVIEW = "gpt-4o-search-preview",
    GPT_4O_SEARCH_PREVIEW_2025_03_11 = "gpt-4o-search-preview-2025-03-11",
    GPT_4O_MINI_SEARCH_PREVIEW = "gpt-4o-mini-search-preview",
    GPT_4O_MINI_SEARCH_PREVIEW_2025_03_11 = "gpt-4o-mini-search-preview-2025-03-11",
    
    // Specialized Models
    GPT_4O_TRANSCRIBE = "gpt-4o-transcribe",
    GPT_4O_MINI_TRANSCRIBE = "gpt-4o-mini-transcribe",
    GPT_4O_MINI_TTS = "gpt-4o-mini-tts",
    CHATGPT_4O_LATEST = "chatgpt-4o-latest",

    O3 = "o3-mini",
    O3_MINI = "o3",
    O3_PRO = "o3-pro",
}

export enum ANTHROPIC_MODELS {
    // Claude Opus 4 (Latest)
    CLAUDE_OPUS_4_20250514 = "claude-opus-4-20250514",
    
    // Claude Sonnet 4 (Latest)
    CLAUDE_SONNET_4_20250514 = "claude-sonnet-4-20250514",
    
    // Claude 3.7 Sonnet (Latest)
    CLAUDE_3_7_SONNET_20250219 = "claude-3-7-sonnet-20250219",
    CLAUDE_3_7_SONNET_LATEST = "claude-3-7-sonnet-latest",
    
    // Claude 3.5 Models

    CLAUDE_3_5_SONNET_LATEST = "claude-3-5-sonnet-latest",

    CLAUDE_3_5_SONNET_V2_20241022 = "claude-3-5-sonnet-v2@20241022",
    CLAUDE_3_5_SONNET_V1_20240620 = "claude-3-5-sonnet-v1@20240620",

    CLAUDE_3_5_HAIKU_LATEST = "claude-3-5-haiku-latest",
    
    // Claude 3 Models

    CLAUDE_3_OPUS_LATEST = "claude-3-opus-latest",


    


}

export enum GOOGLE_MODELS {
    // Gemini 2.5 Flash Models (Latest)
    GEMINI_2_5_FLASH_PREVIEW_05_20 = "gemini-2.5-flash-preview-05-20",
    GEMINI_2_5_FLASH_PREVIEW_NATIVE_AUDIO_DIALOG = "gemini-2.5-flash-preview-native-audio-dialog",
    GEMINI_2_5_FLASH_EXP_NATIVE_AUDIO_THINKING_DIALOG = "gemini-2.5-flash-exp-native-audio-thinking-dialog",
    GEMINI_2_5_FLASH_PREVIEW_TTS = "gemini-2.5-flash-preview-tts",
    
    // Gemini 2.5 Pro Models (Latest)
    GEMINI_2_5_PRO_PREVIEW_05_06 = "gemini-2.5-pro-preview-05-06",
    GEMINI_2_5_PRO_PREVIEW_TTS = "gemini-2.5-pro-preview-tts",
    
    // Gemini 2.0 Flash Models
    GEMINI_2_0_FLASH = "gemini-2.0-flash",
    GEMINI_2_0_FLASH_PREVIEW_IMAGE_GENERATION = "gemini-2.0-flash-preview-image-generation",
    GEMINI_2_0_FLASH_LITE = "gemini-2.0-flash-lite",
    GEMINI_2_0_FLASH_LIVE_001 = "gemini-2.0-flash-live-001",
    
    // Gemini 1.5 Models
    GEMINI_1_5_FLASH = "gemini-1.5-flash",
    GEMINI_1_5_FLASH_8B = "gemini-1.5-flash-8b",
    GEMINI_1_5_PRO = "gemini-1.5-pro",
    
    // Embedding Models
    GEMINI_EMBEDDING_EXP = "gemini-embedding-exp",
    
    // Legacy Models
    GEMINI_2_0_FLASH_EXP = "gemini-2.0-flash-exp",
    GEMINI_2_0_FLASH_001 = "gemini-2.0-flash-001",
    GEMINI_2_0_FLASH_002 = "gemini-2.0-flash-002",
    GEMINI_2_0_FLASH_003 = "gemini-2.0-flash-003",
    GEMINI_2_0_FLASH_004 = "gemini-2.0-flash-004",
}

// Specialized Google Model Categories
export enum GOOGLE_IMAGE_MODELS {
    GEMINI_2_0_FLASH_PREVIEW_IMAGE_GENERATION = "gemini-2.0-flash-preview-image-generation",
    IMAGEN_3_0_GENERATE_002 = "imagen-3.0-generate-002",
}

export enum GOOGLE_VIDEO_MODELS {
    VEO_2_0_GENERATE_001 = "veo-2.0-generate-001",
}

// 统一的模型类型 - 所有支持的模型的联合类型
export type SupportedModel = 
    | OPENAI_MODELS 
    | ANTHROPIC_MODELS 
    | GOOGLE_MODELS 
    | GOOGLE_IMAGE_MODELS 
    | GOOGLE_VIDEO_MODELS
    | DEEPSEEK_MODELS;

// 模型到提供商的映射
export function getModelProvider(model: SupportedModel): 'deepseek' | 'openai' | 'anthropic' | 'google' {
    // OpenAI 模型
    if (Object.values(OPENAI_MODELS).includes(model as OPENAI_MODELS)) {
        return 'openai';
    }

    if (Object.values(DEEPSEEK_MODELS).includes(model as DEEPSEEK_MODELS)) {
        return 'deepseek';
    }
    
    // Anthropic 模型
    if (Object.values(ANTHROPIC_MODELS).includes(model as ANTHROPIC_MODELS)) {
        return 'anthropic';
    }
    
    // Google 模型 (包括所有 Google 相关枚举)
    if (Object.values(GOOGLE_MODELS).includes(model as GOOGLE_MODELS) ||
        Object.values(GOOGLE_IMAGE_MODELS).includes(model as GOOGLE_IMAGE_MODELS) ||
        Object.values(GOOGLE_VIDEO_MODELS).includes(model as GOOGLE_VIDEO_MODELS)) {
        return 'google';
    }
    
    // 默认返回 openai (这种情况理论上不应该发生)
    return 'openai';
}