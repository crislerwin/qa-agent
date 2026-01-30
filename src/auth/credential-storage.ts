import { Database } from "bun:sqlite";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

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

  constructor(db: Database) {
    this.db = db;
    this.encryptionKey = this.getOrCreateEncryptionKey();
  }

  private getOrCreateEncryptionKey(): Buffer {
    // Get from environment or generate
    const keyEnv = process.env.CREDENTIAL_ENCRYPTION_KEY;
    if (keyEnv) {
      if (keyEnv.length !== 64) {
        // Hex string of 32 bytes = 64 chars
        // Fallback or warning? Let's assume valid hex for now, or use what we can.
        // For AES-256 we strictly need 32 bytes.
        // If it's crude string, maybe hash it?
        // For now, assume it's hex instructions.
        try {
          const buf = Buffer.from(keyEnv, "hex");
          if (buf.length === 32) return buf;
        } catch (e) {
          console.warn(
            "Invalid CREDENTIAL_ENCRYPTION_KEY format. Generating temporary key.",
          );
        }
      } else {
        return Buffer.from(keyEnv, "hex");
      }
    }

    // Generate new key (should be stored securely)
    // In a real CLI app we might want to persist this or ask user to save it.
    // For this implementation, we'll warn if we generated it.
    console.warn(
      "⚠️  Generated new encryption key for this session (or missing env). Set CREDENTIAL_ENCRYPTION_KEY env var for persistence.",
    );
    // Development convenience: keys written to specialized file or just in memory?
    // The RFC says "Get from environment or generate".
    const key = randomBytes(32);
    // Ideally we would print it for the user to save.
    // console.warn(`CREDENTIAL_ENCRYPTION_KEY=${key.toString("hex")}`);
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
    const decipher = createDecipheriv("aes-256-cbc", this.encryptionKey, iv);

    let decrypted = decipher.update(row.encrypted_data, "hex", "utf8");
    decrypted += decipher.final("utf8");

    return JSON.parse(decrypted);
  }

  close() {
    this.db.close();
  }
}
