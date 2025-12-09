#!/usr/bin/env bun
/**
 * Database Migration Runner
 *
 * This script runs Drizzle ORM migrations automatically.
 * It tracks applied migrations and only runs new ones.
 * Safe to run multiple times - Drizzle handles migration tracking.
 */

import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { sql } from "drizzle-orm";

const DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql://postgres:postgres@localhost:5432/agents_db";

async function runMigrations() {
  console.log("🗄️  Starting Drizzle ORM migrations...");

  const connectionString = DATABASE_URL;

  // Create connection for migrations
  const migrationClient = postgres(connectionString, { max: 1 });
  const db = drizzle(migrationClient);

  try {
    // Verify pgvector extension first
    console.log("🔌 Checking pgvector extension...");
    const extensions = await db.execute<{ extname: string }>(sql`
      SELECT extname
      FROM pg_extension
      WHERE extname = 'vector'
    `);

    if (extensions.length === 0) {
      console.log("⚠️  pgvector extension not found. Installing...");
      await db.execute(sql`CREATE EXTENSION IF NOT EXISTS vector`);
      console.log("✅ pgvector extension installed!");
    } else {
      console.log("✅ pgvector extension is active");
    }

    // Check if this is an existing database with tables but no migration tracking
    console.log("📊 Checking database state...");
    const tables = await db.execute<{ table_name: string }>(sql`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('conversations', 'messages', 'documents')
    `);

    const hasExistingTables = tables.length > 0;

    // Create drizzle schema and migrations table if needed
    await db.execute(sql`CREATE SCHEMA IF NOT EXISTS drizzle`);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
        id SERIAL PRIMARY KEY,
        hash text NOT NULL,
        created_at bigint
      )
    `);

    // Check if migration tracking has any records
    const appliedMigrations = await db.execute<{ hash: string }>(sql`
      SELECT hash FROM drizzle.__drizzle_migrations
    `);

    const hasAppliedMigrations = appliedMigrations.length > 0;

    if (hasExistingTables && !hasAppliedMigrations) {
      console.log("⚠️  Found existing tables without migration tracking");
      console.log("📝 This is likely a database migrated from pure SQL to Drizzle ORM");
      console.log("🔄 Initializing migration tracking...");

      // Mark the first migration as applied (since tables already exist)
      // The hash must match the migration file name
      await db.execute(sql`
        INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
        VALUES ('0000_powerful_payback', ${Date.now()})
      `);

      console.log("✅ Migration tracking initialized");
      console.log("ℹ️  First migration marked as applied (tables already exist)");
    }

    // Run migrations
    // Drizzle automatically tracks which migrations have been applied
    // using the __drizzle_migrations table
    console.log("🔄 Applying database migrations...");
    await migrate(db, { migrationsFolder: "./drizzle" });

    console.log("✅ All migrations applied successfully!");
    console.log("🎉 Database is ready!");
  } catch (error) {
    console.error("❌ Migration failed:", error);
    throw error;
  } finally {
    await migrationClient.end();
  }
}

// Run migrations if this script is executed directly
if (import.meta.main) {
  runMigrations()
    .then(() => {
      console.log("✨ Migration script completed successfully");
      process.exit(0);
    })
    .catch((error) => {
      console.error("💥 Migration script failed:", error);
      process.exit(1);
    });
}

export { runMigrations };
