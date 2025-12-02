# Conversations Database

This document explains the database structure for storing user conversations.

## Overview

The chat API now persists all conversations to PostgreSQL in addition to Redis cache. This provides:
- **Permanent storage** of conversation history
- **Analytics capabilities** - query conversations by user, date, etc.
- **Redundancy** - conversations survive Redis cache expiration
- **Scalability** - efficient queries with proper indexing

## Database Schema

### Tables

#### `conversations`
Tracks metadata for each conversation.

| Column | Type | Description |
|--------|------|-------------|
| `id` | SERIAL | Primary key |
| `conversation_id` | VARCHAR(255) | Unique conversation identifier (from frontend) |
| `user_id` | VARCHAR(255) | Optional user identifier |
| `locale` | VARCHAR(10) | Language (pt/en) |
| `model` | VARCHAR(100) | AI model used |
| `message_count` | INTEGER | Total messages in conversation |
| `created_at` | TIMESTAMP | Conversation start time |
| `updated_at` | TIMESTAMP | Last message time |

#### `messages`
Stores individual messages within conversations.

| Column | Type | Description |
|--------|------|-------------|
| `id` | SERIAL | Primary key |
| `conversation_id` | VARCHAR(255) | Foreign key to conversations |
| `role` | VARCHAR(50) | Message role (user/assistant/system) |
| `content` | TEXT | Message content |
| `metadata` | JSONB | Additional metadata |
| `created_at` | TIMESTAMP | Message timestamp |

### Indexes

For optimal query performance:
- `conversations_conversation_id_idx` - Fast lookup by conversation ID
- `conversations_user_id_idx` - Query conversations by user
- `conversations_created_at_idx` - Time-based queries
- `messages_conversation_id_idx` - Fast message retrieval
- `messages_created_at_idx` - Chronological ordering

## Setup

### New Installation

If you're setting up a new database, the tables are automatically created by `docker/init-db.sql` when you run:

```bash
docker-compose up -d
```

### Existing Database

If you already have a database running, apply the migration:

```bash
# Using psql
psql $DATABASE_URL -f scripts/migrate-conversations.sql

# Or using Docker
docker exec -i agents-postgres psql -U postgres -d agents_db < scripts/migrate-conversations.sql
```

## Usage

### Automatic Persistence

Conversations are automatically saved when using the chat API:

```bash
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Hello!",
    "conversation_id": "user-123-session-1",
    "locale": "en",
    "model": "free"
  }'
```

### Retrieve Conversation History

Get full conversation with metadata:

```bash
curl http://localhost:3000/api/chat/history/user-123-session-1
```

Response:
```json
{
  "conversation_id": "user-123-session-1",
  "conversation": {
    "id": 1,
    "conversation_id": "user-123-session-1",
    "user_id": null,
    "locale": "en",
    "model": "free",
    "message_count": 4,
    "created_at": "2024-01-01T10:00:00.000Z",
    "updated_at": "2024-01-01T10:05:00.000Z"
  },
  "message_count": 4,
  "messages": [
    {
      "role": "user",
      "content": "Hello!",
      "created_at": "2024-01-01T10:00:00.000Z"
    },
    {
      "role": "assistant",
      "content": "Hi! How can I help you?",
      "created_at": "2024-01-01T10:00:05.000Z"
    }
  ]
}
```

### Clear Conversation

Delete from both Redis and database:

```bash
curl -X DELETE http://localhost:3000/api/chat/history/user-123-session-1
```

## Direct Database Queries

### Get all conversations for a user

```sql
SELECT * FROM conversations 
WHERE user_id = 'user-123' 
ORDER BY updated_at DESC;
```

### Get conversation statistics

```sql
SELECT 
    conversation_id,
    message_count,
    locale,
    model,
    created_at,
    updated_at
FROM conversations
WHERE user_id = 'user-123';
```

### Get recent messages across all conversations

```sql
SELECT 
    m.conversation_id,
    m.role,
    m.content,
    m.created_at,
    c.user_id,
    c.locale
FROM messages m
JOIN conversations c ON m.conversation_id = c.conversation_id
WHERE c.user_id = 'user-123'
ORDER BY m.created_at DESC
LIMIT 50;
```

### Get conversation activity by day

```sql
SELECT 
    DATE(created_at) as date,
    COUNT(*) as conversation_count,
    SUM(message_count) as total_messages
FROM conversations
GROUP BY DATE(created_at)
ORDER BY date DESC;
```

## ConversationDB Service

The `ConversationDB` class provides a clean API for database operations:

```typescript
import { ConversationDB } from './src/services/conversation-db';

const db = new ConversationDB();

// Create/update conversation
await db.upsertConversation('conv-123', 'en', 'free', 'user-456');

// Add message
await db.addMessage('conv-123', 'user', 'Hello!');
await db.addMessage('conv-123', 'assistant', 'Hi there!');

// Get conversation
const conversation = await db.getConversation('conv-123');

// Get messages
const messages = await db.getMessages('conv-123');
const recentMessages = await db.getRecentMessages('conv-123', 10);

// Delete conversation
await db.deleteConversation('conv-123');

// Cleanup old conversations
const deleted = await db.deleteOldConversations(30); // 30 days old
```

## Data Flow

1. **User sends message** → Frontend generates `conversation_id`
2. **API receives request** → `POST /api/chat`
3. **Conversation created/updated** in database with metadata
4. **Message saved to Redis** for fast retrieval (1 hour TTL)
5. **Message saved to database** for permanent storage
6. **AI response generated** and returned
7. **Response saved** to both Redis and database

## Benefits

### Dual Storage Strategy

- **Redis**: Fast access for active conversations (1 hour TTL)
- **Database**: Permanent storage, analytics, historical data

### Why Both?

- **Performance**: Redis provides sub-millisecond access for recent chats
- **Persistence**: Database ensures no data loss after TTL expiration
- **Analytics**: SQL queries enable powerful insights
- **Scalability**: Can scale Redis and PostgreSQL independently

## Maintenance

### Clean up old conversations

```sql
-- Delete conversations older than 90 days
DELETE FROM conversations 
WHERE updated_at < NOW() - INTERVAL '90 days';
```

Or use the service method:

```typescript
const deleted = await conversationDB.deleteOldConversations(90);
console.log(`Deleted ${deleted} old conversations`);
```

### Backup

```bash
# Backup conversations
pg_dump -U postgres -d agents_db -t conversations -t messages > conversations_backup.sql

# Restore
psql -U postgres -d agents_db < conversations_backup.sql
```

## Environment Variables

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/agents_db
```

## Troubleshooting

### Tables not created

Run the migration script:
```bash
psql $DATABASE_URL -f scripts/migrate-conversations.sql
```

### Permission errors

Grant proper permissions:
```sql
GRANT ALL PRIVILEGES ON TABLE conversations TO postgres;
GRANT ALL PRIVILEGES ON TABLE messages TO postgres;
```

### Connection issues

Check your `DATABASE_URL` in `.env`:
```bash
# Test connection
psql $DATABASE_URL -c "SELECT 1;"
```

## Next Steps

Consider adding:
- User authentication and linking `user_id`
- Conversation tagging or categorization
- Full-text search on message content
- Message embeddings for semantic search
- Export conversations to PDF/JSON
