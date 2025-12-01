import { chromium, type Browser, type Page } from "playwright-core";
import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";
import TurndownService from "turndown";
import { createLogger } from "../utils/logger.ts";

const logger = createLogger("scraper-service");

export class ScraperService {
  private browser: Browser | null = null;

  /**
   * Initialize the browser instance
   */
  private async initBrowser() {
    if (!this.browser) {
      logger.log("Launching Playwright browser...");
      this.browser = await chromium.launch({
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage", // Important for Docker
          "--disable-gpu",
        ],
      });
    }
    return this.browser;
  }

  /**
   * Scrape a URL and return the content as Markdown
   */
  async scrape(url: string): Promise<string> {
    let page: Page | null = null;

    try {
      const browser = await this.initBrowser();
      page = await browser.newPage();

      // Block unnecessary resources to save bandwidth and memory
      await page.route("**/*", (route) => {
        const resourceType = route.request().resourceType();
        if (
          ["image", "stylesheet", "font", "media", "other"].includes(
            resourceType
          )
        ) {
          return route.abort();
        }
        return route.continue();
      });

      logger.log(`Navigating to ${url}...`);

      // Navigate to the URL and wait for network to be idle (handles hydration)
      await page.goto(url, {
        waitUntil: "networkidle",
        timeout: 30000, // 30 seconds timeout
      });

      // Get the page content
      const content = await page.content();

      // Parse with JSDOM and Readability
      const dom = new JSDOM(content, { url });
      const reader = new Readability(dom.window.document);
      const article = reader.parse();

      if (!article) {
        throw new Error("Failed to parse article content");
      }

      // Convert to Markdown
      const turndownService = new TurndownService({
        headingStyle: "atx",
        codeBlockStyle: "fenced",
      });

      const markdown = turndownService.turndown(article.content || "");

      logger.log(`Successfully scraped ${url} (${markdown.length} chars)`);

      return markdown;
    } catch (error) {
      logger.error(`Error scraping ${url}:`, error);
      throw error;
    } finally {
      if (page) {
        await page.close();
      }
    }
  }

  /**
   * Close the browser instance
   */
  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}
