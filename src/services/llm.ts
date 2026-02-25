import { ChatOpenAI } from "@langchain/openai";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { createLogger } from "../utils/logger.ts";
import type { LlmUserConfig } from "../config/llm-config.ts";

const logger = createLogger("models");

/**
 * Model configuration options
 */
export interface ModelConfig {
  modelName?: string;
  apiKey?: string;
  temperature?: number;
  maxTokens?: number;
  baseUrl?: string;
}

/**
 * Create a Gemini model instance via AI Studio
 */
export function createGeminiModel(config: ModelConfig = {}): BaseChatModel {
  const apiKey = config.apiKey || process.env.GOOGLE_AI_STUDIO_API_KEY;
  const modelName =
    config.modelName || process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";

  logger.info(`Creating Gemini model: ${modelName}`);

  if (!apiKey) {
    logger.error("GOOGLE_AI_STUDIO_API_KEY not found in environment or config");
    throw new Error(
      "GOOGLE_AI_STUDIO_API_KEY not found in environment or config",
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
 * Create a generic OpenAI-compatible model instance
 * Can be used with any provider supporting the OpenAI API (e.g. OpenAI, OpenRouter, DeepSeek, etc.)
 */
export function createOpenAIModel(config: ModelConfig = {}): BaseChatModel {
  const apiKey = config.apiKey || process.env.OPEN_AI_API_KEY;
  const modelName =
    config.modelName || process.env.OPEN_AI_MODEL || "gpt-3.5-turbo";
  const baseUrl = config.baseUrl || process.env.OPEN_AI_API_URL;

  logger.info(
    `Creating OpenAI model: ${modelName} at ${baseUrl || "default openai url"}`,
  );

  if (!apiKey) {
    logger.warn("OPEN_AI_API_KEY not found. Some providers may require it.");
  }

  return new ChatOpenAI({
    modelName,
    apiKey,
    temperature: config.temperature ?? 0.7,
    maxTokens: config.maxTokens,
    configuration: {
      baseURL: baseUrl,
    },
  });
}

/**
 * Get default model based on environment variables
 */
export function getDefaultModel(): BaseChatModel {
  logger.info("Getting default model...");

  // 1. Prefer Gemini if explicitly key is present
  if (process.env.GOOGLE_AI_STUDIO_API_KEY) {
    logger.info("Using Gemini model (detected GOOGLE_AI_STUDIO_API_KEY)");
    return createGeminiModel();
  }

  // 2. Fallback to OpenAI Compatible (OpenRouter, OpenAI, Local, etc.)
  if (process.env.OPEN_AI_API_KEY) {
    logger.info("Using OpenAI Compatible model (detected OPEN_AI_API_KEY)");
    return createOpenAIModel();
  }

  // 3. Last resort - check if just the URL is there (e.g. local llm with no key needed)
  if (process.env.OPEN_AI_API_URL) {
    logger.info("Using OpenAI Compatible model (detected OPEN_AI_API_URL)");
    return createOpenAIModel();
  }

  throw new Error(
    "No valid provider found. Set GOOGLE_AI_STUDIO_API_KEY or OPEN_AI_API_KEY (and optionally OPEN_AI_API_URL) in .env",
  );
}

/**
 * Get the name of the default model configured in environment variables
 */
export function getDefaultModelName(): string {
  if (process.env.GOOGLE_AI_STUDIO_API_KEY) {
    return process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";
  }

  if (process.env.OPEN_AI_API_KEY || process.env.OPEN_AI_API_URL) {
    return process.env.OPEN_AI_MODEL || "gpt-3.5-turbo";
  }

  return "unknown";
}

/**
 * Create a model instance from a resolved LlmUserConfig (returned by resolveLlmConfig).
 * This is the primary entry point when the user has configured the provider via the CLI.
 */
export function createModelFromConfig(config: LlmUserConfig): BaseChatModel {
  if (config.provider === "google-gemini") {
    return createGeminiModel({
      apiKey: config.apiKey,
      modelName: config.modelName,
    });
  }

  return createOpenAIModel({
    apiKey: config.apiKey,
    modelName: config.modelName,
    baseUrl: config.apiUrl,
  });
}
