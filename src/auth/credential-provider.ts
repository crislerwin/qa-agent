import { CredentialStorage, type Credentials } from "./credential-storage.js";
import type { Database } from "bun:sqlite";
export { type Credentials };

export interface AuthConfig {
    storageType?: "sqlite" | "memory";
}

export class CredentialProvider {
    private storage: CredentialStorage;

    constructor(db: Database, config?: AuthConfig) {
        this.storage = new CredentialStorage(db);
    }

    /**
     * Get credentials for an application
     */
    async getCredentials(appIdentifier: string): Promise<Credentials> {
        // Try environment variables first
        const envCreds = this.getFromEnvironment(appIdentifier);
        if (envCreds) return envCreds;

        // Fall back to encrypted storage
        return await this.storage.get(appIdentifier);
    }

    /**
     * Store credentials securely
     */
    async storeCredentials(
        appIdentifier: string,
        credentials: Credentials,
    ): Promise<void> {
        await this.storage.set(appIdentifier, credentials);
    }

    /**
     * List all stored credential identifiers
     */
    async listCredentials(): Promise<string[]> {
        return await this.storage.list();
    }

    /**
     * Get credentials from environment variables
     */
    private getFromEnvironment(appIdentifier: string): Credentials | null {
        const prefix = `AUTH_${appIdentifier.toUpperCase().replace(/[^A-Z0-9]/g, "_")}`;

        const username = process.env[`${prefix}_USERNAME`];
        const email = process.env[`${prefix}_EMAIL`];
        const password = process.env[`${prefix}_PASSWORD`];
        const totpSecret = process.env[`${prefix}_TOTP_SECRET`];

        if (!password) return null;

        return {
            username,
            email,
            password,
            totpSecret,
        };
    }
}
