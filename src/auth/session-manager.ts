import { Database } from "bun:sqlite";
import type { Page } from "playwright-core";
import path from "node:path";
import fs from "node:fs";

export class SessionManager {
    private db: Database;

    constructor(dbPath: string = "sessions.sqlite") {
        // Ensure directory exists
        const dir = path.dirname(dbPath);
        if (dir && dir !== "." && !fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        this.db = new Database(dbPath);
        this.initializeDatabase();
    }

    private initializeDatabase() {
        this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        app_identifier TEXT PRIMARY KEY,
        cookies TEXT NOT NULL,
        storage_state TEXT,
        expires_at INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);
    }

    async saveSession(page: Page, appIdentifier: string): Promise<void> {
        const context = page.context();
        const cookies = await context.cookies();
        const storageState = await context.storageState();

        const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO sessions 
      (app_identifier, cookies, storage_state, expires_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

        const now = Date.now();
        const expiresAt = now + 24 * 60 * 60 * 1000; // 24 hours

        stmt.run(
            appIdentifier,
            JSON.stringify(cookies),
            JSON.stringify(storageState),
            expiresAt,
            now,
            now
        );
    }

    async restoreSession(page: Page, appIdentifier: string): Promise<boolean> {
        const stmt = this.db.prepare(`
      SELECT cookies, storage_state, expires_at FROM sessions 
      WHERE app_identifier = ? AND expires_at > ?
    `);

        const row = stmt.get(appIdentifier, Date.now()) as any;
        if (!row) return false;

        try {
            const context = page.context();
            const cookies = JSON.parse(row.cookies);
            await context.addCookies(cookies);

            // Note: storageState in Playwright is usually applied at context creation time.
            // Applying it to an existing context might check if we can partially apply it or if we need to reload.
            // For localStorage/sessionStorage, we can inject script.
            if (row.storage_state) {
                const state = JSON.parse(row.storage_state);
                // Apply origins (localStorage)
                if (state.origins) {
                    await page.evaluate((origins: any[]) => {
                        for (const origin of origins) {
                            if (origin.origin === window.location.origin) {
                                for (const item of origin.localStorage) {
                                    localStorage.setItem(item.name, item.value);
                                }
                            }
                        }
                    }, state.origins);
                }
            }

            return true;
        } catch (error) {
            console.error("Failed to restore session:", error);
            return false;
        }
    }

    close() {
        this.db.close();
    }
}
