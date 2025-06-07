import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Get the directory of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from root .env.local file
const rootDir = join(__dirname, '../../');
dotenv.config({ path: join(rootDir, '.env.local') });

// Also load from local .env file if it exists
dotenv.config({ path: join(__dirname, '.env') });

// Initialize clients
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});


// Initialize Google genai client for model listing
const googleClient = new GoogleGenAI({
  apiKey: process.env.GOOGLE_API_KEY,
});

async function fetchOpenAIModels() {
  console.log("🔍 Fetching OpenAI models...");
  try {
    const list = await openai.models.list();
    const models = [];
    
    for await (const model of list) {
      models.push(model);
    }
    
    // Filter for GPT models only
    const gptModels = models.filter(model => 
      model.id.includes('gpt') && 
      model.id.includes('4') // Focus on GPT-4 variants
    );
    
    console.log("📋 OpenAI GPT-4 Models:");
    gptModels.forEach(model => {
      console.log(`  - ${model.id} (created: ${new Date(model.created * 1000).toISOString()})`);
    });
    
    return gptModels;
  } catch (error) {
    console.error("❌ Error fetching OpenAI models:", error.message);
    return [];
  }
}

async function fetchAnthropicModels() {
  console.log("\n🔍 Fetching Anthropic models...");
  try {
    // Anthropic doesn't have a public models list API, so we'll test known models
    const knownModels = [
      "claude-3-5-sonnet-20241022",
      "claude-3-5-sonnet-20240620",
      "claude-3-5-haiku-20241022",
      "claude-3-opus-20240229",
      "claude-3-sonnet-20240229",
      "claude-3-haiku-20240307"
    ];
    
    console.log("📋 Known Anthropic Models:");
    knownModels.forEach(model => {
      console.log(`  - ${model}`);
    });
    
    // Test if we can access one of them
    try {
      const message = await anthropic.messages.create({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 10,
        messages: [{ role: "user", content: "Hi" }]
      });
      console.log("✅ Anthropic API is accessible");
    } catch (error) {
      console.log("⚠️  Anthropic API test failed:", error.message);
    }
    
    return knownModels;
  } catch (error) {
    console.error("❌ Error with Anthropic:", error.message);
    return [];
  }
}

async function fetchGoogleModels() {
  console.log("\n🔍 Fetching Google models...");
  try {
    if (!process.env.GOOGLE_API_KEY) {
      console.log("⚠️  No GOOGLE_API_KEY found, skipping Google models");
      return [];
    }

    // Fetch models that support generateContent
    const generateContentModels = [];
    const embedContentModels = [];
    
    console.log("📋 Fetching models from Google API...");
    
    for await (const model of googleClient.models.list()) {
        console.log(model);
      if (model.supported_actions) {

        for (const action of model.supported_actions) {
          if (action === "generateContent") {
            generateContentModels.push(model.name);
          }
          if (action === "embedContent") {
            embedContentModels.push(model.name);
          }
        }
      }
    }
    
    console.log("📋 Google Models that support generateContent:");
    generateContentModels.forEach(model => {
      console.log(`  - ${model}`);
    });
    
    console.log("\n📋 Google Models that support embedContent:");
    embedContentModels.forEach(model => {
      console.log(`  - ${model}`);
    });
    
    // Test if we can access the API
    if (generateContentModels.length > 0) {
      console.log("✅ Google AI API is accessible");
    }
    
    // Return only generateContent models for enum generation
    return generateContentModels.map(name => name.replace('models/', ''));
  } catch (error) {
    console.error("❌ Error fetching Google models:", error.message);
    console.log("📋 Falling back to known Google models:");
    
    // Fallback to known models if API call fails
    const fallbackModels = [
      "gemini-2.5-flash-preview-05-20",
      "gemini-2.5-flash-preview-native-audio-dialog",
      "gemini-2.5-flash-exp-native-audio-thinking-dialog",
      "gemini-2.5-flash-preview-tts",
      "gemini-2.5-pro-preview-05-06",
      "gemini-2.5-pro-preview-tts",
      "gemini-2.0-flash",
      "gemini-2.0-flash-preview-image-generation",
      "gemini-2.0-flash-lite",
      "gemini-1.5-flash",
      "gemini-1.5-flash-8b",
      "gemini-1.5-pro",
      "gemini-embedding-exp",
      "imagen-3.0-generate-002",
      "veo-2.0-generate-001",
      "gemini-2.0-flash-live-001"
    ];
    
    fallbackModels.forEach(model => {
      console.log(`  - ${model}`);
    });
    
    return fallbackModels;
  }
}

async function generateModelsEnum() {
  console.log("\n🔧 Generating TypeScript enums for models.ts...");
  
  const openaiModels = await fetchOpenAIModels();
  const anthropicModels = await fetchAnthropicModels();
  const googleModels = await fetchGoogleModels();
  
  console.log("\n📝 Suggested TypeScript enums:");
  
  // Generate OpenAI enum
  console.log("\n// OpenAI Models");
  console.log("export enum OPENAI_MODELS {");
  openaiModels.forEach(model => {
    const enumName = model.id.toUpperCase().replace(/-/g, '_').replace(/\./g, '_');
    console.log(`    ${enumName} = "${model.id}",`);
  });
  console.log("}");
  
  // Generate Anthropic enum
  console.log("\n// Anthropic Models");
  console.log("export enum ANTHROPIC_MODELS {");
  anthropicModels.forEach(model => {
    const enumName = model.toUpperCase().replace(/-/g, '_').replace(/\./g, '_');
    console.log(`    ${enumName} = "${model}",`);
  });
  console.log("}");
  
  // Generate Google enum
  console.log("\n// Google Models");
  console.log("export enum GOOGLE_MODELS {");
  googleModels.forEach(model => {
    const enumName = model.toUpperCase().replace(/-/g, '_').replace(/\./g, '_');
    console.log(`    ${enumName} = "${model}",`);
  });
  console.log("}");
}

async function main() {
  console.log("🚀 Starting model discovery...");
  console.log("📁 Loading environment variables from:");
  console.log(`  - Root .env.local: ${join(rootDir, '.env.local')}`);
  console.log(`  - Local .env: ${join(__dirname, '.env')}`);
  console.log("");
  
  // Check which API keys are available
  const availableKeys = [];
  if (process.env.OPENAI_API_KEY) availableKeys.push("✅ OPENAI_API_KEY");
  if (process.env.ANTHROPIC_API_KEY) availableKeys.push("✅ ANTHROPIC_API_KEY");
  if (process.env.GOOGLE_API_KEY) availableKeys.push("✅ GOOGLE_API_KEY");
  
  if (availableKeys.length > 0) {
    console.log("🔑 Found API keys:");
    availableKeys.forEach(key => console.log(`  ${key}`));
  } else {
    console.log("⚠️  No API keys found. Please set at least one of:");
    console.log("  - OPENAI_API_KEY");
    console.log("  - ANTHROPIC_API_KEY");
    console.log("  - GOOGLE_API_KEY");
  }
  console.log("=".repeat(50));
  
  await generateModelsEnum();
  
  console.log("\n✨ Model discovery complete!");
  console.log("Copy the generated enums to your models.ts file.");
}

main().catch(console.error); 