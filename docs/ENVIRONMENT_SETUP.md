# Environment Variables Setup Guide

This guide will help you configure all the environment variables needed for the AI Agents Boilerplate.

## Required Environment Variables

### AI Models (Choose at least one)

#### Option 1: OpenRouter (Recommended - has free models)

```bash
OPEN_ROUTER_API_KEY=your_api_key_here
OPEN_ROUTER_MODEL=x-ai/grok-4.1-fast:free # Optional, defaults to free model
```

**How to get:**

1. Go to [https://openrouter.ai](https://openrouter.ai)
2. Sign up for a free account
3. Go to Settings → API Keys
4. Create a new API key
5. Copy the key to your `.env` file

**Free models available:**

- `google/gemini-flash-1.5` (recommended)
- `meta-llama/llama-3.1-8b-instruct:free`
- `qwen/qwen-2.5-7b-instruct:free`

---

#### Option 2: Google AI Studio (Gemini)

```bash
GOOGLE_AI_STUDIO_API_KEY=your_api_key_here
GEMINI_MODEL=gemini-1.5-flash  # Optional, defaults to gemini-1.5-flash
```

**How to get:**

1. Go to [https://ai.google.dev](https://ai.google.dev)
2. Sign in with your Google account
3. Click "Get API Key" → "Create API key"
4. Copy the API key to your `.env` file

**Note:** Gemini has a generous free tier.

---

## Optional Environment Variables

### PostgreSQL with pgvector (for RAG/Knowledge Base)

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/agents_db
```

**Local Setup with Docker (Recommended):**

1. Make sure Docker is installed
2. Run: `docker-compose up -d`
3. That's it! PostgreSQL with pgvector is now running
4. Default connection: `postgresql://postgres:postgres@localhost:5432/agents_db`

**See [DOCKER_SETUP.md](DOCKER_SETUP.md) for detailed Docker instructions.**

**Alternative - Hosted PostgreSQL:**

- Use [Supabase](https://supabase.com) (includes pgvector)
- Use [Neon](https://neon.tech) with pgvector extension
- Use any PostgreSQL provider and enable pgvector extension

---

### Tavily (for Web Search)

```bash
TAVILY_API_KEY=your_api_key_here
```

**How to get:**

1. Go to [https://tavily.com](https://tavily.com)
2. Sign up for a free account
3. Go to your dashboard
4. Copy your API key
5. Free tier: 1,000 searches/month

---

### Redis (for Chat Memory/History)

```bash
# Local Docker (Default - Recommended)
REDIS_HOST=localhost
REDIS_PORT=6379

# OR Hosted Redis (Upstash)
REDIS_URL=redis://username:password@host:port
```

**Local Setup with Docker (Recommended):**

1. Make sure Docker is installed
2. Run: `docker-compose up -d`
3. Redis is now running on `localhost:6379`
4. No password needed for local development

**See [DOCKER_SETUP.md](DOCKER_SETUP.md) for detailed Docker instructions.**

**Alternative - Hosted Redis:**

1. Go to [https://upstash.com](https://upstash.com)
2. Sign up for free
3. Create a new Redis database
4. Copy the Redis URL from the dashboard
5. Set `REDIS_URL` in your .env
6. Free tier: 10,000 commands/day

---

### Discord Bot (for Discord Integration)

```bash
DISCORD_BOT_TOKEN=your_bot_token_here
```

**How to get:**

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Click "New Application"
3. Give it a name (e.g., "AI Agent Bot")
4. Go to "Bot" section
5. Click "Reset Token" and copy the token
6. Enable these Privileged Gateway Intents:
   - MESSAGE CONTENT INTENT
   - SERVER MEMBERS INTENT
7. Go to OAuth2 → URL Generator
8. Select scopes: `bot`
9. Select bot permissions:
   - Read Messages/View Channels
   - Send Messages
   - Read Message History
10. Copy the generated URL and invite bot to your server

---

## Complete .env Example

```bash
# === AI Models (Choose one or both) ===

# OpenRouter (Recommended - has free models)
OPEN_ROUTER_API_KEY=sk-or-v1-xxxxxxxxxxxxx
OPEN_ROUTER_MODEL=x-ai/grok-4.1-fast:free

# OR Google AI Studio
# GOOGLE_AI_STUDIO_API_KEY=xxxxxxxxxxxxx
# GEMINI_MODEL=gemini-1.5-flash

# === Optional Services ===

# PostgreSQL (for RAG/Knowledge Base - Docker default)
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/agents_db

# Redis (for Chat Memory - Docker default)
REDIS_HOST=localhost
REDIS_PORT=6379

# OR Hosted Redis (Upstash)
# REDIS_URL=redis://default:password@host:port

# Tavily (for Web Search)
TAVILY_API_KEY=tvly-xxxxxxxxxxxxx

# Discord Bot
DISCORD_BOT_TOKEN=xxxxxxxxxxxxx
```

---

## Minimal Setup (Just to get started)

To run the basic examples, you only need **one** AI model provider:

**Option 1 - OpenRouter (Free):**

```bash
OPEN_ROUTER_API_KEY=your_key_here
```

**Option 2 - Google AI Studio (Free):**

```bash
GOOGLE_AI_STUDIO_API_KEY=your_key_here
```

Everything else is optional and can be added as needed!

---

## Service Summary

| Service               | Required?                  | Setup             | Used For                        |
| --------------------- | -------------------------- | ----------------- | ------------------------------- |
| OpenRouter            | One of the model providers | ✅ Free tier      | AI Model (includes free models) |
| Google AI Studio      | One of the model providers | ✅ Free tier      | AI Model (Gemini)               |
| PostgreSQL + pgvector | Optional                   | 🐳 Docker (local) | RAG/Knowledge Base              |
| Redis                 | Optional                   | 🐳 Docker (local) | Chat Memory                     |
| Tavily                | Optional                   | ✅ Free tier      | Web Search                      |
| Discord               | Optional                   | ✅ Free           | Discord Bot                     |

**🐳 = Runs locally via Docker (no account needed!)**

---

## Next Steps

1. Copy `.env.example` to `.env`
2. Add at least one AI model API key (OpenRouter or Google AI Studio)
3. For RAG and Memory features:
   - Run `docker-compose up -d` (starts PostgreSQL + Redis)
   - See [DOCKER_SETUP.md](DOCKER_SETUP.md) for details
4. Add optional API keys as needed (Tavily, Discord)
5. Run `bun install` to install dependencies
6. Test with `bun run index.ts`
7. Try examples in `/examples` folder

For Docker setup, see [DOCKER_SETUP.md](DOCKER_SETUP.md)
For general info, see [README.md](../README.md)
