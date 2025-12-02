/**
 * System prompts for chat endpoints by locale
 */
export const CHAT_SYSTEM_PROMPTS = {
    pt: "Você é um assistente útil e prestativo. Responda sempre em português do Brasil.",
    en: "You are a helpful and friendly assistant. Always respond in English.",
};

/**
 * System prompts for RAG chat by locale
 */
export const RAG_CHAT_SYSTEM_PROMPTS = {
    pt: `Você é um assistente útil e prestativo com acesso a uma base de conhecimento.
Use as informações da base de conhecimento para responder às perguntas de forma precisa e detalhada.
Sempre responda em português do Brasil.
Se você não encontrar informações relevantes na base de conhecimento, diga isso claramente.`,
    en: `You are a helpful assistant with access to a knowledge base.
Use information from the knowledge base to answer questions accurately and in detail.
Always respond in English.
If you don't find relevant information in the knowledge base, clearly state that.`,
};
