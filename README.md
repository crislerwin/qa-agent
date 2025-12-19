# AgentForge API

🚀 **A production-ready REST API for building AI-powered applications** with LangChain, RAG, and modern AI models.

Perfect for building AI chat applications, knowledge bases, document Q&A systems, and conversational AI with support for free models!

## ✨ Features

- 🌐 **REST API**: Elysia-based API server with comprehensive endpoints
- 🤖 **AI-Powered Chat**: Conversational AI with web search and RAG capabilities
- 💰 **Free Model Support**: Includes free models (Gemini Flash, Llama, Qwen)
- 🎯 **Ready-to-use Features**:
  - Web search (Tavily API)
  - RAG with PostgreSQL + pgvector
  - Redis-based chat memory
  - **File upload & embeddings** (txt, md, json, csv)
  - **Web Scraping** (Playwright + Readability + Turndown)
- 🐳 **Docker Setup**: PostgreSQL and Redis run locally via Docker
- 🗄️ **Drizzle ORM**: Type-safe database queries with full TypeScript support
- 🔧 **Modular Architecture**: Easy to customize and extend
- 📊 **OpenTelemetry**: Built-in observability and tracing

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

### 3. Start Database Services

For RAG and chat memory features, start PostgreSQL and Redis:

```bash
# Start PostgreSQL (with pgvector) and Redis
docker-compose up -d

# Verify services are running
docker-compose ps
```

See [docs/DOCKER_SETUP.md](docs/DOCKER_SETUP.md) for detailed Docker instructions.
See [docs/ENVIRONMENT_SETUP.md](docs/ENVIRONMENT_SETUP.md) for all environment variables.

### 4. Start the API Server

```bash
# Development mode
bun run start:dev

# Production mode
bun run build
bun run start
```

The API will be available at `http://localhost:8000`

## 📁 Project Structure

```
agentforge/
├── src/
│   ├── api/              # REST API server
│   │   ├── middleware/   # Request handling middleware
│   │   ├── routes/       # API endpoints (chat, rag, files, scraper)
│   │   ├── server.ts     # API server setup
│   │   └── types/        # Type definitions
│   ├── config/           # Model configurations (OpenRouter, Gemini)
│   ├── db/               # Database (Drizzle ORM)
│   │   ├── schema.ts     # Table schemas with TypeScript types
│   │   ├── client.ts     # Database connection
│   │   └── index.ts      # Exports
│   ├── factory/          # Agent factory functions
│   ├── memory/           # Redis chat history
│   ├── prompts/          # System prompts for AI agents
│   ├── services/         # Business logic (file processing, conversation DB, scraper)
│   ├── tools/            # AI tools (web search, RAG)
│   └── utils/            # Utilities (logger, chunking)
├── drizzle/              # Database migrations (auto-generated)
├── tests/                # Test files
├── uploads/              # File upload directory (auto-created)
├── drizzle.config.ts     # Drizzle ORM configuration
└── docs/                 # Documentation
    ├── CONVERSATIONS_DATABASE.md
    ├── ENVIRONMENT_SETUP.md
    └── DOCKER_SETUP.md
```

## 🌐 API Endpoints

### Chat

- **POST** `/api/chat` - Chat with AI agent (supports web search + RAG)
- **GET** `/api/chat/history/:id` - Get conversation history
- **DELETE** `/api/chat/history/:id` - Clear conversation history

### RAG (Knowledge Base)

- **POST** `/api/rag/documents` - Add documents to knowledge base
- **POST** `/api/rag/search` - Search knowledge base
- **DELETE** `/api/rag/documents` - Clear knowledge base

### File Upload

- **POST** `/api/files/upload` - Upload and process files
- **POST** `/api/files/process/:filename` - Process uploaded file
- **POST** `/api/files/process-all` - Process all uploaded files
- **GET** `/api/files/list` - List all uploaded files
- **DELETE** `/api/files/:filename` - Delete specific file
- **DELETE** `/api/files/` - Clear all uploaded files

### Web Scraping

- **POST** `/api/scraper/scrape` - Scrape URL and save to knowledge base

### Health & Info

- **GET** `/` - API information
- **GET** `/health` - Health check
- **GET** `/swagger` - Interactive API documentation

## 🎯 Usage Examples

### Chat with AI

```bash
curl -X POST http://localhost:8000/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "What is the weather like?",
    "conversation_id": "conv-123",
    "locale": "en"
  }'
```

### Upload and Process Files

```bash
# Upload a document
curl -X POST http://localhost:8000/api/files/upload \
  -F "file=@document.txt"

# Search the knowledge base
curl -X POST http://localhost:8000/api/rag/search \
  -H "Content-Type: application/json" \
  -d '{"query": "your question", "topK": 5}'
```

### Scrape Web Content

```bash
curl -X POST http://localhost:8000/api/scraper/scrape \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com"}'
```

### Get Conversation History

```bash
curl http://localhost:8000/api/chat/history/conv-123
```

## 📤 File Upload & Embeddings

Upload files, process them into embeddings, and store them in your vector database for semantic search!

### Supported File Types

- **Text** (`.txt`) - Plain text files
- **Markdown** (`.md`, `.markdown`) - Markdown documents
- **JSON** (`.json`) - JSON data (auto-formatted)
- **CSV** (`.csv`) - CSV data (parsed and structured)

### How It Works

1. **Upload** - Files saved to `./uploads` directory
2. **Parse** - Content extracted based on file type
3. **Chunk** - **Cluster Semantic Chunking**: Uses dynamic programming to split text into semantically coherent groups based on vector similarity (instead of arbitrary character counts)
4. **Embed** - Each chunk converted to vector embedding
5. **Store** - Embeddings saved in PostgreSQL with pgvector
6. **Search** - Semantic search across all documents

