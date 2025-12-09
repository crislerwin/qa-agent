import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

/**
 * Get database connection string from environment
 */
export function getDatabaseUrl(): string {
  return (
    process.env.DATABASE_URL ||
    "postgresql://postgres:postgres@localhost:5432/agents_db"
  );
}

/**
 * Create a PostgreSQL connection client
 */
export function createDbClient() {
  const connectionString = getDatabaseUrl();
  const client = postgres(connectionString);
  return drizzle(client, { schema });
}

/**
 * Singleton database instance
 */
let dbInstance: ReturnType<typeof createDbClient> | null = null;

/**
 * Get or create the database instance
 */
export function getDb() {
  if (!dbInstance) {
    dbInstance = createDbClient();
  }
  return dbInstance;
}

/**
 * Export database instance as default
 */
export const db = getDb();

// Re-export schema for convenience
export * from "./schema";
