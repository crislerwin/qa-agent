import { type Page } from "playwright-core";
import { createLogger } from "../utils/logger.ts";

const logger = createLogger("tool:broken-images");

export interface BrokenImageFinding {
  src: string;
  alt: string;
  selector: string;
  reason: string;
  location: { x: number; y: number };
}

/**
 * Scans the current page for broken images.
 * Detects:
 * - HTTP errors (404, etc.)
 * - Invalid/Empty src
 * - Zero dimensions
 */
export async function findBrokenImages(
  page: Page
): Promise<BrokenImageFinding[]> {
  logger.log("Scanning page for broken images...");

  // We inject a script to check image properties in the browser context
  const findings = await page.evaluate(async () => {
    const images = Array.from(document.querySelectorAll("img"));
    const broken: any[] = [];

    for (const img of images) {
      const rect = img.getBoundingClientRect();

      // Helper to get a simple selector (best effort)
      // Helper to get a robust selector
      const getSelector = (el: Element): string => {
        if (el.id) return `#${el.id}`;

        let path = el.tagName.toLowerCase();
        if (el.className) {
          path += `.${el.className.split(" ").join(".")}`;
        }

        const parent = el.parentElement;
        if (parent) {
          // 1. Add sibling index for uniqueness within parent
          const siblings = Array.from(parent.children).filter(
            (c) => c.tagName === el.tagName
          );
          if (siblings.length > 1) {
            const index = siblings.indexOf(el) + 1;
            path += `:nth-of-type(${index})`;
          }

          // 2. Prepend parent selector for uniqueness across page structure
          let parentPath = parent.tagName.toLowerCase();
          if (parent.id) {
            parentPath = `#${parent.id}`;
          } else if (parent.className) {
            parentPath += `.${parent.className.split(" ").join(".")}`;
          }
          path = `${parentPath} > ${path}`;
        }
        return path;
      };

      const result = {
        src: img.getAttribute("src") || "",
        alt: img.alt || "",
        selector: getSelector(img),
        location: { x: rect.x, y: rect.y },
        reason: "",
      };

      // Check 1: Missing src
      if (!result.src) {
        result.reason = "Missing 'src' attribute";
        broken.push(result);
        continue;
      }

      // Check 2: Zero dimensions (loaded but invisible/broken)
      // If it's not complete, it might be loading, but if it is complete and 0x0, it's likely broken
      if (img.complete && (img.naturalWidth === 0 || img.naturalHeight === 0)) {
        result.reason =
          "Image loaded with 0x0 dimensions (failed to decode or 404)";
        broken.push(result);
        continue;
      }

      // Check 3: Error event handler (harder to catch post-load, but we can check if complete is false after wait?)
      // Actually, naturalWidth/Height being 0 is the reliable indicator for "failed to load" in most browsers
      // if the image tag has been rendered.

      // Double check with fetch if we suspect it (optional, but robust)
      // For now, naturalWidth === 0 is the standard "broken image" check for existing DOM elements.

      // One edge case: image is complete = false (stuck loading)
      // We might want to wait? For this challenge, we assume page is mostly settled.
    }

    return broken;
  });

  if (findings.length > 0) {
    logger.log(`Found ${findings.length} broken images.`);
  } else {
    logger.log("No broken images found.");
  }

  return findings;
}
