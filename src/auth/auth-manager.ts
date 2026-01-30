import type { Page } from "playwright-core";
import {
  CredentialProvider,
  type AuthConfig as CredConfig,
  type Credentials,
} from "./credential-provider.js";
import { LoginFlowDetector } from "./login-detector.js";
import { LoginExecutor, type AuthResult } from "./login-executor.js";
import { SessionManager } from "./session-manager.js";
import type { Database } from "bun:sqlite";

export { type Credentials };

export interface AuthManagerConfig extends CredConfig {
  // any extra config
}

export class AuthenticationManager {
  private credentialProvider: CredentialProvider;
  private loginDetector: LoginFlowDetector;
  private loginExecutor: LoginExecutor;
  private sessionManager: SessionManager;

  constructor(db: Database, config?: AuthManagerConfig) {
    this.credentialProvider = new CredentialProvider(db, config);
    this.loginDetector = new LoginFlowDetector();
    this.loginExecutor = new LoginExecutor();
    this.sessionManager = new SessionManager(db);
  }

  /**
   * Authenticate to an application
   */
  async authenticate(page: Page, appIdentifier: string): Promise<AuthResult> {
    try {
      // 1. Check if already authenticated
      if (await this.isAuthenticated(page)) {
        return { success: true, method: "session-reuse" };
      }

      // 2. Restore session if available
      const restored = await this.sessionManager.restoreSession(
        page,
        appIdentifier,
      );
      if (restored && (await this.isAuthenticated(page))) {
        return { success: true, method: "session-restore" };
      }

      // 3. Detect login flow
      const loginFlow = await this.loginDetector.detect(page);
      if (!loginFlow) {
        // If we can't detect a login flow, maybe we are already in (false negative on isAuthenticated)
        // or it's not a login page.
        // Let's assume if we are asked to auth, we should be on a login page or navigable to one.
        // For now, fail.
        return {
          success: false,
          method: "detection-failed",
          error: "Could not detect login flow",
        };
      }

      // 4. Get credentials
      let credentials;
      try {
        credentials =
          await this.credentialProvider.getCredentials(appIdentifier);
      } catch (e) {
        return {
          success: false,
          method: "credential-retrieval",
          error: (e as Error).message,
        };
      }

      // 5. Execute login
      const result = await this.loginExecutor.execute(
        page,
        loginFlow,
        credentials,
      );

      // 6. Save session
      if (result.success) {
        await this.sessionManager.saveSession(page, appIdentifier);
      }

      return result;
    } catch (error: any) {
      return { success: false, method: "unknown", error: error.message };
    }
  }

  /**
   * Check if currently authenticated
   */
  async isAuthenticated(page: Page): Promise<boolean> {
    // Re-using the verification logic from executor for now, but could be broader.
    // Ideally we check for public-only elements separately?
    // For now, presence of "logout" or "profile" is a strong signal.
    const indicators = await page.evaluate(() => {
      const hasLogout = !!document.querySelector(
        'a[href*="logout"], button:has-text("logout"), button:has-text("Logout"), button:has-text("sign out"), button:has-text("Sign out")',
      );
      const hasUserMenu = !!document.querySelector(
        '[class*="user-menu"], [class*="profile"], [id*="user-menu"]',
      );

      return { hasLogout, hasUserMenu };
    });

    return indicators.hasLogout || indicators.hasUserMenu;
  }

  async storeCredentials(appIdentifier: string, credentials: Credentials) {
    return this.credentialProvider.storeCredentials(appIdentifier, credentials);
  }
}
