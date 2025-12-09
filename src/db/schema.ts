import {
  pgTable,
  serial,
  varchar,
  text,
  timestamp,
  integer,
  jsonb,
  index,
  uniqueIndex,
  customType,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// Custom type for pgvector
const vector = customType<{ data: number[]; driverData: string }>({
  dataType() {
    return "vector(1536)";
  },
  toDriver(value: number[]): string {
    return JSON.stringify(value);
  },
  fromDriver(value: string): number[] {
    return JSON.parse(value);
  },
});

/**
 * Conversations table - tracks user conversations
 */
export const conversations = pgTable(
  "conversations",
  {
    id: serial("id").primaryKey(),
    conversationId: varchar("conversation_id", { length: 255 })
      .notNull()
      .unique(),
    userId: varchar("user_id", { length: 255 }),
    locale: varchar("locale", { length: 10 }).notNull(),
    model: varchar("model", { length: 100 }),
    messageCount: integer("message_count").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    conversationIdIdx: uniqueIndex("conversations_conversation_id_idx").on(
      table.conversationId
    ),
    userIdIdx: index("conversations_user_id_idx").on(table.userId),
    createdAtIdx: index("conversations_created_at_idx").on(table.createdAt),
  })
);

/**
 * Messages table - stores individual messages in conversations
 */
export const messages = pgTable(
  "messages",
  {
    id: serial("id").primaryKey(),
    conversationId: varchar("conversation_id", { length: 255 })
      .notNull()
      .references(() => conversations.conversationId, { onDelete: "cascade" }),
    role: varchar("role", { length: 50 }).notNull(),
    content: text("content").notNull(),
    metadata: jsonb("metadata").default({}).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    conversationIdIdx: index("messages_conversation_id_idx").on(
      table.conversationId
    ),
    createdAtIdx: index("messages_created_at_idx").on(table.createdAt),
  })
);

/**
 * Documents table - for RAG with pgvector
 * Note: vector type requires pgvector extension
 */
export const documents = pgTable(
  "documents",
  {
    id: serial("id").primaryKey(),
    content: text("content").notNull(),
    metadata: jsonb("metadata").default({}).notNull(),
    embedding: vector("embedding"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    // HNSW index for vector similarity search
    embeddingIdx: index("documents_embedding_idx").using(
      "hnsw",
      sql`${table.embedding} vector_cosine_ops`
    ),
    metadataIdx: index("documents_metadata_idx").using(
      "gin",
      table.metadata
    ),
  })
);

// Type exports for use in application code
export type Conversation = typeof conversations.$inferSelect;
export type InsertConversation = typeof conversations.$inferInsert;

export type Message = typeof messages.$inferSelect;
export type InsertMessage = typeof messages.$inferInsert;

export type Document = typeof documents.$inferSelect;
export type InsertDocument = typeof documents.$inferInsert;
