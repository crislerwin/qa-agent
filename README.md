# AI Agents Boilerplate

🚀 **A modular, production-ready boilerplate for building AI agents** with LangChain, LangGraph, and modern AI APIs.

Perfect for building Discord bots, task automation agents, RAG systems, and conversational AI with support for free models!

## ✨ Features

- 🤖 **Multiple Agent Types**: Conversational, Web-enabled, RAG, Task automation
- 🔧 **Modular Architecture**: Easy to customize and extend
- 💰 **Free Model Support**: Includes free models (Gemini Flash, Llama, Qwen)
- 🎯 **Ready-to-use Tools**:
  - Web search (Tavily API)
  - Google Calendar/Meet scheduling
  - RAG with PostgreSQL + pgvector
  - Redis-based chat memory
- 🐳 **Docker Setup**: PostgreSQL and Redis run locally via Docker
- 💬 **Discord Integration**: Full Discord bot support out of the box
- 🌐 **REST API**: Elysia-based API server with all agent endpoints
- 🏗️ **Factory Pattern**: Quick agent creation with preset configurations
- 📚 **Complete Examples**: Learn from working examples

## 🚀 Quick Start

### 1. Install Dependencies

```bash
bun install
```

### 2. Setup Environment

```bash
# Copy environment template
cp .env.example .env

# Edit .env and add your AI model API key (OpenRouter or Google AI Studio)
```

**Minimum required:** Just one AI model API key (both have free tiers!)

### 3. Start Database Services (Optional)

For RAG and chat memory features, start PostgreSQL and Redis:

```bash
# Start PostgreSQL (with pgvector) and Redis
docker-compose up -d

# Verify services are running
docker-compose ps
```

See [docs/DOCKER_SETUP.md](docs/DOCKER_SETUP.md) for detailed Docker instructions.
See [docs/ENVIRONMENT_SETUP.md](docs/ENVIRONMENT_SETUP.md) for all environment variables.

### 4. Run the Demo

```bash
bun run index.ts
```

## 📁 Project Structure

```
agents-boilerplate/
├── src/
│   ├── agents/           # Pre-made agent configurations
│   ├── config/           # Model configurations (OpenRouter, Gemini)
│   ├── factory/          # Agent factory functions
│   ├── integrations/     # Discord bot integration
│   ├── memory/           # Redis chat history
│   └── tools/            # Reusable tools (web, calendar, RAG)
├── examples/             # Complete usage examples
│   ├── simple-chat.ts
│   ├── web-search.ts
│   ├── rag-agent.ts
│   ├── task-automation.ts
│   ├── discord-bot.ts
│   └── full-agent.ts
└── docs/                 # Documentation
    └── ENVIRONMENT_SETUP.md
```

## 🎯 Usage Examples

### Simple Conversational Agent

```typescript
import { simpleAgent } from "./src/agents/index.ts";

const response = await simpleAgent.invoke({
    messages: [{ role: "user", content: "Hello!" }],
});
```

### Web Search Agent

```typescript
import { createWebAgent, ModelPresets } from "./src/agents/index.ts";

const agent = createWebAgent({
    model: ModelPresets.free(), // Uses free Gemini Flash
});

const response = await agent.invoke({
    messages: [
        { role: "user", content: "Search the web for latest AI news" },
    ],
});
```

### RAG Agent (Knowledge Base)

```typescript
import { PGVectorRAG, createRAGAgent } from "./src/agents/index.ts";

const rag = new PGVectorRAG(); // Uses local PostgreSQL via Docker
const agent = createRAGAgent(rag);

await agent.invoke({
    messages: [
        { role: "user", content: "Add this to knowledge base: ..." },
    ],
});
```

### Discord Bot

```typescript
import { createDiscordAgent, createDiscordBot } from "./src/agents/index.ts";

const agent = createDiscordAgent();
const bot = await createDiscordBot({ agent });
// Bot is now running!
```

