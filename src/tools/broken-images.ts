import { type Page } from "playwright-core";
import { createLogger } from "../utils/logger.ts";
import type { BrokenImageFinding } from "../types/index.ts";

const logger = createLogger("tool:broken-images");

export async function findBrokenImages(
  page: Page
): Promise<BrokenImageFinding[]> {
  logger.log("Scanning page for broken images...");


  const findings = await page.evaluate(async () => {
    // Helper to get a selector (embedded for browser context)
    const getSelector = (el: Element): string => {
      if (el.id) return `#${el.id}`;

      let path = el.tagName.toLowerCase();

      // 2. Fix CSS class splitting (filter empty strings)
      if (el.className && typeof el.className === 'string') {
        const classes = el.className.split(/\s+/).filter(c => c.length > 0);
        if (classes.length > 0) {
          path += `.${classes.join(".")}`;
        }
      }

      const parent = el.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter(
          (c) => c.tagName === el.tagName
        );
        if (siblings.length > 1) {
          const index = siblings.indexOf(el) + 1;
          path += `:nth-of-type(${index})`;
        }

        // Simplified parent path logic for brevity/robustness
        let parentPath = parent.tagName.toLowerCase();
        if (parent.id) {
          parentPath = `#${parent.id}`;
        } else if (parent.className && typeof parent.className === 'string') {
          const classes = parent.className.split(/\s+/).filter(c => c.length > 0);
          if (classes.length > 0) {
            parentPath += `.${classes.join(".")}`;
          }
        }
        path = `${parentPath} > ${path}`;
      }
      return path;
    };

    const images = Array.from(document.querySelectorAll("img"));
    const broken: any[] = [];

    for (const img of images) {
      if (!img.complete) {
        // Optional: You could log a warning here or return a "Loading..." status.
        // For now, we continue, but be aware these are skipped.
        continue;
      }

      const rect = img.getBoundingClientRect();
      const currentSrc = img.getAttribute("src") || "";
      const currentSrcset = img.getAttribute("srcset") || "";

      const result = {
        src: currentSrc,
        srcset: currentSrcset,
        alt: img.alt || "",
        selector: getSelector(img),
        location: { x: rect.x, y: rect.y },
        reason: "",
      };

      if (!result.src && !result.srcset) {
        result.reason = "Missing both 'src' and 'srcset' attributes";
        broken.push(result);
        continue;
      }

      if (img.complete && img.naturalWidth === 0) {
        result.reason = "Image failed to load (0 natural width)";
        broken.push(result);
      }
    }

    return broken;
  });

  findings.length > 0
    ? logger.log(`Found ${findings.length} broken images.`)
    : logger.log("No broken images found.");

  return findings;
}