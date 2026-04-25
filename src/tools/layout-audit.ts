import { type Page } from "playwright-core";
import { createLogger } from "../utils/logger";
import type { LayoutAuditFinding } from "../types/index";

const logger = createLogger("tool:layout-audit");

/**
 * Skip tags that naturally have non-visual children (scripts, styles, etc.)
 * and intentionally hidden elements.
 */
const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "META", "LINK", "NOSCRIPT", "BASE", "HEAD"]);

export async function runLayoutAudit(
  page: Page,
  maxElements = 300,
  heuristics?: string[]
): Promise<LayoutAuditFinding[]> {
  logger.log("Running layout audit...");

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

      for (const el of all) {
        if (!(el instanceof HTMLElement)) continue;

        const style = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        const vpW = window.innerWidth;
        const vpH = window.innerHeight;
        const selector = getSelector(el);

        // Skip intentionally hidden elements
        if (style.display === "none" || style.visibility === "hidden") continue;
        // Skip small decorative elements (less than 3px) to reduce noise
        if (rect.width < 3 && rect.height < 3) continue;

        // ─── H1: orphan-text ───
        if (enabled("orphan-text")) {
          const orphanParent =
            el.parentElement &&
            ["BODY", "MAIN"].includes(el.parentElement.tagName);
          if (
            orphanParent &&
            el.children.length === 0 &&
            style.display.includes("inline") &&
            (el.textContent?.trim().length || 0) > 30
          ) {
            results.push({
              type: "orphan-text",
              severity: "warning",
              category: "layout",
              message: `Text in ${selector} is directly under ${el.parentElement.tagName.toLowerCase()} without a proper block container`,
              selector,
            });
          }
        }

        // ─── H2: invisible-interactive ───
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

        // ─── H3: empty-container ───
        if (enabled("empty-container")) {
          const empty = el.children.length === 0 && !(el.textContent?.trim());
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

        // ─── H4: misaligned-siblings (flex) ───
        if (enabled("misaligned-siblings")) {
          if (style.display.includes("flex") && el.parentElement) {
            const siblings = Array.from(el.parentElement.children).filter(
              (c) => c !== el && c instanceof HTMLElement
            ) as HTMLElement[];
            for (const sib of siblings) {
              const sr = sib.getBoundingClientRect();
              const sameRow = Math.abs(rect.top - sr.top) < 5;
              if (sameRow && rect.height > 10 && sr.height > 10) {
                const ratio =
                  Math.max(rect.height, sr.height) / Math.min(rect.height, sr.height);
                if (ratio > 4) {
                  results.push({
                    type: "misaligned-siblings",
                    severity: "info",
                    category: "layout",
                    message: `Flex siblings in ${selector} have very different heights (${Math.round(rect.height)}px vs ${Math.round(sr.height)}px)`,
                    selector,
                  });
                  break;
                }
              }
            }
          }
        }

        // ─── H5: overlapping-elements (significant overlap only) ───
        if (enabled("overlapping")) {
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

        // ─── H6: off-screen ───
        if (enabled("off-screen")) {
          if (style.position !== "fixed" && style.position !== "sticky") {
            const farOff =
              rect.bottom < -50 ||
              rect.top > vpH + 50 ||
              rect.right < -50 ||
              rect.left > vpW + 50;
            if (
              farOff &&
              rect.width > 0 &&
              rect.height > 0
            ) {
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

        // ─── H7: zero-size-parent ───
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
      }

      return results;
    },
    { maxElements, heuristics }
  );

  logger.log(`Layout audit found ${findings.length} issues`);
  return findings;
}
