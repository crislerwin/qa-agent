# API Documentation

REST API endpoints for the AI Agents Boilerplate, built with Elysia.

## Quick Start

### Start the API Server

```bash
bun run examples/api-server.ts
```

The server will start on `http://localhost:3000`

### Test with Examples

```bash
# In another terminal
bun run examples/api-client.ts
```

## Base URL

```
http://localhost:3000
```

## Endpoints

### Health & Info

#### GET /
Get API information

**Response:**
```json
{
  "message": "AI Agents API",
  "version": "1.0.0",
  "endpoints": {
    "chat": "/api/chat",
    "rag": "/api/rag"
  }
}
```

#### GET /health
Health check endpoint

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

---

## Chat Endpoints

### POST /api/chat
Simple conversational chat

**Request Body:**
```json
{
  "message": "Tell me a joke",
  "model": "free" // optional: "free", "balanced", "powerful"
}
```

**Response:**
```json
{
  "response": "...",
  "model": "free",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

**Example:**
```bash
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello!", "model": "free"}'
```

---

### POST /api/chat/web
Web-enabled chat with search capabilities

**Request Body:**
```json
{
  "message": "What's the latest news about AI?",
  "model": "free" // optional: "free", "balanced"
}
```

**Response:**
```json
{
  "response": "...",
  "model": "free",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

---

### POST /api/chat/conversation
Multi-turn conversation with history

**Request Body:**
```json
{
  "messages": [
    { "role": "user", "content": "Hi! My name is Alice" },
    { "role": "assistant", "content": "Hello Alice!" },
    { "role": "user", "content": "What's my name?" }
  ],
  "model": "free" // optional
}
```

**Response:**
```json
{
  "response": "...",
  "messageCount": 3,
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

---

## RAG Endpoints

### POST /api/rag/documents
Add documents to knowledge base

**Request Body:**
```json
{
  "documents": [
    {
      "content": "Elysia is a web framework for Bun",
      "metadata": { "source": "docs" }
    },
    {
      "content": "Bun is a JavaScript runtime",
      "metadata": { "source": "docs" }
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "count": 2,
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

**Example:**
```bash
curl -X POST http://localhost:3000/api/rag/documents \
  -H "Content-Type: application/json" \
  -d '{
    "documents": [
      {"content": "TypeScript is a typed superset of JavaScript"}
    ]
  }'
```

---

### POST /api/rag/search
Search knowledge base

**Request Body:**
```json
{
  "query": "What is Elysia?",
  "topK": 3 // optional, default 3, max 20
}
```

**Response:**
```json
{
  "results": [
    {
      "content": "Elysia is a web framework...",
      "metadata": { "source": "docs", "score": 0.95 }
    }
  ],
  "count": 1,
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

---

### POST /api/rag/chat
Chat with RAG-enabled agent

**Request Body:**
```json
{
  "message": "What do you know about Bun?",
  "model": "free" // optional
}
```

**Response:**
```json
{
  "response": "...",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

---

### DELETE /api/rag/documents
Clear all documents from knowledge base

**Response:**
```json
{
  "success": true,
  "message": "Knowledge base cleared",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

**Example:**
```bash
curl -X DELETE http://localhost:3000/api/rag/documents
```

---

## Model Options

Available models for chat endpoints:

| Model | Description | Cost |
|-------|-------------|------|
| `free` | Gemini Flash via OpenRouter | Free |
| `balanced` | Claude Sonnet | Paid |
| `powerful` | Claude Opus | Paid |

If no model is specified, the default model from environment variables is used.

---

## Error Handling

All endpoints return errors in the following format:

```json
{
  "error": "Error Type",
  "message": "Detailed error message"
}
```

**Common Status Codes:**
- `200` - Success
- `400` - Validation Error (invalid request body)
- `404` - Not Found
- `500` - Internal Server Error

---

## Configuration

### Environment Variables

```bash
# API Server (optional)
API_PORT=3000
API_HOST=0.0.0.0

# Required: AI Model (one of these)
OPEN_ROUTER_API_KEY=your_key_here
# OR
GOOGLE_AI_STUDIO_API_KEY=your_key_here

# Optional: For RAG
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/agents_db

# Optional: For web search
TAVILY_API_KEY=your_key_here
```

---

## CORS

CORS is enabled by default. All origins are allowed in development.

For production, configure CORS in `src/api/server.ts`:

```typescript
.use(cors({
  origin: ['https://yourdomain.com'],
  credentials: true,
}))
```

---

## Examples

See complete examples in:
- `examples/api-server.ts` - Start the API server
- `examples/api-client.ts` - Client usage examples

Run the examples:
```bash
# Terminal 1: Start server
bun run examples/api-server.ts

# Terminal 2: Run client examples
bun run examples/api-client.ts
```

---

## Deployment

### Using Docker

```dockerfile
FROM oven/bun:1

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --production

COPY . .

EXPOSE 3000

CMD ["bun", "run", "examples/api-server.ts"]
```

### Using PM2

```bash
pm2 start examples/api-server.ts --name agents-api --interpreter bun
```

---

## Performance

Elysia is built for Bun and is extremely fast:
- ~3-4x faster than Express.js
- Built-in validation with TypeBox
- Native TypeScript support
- Low memory footprint

---

## Next Steps

- Add authentication (JWT, API keys)
- Add rate limiting
- Add request/response logging
- Add WebSocket support for streaming
- Add OpenAPI documentation

For more information, see the main [README.md](../README.md)
