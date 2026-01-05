import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { chromium, type Browser, type Page } from "playwright-core";
import { NetworkMonitor } from "../../src/tools/network-errors.ts";

describe("Network Errors Monitor", () => {
  let browser: Browser;
  let page: Page;
  let monitor: NetworkMonitor;

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
  });

  afterAll(async () => {
    await browser.close();
  });

  test("should capture 404 errors", async () => {
    page = await browser.newPage();
    monitor = new NetworkMonitor(page);

    // Navigate to a page that tries to load a non-existent resource
    await page.setContent(`
      <html>
        <body>
          <script src="https://nonexistent-test-domain-12345.com/script.js"></script>
        </body>
      </html>
    `);
    await page.waitForTimeout(1500);

    const errors = monitor.getErrors();

    // Should capture the failed request
    expect(errors.length).toBeGreaterThan(0);
    const failedRequest = errors.find((e) => e.url.includes("nonexistent"));
    expect(failedRequest).toBeDefined();

    await page.close();
  });

  test("should capture failed requests", async () => {
    page = await browser.newPage();
    monitor = new NetworkMonitor(page);

    // Try to load from a definitely non-existent domain
    await page.setContent(`
      <html>
        <body>
          <img src='https://this-domain-definitely-does-not-exist-99999.com/image.png' />
        </body>
      </html>
    `);
    await page.waitForTimeout(1500);

    const errors = monitor.getErrors();

    // Should capture the failed request
    expect(errors.length).toBeGreaterThan(0);

    await page.close();
  });

  test("should not capture successful requests", async () => {
    page = await browser.newPage();
    monitor = new NetworkMonitor(page);

    // Use a simple data URL which will succeed
    await page.goto("data:text/html,<html><body>Success</body></html>");
    await page.waitForTimeout(500);

    const errors = monitor.getErrors();

    // Should not have any errors for successful requests
    const successErrors = errors.filter(
      (e) => e.status >= 200 && e.status < 400
    );
    expect(successErrors.length).toBe(0);

    await page.close();
  });

  test("should clear errors after retrieval", async () => {
    page = await browser.newPage();
    monitor = new NetworkMonitor(page);

    await page.goto(
      "data:text/html,<html><body><img src='https://httpstat.us/404' /></body></html>"
    );
    await page.waitForTimeout(2000);

    const errors1 = monitor.getErrors();
    const initialCount = errors1.length;

    const errors2 = monitor.getErrors();
    expect(errors2.length).toBe(0);

    await page.close();
  });

  test("should peek errors without clearing", async () => {
    page = await browser.newPage();
    monitor = new NetworkMonitor(page);

    await page.goto(
      "data:text/html,<html><body><img src='https://httpstat.us/404' /></body></html>"
    );
    await page.waitForTimeout(2000);

    const peeked1 = monitor.peekErrors();
    const count1 = peeked1.length;

    const peeked2 = monitor.peekErrors();
    expect(peeked2.length).toBe(count1);

    await page.close();
  });

  test("should handle request failures", async () => {
    page = await browser.newPage();
    monitor = new NetworkMonitor(page);

    // Try to load from a definitely non-existent domain
    await page.goto(
      "data:text/html,<html><body><img src='https://this-domain-definitely-does-not-exist-12345.com/image.png' /></body></html>"
    );
    await page.waitForTimeout(2000);

    const errors = monitor.getErrors();

    // Should capture the failed request
    expect(errors.length).toBeGreaterThan(0);
    const failedRequest = errors.find(
      (e) => e.status === 0 || e.statusText.includes("failed")
    );
    expect(failedRequest).toBeDefined();

    await page.close();
  });

  test("should capture multiple network errors", async () => {
    page = await browser.newPage();
    monitor = new NetworkMonitor(page);

    await page.goto(
      "data:text/html,<html><body><img src='https://httpstat.us/404' /><img src='https://httpstat.us/500' /></body></html>"
    );
    await page.waitForTimeout(3000);

    const errors = monitor.getErrors();

    expect(errors.length).toBeGreaterThanOrEqual(2);

    await page.close();
  });

  test("should include page URL in findings", async () => {
    page = await browser.newPage();
    monitor = new NetworkMonitor(page);

    const testUrl =
      "data:text/html,<html><body><img src='https://httpstat.us/404' /></body></html>";
    await page.goto(testUrl);
    await page.waitForTimeout(2000);

    const errors = monitor.getErrors();

    if (errors.length > 0) {
      expect(errors[0]).toHaveProperty("pageUrl");
      expect(errors[0].pageUrl).toBeTruthy();
    }

    await page.close();
  });
});
