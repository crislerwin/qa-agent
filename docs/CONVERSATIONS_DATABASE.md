# Conversations Database

This document explains the database structure for storing user conversations.

## Overview

The chat API persists all conversations to PostgreSQL (with **Drizzle ORM**) in addition to Redis cache. This provides:
- **Permanent storage** of conversation history
- **Analytics capabilities** - query conversations by user, date, etc.
- **Redundancy** - conversations survive Redis cache expiration
- **Scalability** - efficient queries with proper indexing
- **Type Safety** - Drizzle ORM provides full TypeScript support

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

#### `documents`
Stores document embeddings for RAG (Retrieval-Augmented Generation) with pgvector.

| Column | Type | Description |
|--------|------|-------------|
| `id` | SERIAL | Primary key |
| `content` | TEXT | Document content/text |
| `metadata` | JSONB | Document metadata |
| `embedding` | vector(1536) | Vector embedding (pgvector) |
| `created_at` | TIMESTAMP | Document creation time |

### Indexes

For optimal query performance:

**Conversations:**
- `conversations_conversation_id_idx` - Fast lookup by conversation ID
- `conversations_user_id_idx` - Query conversations by user
- `conversations_created_at_idx` - Time-based queries

**Messages:**
- `messages_conversation_id_idx` - Fast message retrieval
- `messages_created_at_idx` - Chronological ordering

**Documents (RAG):**
- `documents_embedding_idx` - HNSW index for vector similarity search
- `documents_metadata_idx` - GIN index for metadata queries

## Setup

### New Installation

If you're setting up a new database, the tables are automatically created by `docker/init-db.sql` when you run:

```bash
docker-compose up -d
```

The database schema is now managed by **Drizzle ORM**. The schema is defined in `src/db/schema.ts`.

### Automatic Migrations

When using Docker, migrations run automatically on container startup:

```bash
docker-compose up -d
```

The startup process:
1. ✅ Waits for PostgreSQL to be ready
2. ✅ Enables pgvector extension
3. ✅ Checks if tables exist
4. ✅ Runs Drizzle migrations if needed
5. ✅ Starts the API server

### Manual Migrations

Run migrations manually with:

```bash
# Run migration script (checks tables and migrates if needed)
bun run db:migrate

# Or generate new migrations after schema changes
bun run db:generate
```

### Development Workflow

For schema changes during development:

```bash
# 1. Edit schema in src/db/schema.ts
# 2. Generate migration
bun run db:generate

# 3. Apply migration
bun run db:migrate

# Or push directly (skip migration generation)
bun run db:push
```

See [scripts/README.md](../scripts/README.md) for detailed migration documentation.

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

## Using Drizzle ORM

This project uses **Drizzle ORM** for type-safe database operations. All queries are type-checked at compile time!

### Direct Database Queries with Drizzle

```typescript
import { db, conversations, messages } from './src/db';
import { eq, desc, sql } from 'drizzle-orm';

// Get a conversation
const [conv] = await db.select()
  .from(conversations)
  .where(eq(conversations.conversationId, 'conv-123'))
  .limit(1);

// Get messages
const msgs = await db.select()
  .from(messages)
  .where(eq(messages.conversationId, 'conv-123'))
  .orderBy(messages.createdAt);

// Insert a message
const [newMsg] = await db.insert(messages)
  .values({
    conversationId: 'conv-123',
    role: 'user',
    content: 'Hello!',
    metadata: {}
  })
  .returning();

// Using transactions
await db.transaction(async (tx) => {
  await tx.insert(messages).values({ ... });
  await tx.update(conversations)
    .set({ messageCount: sql`${conversations.messageCount} + 1` });
});
```

### ConversationDB Service

The `ConversationDB` class provides a high-level API (powered by Drizzle under the hood):

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

### Drizzle ORM Benefits

- **Type Safety**: All queries are type-checked at compile time
- **IntelliSense**: Full autocomplete for tables, columns, and operations
- **Better DX**: No string interpolation, cleaner syntax
- **Migrations**: Built-in migration system with `drizzle-kit`
- **Visual Tools**: Database browser with `bun run db:studio`

### NPM Scripts for Database Management

```bash
bun run db:generate   # Generate migration files from schema
bun run db:push       # Push schema changes to database (dev)
bun run db:migrate    # Run pending migrations
bun run db:studio     # Open Drizzle Studio (visual DB browser)
```

### Schema Definitions

All database schemas are defined in `src/db/schema.ts`:

```typescript
// Conversations table schema
export const conversations = pgTable("conversations", {
  id: serial("id").primaryKey(),
  conversationId: varchar("conversation_id", { length: 255 }).notNull().unique(),
  userId: varchar("user_id", { length: 255 }),
  locale: varchar("locale", { length: 10 }).notNull(),
  model: varchar("model", { length: 100 }),
  messageCount: integer("message_count").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// TypeScript types are auto-generated
export type Conversation = typeof conversations.$inferSelect;
export type InsertConversation = typeof conversations.$inferInsert;
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

## Drizzle Studio - Visual Database Browser

Explore your database visually with Drizzle Studio:

```bash
bun run db:studio
```

This opens a web interface at `https://local.drizzle.studio` where you can:
- Browse all tables and data
- Run queries
- Edit records
- View relationships
- Inspect indexes

## Next Steps

Consider adding:
- User authentication and linking `user_id`
- Conversation tagging or categorization
- Full-text search on message content
- Message embeddings for semantic search
- Export conversations to PDF/JSON

### Learning More About Drizzle ORM

- [Drizzle ORM Docs](https://orm.drizzle.team/)
- [Drizzle with PostgreSQL](https://orm.drizzle.team/docs/get-started-postgresql)
- [Drizzle Kit](https://orm.drizzle.team/kit-docs/overview)
- [Schema Definition](https://orm.drizzle.team/docs/sql-schema-declaration)
