import { TOTP } from "otplib";
import type { Page } from "playwright-core";

export class MFAHandler {
    private totp: TOTP;

    constructor() {
        this.totp = new TOTP();
    }

    /**
     * Handle TOTP-based MFA
     */
    async handleTOTP(page: Page, totpSecret: string): Promise<boolean> {
        try {
            // Generate TOTP code
            const token = await this.totp.generate({ secret: totpSecret });

            // Find MFA input field
            const mfaInput = page.locator(
                'input[name*="code"], input[name*="token"], input[name*="otp"], input[placeholder*="code"]'
            );

            if (await mfaInput.count() > 0) {
                await mfaInput.first().fill(token);

                // Find and click submit
                // Note: Sometimes filling the code auto-submits.
                // We'll look for a button just in case.
                const submitButton = page.locator(
                    'button[type="submit"], button:has-text("verify"), button:has-text("continue")'
                );

                if (await submitButton.count() > 0 && await submitButton.first().isVisible()) {
                    await submitButton.first().click();
                }
                return true;
            }
            return false;
        } catch (error) {
            console.error("Error handling TOTP:", error);
            return false;
        }
    }

    /**
     * Handle SMS-based MFA (requires manual intervention)
     */
    async handleSMS(_page: Page): Promise<void> {
        // This would require user intervention or integration with SMS service
        // For now, we can log a warning or throw
        console.warn("SMS MFA encountered. Manual intervention required if not handled.");
        // In a real agent, we might notify the user or pause execution.
    }
}
