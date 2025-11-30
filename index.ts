import * as z from "zod";
import { createAgent, tool } from "langchain";
import { ChatOpenAI } from "@langchain/openai";

const model = new ChatOpenAI({
    modelName: process.env.OPEN_ROUTER_MODEL,
    apiKey: process.env.OPEN_ROUTER_API_KEY,
    configuration: {
        baseURL: "https://openrouter.ai/api/v1",
    },
});

const getWeather = tool(({ city }) => `It's always sunny in ${city}!`, {
    name: "get_weather",
    description: "Get the weather for a given city",
    schema: z.object({
        city: z.string(),
    }),
});

const agent = createAgent({
    model,
    tools: [getWeather],
});

console.log(
    await agent.invoke({
        messages: [{ role: "user", content: "What's the weather in Tokyo?" }],
    }),
);
