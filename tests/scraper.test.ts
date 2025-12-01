import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import { ScraperService } from "../src/services/scraper.service.ts";

describe("ScraperService", () => {
  let scraper: ScraperService;

  beforeAll(() => {
    scraper = new ScraperService();
  });

  afterAll(async () => {
    await scraper.close();
  });

  it("should scrape a URL and return markdown", async () => {
    // Use a simple, stable URL for testing
    const url = "https://example.com";
    const markdown = await scraper.scrape(url);

    console.log("Scraped Markdown:", markdown);

    expect(markdown).toBeDefined();
    expect(markdown).toContain("Example Domain");
    expect(typeof markdown).toBe("string");
    expect(markdown.length).toBeGreaterThan(0);
  });
});
