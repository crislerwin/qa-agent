import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { chromium, type Browser, type Page } from "playwright-core";
import { findBrokenImages } from "../../src/agent/tools/broken-images";

describe("findBrokenImages Tool", () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
    page = await browser.newPage();
  });

  afterAll(async () => {
    await browser.close();
  });

  test("should detect broken images", async () => {
    // Create an HTML page with mixed images
    const htmlContent = `
            <!DOCTYPE html>
            <html>
                <body>
                    <!-- 1. Valid Image (Base64 dot) -->
                    <img id="valid-img" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA6fptVAAAACklEQVR4nGNiAAAABgADNjd8qAAAAABJRU5ErkJggg==" alt="Valid Dot" />
                    
                    <!-- 2. Missing Src -->
                    <img id="missing-src" alt="Missing Src" />
                    
                    <!-- 3. Invalid URL / 404 (using non-existent domain/path) -->
                    <img id="broken-404" src="http://0.0.0.0:12345/non-existent.png" alt="Broken 404" />
                    
                    <!-- 4. Empty Src -->
                    <img id="empty-src" src="" alt="Empty Src" />
                </body>
            </html>
        `;

    await page.setContent(htmlContent);

    // Run the tool
    const findings = await findBrokenImages(page);

    // Expectations
    expect(findings.length).toBe(3);

    const missingSrc = findings.find((f) => f.selector === "#missing-src");
    expect(missingSrc).toBeDefined();
    expect(missingSrc?.reason).toContain("Missing 'src'");

    const broken404 = findings.find((f) => f.selector === "#broken-404");
    expect(broken404).toBeDefined();
    // Reason might be 0x0 dimensions
    expect(broken404?.reason).toContain("0x0 dimensions");

    const emptySrc = findings.find((f) => f.selector === "#empty-src");
    expect(emptySrc).toBeDefined();
    expect(emptySrc?.reason).toContain("Missing 'src'");
  });
});
