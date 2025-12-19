# API Documentation

REST API endpoints for AgentForge, built with Elysia.

## Quick Start

### Start the API Server

```bash
# Development mode
bun run start:dev

# Production mode
bun run build
bun run start
```

The server will start on `http://localhost:8000` (configurable via `API_PORT` env variable)

## Base URL

```
http://localhost:8000
```

## Interactive Documentation

When the server is running, visit:
- **Swagger UI**: http://localhost:8000/swagger

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
    "rag": "/api/rag",
    "files": "/api/files",
    "scraper": "/api/scraper"
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
Chat with AI agent (supports web search + RAG)

**Request Body:**
```json
{
  "message": "What is the latest news about AI?",
  "conversation_id": "conv-123",
  "locale": "en" // "en" or "pt"
}
```

**Response:**
```json
{
  "response": "Based on my web search...",
  "conversation_id": "conv-123",
  "locale": "en",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

**Example:**
```bash
curl -X POST http://localhost:8000/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Hello!",
    "conversation_id": "conv-123",
    "locale": "en"
  }'
```

---

### GET /api/chat/history/:conversation_id
Get conversation history from database

**Response:**
```json
{
  "conversation_id": "conv-123",
  "conversation": {
    "conversationId": "conv-123",
    "locale": "en",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  },
  "message_count": 4,
  "messages": [
    {
      "role": "user",
      "content": "Hello!",
      "created_at": "2024-01-01T00:00:00.000Z"
    },
    {
      "role": "assistant",
      "content": "Hi! How can I help you?",
      "created_at": "2024-01-01T00:00:01.000Z"
    }
  ]
}
```

**Example:**
```bash
curl http://localhost:8000/api/chat/history/conv-123
```

---

### DELETE /api/chat/history/:conversation_id
Clear conversation history (both Redis and database)

**Response:**
```json
{
  "success": true,
  "conversation_id": "conv-123",
  "message": "Conversation history cleared from both Redis and database",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

**Example:**
```bash
curl -X DELETE http://localhost:8000/api/chat/history/conv-123
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
      "content": "AgentForge is a REST API for AI applications",
      "metadata": { "source": "docs" }
    },
    {
      "content": "It uses PostgreSQL with pgvector for RAG",
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
curl -X POST http://localhost:8000/api/rag/documents \
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
  "query": "What is AgentForge?",
  "topK": 5 // optional, default 3, max 20
}
```

**Response:**
```json
{
  "results": [
    {
      "content": "AgentForge is a REST API...",
      "metadata": { "source": "docs" },
      "score": 0.95
    }
  ],
  "count": 1,
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

**Example:**
```bash
curl -X POST http://localhost:8000/api/rag/search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "What is RAG?",
    "topK": 5
  }'
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
curl -X DELETE http://localhost:8000/api/rag/documents
```

---

## File Upload Endpoints

### POST /api/files/upload
Upload and process file (automatically adds to knowledge base)

**Request:**
- Content-Type: `multipart/form-data`
- Field: `file`

**Supported formats:** `.txt`, `.md`, `.markdown`, `.json`, `.csv`

**Response:**
```json
{
  "success": true,
  "filename": "document.txt",
  "size": 1024,
  "chunks_count": 5,
  "message": "File uploaded and processed successfully"
}
```

**Example:**
```bash
curl -X POST http://localhost:8000/api/files/upload \
  -F "file=@document.txt"
```

---

### POST /api/files/process/:filename
Process a previously uploaded file

**Response:**
```json
{
  "success": true,
  "filename": "document.txt",
  "chunks_count": 5,
  "message": "File processed successfully"
}
```

**Example:**
```bash
curl -X POST http://localhost:8000/api/files/process/document.txt
```

---

### POST /api/files/process-all
Process all uploaded files in batch

**Response:**
```json
{
  "success": true,
  "files_count": 3,
  "total_chunks": 15,
  "message": "All files processed successfully"
}
```

**Example:**
```bash
curl -X POST http://localhost:8000/api/files/process-all
```

---

### GET /api/files/list
List all uploaded files

**Response:**
```json
{
  "files": [
    {
      "filename": "document.txt",
      "size": 1024,
      "uploaded_at": "2024-01-01T00:00:00.000Z"
    }
  ],
  "count": 1
}
```

**Example:**
```bash
curl http://localhost:8000/api/files/list
```

---

### DELETE /api/files/:filename
Delete specific file

**Response:**
```json
{
  "success": true,
  "filename": "document.txt",
  "message": "File deleted successfully"
}
```

**Example:**
```bash
curl -X DELETE http://localhost:8000/api/files/document.txt
```

---

### DELETE /api/files/
Clear all uploaded files

**Response:**
```json
{
  "success": true,
  "deleted_count": 5,
  "message": "All files deleted successfully"
}
```

**Example:**
```bash
curl -X DELETE http://localhost:8000/api/files/
```

---

## Web Scraping Endpoints

### POST /api/scraper/scrape
Scrape URL, convert to Markdown, and save to knowledge base

**Request Body:**
```json
{
  "url": "https://example.com"
}
```

**Response:**
```json
{
  "success": true,
  "url": "https://example.com",
  "chunks_count": 5,
  "message": "Successfully scraped https://example.com and saved 5 chunks to knowledge base"
}
```

**Example:**
```bash
curl -X POST http://localhost:8000/api/scraper/scrape \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com"}'
```

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
- `403` - Forbidden (IP not whitelisted)
- `404` - Not Found
- `500` - Internal Server Error

---

## Configuration

### Environment Variables

```bash
# API Server
API_PORT=8000              # Default: 8000
API_HOST=0.0.0.0           # Default: 0.0.0.0

