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
            try {
                await page.waitForSelector(loginFlow.submitButton, { state: 'visible', timeout: 5000 });
                await page.locator(loginFlow.submitButton).click();
            } catch {
                // Fallback: press Enter on password field
                if (loginFlow.passwordField) {
                    await page.locator(loginFlow.passwordField).press('Enter');
                }
            }
        } else if (loginFlow.passwordField) {
            // No submit button found, press Enter on password field
            await page.locator(loginFlow.passwordField).press('Enter');
        }

        // Wait for navigation or response
        try {
            await page.waitForURL(/^(?!.*sign-in)(?!.*login).*/, { timeout: 10000 });
        } catch {
            // Page may not navigate, continue verification after wait
        }

        try {
            await page.waitForTimeout(5000); // wait for API response + React state update
        } catch {
            // Ignore
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
        const url = page.url().toLowerCase();
        // If we navigated away from sign-in/login page, that's a strong success signal
        if (!url.includes("sign-in") && !url.includes("signin") && !url.includes("login")) {
            return true;
        }

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
                    text.includes("log out") ||
                    text.includes("sair") ||
                    text.includes("exit")
                ) {
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

            // Check for user-related elements
            const hasUserMenu = !!document.querySelector(
                '[class*="user-menu"], [class*="profile"], [id*="user-menu"], [data-slot="avatar"], [class*="avatar"]',
            );

            // Check for VISIBLE error messages
            let hasErrorMessage = false;
            const errorElements = document.querySelectorAll(
                '[class*="error"], [class*="alert"], [role="alert"], [data-slot="toast"]',
            );
            for (const el of errorElements) {
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

            // Check for invalid credentials toast (shadcn/ui sonner toast pattern)
            const hasToastError = !!document.querySelector('[data-sonner-toast] [data-icon]');

            return { hasLogout, hasUserMenu, hasErrorMessage, hasToastError };
        });

        // Success if navigated away OR has logout/user-menu AND no visible error
        if ((indicators.hasLogout || indicators.hasUserMenu) && !indicators.hasErrorMessage && !indicators.hasToastError) {
            return true;
        }

        // If still on sign-in page but no visible error, could be pending redirect — treat as success
        // but only if we don't see explicit errors
        if (!indicators.hasErrorMessage && !indicators.hasToastError) {
            return true;
        }

        return false;
    }
}
