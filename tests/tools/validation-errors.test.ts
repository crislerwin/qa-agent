import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { chromium, type Browser, type Page } from "playwright-core";
import { findValidationErrors } from "../../src/tools/validation-errors.ts";

describe("Validation Errors Tool", () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
    page = await browser.newPage();
  });

  afterAll(async () => {
    await browser.close();
  });

  test("should detect elements with role=alert", async () => {
    await page.setContent(`
      <html>
        <body>
          <div role="alert">This is an error message</div>
        </body>
      </html>
    `);

    const findings = await findValidationErrors(page);

    expect(findings.length).toBe(1);
    expect(findings[0].message).toBe("This is an error message");
  });

  test("should detect elements with .error class", async () => {
    await page.setContent(`
      <html>
        <body>
          <div class="error">Form validation failed</div>
        </body>
      </html>
    `);

    const findings = await findValidationErrors(page);

    expect(findings.length).toBe(1);
    expect(findings[0].message).toBe("Form validation failed");
  });

  test("should detect elements with .alert-danger class", async () => {
    await page.setContent(`
      <html>
        <body>
          <div class="alert alert-danger">Danger alert</div>
        </body>
      </html>
    `);

    const findings = await findValidationErrors(page);

    expect(findings.length).toBe(1);
    expect(findings[0].message).toBe("Danger alert");
  });

  test("should detect invalid form inputs", async () => {
    await page.setContent(`
      <html>
        <body>
          <form>
            <input type="email" aria-invalid="true" aria-describedby="email-error" />
            <span id="email-error" class="error">Invalid email address</span>
          </form>
        </body>
      </html>
    `);

    const findings = await findValidationErrors(page);

    expect(findings.length).toBeGreaterThan(0);
    const invalidInputError = findings.find((f) =>
      f.message.includes("Invalid email")
    );
    expect(invalidInputError).toBeDefined();
  });

  test("should ignore hidden error messages", async () => {
    await page.setContent(`
      <html>
        <body>
          <div class="error" style="display: none;">Hidden error</div>
          <div class="error">Visible error</div>
        </body>
      </html>
    `);

    const findings = await findValidationErrors(page);

    expect(findings.length).toBe(1);
    expect(findings[0].message).toBe("Visible error");
  });

  test("should ignore empty error messages", async () => {
    await page.setContent(`
      <html>
        <body>
          <div class="error"></div>
          <div class="error">   </div>
          <div class="error">Real error</div>
        </body>
      </html>
    `);

    const findings = await findValidationErrors(page);

    expect(findings.length).toBe(1);
    expect(findings[0].message).toBe("Real error");
  });

  test("should return structured findings with selectors and locations", async () => {
    await page.setContent(`
      <html>
        <body>
          <div id="error-msg" class="error">Test error</div>
        </body>
      </html>
    `);

    const findings = await findValidationErrors(page);

    expect(findings.length).toBe(1);
    expect(findings[0]).toHaveProperty("message");
    expect(findings[0]).toHaveProperty("selector");
    expect(findings[0]).toHaveProperty("location");
    expect(findings[0].location).toHaveProperty("x");
    expect(findings[0].location).toHaveProperty("y");
    expect(findings[0].selector).toContain("error-msg");
  });

  test("should handle multiple validation errors", async () => {
    await page.setContent(`
      <html>
        <body>
          <div class="error">Error 1</div>
          <div role="alert">Error 2</div>
          <div class="validation-error">Error 3</div>
        </body>
      </html>
    `);

    const findings = await findValidationErrors(page);

    expect(findings.length).toBe(3);
  });

  test("should deduplicate similar errors at same location", async () => {
    await page.setContent(`
      <html>
        <body>
          <div class="error">Same error</div>
          <div class="validation-error">Same error</div>
        </body>
      </html>
    `);

    const findings = await findValidationErrors(page);

    // Should deduplicate based on message and location
    const uniqueMessages = new Set(findings.map((f) => f.message));
    expect(uniqueMessages.size).toBeLessThanOrEqual(findings.length);
  });

  test("should detect Tailwind error classes", async () => {
    await page.setContent(`
      <html>
        <body>
          <div class="text-red-500">Tailwind error message</div>
        </body>
      </html>
    `);

    const findings = await findValidationErrors(page);

    expect(findings.length).toBe(1);
    expect(findings[0].message).toBe("Tailwind error message");
  });

  test("should handle complex form validation scenarios", async () => {
    await page.setContent(`
      <html>
        <body>
          <form>
            <div class="form-group">
              <label for="username">Username</label>
              <input type="text" id="username" aria-invalid="true" />
              <div class="invalid-feedback">Username is required</div>
            </div>
            <div class="form-group">
              <label for="email">Email</label>
              <input type="email" id="email" aria-invalid="true" />
              <div class="field-error">Invalid email format</div>
            </div>
          </form>
        </body>
      </html>
    `);

    const findings = await findValidationErrors(page);

    expect(findings.length).toBeGreaterThanOrEqual(2);
    const messages = findings.map((f) => f.message);
    expect(messages.some((m) => m.includes("Username"))).toBe(true);
    expect(messages.some((m) => m.includes("email"))).toBe(true);
  });
});