### Configuration

Default settings (customizable in `src/services/file-processor.ts`):

- **Upload directory**: `./uploads`
- **Chunk size**: 1000 characters
- **Chunk overlap**: 200 characters
- **Max file size**: 10MB

## 🗄️ Database with Drizzle ORM

This project uses **Drizzle ORM** for type-safe database operations with full TypeScript support.

### Features

- **Type Safety**: All queries type-checked at compile time
- **IntelliSense**: Full autocomplete for tables and columns
- **Migrations**: Built-in migration system
- **Visual Tools**: Database browser with Drizzle Studio

### Usage

```typescript
import { db, conversations, messages } from './src/db';
import { eq, desc } from 'drizzle-orm';

// Type-safe queries
const conv = await db.select()
  .from(conversations)
  .where(eq(conversations.conversationId, 'conv-123'))
  .limit(1);

// All results are fully typed!
```

### NPM Scripts

```bash
bun run db:generate   # Generate migrations
bun run db:push       # Push schema to database
bun run db:studio     # Open visual database browser
```

### Tables

- **conversations** - Chat conversation metadata
- **messages** - Individual messages in conversations
- **documents** - Vector embeddings for RAG (with pgvector)

See [docs/CONVERSATIONS_DATABASE.md](docs/CONVERSATIONS_DATABASE.md) for complete documentation.

## 🕷️ Web Scraping

Extract content from any URL, convert it to clean Markdown, and automatically save it to your vector database for RAG.

### Features

- **Headless Browser**: Uses Playwright to render JavaScript-heavy pages (SPA/SSR)
- **Content Extraction**: Uses `@mozilla/readability` to remove clutter (ads, navs)
- **Markdown Conversion**: Converts HTML to clean Markdown
- **Auto-RAG**: Automatically chunks and saves content to pgvector

## 🔧 Model Configuration

### Model Presets

```typescript
import { ModelPresets } from "./src/config/models.ts";

// FREE models
ModelPresets.free();          // Gemini Flash via OpenRouter
ModelPresets.freeGemini();    // Gemini Flash via AI Studio
ModelPresets.freeLlama();     // Llama 3.1 8B
ModelPresets.freeQwen();      // Qwen 2.5 7B

// PAID models
ModelPresets.fast();          // Claude Haiku
ModelPresets.balanced();      // Claude Sonnet
ModelPresets.powerful();      // Claude Opus
ModelPresets.geminiPro();     // Gemini Pro
```

### Default Model

The API uses `getDefaultModel()` which auto-detects based on your `.env` configuration:

```bash
# Option 1: Use OpenRouter (supports many models)
OPEN_ROUTER_API_KEY=your_key_here
OPEN_ROUTER_MODEL=x-ai/grok-4.1-fast:free

# Option 2: Use Google AI Studio (Gemini models)
GOOGLE_AI_STUDIO_API_KEY=your_key_here
GEMINI_MODEL=gemini-2.5-flash-lite

# Optional: Force a specific provider
MODEL_PROVIDER=gemini  # or 'openrouter'
```

## 🌟 Use Cases

This API is perfect for:

- 🌐 **AI Chat Applications**: Build conversational AI with memory
- 📚 **Documentation Q&A**: RAG-powered knowledge base search
- 🤝 **Customer Support**: AI-powered support systems
- 🔍 **Research Tools**: Web search + document analysis
- 📊 **Data Analysis**: Upload CSV/JSON and query with AI
- 🎓 **Educational Platforms**: Interactive learning assistants

## 📖 Documentation

- [Database & Drizzle ORM](docs/CONVERSATIONS_DATABASE.md) - Database schema, Drizzle ORM guide
- [Docker Setup Guide](docs/DOCKER_SETUP.md) - PostgreSQL + Redis setup
- [Environment Setup Guide](docs/ENVIRONMENT_SETUP.md) - Complete guide for all API keys
- [Swagger Documentation](http://localhost:8000/swagger) - Interactive API docs (when server is running)

## 🆓 Free & Local Setup

Run everything locally with Docker (no external accounts needed for databases!):

| Service               | Setup                   | What It Does                   |
| --------------------- | ----------------------- | ------------------------------ |
| OpenRouter            | ✅ Free tier            | AI Model (Gemini, Llama, Qwen) |
| Google AI Studio      | ✅ Free tier            | AI Model (Gemini)              |
| PostgreSQL + pgvector | 🐳 Docker (local)       | Vector database for RAG        |
| Redis                 | 🐳 Docker (local)       | Chat memory                    |
| Tavily                | ✅ Free tier (1,000/mo) | Web search                     |

**🐳 = Runs locally via Docker - no account or payment needed!**

## 🔒 Security Features

- **IP Whitelisting**: Optional IP-based access control
- **CORS Configuration**: Configurable cross-origin requests
- **Request ID Tracking**: Correlation IDs for request tracing
- **Error Handling**: Global error handler with proper logging
- **Input Validation**: Request validation with Elysia's type system

## 📊 Observability

- **OpenTelemetry**: Built-in distributed tracing
- **Request Logging**: Automatic request/response logging
- **Correlation IDs**: Track requests across services
- **Health Checks**: Monitor API status

## 🧪 Testing

```bash
# Run tests
bun test

# Run specific test
bun test tests/api.test.ts
```

## 🤝 Contributing

Feel free to submit issues and enhancement requests!

## 📝 License

MIT

---

Built with [LangChain](https://langchain.com), [LangGraph](https://langchain-ai.github.io/langgraph/), [Elysia](https://elysiajs.com/), and [Bun](https://bun.sh)
