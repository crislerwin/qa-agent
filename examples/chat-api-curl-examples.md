# Chat API cURL Examples

## Basic Chat Request

### English Conversation
```bash
# First message
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Hello! My name is Alice.",
    "conversation_id": "user-123-session-1",
    "locale": "en",
    "model": "free"
  }'

# Follow-up message (will remember context)
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "What is my name?",
    "conversation_id": "user-123-session-1",
    "locale": "en",
    "model": "free"
  }'
```

### Portuguese Conversation
```bash
# Portuguese message
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Olá! Como você está?",
    "conversation_id": "user-456-session-1",
    "locale": "pt",
    "model": "free"
  }'

# Follow-up in Portuguese
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Qual é a capital do Brasil?",
    "conversation_id": "user-456-session-1",
    "locale": "pt",
    "model": "free"
  }'
```

## Web-Enabled Chat (with search capabilities)

```bash
curl -X POST http://localhost:3000/api/chat/web \
  -H "Content-Type: application/json" \
  -d '{
    "message": "What are the latest news about AI?",
    "conversation_id": "user-789-session-1",
    "locale": "en",
    "model": "free"
  }'
```

## RAG Chat (with knowledge base)

### English Conversation with RAG
```bash
curl -X POST http://localhost:3000/api/rag/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "What information do you have about our products?",
    "conversation_id": "user-rag-session-1",
    "locale": "en",
    "model": "free"
  }'
```

### Portuguese Conversation with RAG
```bash
curl -X POST http://localhost:3000/api/rag/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "O que você sabe sobre nossos produtos?",
    "conversation_id": "user-rag-session-2",
    "locale": "pt",
    "model": "free"
  }'
```

## Get Conversation History

```bash
curl http://localhost:3000/api/chat/history/user-123-session-1
```

## Clear Conversation History

```bash
curl -X DELETE http://localhost:3000/api/chat/history/user-123-session-1
```

## Model Options

Available models:
- `"free"` - Free Gemini Flash model (default)
- `"balanced"` - Claude Sonnet (paid)
- `"powerful"` - Claude Opus (paid)
- Leave empty or use any other string for the default model from environment

Example with different models:
```bash
# Using free model (explicitly)
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Hello!",
    "conversation_id": "test-123",
    "locale": "en",
    "model": "free"
  }'

# Using balanced model
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Hello!",
    "conversation_id": "test-123",
    "locale": "en",
    "model": "balanced"
  }'

# Using default from environment
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Hello!",
    "conversation_id": "test-123",
    "locale": "en"
  }'
```

## Response Format

All chat endpoints return:
```json
{
  "response": "The assistant's response message",
  "conversation_id": "user-123-session-1",
  "locale": "en",
  "model": "free",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Conversation History Response

```json
{
  "conversation_id": "user-123-session-1",
  "message_count": 4,
  "messages": [
    {
      "type": "human",
      "content": "Hello! My name is Alice."
    },
    {
      "type": "ai",
      "content": "Hello Alice! Nice to meet you..."
    },
    {
      "type": "human",
      "content": "What is my name?"
    },
    {
      "type": "ai",
      "content": "Your name is Alice..."
    }
  ]
}
```

## Key Features

- **Conversation History**: Automatically tracked via Redis using `conversation_id`
- **Multi-language Support**: Use `locale` to specify language (pt/en)
- **TTL**: Conversations expire after 1 hour of inactivity
- **Model Selection**: Choose different AI models per request
- **Context Awareness**: Agent remembers previous messages in the conversation
