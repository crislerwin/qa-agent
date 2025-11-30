import { createWebAgent } from "../factory/agents.ts";
import { ModelPresets } from "../config/models.ts";

/**
 * Web-enabled agent with search capabilities
 * Uses free model for cost-effective web research
 */
export const webAgent = createWebAgent({
    model: ModelPresets.free(),
});

/**
 * Advanced web agent with better reasoning
 */
export const advancedWebAgent = createWebAgent({
    model: ModelPresets.balanced(),
});
