import { createConversationalAgent } from "../factory/agents.ts";
import { ModelPresets } from "../config/models.ts";

/**
 * Simple conversational agent using free Gemini Flash model
 * No tools, just conversation
 */
export const simpleAgent = createConversationalAgent({
    model: ModelPresets.free(),
});

/**
 * Conversational agent with balanced model
 */
export const balancedAgent = createConversationalAgent({
    model: ModelPresets.balanced(),
});
