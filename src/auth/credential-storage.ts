import { Database } from "bun:sqlite";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export interface Credentials {
    username?: string;
    email?: string;
    password: string;
    totpSecret?: string; // For MFA
    additionalFields?: Record<string, string>;
}

export class CredentialStorage {
    private db: Database;
    private encryptionKey: Buffer;
    private readonly KEY_FILE = ".auth.key";

    constructor(db: Database) {
        this.db = db;
        this.encryptionKey = this.getOrCreateEncryptionKey();
    }

    private getOrCreateEncryptionKey(): Buffer {
        // 1. Get from environment
        const keyEnv = process.env.CREDENTIAL_ENCRYPTION_KEY;
        if (keyEnv) {
            try {
                if (keyEnv.length === 64) return Buffer.from(keyEnv, "hex");
                // Warning if length is weird?
            } catch (e) {
                // ignore
            }
        }

        // 2. Get from file
        const keyPath = path.resolve(process.cwd(), this.KEY_FILE);
        if (fs.existsSync(keyPath)) {
            try {
                const keyHex = fs.readFileSync(keyPath, "utf-8").trim();
                if (keyHex.length === 64) {
                    return Buffer.from(keyHex, "hex");
                }
            } catch (e) {
                console.warn(`Failed to read key file: ${e}`);
            }
        }

        // 3. Generate new key
        const key = randomBytes(32);
        const keyHex = key.toString("hex");

        // 4. Save to file
        try {
            fs.writeFileSync(keyPath, keyHex, {
                encoding: "utf-8",
                mode: 0o600,
            });
            // console.log(`Encryption key saved to ${this.KEY_FILE}`);
        } catch (e) {
            console.warn(
                "⚠️  Could not save encryption key to file. Credentials will be lost on exit.",
            );
        }

        return key;
    }
    async set(appIdentifier: string, credentials: Credentials): Promise<void> {
        const iv = randomBytes(16);
        const cipher = createCipheriv("aes-256-cbc", this.encryptionKey, iv);

        const data = JSON.stringify(credentials);
        let encrypted = cipher.update(data, "utf8", "hex");
        encrypted += cipher.final("hex");

        const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO credentials
      (app_identifier, encrypted_data, iv, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `);

        const now = Date.now();
        stmt.run(appIdentifier, encrypted, iv.toString("hex"), now, now);
    }

    async get(appIdentifier: string): Promise<Credentials> {
        const stmt = this.db.prepare(`
      SELECT encrypted_data, iv FROM credentials
      WHERE app_identifier = ?
    `);

        const row = stmt.get(appIdentifier) as any;
        if (!row) {
            throw new Error(`No credentials found for ${appIdentifier}`);
        }

        const iv = Buffer.from(row.iv, "hex");
        const decipher = createDecipheriv(
            "aes-256-cbc",
            this.encryptionKey,
            iv,
        );

        let decrypted = decipher.update(row.encrypted_data, "hex", "utf8");
        decrypted += decipher.final("utf8");

        return JSON.parse(decrypted);
    }

    async list(): Promise<string[]> {
        const stmt = this.db.prepare(
            "SELECT app_identifier FROM credentials ORDER BY updated_at DESC",
        );
        const rows = stmt.all() as { app_identifier: string }[];
        return rows.map((row) => row.app_identifier);
    }

    close() {
        this.db.close();
    }
}
