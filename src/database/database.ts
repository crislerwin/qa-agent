import { Database } from "bun:sqlite";
import path from "node:path";
import fs from "node:fs";

/**
 * Unified database class that manages all application data in a single SQLite database.
 * Consolidates what were previously 3 separate databases:
 * - agent_sessions (formerly agent_state.sqlite)
 * - credentials (formerly credentials.sqlite)
 * - browser_sessions (formerly sessions.sqlite)
 */
export class AppDatabase {
  private static instance: AppDatabase | null = null;
  private db: Database;

  constructor(dbPath: string = "qa-agent.sqlite") {
    // Ensure directory exists
    const dir = path.dirname(dbPath);
    if (dir && dir !== "." && !fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(dbPath);
    this.initializeSchema();
  }

  /**
   * Get singleton instance of the database
   */
  static getInstance(dbPath?: string): AppDatabase {
    if (!AppDatabase.instance) {
      AppDatabase.instance = new AppDatabase(dbPath);
    }
    return AppDatabase.instance;
  }

  /**
   * Initialize all database tables
   */
  private initializeSchema() {
    // Agent sessions table (exploration state)
    // Renamed from 'sessions' to avoid conflict with browser_sessions
    this.db.run(`
            CREATE TABLE IF NOT EXISTS agent_sessions (
                id TEXT PRIMARY KEY,
                state TEXT NOT NULL,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        `);

    // Credentials table (encrypted authentication credentials)
    this.db.run(`
            CREATE TABLE IF NOT EXISTS credentials (
                app_identifier TEXT PRIMARY KEY,
                encrypted_data TEXT NOT NULL,
                iv TEXT NOT NULL,
                metadata TEXT,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            )
        `);

    // Browser sessions table (cookies and storage state)
    // Renamed from 'sessions' to avoid conflict with agent_sessions
    this.db.run(`
            CREATE TABLE IF NOT EXISTS browser_sessions (
                app_identifier TEXT PRIMARY KEY,
                cookies TEXT NOT NULL,
                storage_state TEXT,
                expires_at INTEGER,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            )
        `);

    // User configuration table (persisted CLI preferences, e.g. LLM provider)
    this.db.run(`
            CREATE TABLE IF NOT EXISTS user_config (
                key        TEXT PRIMARY KEY,
                value      TEXT NOT NULL,
                updated_at INTEGER NOT NULL
            )
        `);
  }

  /**
   * Get the underlying Database instance
   */
  getDatabase(): Database {
    return this.db;
  }

  /**
   * Close the database connection
   */
  close() {
    this.db.close();
    AppDatabase.instance = null;
  }

  /**
   * Reset singleton instance (useful for testing)
   */
  static reset() {
    if (AppDatabase.instance) {
      AppDatabase.instance.close();
    }
    AppDatabase.instance = null;
  }
}
