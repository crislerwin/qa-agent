import { tool } from "langchain";
import { z } from "zod";

/**
 * Tavily API configuration
 */
export interface TavilyConfig {
    apiKey?: string;
    searchDepth?: "basic" | "advanced";
    maxResults?: number;
}

/**
 * Tavily search result
 */
interface TavilyResult {
    title: string;
    url: string;
    content: string;
    score: number;
}

/**
 * Search the web using Tavily API
 */
async function searchTavily(
    query: string,
    config: TavilyConfig = {}
): Promise<TavilyResult[]> {
    const apiKey = config.apiKey || process.env.TAVILY_API_KEY;

    if (!apiKey) {
        throw new Error("TAVILY_API_KEY not found in environment or config");
    }

    const response = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            api_key: apiKey,
            query,
            search_depth: config.searchDepth || "basic",
            max_results: config.maxResults || 5,
            include_answer: true,
            include_raw_content: false,
        }),
    });

    if (!response.ok) {
        throw new Error(`Tavily API error: ${response.statusText}`);
    }

    const data = await response.json() as { results?: TavilyResult[] };
    return data.results || [];
}

/**
 * Create Tavily web search tool
 */
export function createWebSearchTool(config: TavilyConfig = {}) {
    return tool(
        async ({ query }) => {
            try {
                const results = await searchTavily(query, config);

                if (results.length === 0) {
                    return `No results found for: ${query}`;
                }

                const formattedResults = results
                    .map((result, i) => {
                        return `[${i + 1}] ${result.title}
URL: ${result.url}
${result.content}`;
                    })
                    .join("\n\n");

                return `Web search results for "${query}":\n\n${formattedResults}`;
            } catch (error) {
                if ((error as Error).message?.includes("TAVILY_API_KEY")) {
                    return `⚠ Tavily API not configured. Set TAVILY_API_KEY in .env to enable web search.
You can get a free API key at https://tavily.com

Search query was: ${query}`;
                }
                return `Error searching web: ${(error as Error).message}`;
            }
        },
        {
            name: "web_search",
            description: "Search the web for current information using Tavily API. Use this when you need up-to-date information not in your training data.",
            schema: z.object({
                query: z.string().describe("The search query"),
            }),
        }
    );
}

/**
 * Create Tavily news search tool
 */
export function createNewsSearchTool(config: TavilyConfig = {}) {
    return tool(
        async ({ query }) => {
            try {
                const apiKey = config.apiKey || process.env.TAVILY_API_KEY;

                if (!apiKey) {
                    throw new Error("TAVILY_API_KEY not found");
                }

                const response = await fetch("https://api.tavily.com/search", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        api_key: apiKey,
                        query,
                        search_depth: "advanced",
                        topic: "news",
                        max_results: config.maxResults || 5,
                    }),
                });

                const data = await response.json() as { results?: TavilyResult[] };
                const results = data.results || [];

                if (results.length === 0) {
                    return `No news found for: ${query}`;
                }

                const formattedResults = results
                    .map((result: TavilyResult, i: number) => {
                        return `[${i + 1}] ${result.title}\n${result.content}\nSource: ${result.url}`;
                    })
                    .join("\n\n");

                return `Latest news for "${query}":\n\n${formattedResults}`;
            } catch (error) {
                if ((error as Error).message?.includes("TAVILY_API_KEY")) {
                    return `⚠ Tavily API not configured. Set TAVILY_API_KEY in .env`;
                }
                return `Error searching news: ${(error as Error).message}`;
            }
        },
        {
            name: "search_news",
            description: "Search for latest news articles using Tavily API",
            schema: z.object({
                query: z.string().describe("The news search query"),
            }),
        }
    );
}

/**
 * Fetch and extract content from URL
 */
export function createURLFetchTool() {
    return tool(
        async ({ url }) => {
            try {
                const response = await fetch(url, {
                    headers: {
                        "User-Agent": "Mozilla/5.0 (compatible; AgentBot/1.0)",
                    },
                });

                if (!response.ok) {
                    return `Error: Unable to fetch ${url} (Status: ${response.status})`;
                }

                const contentType = response.headers.get("content-type");

                // Handle JSON responses
                if (contentType?.includes("application/json")) {
                    const json = await response.json();
                    return `JSON content from ${url}:\n\n${JSON.stringify(json, null, 2).slice(0, 2000)}`;
                }

                // Handle text/HTML responses
                const text = await response.text();

                // Simple HTML cleaning (for production, use a proper parser like cheerio)
                const cleanText = text
                    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
                    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
                    .replace(/<[^>]+>/g, " ")
                    .replace(/\s+/g, " ")
                    .trim()
                    .slice(0, 3000);

                return `Content from ${url}:\n\n${cleanText}`;
            } catch (error) {
                return `Error fetching ${url}: ${(error as Error).message}`;
            }
        },
        {
            name: "fetch_url",
            description: "Fetch and extract content from a specific URL",
            schema: z.object({
                url: z.string().url().describe("The URL to fetch"),
            }),
        }
    );
}