# Required: AI Model (choose one)
OPEN_ROUTER_API_KEY=your_key_here
OPEN_ROUTER_MODEL=x-ai/grok-4.1-fast:free

# OR

GOOGLE_AI_STUDIO_API_KEY=your_key_here
GEMINI_MODEL=gemini-2.5-flash-lite

# Optional: Force specific provider
MODEL_PROVIDER=gemini      # or 'openrouter'

# Required: PostgreSQL (for RAG)
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/agents_db

# Required: Redis (for chat memory)
REDIS_URL=redis://localhost:6379

# Optional: Web Search
TAVILY_API_KEY=your_key_here

# Optional: Security
ALLOWED_IPS=192.168.1.1,10.0.0.1   # Comma-separated IPs
CORS_ORIGINS=https://yourdomain.com # Comma-separated origins

# Optional: OpenTelemetry
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
```

See [ENVIRONMENT_SETUP.md](ENVIRONMENT_SETUP.md) for complete guide.

---

## Security Features

### IP Whitelisting

Restrict API access to specific IP addresses:

```bash
ALLOWED_IPS=192.168.1.100,10.0.0.50
```

If not set, all IPs are allowed.

### CORS

Configure allowed origins:

```bash
CORS_ORIGINS=https://app.example.com,https://admin.example.com
```

If not set, all origins are allowed in development.

### Request Tracking

Every request gets a correlation ID for tracing:

```
X-Correlation-ID: 550e8400-e29b-41d4-a716-446655440000
```

---

## Observability

### OpenTelemetry

The API includes built-in OpenTelemetry tracing:

```bash
# Configure OTLP endpoint
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
```

### Request Logging

All requests are automatically logged with:
- Method, path, status code
- Response time
- Correlation ID
- IP address

---

## Model Configuration

The API uses the default model configured in your environment variables:

```typescript
// Configured via environment variables
getDefaultModel() // Returns the configured model
```

**Supported Providers:**
- **OpenRouter** - Access to 100+ models (many free options)
- **Google AI Studio** - Gemini models (generous free tier)

**Free Models Available:**
- `x-ai/grok-4.1-fast:free` (OpenRouter)
- `gemini-2.5-flash-lite` (Google AI Studio)
- `meta-llama/llama-3.1-8b-instruct:free` (OpenRouter)
- `qwen/qwen-2.5-7b-instruct:free` (OpenRouter)

---

## Rate Limiting

Currently no rate limiting is implemented. For production, consider adding:

```typescript
import { rateLimit } from '@elysiajs/rate-limit'

app.use(rateLimit({
  duration: 60000, // 1 minute
  max: 100         // 100 requests per minute
}))
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

EXPOSE 8000

CMD ["bun", "run", "start"]
```

### Using PM2

```bash
pm2 start src/api/server.ts --name agentforge-api --interpreter bun
```

### Using Docker Compose

The project includes a `docker-compose.yml` for running PostgreSQL and Redis:

```bash
docker-compose up -d
```

---

## Performance

Elysia + Bun provides excellent performance:
- ~3-4x faster than Express.js
- Built-in validation with TypeBox
- Native TypeScript support
- Low memory footprint
- Fast startup time

---

## Next Steps

**Recommended enhancements:**
- Add authentication (JWT, API keys)
- Add rate limiting
- Add WebSocket support for streaming responses
- Add caching layer (Redis)
- Add monitoring and alerts
- Add API versioning

For more information, see the main [README.md](../README.md)
