import { type Page } from "playwright-core";
import { createLogger } from "../utils/logger.ts";

const logger = createLogger("tool:validation-errors");

export interface ValidationErrorFinding {
  message: string;
  selector: string;
  location: { x: number; y: number };
}

/**
 * Scans the current page for visible validation/error messages.
 * Detects common error patterns in the DOM.
 */
export async function findValidationErrors(
  page: Page
): Promise<ValidationErrorFinding[]> {
  logger.log("Scanning page for validation errors...");

  const findings = await page.evaluate(() => {
    const errors: any[] = [];

    // Common selectors for error messages
    const errorSelectors = [
      '[role="alert"]',
      ".error",
      ".alert-danger",
      ".alert-error",
      ".validation-error",
      ".field-error",
      ".form-error",
      ".error-message",
      ".invalid-feedback",
      '[aria-invalid="true"]',
      ".text-danger",
      ".text-red-500", // Tailwind
      ".text-red-600",
    ];

    // Helper to get a selector
    const getSelector = (el: Element): string => {
      if (el.id) return `#${el.id}`;

      let path = el.tagName.toLowerCase();
      if (el.className) {
        const classes = el.className.split(" ").filter((c) => c.trim());
        if (classes.length > 0) {
          path += `.${classes.join(".")}`;
        }
      }

      return path;
    };

    // Check each selector
    for (const selector of errorSelectors) {
      const elements = document.querySelectorAll(selector);

      for (const el of elements) {
        const rect = el.getBoundingClientRect();

        // Skip invisible elements
        if (rect.width === 0 || rect.height === 0) continue;

        // Skip elements that are not visible
        const style = window.getComputedStyle(el);
        if (style.display === "none" || style.visibility === "hidden") continue;

        const text = el.textContent?.trim() || "";

        // Skip empty messages
        if (!text) continue;

        // Skip very long messages (likely not error messages)
        if (text.length > 200) continue;

        errors.push({
          message: text,
          selector: getSelector(el),
          location: { x: rect.x, y: rect.y },
        });
      }
    }

    // Also check for inputs with aria-invalid
    const invalidInputs = document.querySelectorAll(
      'input[aria-invalid="true"], textarea[aria-invalid="true"], select[aria-invalid="true"]'
    );
    for (const input of invalidInputs) {
      const rect = input.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;

      // Look for associated error message
      const ariaDescribedBy = input.getAttribute("aria-describedby");
      let errorMessage = "";

      if (ariaDescribedBy) {
        const errorEl = document.getElementById(ariaDescribedBy);
        if (errorEl) {
          errorMessage = errorEl.textContent?.trim() || "";
        }
      }

      // If no aria-describedby, look for nearby error elements
      if (!errorMessage) {
        const parent = input.parentElement;
        if (parent) {
          const nearbyError = parent.querySelector(
            ".error, .invalid-feedback, .field-error"
          );
          if (nearbyError) {
            errorMessage = nearbyError.textContent?.trim() || "";
          }
        }
      }

      if (errorMessage) {
        errors.push({
          message: `Invalid input: ${errorMessage}`,
          selector: getSelector(input),
          location: { x: rect.x, y: rect.y },
        });
      }
    }

    // Deduplicate by message and location
    const unique = errors.filter(
      (error, index, self) =>
        index ===
        self.findIndex(
          (e) =>
            e.message === error.message &&
            Math.abs(e.location.x - error.location.x) < 5 &&
            Math.abs(e.location.y - error.location.y) < 5
        )
    );

    return unique;
  });

  if (findings.length > 0) {
    logger.log(`Found ${findings.length} validation errors.`);
  } else {
    logger.log("No validation errors found.");
  }

  return findings;
}
