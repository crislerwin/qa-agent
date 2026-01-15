import type { Page } from "playwright-core";

export interface LoginFlow {
    type: "form" | "oauth" | "sso" | "magic-link" | "unknown";
    formSelector?: string;
    usernameField?: string;
    emailField?: string;
    passwordField?: string;
    submitButton?: string;
    mfaRequired?: boolean;
    oauthProvider?: string;
    additionalSteps?: LoginStep[];
}

export interface LoginStep {
    type: "input" | "click" | "wait" | "mfa";
    selector?: string;
    value?: string;
    description: string;
}

export class LoginFlowDetector {
    /**
     * Detect login flow on current page
     */
    async detect(page: Page): Promise<LoginFlow | null> {
        // 1. Check if we're on a login page
        const isLoginPage = await this.isLoginPage(page);
        if (!isLoginPage) return null;

        // 2. Extract form elements
        // Note: In a real implementation we might pass this data to an LLM.
        // Here we'll implement heuristic detection first.

        // Heuristic detection
        const usernameField = await this.findUsernameField(page);
        const passwordField = await this.findPasswordField(page);
        const submitButton = await this.findSubmitButton(page);

        if ((usernameField || passwordField) && submitButton) {
            return {
                type: "form",
                usernameField, // Might be email or username
                emailField: usernameField?.includes("email") ? usernameField : undefined, // loose check
                passwordField,
                submitButton,
                mfaRequired: false
            };
        }

        return { type: "unknown" };
    }

    private async isLoginPage(page: Page): Promise<boolean> {
        const url = page.url().toLowerCase();
        const title = (await page.title()).toLowerCase();

        // Simple heuristics
        const loginKeywords = [
            "login",
            "signin",
            "sign-in",
            "log-in",
            "authenticate",
            "auth",
        ];

        return (
            loginKeywords.some((kw) => url.includes(kw) || title.includes(kw))
        );
    }

    private async findUsernameField(page: Page): Promise<string | undefined> {
        const selectors = [
            'input[type="email"]',
            'input[name="email"]',
            'input[name="username"]',
            'input[id="email"]',
            'input[id="username"]',
            'input[type="text"]' // risky, but maybe last resort
        ];

        for (const selector of selectors) {
            if (await page.locator(selector).first().isVisible()) {
                return selector;
            }
        }
        return undefined;
    }

    private async findPasswordField(page: Page): Promise<string | undefined> {
        const selectors = [
            'input[type="password"]',
            'input[name="password"]',
            'input[id="password"]'
        ];

        for (const selector of selectors) {
            if (await page.locator(selector).first().isVisible()) {
                return selector;
            }
        }
        return undefined;
    }

    private async findSubmitButton(page: Page): Promise<string | undefined> {
        const selectors = [
            'button[type="submit"]',
            'input[type="submit"]',
            'button:has-text("Login")',
            'button:has-text("Sign in")',
            'button:has-text("Log in")'
        ];

        for (const selector of selectors) {
            if (await page.locator(selector).first().isVisible()) {
                return selector;
            }
        }
        return undefined;
    }
}
