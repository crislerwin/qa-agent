import { type Page } from "playwright-core";
import { createLogger } from "../utils/logger";
import { mkdir } from "fs/promises";
import { existsSync } from "fs";
import { dirname } from "path";

const logger = createLogger("tool:screenshot");

export interface ScreenshotConfig {
  enabled: boolean;
  outputDir?: string;
  fullPage?: boolean;
  highlightElements?: boolean;
  quality?: number;
  type?: "png" | "jpeg";
}

export interface ScreenshotResult {
  fullPagePath?: string;
  elementPath?: string;
  success: boolean;
  error?: string;
}

/**
 * Ensures the output directory exists
 */
async function ensureDir(dir: string): Promise<void> {
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
}

/**
 * Generates a safe filename from a selector
 */
function generateFilename(selector: string, index: number, suffix: string): string {
  // Clean selector for filename: remove special chars, limit length
  const clean = selector
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .substring(0, 50);
  const timestamp = Date.now();
  return `finding_${index}_${clean}_${suffix}_${timestamp}.png`;
}

/**
 * Highlights an element on the page with a colored border
 * Returns true if element was found and highlighted
 */
async function highlightElement(
  page: Page,
  selector: string,
  color: string = "#FF0000"
): Promise<boolean> {
  try {
    // Try to find and highlight the element
    const result = await page.evaluate(
      ({ sel, highlightColor }: { sel: string; highlightColor: string }) => {
        const el = document.querySelector(sel);
        if (!el || !(el instanceof HTMLElement)) return false;
        
        // Store original styles to restore later
        const originalOutline = el.style.outline;
        const originalOutlineOffset = el.style.outlineOffset;
        const originalPosition = el.style.position;
        const originalZIndex = el.style.zIndex;
        
        // Apply highlight
        el.style.outline = `4px solid ${highlightColor}`;
        el.style.outlineOffset = "2px";
        el.style.position = "relative";
        el.style.zIndex = "99999";
        
        // Store originals for restoration
        (el as any).__screenshotOriginalStyles = {
          outline: originalOutline,
          outlineOffset: originalOutlineOffset,
          position: originalPosition,
          zIndex: originalZIndex,
        };
        
        // Scroll element into view
        el.scrollIntoView({ behavior: "instant", block: "center", inline: "center" });
        
        return true;
      },
      { sel: selector, highlightColor: color }
    );
    
    return result;
  } catch (e) {
    logger.warn(`Failed to highlight element ${selector}:`, e);
    return false;
  }
}

/**
 * Removes highlight from an element
 */
async function removeHighlight(page: Page, selector: string): Promise<void> {
  try {
    await page.evaluate((sel: string) => {
      const el = document.querySelector(sel);
      if (!el || !(el instanceof HTMLElement)) return;
      
      const original = (el as any).__screenshotOriginalStyles;
      if (original) {
        el.style.outline = original.outline;
        el.style.outlineOffset = original.outlineOffset;
        el.style.position = original.position;
        el.style.zIndex = original.zIndex;
        delete (el as any).__screenshotOriginalStyles;
      }
    }, selector);
  } catch (e) {
    // Non-critical, just log
    logger.log(`Failed to remove highlight from ${selector}:`, e);
  }
}

/**
 * Captures a full-page screenshot
 */
export async function captureFullPageScreenshot(
  page: Page,
  config: ScreenshotConfig,
  filename: string
): Promise<string | undefined> {
  if (!config.enabled) return undefined;
  
  try {
    await ensureDir(config.outputDir);
    const filepath = `${config.outputDir}/${filename}`;
    
    await page.screenshot({
      path: filepath,
      fullPage: config.fullPage,
      type: config.type || "png",
    });
    
    logger.log(`Full-page screenshot saved: ${filepath}`);
    return filepath;
  } catch (e) {
    logger.error("Failed to capture full-page screenshot:", e);
    return undefined;
  }
}

/**
 * Captures a screenshot of a specific element
 */
export async function captureElementScreenshot(
  page: Page,
  selector: string,
  config: ScreenshotConfig,
  filename: string,
  severity: "error" | "warning" | "info" = "warning"
): Promise<string | undefined> {
  if (!config.enabled) return undefined;
  
  // Color-code by severity
  const colors = {
    error: "#FF0000",    // Red
    warning: "#FFA500",  // Orange
    info: "#0080FF",     // Blue
  };
  
  let highlighted = false;
  
  try {
    await ensureDir(config.outputDir);
    const filepath = `${config.outputDir}/${filename}`;
    
    // Try to highlight the element
    if (config.highlightElements) {
      highlighted = await highlightElement(page, selector, colors[severity]);
      // Small delay to ensure highlight is rendered
      await page.waitForTimeout(100);
    }
    
    // Try to capture element-specific screenshot first
    try {
      const element = page.locator(selector).first();
      await element.screenshot({
        path: filepath,
        type: config.type || "png",
      });
      logger.log(`Element screenshot saved: ${filepath}`);
      return filepath;
    } catch (elementError) {
      // Fallback: capture viewport screenshot with scroll
      logger.log(`Element screenshot failed for ${selector}, falling back to viewport`);
      await page.screenshot({
        path: filepath,
        fullPage: false,
        type: config.type || "png",
      });
      logger.log(`Viewport screenshot saved: ${filepath}`);
      return filepath;
    }
  } catch (e) {
    logger.error(`Failed to capture screenshot for ${selector}:`, e);
    return undefined;
  } finally {
    // Always clean up highlight
    if (highlighted && config.highlightElements) {
      await removeHighlight(page, selector);
    }
  }
}

/**
 * Captures screenshots for multiple layout findings
 * Returns a map of finding index to screenshot paths
 */
export async function captureLayoutFindingScreenshots(
  page: Page,
  findings: Array<{ selector?: string; severity: "error" | "warning" | "info"; type: string }>,
  config: ScreenshotConfig,
  sessionId: string
): Promise<Map<number, { elementPath?: string; fullPagePath?: string }>> {
  const screenshotMap = new Map<number, { elementPath?: string; fullPagePath?: string }>();
  
  if (!config.enabled || findings.length === 0) {
    return screenshotMap;
  }
  
  // Ensure session directory exists
  const sessionDir = `${config.outputDir}/${sessionId}`;
  await ensureDir(sessionDir);
  
  // Capture one full-page screenshot for reference
  const fullPageFilename = `layout_audit_full_${Date.now()}.png`;
  const fullPagePath = await captureFullPageScreenshot(
    page,
    { ...config, outputDir: sessionDir },
    fullPageFilename
  );
  
  // Capture individual element screenshots
  for (let i = 0; i < findings.length; i++) {
    const finding = findings[i];
    const result: { elementPath?: string; fullPagePath?: string } = {};
    
    if (fullPagePath) {
      result.fullPagePath = fullPagePath;
    }
    
    if (finding.selector) {
      const filename = generateFilename(finding.selector, i, finding.type);
      const elementPath = await captureElementScreenshot(
        page,
        finding.selector,
        { ...config, outputDir: sessionDir },
        filename,
        finding.severity
      );
      
      if (elementPath) {
        result.elementPath = elementPath;
      }
    }
    
    screenshotMap.set(i, result);
    
    // Small delay between screenshots to avoid overwhelming the browser
    if (i < findings.length - 1) {
      await page.waitForTimeout(50);
    }
  }
  
  return screenshotMap;
}

export default {
  captureFullPageScreenshot,
  captureElementScreenshot,
  captureLayoutFindingScreenshots,
};
