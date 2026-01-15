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
        credentials: Credentials
    ): Promise<AuthResult> {
        try {
            switch (loginFlow.type) {
                case "form":
                    return await this.executeFormLogin(page, loginFlow, credentials);
                case "oauth":
                    // For now, return error or handle simple case if feasible without interacting with external provider in complex way
                    // Implementation deferred as per plan complexity
                    return { success: false, method: "oauth", error: "OAuth not implemented yet" };
                default:
                    // Fallback to error or simple fill if possible
                    return { success: false, method: loginFlow.type, error: "Login type not supported yet" };
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
        credentials: Credentials
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
            await page.waitForTimeout(2000); // Simple wait
            // In real world, wait for navigation or specific selector
        } catch (e) {
            // Ignore timeout
        }

        // Handle MFA if potentially required (e.g. if we have a secret)
        // We try to handle it if we see an input, even if not explicitly flagged, 
        // or if the flow says it's required.
        if (credentials.totpSecret) {
            // Check if MFA input appeared
            const handled = await this.mfaHandler.handleTOTP(page, credentials.totpSecret);
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
            error: success ? undefined : "Login verification failed"
        };
    }

    private async verifyLoginSuccess(page: Page): Promise<boolean> {
        // Check for common success indicators
        const indicators = await page.evaluate(() => {
            const hasLogout = !!document.querySelector(
                'a[href*="logout"], button:has-text("logout"), button:has-text("Logout"), button:has-text("sign out"), button:has-text("Sign out")'
            );
            const hasUserMenu = !!document.querySelector(
                '[class*="user-menu"], [class*="profile"], [id*="user-menu"]'
            );
            const hasErrorMessage = !!document.querySelector(
                '[class*="error"], [class*="alert"], [role="alert"]'
            );

            return { hasLogout, hasUserMenu, hasErrorMessage };
        });

        return (
            (indicators.hasLogout || indicators.hasUserMenu) &&
            !indicators.hasErrorMessage
        );
    }
}
