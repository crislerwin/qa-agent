import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { chromium, type Browser, type Page } from "playwright-core";
import { ConsoleMonitor } from "../../src/tools/console-errors.ts";

describe("Console Errors Monitor", () => {
  let browser: Browser;
  let page: Page;
  let monitor: ConsoleMonitor;

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
  });

  afterAll(async () => {
    await browser.close();
  });

  test("should capture console errors", async () => {
    page = await browser.newPage();
    monitor = new ConsoleMonitor(page);

    await page.setContent(`
      <html>
        <body>
          <script>
            console.error("Test error message");
          </script>
        </body>
      </html>
    `);

    await page.waitForTimeout(500);

    const errors = monitor.getErrors();

    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].type).toBe("error");
    expect(errors[0].message).toContain("Test error message");
    expect(errors[0]).toHaveProperty("url");
    expect(errors[0]).toHaveProperty("timestamp");

    await page.close();
  });

  test("should capture console warnings", async () => {
    page = await browser.newPage();
    monitor = new ConsoleMonitor(page);

    await page.setContent(`
      <html>
        <body>
          <script>
            console.warn("Test warning message");
          </script>
        </body>
      </html>
    `);

    await page.waitForTimeout(500);

    const errors = monitor.getErrors();

    const warnings = errors.filter((e) => e.type === "warning");
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0].message).toContain("Test warning message");

    await page.close();
  });

  test("should not capture console.log messages", async () => {
    page = await browser.newPage();
    monitor = new ConsoleMonitor(page);

    await page.setContent(`
      <html>
        <body>
          <script>
            console.log("This should not be captured");
          </script>
        </body>
      </html>
    `);

    await page.waitForTimeout(500);

    const errors = monitor.getErrors();

    expect(errors.length).toBe(0);

    await page.close();
  });

  test("should capture page errors (uncaught exceptions)", async () => {
    page = await browser.newPage();
    monitor = new ConsoleMonitor(page);

    await page.setContent(`
      <html>
        <body>
          <script>
            throw new Error("Uncaught exception");
          </script>
        </body>
      </html>
    `);

    await page.waitForTimeout(500);

    const errors = monitor.getErrors();

    expect(errors.length).toBeGreaterThan(0);
    const pageError = errors.find((e) =>
      e.message.includes("Uncaught exception")
    );
    expect(pageError).toBeDefined();
    if (pageError) {
      expect(pageError.type).toBe("error");
    }

    await page.close();
  });

  test("should clear errors after retrieval", async () => {
    page = await browser.newPage();
    monitor = new ConsoleMonitor(page);

    await page.setContent(`
      <html>
        <body>
          <script>
            console.error("Error 1");
          </script>
        </body>
      </html>
    `);

    await page.waitForTimeout(500);

    const errors1 = monitor.getErrors();
    expect(errors1.length).toBeGreaterThan(0);

    const errors2 = monitor.getErrors();
    expect(errors2.length).toBe(0);

    await page.close();
  });

  test("should peek errors without clearing", async () => {
    page = await browser.newPage();
    monitor = new ConsoleMonitor(page);

    await page.setContent(`
      <html>
        <body>
          <script>
            console.error("Error for peek");
          </script>
        </body>
      </html>
    `);

    await page.waitForTimeout(500);

    const peeked = monitor.peekErrors();
    expect(peeked.length).toBeGreaterThan(0);

    const peeked2 = monitor.peekErrors();
    expect(peeked2.length).toBe(peeked.length);

    await page.close();
  });

  test("should handle multiple errors", async () => {
    page = await browser.newPage();
    monitor = new ConsoleMonitor(page);

    await page.setContent(`
      <html>
        <body>
          <script>
            console.error("Error 1");
            console.warn("Warning 1");
            console.error("Error 2");
          </script>
        </body>
      </html>
    `);

    await page.waitForTimeout(500);

    const errors = monitor.getErrors();

    expect(errors.length).toBe(3);

    await page.close();
  });
});
