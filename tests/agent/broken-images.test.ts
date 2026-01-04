import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { chromium, type Browser, type Page } from "playwright-core";
import { join } from "path";
import { findBrokenImages } from "../../src/tools/broken-images.ts";

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

  test("should generate unique selectors for siblings without IDs", async () => {
    const htmlContent = `
        <body>
            <div id="container">
                <img src="broken1.png" class="test-img" />
                <img src="broken2.png" class="test-img" />
            </div>
        </body>
    `;
    await page.setContent(htmlContent);
    const findings = await findBrokenImages(page);

    expect(findings.length).toBe(2);
    // Expect unique selectors
    const selectors = findings.map((f) => f.selector);
    // They should look like img.test-img:nth-of-type(1) and img.test-img:nth-of-type(2)
    // Or at least be different
    expect(selectors[0]).not.toBe(selectors[1]);
    expect(selectors[0]).toContain(":nth-of-type");
  });

  test("should report multiple instances of the same broken image", async () => {
    const htmlContent = `
        <body>
            <div id="container">
                <img src="duplicate.png" class="test-img" />
                <img src="duplicate.png" class="test-img" />
            </div>
        </body>
    `;
    await page.setContent(htmlContent);
    const findings = await findBrokenImages(page);

    expect(findings.length).toBe(2);
    expect(findings[0].src).toBe("duplicate.png");
    expect(findings[1].src).toBe("duplicate.png");

    expect(findings[0].selector).not.toBe(findings[1].selector);
  });

  test("should produce distinct selectors for images in different parents", async () => {
    const htmlContent = `
        <body>
            <div class="parent-a">
                <img src="common-broken.png" />
            </div>
            <div class="parent-b">
                <img src="common-broken.png" />
            </div>
        </body>
    `;
    await page.setContent(htmlContent);
    const findings = await findBrokenImages(page);

    expect(findings.length).toBe(2);
    expect(findings[0].selector).not.toBe(findings[1].selector);
  });
});
