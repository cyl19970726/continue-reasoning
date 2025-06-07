# Model Discovery Script

This script helps you discover available AI models from different providers (OpenAI, Anthropic, Google) and generates TypeScript enums for your `models.ts` file.

## Setup

1. **Install dependencies:**
   ```bash
   cd scripts/model-discovery
   npm install
   ```

2. **Set up environment variables:**
   The script will automatically load API keys from the following sources (in order of priority):
   
   **Option 1: Root .env.local file (Recommended)**
   ```
   # In your project root directory: .env.local
   OPENAI_API_KEY=your-openai-api-key
   ANTHROPIC_API_KEY=your-anthropic-api-key
   GOOGLE_API_KEY=your-google-api-key
   ```

   **Option 2: Local .env file**
   ```
   # In scripts/model-discovery/.env
   OPENAI_API_KEY=your-openai-api-key
   ANTHROPIC_API_KEY=your-anthropic-api-key
   GOOGLE_API_KEY=your-google-api-key
   ```

   **Option 3: Environment variables**
   ```bash
   export OPENAI_API_KEY="your-openai-api-key"
   export ANTHROPIC_API_KEY="your-anthropic-api-key"
   export GOOGLE_API_KEY="your-google-api-key"
   ```

## Usage

Run the script to discover models:

```bash
npm run test-models
```

Or directly with node:

```bash
node test-models.js
```

## What it does

1. **OpenAI Models**: Fetches all available models from OpenAI API and filters for GPT-4 variants
2. **Anthropic Models**: Lists known Claude models (since Anthropic doesn't have a public models list API)
3. **Google Models**: Fetches real-time model list from Google AI API, showing both generateContent and embedContent models
4. **Generates TypeScript Enums**: Creates properly formatted enum code that you can copy to your `models.ts` file

## Output

The script will output:
- List of discovered models with creation dates (for OpenAI)
- API accessibility status for each provider
- Generated TypeScript enum code ready to copy to your `models.ts` file

## Example Output

```
🚀 Starting model discovery...
📁 Loading environment variables from:
  - Root .env.local: /Users/hhh0x/agent/hhh-agi/.env.local
  - Local .env: /Users/hhh0x/agent/hhh-agi/scripts/model-discovery/.env

🔑 Found API keys:
  ✅ OPENAI_API_KEY
  ✅ ANTHROPIC_API_KEY
  ✅ GOOGLE_API_KEY
==================================================

🔍 Fetching OpenAI models...
📋 OpenAI GPT-4 Models:
  - gpt-4o (created: 2024-05-13T00:00:00.000Z)
  - gpt-4o-mini (created: 2024-07-18T00:00:00.000Z)
  - gpt-4o-2024-08-06 (created: 2024-08-06T00:00:00.000Z)

🔍 Fetching Anthropic models...
📋 Known Anthropic Models:
  - claude-3-5-sonnet-20241022
  - claude-3-5-sonnet-20240620
  - claude-3-5-haiku-20241022
✅ Anthropic API is accessible

🔍 Fetching Google models...
📋 Fetching models from Google API...
📋 Google Models that support generateContent:
  - gemini-2.0-flash-exp
  - gemini-2.0-flash-001
  - gemini-1.5-pro
  - gemini-1.5-flash

📋 Google Models that support embedContent:
  - text-embedding-004
  - embedding-001
✅ Google AI API is accessible

🔧 Generating TypeScript enums for models.ts...

📝 Suggested TypeScript enums:

// OpenAI Models
export enum OPENAI_MODELS {
    GPT_4O = "gpt-4o",
    GPT_4O_MINI = "gpt-4o-mini",
    GPT_4O_2024_08_06 = "gpt-4o-2024-08-06",
}

// Anthropic Models
export enum ANTHROPIC_MODELS {
    CLAUDE_3_5_SONNET_20241022 = "claude-3-5-sonnet-20241022",
    CLAUDE_3_5_SONNET_20240620 = "claude-3-5-sonnet-20240620",
    CLAUDE_3_5_HAIKU_20241022 = "claude-3-5-haiku-20241022",
}

// Google Models
export enum GOOGLE_MODELS {
    GEMINI_2_0_FLASH_EXP = "gemini-2.0-flash-exp",
    GEMINI_2_0_FLASH_001 = "gemini-2.0-flash-001",
    GEMINI_2_0_FLASH_002 = "gemini-2.0-flash-002",
}

✨ Model discovery complete!
Copy the generated enums to your models.ts file.
```

## Notes

- The script requires valid API keys to test connectivity
- OpenAI and Google provide models list APIs, so they fetch real-time data
- Anthropic doesn't have a public models list API, so the script uses known model names
- The script filters OpenAI models to focus on GPT-4 variants only
- For Google models, it shows both generateContent and embedContent models, but only includes generateContent models in the enum
- Generated enum names follow TypeScript conventions (UPPER_CASE with underscores)

## Environment Variable Priority

The script loads environment variables in the following order (later sources override earlier ones):
1. Root project `.env.local` file (recommended for project-specific keys)
2. Local `scripts/model-discovery/.env` file (for script-specific overrides)
3. System environment variables (highest priority)

This allows you to keep your API keys in the main project's `.env.local` file while still allowing for local overrides if needed. 