### REST API

```typescript
import { startAPIServer } from "./src/api/server.ts";

// Start API server on port 3000
startAPIServer({ port: 3000 });

// Or make requests
fetch("http://localhost:3000/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
        message: "Hello!",
        model: "free"
    })
});
```

## 🛠️ Available Agents

### Factory Functions

- `createConversationalAgent()` - Simple chat agent
- `createWebAgent()` - Web search + URL fetching
- `createRAGAgent()` - Knowledge base powered
- `createTaskAgent()` - Calendar/meeting scheduling
- `createDiscordAgent()` - Optimized for Discord
- `createFullAgent()` - All features combined

### Model Presets

```typescript
import { ModelPresets } from "./src/config/models.ts";

// FREE models
ModelPresets.free()        // Gemini Flash via OpenRouter
ModelPresets.freeGemini()  // Gemini Flash via AI Studio
ModelPresets.freeLlama()   // Llama 3.1 8B
ModelPresets.freeQwen()    // Qwen 2.5 7B

// PAID models
ModelPresets.fast()        // Claude Haiku
ModelPresets.balanced()    // Claude Sonnet
ModelPresets.powerful()    // Claude Opus
ModelPresets.geminiPro()   // Gemini Pro
```

## 🔧 Tools Available

### Web Tools
- `createWebSearchTool()` - Tavily web search
- `createNewsSearchTool()` - Latest news search
- `createURLFetchTool()` - Fetch content from URLs

### Task Automation
- `createMeetingTool()` - Schedule Google Meet meetings
- `checkAvailabilityTool()` - Check calendar availability
- `listMeetingsTool()` - List upcoming meetings

### RAG (Knowledge Base)
- `PGVectorRAG.createSearchTool()` - Search knowledge base
- `PGVectorRAG.createAddDocumentTool()` - Add documents

## 📚 Examples

Run any example:

```bash
bun run examples/simple-chat.ts
bun run examples/web-search.ts
bun run examples/rag-agent.ts
bun run examples/task-automation.ts
bun run examples/discord-bot.ts
bun run examples/full-agent.ts
bun run examples/api-server.ts      # Start API server
bun run examples/api-client.ts      # API client examples
```

## 🌟 Use Cases

This boilerplate is perfect for:

- 💬 **Discord/Slack bots** with AI capabilities
- 🌐 **REST API backends** for AI-powered apps
- 📅 **Meeting scheduling assistants**
- 🔍 **Research agents** with web search
- 📚 **Documentation Q&A** with RAG
- 🤝 **Customer support** bots
- 🔄 **Workflow automation** agents

## 📖 Documentation

- [API Documentation](docs/API.md) - REST API endpoints reference
- [Docker Setup Guide](docs/DOCKER_SETUP.md) - PostgreSQL + Redis setup
- [Environment Setup Guide](docs/ENVIRONMENT_SETUP.md) - Complete guide for all API keys
- Examples in `/examples` - Working code for all use cases

## 🆓 Free & Local Setup

Run everything locally with Docker (no external accounts needed for databases!):

| Service | Setup | What It Does |
|---------|-------|--------------|
| OpenRouter | ✅ Free tier | AI Model (Gemini, Llama, Qwen) |
| Google AI Studio | ✅ Free tier | AI Model (Gemini) |
| PostgreSQL + pgvector | 🐳 Docker (local) | Vector database for RAG |
| Redis | 🐳 Docker (local) | Chat memory |
| Tavily | ✅ Free tier (1,000/mo) | Web search |
| Discord | ✅ Free | Bot hosting |

**🐳 = Runs locally via Docker - no account or payment needed!**

## 🤝 Contributing

Feel free to submit issues and enhancement requests!

## 📝 License

MIT

---

Built with [LangChain](https://langchain.com), [LangGraph](https://langchain-ai.github.io/langgraph/), and [Bun](https://bun.sh)
