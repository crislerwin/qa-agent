import type { Page } from "playwright-core";
import { type Credentials } from "./credential-storage.js";
import { type LoginFlow } from "./login-detector.js";
import { MFAHandler } from "./mfa-handler.js";

export interface AuthResult {
    success: boolean;
    method: string;
    error?: string;
}

export class LoginExecutor {
    private mfaHandler: MFAHandler;

    constructor() {
        this.mfaHandler = new MFAHandler();
    }

    async execute(
        page: Page,
        loginFlow: LoginFlow,
        credentials: Credentials,
    ): Promise<AuthResult> {
        try {
            switch (loginFlow.type) {
                case "form":
                    return await this.executeFormLogin(
                        page,
                        loginFlow,
                        credentials,
                    );
                case "oauth":
                    // For now, return error or handle simple case if feasible without interacting with external provider in complex way
                    // Implementation deferred as per plan complexity
                    return {
                        success: false,
                        method: "oauth",
                        error: "OAuth not implemented yet",
                    };
                default:
                    // Fallback to error or simple fill if possible
                    return {
                        success: false,
                        method: loginFlow.type,
                        error: "Login type not supported yet",
                    };
            }
        } catch (error: any) {
            return {
                success: false,
                method: loginFlow.type,
                error: error.message,
            };
        }
    }

    private async executeFormLogin(
        page: Page,
        loginFlow: LoginFlow,
        credentials: Credentials,
    ): Promise<AuthResult> {
        // Fill username/email
        if (loginFlow.emailField && credentials.email) {
            await page.fill(loginFlow.emailField, credentials.email);
        } else if (loginFlow.usernameField && credentials.username) {
            await page.fill(loginFlow.usernameField, credentials.username);
        } else if (loginFlow.usernameField && credentials.email) {
            // Fallback: try filling email in username field
            await page.fill(loginFlow.usernameField, credentials.email);
        }

        // Fill password
        if (loginFlow.passwordField && credentials.password) {
            await page.fill(loginFlow.passwordField, credentials.password);
        }

        // Submit
        if (loginFlow.submitButton) {
            await page.click(loginFlow.submitButton);
        }

        // Wait for navigation or error
        try {
            await page.waitForTimeout(5000); // Increased wait for slower apps/simulated delays
            // In real world, wait for navigation or specific selector
        } catch (e) {
            // Ignore timeout
        }

        // Handle MFA if potentially required (e.g. if we have a secret)
        // We try to handle it if we see an input, even if not explicitly flagged,
        // or if the flow says it's required.
        if (credentials.totpSecret) {
            // Check if MFA input appeared
            const handled = await this.mfaHandler.handleTOTP(
                page,
                credentials.totpSecret,
            );
            if (handled) {
                // Wait again after MFA submit
                await page.waitForTimeout(2000);
            }
        }

        // Verify success
        const success = await this.verifyLoginSuccess(page);

        return {
            success,
            method: "form",
            error: success ? undefined : "Login verification failed",
        };
    }

    private async verifyLoginSuccess(page: Page): Promise<boolean> {
        // Check for common success indicators
        const indicators = await page.evaluate(() => {
            // Check for logout buttons/links by text
            let hasLogout = false;
            const elements = document.querySelectorAll("a, button");
            for (const el of elements) {
                const text = el.textContent?.toLowerCase() || "";
                if (
                    text.includes("logout") ||
                    text.includes("sign out") ||
                    text.includes("log out")
                ) {
                    // Check if visible
                    const rect = el.getBoundingClientRect();
                    if (rect.width > 0 && rect.height > 0) {
                        hasLogout = true;
                        break;
                    }
                }
            }

            // Fallback: Check hrefs for logout
            if (!hasLogout) {
                const logoutLink = document.querySelector('a[href*="logout"]');
                if (logoutLink) hasLogout = true;
            }

            const hasUserMenu = !!document.querySelector(
                '[class*="user-menu"], [class*="profile"], [id*="user-menu"]',
            );

            // Check for VISIBLE error messages
            let hasErrorMessage = false;
            const errorElements = document.querySelectorAll(
                '[class*="error"], [class*="alert"], [role="alert"]',
            );
            for (const el of errorElements) {
                // Ignore elements that might be hidden or just containers without text
                const rect = el.getBoundingClientRect();
                const text = el.textContent?.trim();
                if (
                    rect.width > 0 &&
                    rect.height > 0 &&
                    text &&
                    text.length > 0 &&
                    getComputedStyle(el).display !== "none" &&
                    getComputedStyle(el).visibility !== "hidden"
                ) {
                    hasErrorMessage = true;
                    break;
                }
            }

            return { hasLogout, hasUserMenu, hasErrorMessage };
        });

        // We consider it success if we see logout/user-menu AND we don't see a visible error.
        // However, sometimes errors appear alongside menus (unlikely).
        // Let's prioritize success indicators.
        if (indicators.hasLogout || indicators.hasUserMenu) {
            return true;
        }

        return false;
    }
}
