import { ChatOpenAI } from "@langchain/openai";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { createLogger } from "../utils/logger.ts";

const logger = createLogger("models");

/**
 * Model configuration options
 */
export interface ModelConfig {
  modelName?: string;
  apiKey?: string;
  temperature?: number;
  maxTokens?: number;
}

/**
 * Create an OpenRouter model instance
 * Supports any model available on OpenRouter
 */
export function createOpenRouterModel(config: ModelConfig = {}): BaseChatModel {
  const apiKey = config.apiKey || process.env.OPEN_ROUTER_API_KEY;
  const modelName =
    config.modelName ||
    process.env.OPEN_ROUTER_MODEL ||
    "x-ai/grok-4.1-fast:free";

  logger.info(`Creating OpenRouter model: ${modelName}`);

  if (!apiKey) {
    logger.error("OPEN_ROUTER_API_KEY not found in environment or config");
    throw new Error("OPEN_ROUTER_API_KEY not found in environment or config");
  }

  return new ChatOpenAI({
    modelName,
    apiKey,
    temperature: config.temperature ?? 0.7,
    maxTokens: config.maxTokens,
    configuration: {
      baseURL: "https://openrouter.ai/api/v1",
    },
  });
}

/**
 * Create a Gemini model instance via AI Studio
 * Supports Gemini models: gemini-1.5-flash, gemini-1.5-pro, etc.
 */
export function createGeminiModel(config: ModelConfig = {}): BaseChatModel {
  const apiKey = config.apiKey || process.env.GOOGLE_AI_STUDIO_API_KEY;
  const modelName =
    config.modelName || process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";

  logger.info(`Creating Gemini model: ${modelName}`);
  logger.info(
    `API Key present: ${apiKey ? "Yes (length: " + apiKey.length + ")" : "No"}`
  );

  if (!apiKey) {
    logger.error("GOOGLE_AI_STUDIO_API_KEY not found in environment or config");
    throw new Error(
      "GOOGLE_AI_STUDIO_API_KEY not found in environment or config"
    );
  }

  try {
    const model = new ChatGoogleGenerativeAI({
      model: modelName,
      apiKey,
      temperature: config.temperature ?? 0.7,
      maxOutputTokens: config.maxTokens,
    });
    logger.success(`Gemini model created successfully: ${modelName}`);
    return model;
  } catch (error) {
    logger.error(`Error creating Gemini model: ${error}`);
    throw error;
  }
}

/**
 * Get default model based on environment variables
 * Defaults to free models when available
 */
export function getDefaultModel(): BaseChatModel {
  logger.info("Getting default model...");
  logger.info(`MODEL_PROVIDER: ${process.env.MODEL_PROVIDER || "auto"}`);
  logger.info(
    `OPEN_ROUTER_API_KEY present: ${
      process.env.OPEN_ROUTER_API_KEY ? "Yes" : "No"
    }`
  );
  logger.info(
    `GOOGLE_AI_STUDIO_API_KEY present: ${
      process.env.GOOGLE_AI_STUDIO_API_KEY ? "Yes" : "No"
    }`
  );

  // Check explicit provider preference first
  const provider = process.env.MODEL_PROVIDER?.toLowerCase();

  if (provider === "openrouter") {
    if (!process.env.OPEN_ROUTER_API_KEY) {
      throw new Error(
        'MODEL_PROVIDER is set to "openrouter" but OPEN_ROUTER_API_KEY is not configured'
      );
    }
    logger.info("Using OpenRouter model (explicitly set)");
    return createOpenRouterModel();
  }

  if (provider === "gemini") {
    if (!process.env.GOOGLE_AI_STUDIO_API_KEY) {
      throw new Error(
        'MODEL_PROVIDER is set to "gemini" but GOOGLE_AI_STUDIO_API_KEY is not configured'
      );
    }
    logger.info("Using Gemini model (explicitly set)");
    return createGeminiModel();
  }

  // Auto-detect based on available API keys (fallback behavior)
  if (process.env.OPEN_ROUTER_API_KEY) {
    logger.info("Using OpenRouter model (auto-detected)");
    return createOpenRouterModel();
  }
  if (process.env.GOOGLE_AI_STUDIO_API_KEY) {
    logger.info("Using Gemini model (auto-detected)");
    return createGeminiModel();
  }
  throw new Error(
    "No API key found. Set OPEN_ROUTER_API_KEY or GOOGLE_AI_STUDIO_API_KEY in .env"
  );
}

/**
 * Get the name of the default model configured in environment variables
 */
export function getDefaultModelName(): string {
  if (process.env.OPEN_ROUTER_API_KEY) {
    return process.env.OPEN_ROUTER_MODEL || "x-ai/grok-4.1-fast:free";
  }
  if (process.env.GOOGLE_AI_STUDIO_API_KEY) {
    return process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";
  }
  return "unknown";
}

/**
 * Model presets for common use cases
 */
export const ModelPresets = {
  /** FREE - Gemini Flash via OpenRouter (fast, good for testing) */
  free: () =>
    createOpenRouterModel({
      modelName: "x-ai/grok-4.1-fast:free",
      temperature: 0.7,
    }),

  /** FREE - Gemini Flash via AI Studio (generous free tier) */
  freeGemini: () =>
    createGeminiModel({
      modelName: "gemini-1.5-flash",
      temperature: 0.7,
    }),

  /** FREE - Meta Llama 3.1 8B via OpenRouter */
  freeLlama: () =>
    createOpenRouterModel({
      modelName: "meta-llama/llama-3.1-8b-instruct:free",
      temperature: 0.7,
    }),

  /** FREE - Qwen 2.5 7B via OpenRouter */
  freeQwen: () =>
    createOpenRouterModel({
      modelName: "qwen/qwen-2.5-7b-instruct:free",
      temperature: 0.7,
    }),

  /** PAID - Fast and cost-effective */
  fast: () =>
    createOpenRouterModel({
      modelName: "anthropic/claude-3-haiku",
      temperature: 0.7,
    }),

  /** PAID - Balanced performance */
  balanced: () =>
    createOpenRouterModel({
      modelName: "anthropic/claude-3.5-sonnet",
      temperature: 0.7,
    }),

  /** PAID - Most capable */
  powerful: () =>
    createOpenRouterModel({
      modelName: "anthropic/claude-3-opus",
      temperature: 0.7,
    }),

  /** PAID - Gemini Pro for multimodal */
  geminiPro: () =>
    createGeminiModel({
      modelName: "gemini-1.5-pro",
      temperature: 0.7,
    }),
} as const;
