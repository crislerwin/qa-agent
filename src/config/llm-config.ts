import type { Database } from "bun:sqlite";
import * as clack from "@clack/prompts";

// ─── Types ───────────────────────────────────────────────────────────────────

export type LlmProvider = "google-gemini" | "openai-compat";

export interface LlmUserConfig {
  provider: LlmProvider;
  modelName: string;
  apiKey: string;
  /** Base URL — only relevant for openai-compat providers */
  apiUrl?: string;
}

// ─── Default models per provider ─────────────────────────────────────────────

const PROVIDER_DEFAULTS: Record<
  LlmProvider,
  { model: string; urlHint: string }
> = {
  "google-gemini": {
    model: "gemini-2.0-flash-exp",
    urlHint: "",
  },
  "openai-compat": {
    model: "gpt-4o-mini",
    urlHint: "https://api.openai.com/v1",
  },
};

// ─── Persistence (user_config table) ─────────────────────────────────────────

const CONFIG_KEY = "llm_config";

export class LlmConfigStore {
  constructor(private db: Database) {}

  load(): LlmUserConfig | null {
    const row = this.db
      .prepare("SELECT value FROM user_config WHERE key = ?")
      .get(CONFIG_KEY) as { value: string } | undefined;

    if (!row) return null;

    try {
      return JSON.parse(row.value) as LlmUserConfig;
    } catch {
      return null;
    }
  }

  save(config: LlmUserConfig): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO user_config (key, value, updated_at)
                 VALUES (?, ?, ?)`,
      )
      .run(CONFIG_KEY, JSON.stringify(config), Date.now());
  }

  clear(): void {
    this.db.prepare("DELETE FROM user_config WHERE key = ?").run(CONFIG_KEY);
  }
}

// ─── Resolution logic ─────────────────────────────────────────────────────────

/**
 * Resolve the LLM configuration using the following priority:
 *
 * 1. Environment variables (.env / process.env) — no prompt, no save
 * 2. Persisted SQLite config — no prompt, shows a note
 * 3. Interactive clack prompts — saves the result for next run
 */
export async function resolveLlmConfig(db: Database): Promise<LlmUserConfig> {
  // ── 1. Check environment variables ──────────────────────────────────────
  if (process.env.GOOGLE_AI_STUDIO_API_KEY) {
    return {
      provider: "google-gemini",
      modelName:
        process.env.GEMINI_MODEL || PROVIDER_DEFAULTS["google-gemini"].model,
      apiKey: process.env.GOOGLE_AI_STUDIO_API_KEY,
    };
  }

  if (process.env.OPEN_AI_API_KEY) {
    return {
      provider: "openai-compat",
      modelName:
        process.env.OPEN_AI_MODEL || PROVIDER_DEFAULTS["openai-compat"].model,
      apiKey: process.env.OPEN_AI_API_KEY,
      apiUrl: process.env.OPEN_AI_API_URL,
    };
  }

  // Covers the rare case: URL set but no key (local LLM)
  if (process.env.OPEN_AI_API_URL) {
    return {
      provider: "openai-compat",
      modelName:
        process.env.OPEN_AI_MODEL || PROVIDER_DEFAULTS["openai-compat"].model,
      apiKey: "",
      apiUrl: process.env.OPEN_AI_API_URL,
    };
  }

  // ── 2. Check persisted config ────────────────────────────────────────────
  const store = new LlmConfigStore(db);
  const saved = store.load();

  if (saved) {
    const providerLabel =
      saved.provider === "google-gemini"
        ? "Google Gemini"
        : "OpenAI-Compatible";

    clack.note(
      `Provider : ${providerLabel}\nModel    : ${saved.modelName}${saved.apiUrl ? `\nBase URL : ${saved.apiUrl}` : ""}`,
      "Using saved LLM configuration",
    );
    return saved;
  }

  // ── 3. Interactive setup ─────────────────────────────────────────────────
  clack.log.info("No LLM provider configured. Let's set one up.");

  const provider = await clack.select<LlmProvider>({
    message: "Select LLM Provider:",
    options: [
      { value: "google-gemini", label: "Google Gemini (AI Studio)" },
      {
        value: "openai-compat",
        label: "OpenAI-Compatible (OpenAI, OpenRouter, DeepSeek, local, …)",
      },
    ],
  });

  if (clack.isCancel(provider)) {
    clack.outro("Operation cancelled.");
    process.exit(0);
  }

  const defaults = PROVIDER_DEFAULTS[provider];

  const apiKey = await clack.password({
    message:
      provider === "google-gemini"
        ? "Google AI Studio API Key:"
        : "API Key (leave blank for keyless local LLM):",
  });

  if (clack.isCancel(apiKey)) {
    clack.outro("Operation cancelled.");
    process.exit(0);
  }

  const modelName = await clack.text({
    message: "Model name:",
    defaultValue: defaults.model,
    placeholder: defaults.model,
  });

  if (clack.isCancel(modelName)) {
    clack.outro("Operation cancelled.");
    process.exit(0);
  }

  let apiUrl: string | undefined;

  if (provider === "openai-compat") {
    const urlInput = await clack.text({
      message: "API Base URL:",
      defaultValue: defaults.urlHint,
      placeholder: defaults.urlHint,
    });

    if (clack.isCancel(urlInput)) {
      clack.outro("Operation cancelled.");
      process.exit(0);
    }

    apiUrl = (urlInput as string) || undefined;
  }

  const config: LlmUserConfig = {
    provider,
    modelName: modelName as string,
    apiKey: apiKey as string,
    apiUrl,
  };

  // Persist for next run
  store.save(config);
  clack.log.success("LLM configuration saved for future runs.");

  return config;
}
