import { type Page } from "playwright-core";
import { createLogger } from "../utils/logger";
import type { LayoutAuditFinding, LayoutAuditConfig } from "../types/index";
import { captureLayoutFindingScreenshots, type ScreenshotConfig } from "./screenshot";

const logger = createLogger("tool:layout-audit");

/**
 * Skip tags that naturally have non-visual children (scripts, styles, etc.)
 * and intentionally hidden elements.
 */
const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "META", "LINK", "NOSCRIPT", "BASE", "HEAD"]);

export async function runLayoutAudit(
  page: Page,
  config: { maxElements?: number; heuristics?: string[]; screenshots?: ScreenshotConfig; sessionId?: string } = {}
): Promise<LayoutAuditFinding[]> {
  logger.log("Running layout audit...");
  const { maxElements = 300, heuristics } = config;

  const findings: LayoutAuditFinding[] = await page.evaluate(
    (opts: { maxElements: number; heuristics?: string[] }) => {
      const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "META", "LINK", "NOSCRIPT", "BASE", "HEAD"]);
      const results: LayoutAuditFinding[] = [];
      const all = Array.from(document.querySelectorAll("*")).filter(
        (el) => !SKIP_TAGS.has(el.tagName)
      ).slice(0, opts.maxElements);
      const enabled = (h: string) =>
        !opts.heuristics || opts.heuristics.length === 0 || opts.heuristics.includes(h);

      const getSelector = (el: Element): string => {
        if (el.id) return `#${el.id}`;
        if (el.className && typeof el.className === "string") {
          const cls = el.className.split(/\s+/).filter(Boolean).join(".");
          if (cls) return `${el.tagName.toLowerCase()}.${cls}`;
        }
        const tag = el.tagName.toLowerCase();
        if (el.parentElement) {
          const same = Array.from(el.parentElement.children).filter(
            (c) => c.tagName === el.tagName
          );
          if (same.length > 1) {
            const idx = same.indexOf(el) + 1;
            return `${el.parentElement.tagName.toLowerCase()} > ${tag}:nth-of-type(${idx})`;
          }
        }
        return tag;
      };

      // Track which parent-container flex rows we've already flagged for misalignment
      const flaggedMisalignedParents = new Set<Element>();

      for (const el of all) {
        if (!(el instanceof HTMLElement)) continue;

        const style = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        const vpW = window.innerWidth;
        const vpH = window.innerHeight;
        const selector = getSelector(el);

        // Skip explicitly hidden elements
        if (style.display === "none" || style.visibility === "hidden") continue;

        // ─── H2: invisible-interactive (ZERO-SIZE, before size skip) ───
        if (enabled("invisible-interactive")) {
          const interactive = ["BUTTON", "A", "INPUT", "SELECT", "TEXTAREA"].includes(el.tagName);
          if (interactive && rect.width === 0 && rect.height === 0) {
            results.push({
              type: "invisible-interactive",
              severity: "error",
              category: "layout",
              message: `Interactive element ${selector} has zero width and height (not clickable)`,
              selector,
            });
          }
        }

        // ─── H7: zero-size-parent (ZERO-SIZE, before size skip) ───
        if (enabled("zero-size-parent")) {
          if (
            style.display !== "contents" &&
            rect.width === 0 &&
            rect.height === 0 &&
            el.children.length > 0
          ) {
            results.push({
              type: "zero-size-container",
              severity: "error",
              category: "layout",
              message: `Container ${selector} has zero dimensions but contains ${el.children.length} children`,
              selector,
            });
          }
        }

        // Skip small decorative elements after zero-size heuristics
        if (rect.width < 3 && rect.height < 3) continue;

        // ─── H1: orphan-text ───
        if (enabled("orphan-text")) {
          const directText = Array.from(el.childNodes)
            .filter((n) => n.nodeType === Node.TEXT_NODE)
            .map((n) => n.textContent)
            .join("")
            .trim();
          const orphanParent =
            el.parentElement &&
            el.parentElement.tagName === "BODY";
          if (
            orphanParent &&
            el.children.length === 0 &&
            directText.length > 30
          ) {
            results.push({
              type: "orphan-text",
              severity: "warning",
              category: "layout",
              message: `Text node in ${selector} is directly under body without a proper block container`,
              selector,
            });
          }
        }

        // ─── H3: empty-container ───
        if (enabled("empty-container")) {
          const empty =
            el.children.length === 0 &&
            !(Array.from(el.childNodes).some(
              (n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim()
            ));
          const big = rect.width >= 10 && rect.height >= 10;
          if (empty && big) {
            const spacer =
              style.flex === "1" ||
              style.flexGrow === "1" ||
              parseFloat(style.minWidth) > 0 ||
              parseFloat(style.minHeight) > 0;
            if (!spacer) {
              results.push({
                type: "empty-container",
                severity: "info",
                category: "layout",
                message: `${selector} is an empty container (${Math.round(rect.width)}×${Math.round(rect.height)}px)`,
                selector,
              });
            }
          }
        }

        // ─── H4: misaligned-siblings (when THIS element is a flex CONTAINER) ───
        if (enabled("misaligned-siblings")) {
          if (style.display.includes("flex") && el.children.length >= 2) {
            if (!flaggedMisalignedParents.has(el)) {
              const children = Array.from(el.children).filter(
                (c) => c instanceof HTMLElement
              ) as HTMLElement[];
              // Check all pairs of siblings in this container
              for (let i = 0; i < children.length - 1; i++) {
                const a = children[i];
                const b = children[i + 1];
                const ra = a.getBoundingClientRect();
                const rb = b.getBoundingClientRect();
                const sameRow =
                  (style.flexDirection.includes("row") && Math.abs(ra.top - rb.top) < 5) ||
                  (style.flexDirection.includes("column") && Math.abs(ra.left - rb.left) < 5) ||
                  (Math.abs(ra.top - rb.top) < 5); // fallback
                if (sameRow && ra.height > 10 && rb.height > 10) {
                  const ratio =
                    Math.max(ra.height, rb.height) /
                    Math.min(ra.height, rb.height);
                  if (ratio > 4) {
                    results.push({
                      type: "misaligned-siblings",
                      severity: "info",
                      category: "layout",
                      message: `Flex children in ${selector} have very different heights (${Math.round(ra.height)}px vs ${Math.round(rb.height)}px)`,
                      selector,
                    });
                    flaggedMisalignedParents.add(el);
                    break;
                  }
                }
              }
            }
          }
        }

        // ─── H5: overlapping-elements ───
        if (enabled("overlapping-elements")) {
          if (style.position === "absolute" || style.position === "fixed") {
            const siblings = Array.from(el.parentElement?.children || []).filter(
              (s) => s !== el && s instanceof HTMLElement
            ) as HTMLElement[];
            for (const sib of siblings) {
              const sr = sib.getBoundingClientRect();
              const interX = Math.max(0, Math.min(rect.right, sr.right) - Math.max(rect.left, sr.left));
              const interY = Math.max(0, Math.min(rect.bottom, sr.bottom) - Math.max(rect.top, sr.top));
              const overlapArea = interX * interY;
              const minArea = Math.min(rect.width * rect.height, sr.width * sr.height);
              if (minArea > 0 && overlapArea / minArea > 0.5) {
                results.push({
                  type: "overlapping-elements",
                  severity: "warning",
                  category: "layout",
                  message: `Element ${selector} significantly overlaps sibling`,
                  selector,
                });
                break;
              }
            }
          }
        }

        // ─── H6: off-screen-element ───
        if (enabled("off-screen-element")) {
          if (style.position !== "fixed" && style.position !== "sticky") {
            const farOff =
              rect.bottom < -50 ||
              rect.top > vpH + 50 ||
              rect.right < -50 ||
              rect.left > vpW + 50;
            if (farOff && rect.width > 0 && rect.height > 0) {
              results.push({
                type: "off-screen-element",
                severity: "warning",
                category: "layout",
                message: `Element ${selector} is far outside the visible viewport`,
                selector,
              });
            }
          }
        }
      }

      return results;
    },
    { maxElements, heuristics }
  );

  logger.log(`Layout audit found ${findings.length} issues`);

  // Capture screenshots if enabled
  if (config.screenshots?.enabled && findings.length > 0) {
    logger.log("Capturing screenshots for layout findings...");
    const screenshotConfig: ScreenshotConfig = {
      enabled: true,
      outputDir: config.screenshots.outputDir || "./test-results/layout-audit",
      fullPage: true,
      highlightElements: config.screenshots.highlightElements ?? true,
      type: config.screenshots.type || "png",
    };

    const screenshotMap = await captureLayoutFindingScreenshots(
      page,
      findings,
      screenshotConfig,
      config.sessionId || "unknown"
    );

    // Attach screenshot paths to findings
    for (const [index, paths] of screenshotMap.entries()) {
      if (findings[index]) {
        if (paths.elementPath) {
          findings[index].screenshot = paths.elementPath;
        }
        if (paths.fullPagePath) {
          findings[index].fullPageScreenshot = paths.fullPagePath;
        }
      }
    }

    logger.log(`Screenshots captured for ${screenshotMap.size} findings`);
  }

  return findings;
}
