import { type Page } from "playwright-core";
import { createLogger } from "../utils/logger.ts";

const logger = createLogger("tool:crawler");

export async function crawlSite(
  page: Page,
  baseUrl: string,
  maxPages: number = 20
): Promise<string[]> {
  const visited = new Set<string>();
  const queue: string[] = [baseUrl];
  const foundUrls: Set<string> = new Set();

  // Normalize base URL
  const baseObj = new URL(baseUrl);
  const baseHostname = baseObj.hostname;

  logger.log(
    `Starting Playwright crawl of ${baseUrl} (Max pages: ${maxPages})...`
  );

  while (queue.length > 0 && visited.size < maxPages) {
    const currentUrl = queue.shift()!;
    if (visited.has(currentUrl)) continue;

    try {
      // Navigate to the page
      // logger.log(`Crawling: ${currentUrl}`);
      visited.add(currentUrl);
      foundUrls.add(currentUrl);

      await page.goto(currentUrl, {
        waitUntil: "domcontentloaded",
        timeout: 10000,
      });

      // Auto-scroll to trigger lazy loading
      try {
        await page.evaluate(async () => {
          await new Promise<void>((resolve) => {
            let totalHeight = 0;
            const distance = 100;
            const timer = setInterval(() => {
              const scrollHeight = document.body.scrollHeight;
              window.scrollBy(0, distance);
              totalHeight += distance;
              if (totalHeight >= scrollHeight) {
                clearInterval(timer);
                resolve();
              }
            }, 100);
          });
        });
      } catch (e) {}

      // Give SPA a moment to render links if network is idle
      try {
        await page
          .waitForLoadState("networkidle", { timeout: 3000 })
          .catch(() => {});
      } catch (e) {}

      // Extract hrefs
      const hrefs = await page.evaluate(() => {
        return Array.from(document.querySelectorAll("a"))
          .map((a) => a.href)
          .filter(Boolean);
      });

      for (const href of hrefs) {
        try {
          const urlObj = new URL(href, currentUrl);

          // Only remove hash if it's NOT a route (HashRouter uses #/)
          if (!urlObj.hash.startsWith("#/")) {
            urlObj.hash = "";
          }

          const cleanUrl = urlObj.href;

          if (
            urlObj.hostname === baseHostname &&
            !visited.has(cleanUrl) &&
            !queue.includes(cleanUrl) &&
            !foundUrls.has(cleanUrl)
          ) {
            queue.push(cleanUrl);
            foundUrls.add(cleanUrl);
          }
        } catch (e) {
          // invalid url
        }
      }
    } catch (e) {
      logger.error(`Error crawling ${currentUrl}: ${e}`);
    }
  }

  logger.log(`Crawl complete. Discovered ${foundUrls.size} unique pages.`);
  return Array.from(foundUrls);
}
