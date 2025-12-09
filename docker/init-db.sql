-- PostgreSQL Database Initialization
-- This script runs only on the first database creation
-- Tables are now managed by Drizzle ORM migrations (see drizzle/ folder)

-- Enable pgvector extension for vector similarity search
CREATE EXTENSION IF NOT EXISTS vector;

-- Note: Table creation is handled by Drizzle migrations
-- The API container will automatically run migrations on startup
-- See: scripts/run-migrations.ts
