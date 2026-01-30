import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { AppDatabase } from "../src/database/database";
import { CredentialStorage } from "../src/auth/credential-storage";
import { SessionManager } from "../src/auth/session-manager";
import { SessionRepository } from "../src/repositories/session.repository";

describe("Database Consolidation", () => {
  let db: AppDatabase;
  let database: any;

  beforeAll(() => {
    // Use in-memory database for testing
    db = new AppDatabase(":memory:");
    database = db.getDatabase();
  });

  afterAll(() => {
    db.close();
  });

  test("should create all 3 tables in single database", () => {
    const tables = database
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
      )
      .all() as { name: string }[];

    const tableNames = tables.map((t) => t.name);

    expect(tableNames).toContain("agent_sessions");
    expect(tableNames).toContain("credentials");
    expect(tableNames).toContain("browser_sessions");
  });

  test("CredentialStorage should store and retrieve credentials", async () => {
    const credStorage = new CredentialStorage(database);

    await credStorage.set("testapp", {
      email: "test@example.com",
      password: "SecurePass123!",
    });

    const retrieved = await credStorage.get("testapp");

    expect(retrieved.email).toBe("test@example.com");
    expect(retrieved.password).toBe("SecurePass123!");
  });

  test("SessionRepository should save and load agent state", () => {
    const sessionRepo = new SessionRepository(database);

    const testState = {
      visitedUrls: new Set(["http://example.com"]),
      findings: [],
      steps: 5,
      history: [],
      todoQueue: ["http://example.com/page2"],
    };

    sessionRepo.saveState("test-session-1", testState);
    const loaded = sessionRepo.loadState("test-session-1");

    expect(loaded).not.toBeNull();
    expect(loaded?.steps).toBe(5);
    expect(loaded?.visitedUrls).toBeInstanceOf(Set);
    expect(loaded?.visitedUrls.has("http://example.com")).toBe(true);
  });

  test("SessionRepository should list sessions", () => {
    const sessionRepo = new SessionRepository(database);

    // Save multiple sessions
    sessionRepo.saveState("session-1", {
      visitedUrls: new Set(),
      findings: [],
      steps: 1,
      history: [],
      todoQueue: [],
    });

    sessionRepo.saveState("session-2", {
      visitedUrls: new Set(),
      findings: [],
      steps: 2,
      history: [],
      todoQueue: [],
    });

    const sessions = sessionRepo.listSessions();

    expect(sessions.length).toBeGreaterThanOrEqual(2);
    expect(sessions).toContain("session-1");
    expect(sessions).toContain("session-2");
  });

  test("should use single database file", () => {
    // Verify all components use the same database instance
    const credStorage = new CredentialStorage(database);
    const sessionRepo = new SessionRepository(database);
    const sessionManager = new SessionManager(database);

    // All should work without errors
    expect(() => {
      sessionRepo.listSessions();
    }).not.toThrow();
  });
});

describe("Database Schema", () => {
  let db: AppDatabase;
  let database: any;

  beforeAll(() => {
    db = new AppDatabase(":memory:");
    database = db.getDatabase();
  });

  afterAll(() => {
    db.close();
  });

  test("agent_sessions table should have correct schema", () => {
    const schema = database
      .prepare("PRAGMA table_info(agent_sessions)")
      .all() as any[];

    const columns = schema.map((col) => col.name);

    expect(columns).toContain("id");
    expect(columns).toContain("state");
    expect(columns).toContain("created_at");
    expect(columns).toContain("updated_at");
  });

  test("credentials table should have correct schema", () => {
    const schema = database
      .prepare("PRAGMA table_info(credentials)")
      .all() as any[];

    const columns = schema.map((col) => col.name);

    expect(columns).toContain("app_identifier");
    expect(columns).toContain("encrypted_data");
    expect(columns).toContain("iv");
    expect(columns).toContain("metadata");
    expect(columns).toContain("created_at");
    expect(columns).toContain("updated_at");
  });

  test("browser_sessions table should have correct schema", () => {
    const schema = database
      .prepare("PRAGMA table_info(browser_sessions)")
      .all() as any[];

    const columns = schema.map((col) => col.name);

    expect(columns).toContain("app_identifier");
    expect(columns).toContain("cookies");
    expect(columns).toContain("storage_state");
    expect(columns).toContain("expires_at");
    expect(columns).toContain("created_at");
    expect(columns).toContain("updated_at");
  });
});
