import { type Page } from "playwright-core";
import { createLogger } from "../utils/logger";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";
import { mkdir, readFile, writeFile, access, readdir } from "fs/promises";
import { existsSync } from "fs";
import { dirname, join, basename } from "path";
import { createHash } from "crypto";

const logger = createLogger("tool:visual-regression");

export interface ViewportConfig {
  width: number;
  height: number;
  name: string;
}

export interface VisualRegressionConfig {
  enabled: boolean;
  baselineDir: string;
  currentDir: string;
  diffDir: string;
  viewports: ViewportConfig[];
  threshold: number; // Pixel difference threshold (0-1)
  pixelmatchThreshold: number; // Sensitivity (0-1, lower = more strict)
  captureFullPage: boolean;
  generateDiffImages: boolean;
}

export interface VisualRegressionResult {
  url: string;
  viewport: ViewportConfig;
  baselineExists: boolean;
  baselinePath?: string;
  currentPath: string;
  diffPath?: string;
  match: boolean;
  diffPercentage: number;
  diffPixelCount: number;
  isNewBaseline: boolean;
}

interface ScreenshotPaths {
  baseline: string;
  current: string;
  diff: string;
}

/**
 * Generates paths for screenshots based on URL, viewport, and directories
 */
function generateScreenshotPaths(
  url: string,
  viewport: ViewportConfig,
  config: VisualRegressionConfig
): ScreenshotPaths {
  // Create a safe filename from URL
  const urlHash = createHash("sha256").update(url).digest("hex").substring(0, 16);
  const urlSlug = url
    .replace(/^https?:\/\//, "")
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .substring(0, 50);
  
  const baseName = `${urlSlug}_${urlHash}_${viewport.name}_${viewport.width}x${viewport.height}`;
  
  return {
    baseline: join(config.baselineDir, `${baseName}.png`),
    current: join(config.currentDir, `${baseName}.png`),
    diff: join(config.diffDir, `${baseName}_diff.png`),
  };
}

/**
 * Ensures directory exists
 */
async function ensureDir(dir: string): Promise<void> {
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
}

/**
 * Checks if a file exists
 */
async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Captures a screenshot at the specified viewport
 */
async function captureScreenshot(
  page: Page,
  viewport: ViewportConfig,
  outputPath: string,
  fullPage: boolean
): Promise<void> {
  // Set viewport size
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  
  // Wait for any layout shifts to settle
  await page.waitForTimeout(500);
  
  // Ensure directory exists
  await ensureDir(dirname(outputPath));
  
  // Capture screenshot
  await page.screenshot({
    path: outputPath,
    fullPage,
  });
  
  logger.log(`Screenshot captured: ${outputPath} (${viewport.name}: ${viewport.width}x${viewport.height})`);
}

/**
 * Compares two images using pixelmatch
 */
async function compareImages(
  baselinePath: string,
  currentPath: string,
  diffPath: string,
  threshold: number
): Promise<{ match: boolean; diffPixelCount: number; diffPercentage: number }> {
  const baselineImg = PNG.sync.read(await readFile(baselinePath));
  const currentImg = PNG.sync.read(await readFile(currentPath));
  
  const { width, height } = baselineImg;
  
  // Handle different image sizes
  if (width !== currentImg.width || height !== currentImg.height) {
    logger.warn(`Image size mismatch: baseline ${width}x${height} vs current ${currentImg.width}x${currentImg.height}`);
    return {
      match: false,
      diffPixelCount: -1,
      diffPercentage: 100,
    };
  }
  
  // Create diff image
  const diffImg = new PNG({ width, height });
  
  // Run pixel comparison
  const diffPixelCount = pixelmatch(
    baselineImg.data,
    currentImg.data,
    diffImg.data,
    width,
    height,
    {
      threshold: threshold, // Pixel threshold (0-1)
      includeAA: false, // Ignore anti-aliased pixels
    }
  );
  
  // Calculate percentage
  const totalPixels = width * height;
  const diffPercentage = (diffPixelCount / totalPixels) * 100;
  
  // Save diff image
  await ensureDir(dirname(diffPath));
  await writeFile(diffPath, PNG.sync.write(diffImg));
  
  return {
    match: diffPixelCount === 0,
    diffPixelCount,
    diffPercentage,
  };
}

/**
 * Runs visual regression test for a page
 */
export async function runVisualRegression(
  page: Page,
  url: string,
  config: VisualRegressionConfig
): Promise<VisualRegressionResult[]> {
  if (!config.enabled) {
    logger.log("Visual regression disabled, skipping");
    return [];
  }

  logger.info(`Running visual regression for: ${url}`);
  
  const results: VisualRegressionResult[] = [];
  
  // Ensure all directories exist
  await ensureDir(config.baselineDir);
  await ensureDir(config.currentDir);
  await ensureDir(config.diffDir);
  
  // Store original viewport to restore later
  const originalViewport = page.viewportSize();
  
  for (const viewport of config.viewports) {
    const paths = generateScreenshotPaths(url, viewport, config);
    
    // Capture current screenshot
    await captureScreenshot(page, viewport, paths.current, config.captureFullPage);
    
    // Check if baseline exists
    const baselineExists = await fileExists(paths.baseline);
    
    let result: VisualRegressionResult;
    
    if (baselineExists) {
      // Compare with baseline
      logger.log(`Comparing with baseline: ${paths.baseline}`);
      
      const { match, diffPixelCount, diffPercentage } = await compareImages(
        paths.baseline,
        paths.current,
        paths.diff,
        config.pixelmatchThreshold
      );
      
      // Determine pass/fail based on threshold
      const passesThreshold = diffPercentage <= config.threshold * 100;
      
      result = {
        url,
        viewport,
        baselineExists: true,
        baselinePath: paths.baseline,
        currentPath: paths.current,
        diffPath: config.generateDiffImages ? paths.diff : undefined,
        match: passesThreshold,
        diffPercentage,
        diffPixelCount,
        isNewBaseline: false,
      };
      
      if (!passesThreshold) {
        logger.warn(
          `Visual regression FAILED for ${viewport.name}: ${diffPercentage.toFixed(2)}% difference (${diffPixelCount} pixels)`
        );
      } else {
        logger.log(`Visual regression PASSED for ${viewport.name}: ${diffPercentage.toFixed(2)}% difference`);
      }
    } else {
      // No baseline exists, create one
      logger.log(`No baseline found, creating new baseline: ${paths.baseline}`);
      
      // Copy current to baseline
      await ensureDir(dirname(paths.baseline));
      await writeFile(paths.baseline, await readFile(paths.current));
      
      result = {
        url,
        viewport,
        baselineExists: false,
        baselinePath: paths.baseline,
        currentPath: paths.current,
        match: true, // No comparison possible, treat as pass
        diffPercentage: 0,
        diffPixelCount: 0,
        isNewBaseline: true,
      };
    }
    
    results.push(result);
  }
  
  // Restore original viewport
  if (originalViewport) {
    await page.setViewportSize(originalViewport);
  }
  
  logger.info(`Visual regression complete: ${results.length} viewports tested`);
  return results;
}

/**
 * Updates (overwrites) a baseline for a specific URL and viewport
 */
export async function updateBaseline(
  page: Page,
  url: string,
  viewport: ViewportConfig,
  config: VisualRegressionConfig
): Promise<string> {
  const paths = generateScreenshotPaths(url, viewport, config);
  
  // Set viewport and navigate
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  
  // Capture new baseline
  await ensureDir(dirname(paths.baseline));
  await page.screenshot({
    path: paths.baseline,
    fullPage: config.captureFullPage,
  });
  
  logger.info(`Baseline updated: ${paths.baseline}`);
  return paths.baseline;
}

/**
 * Lists all existing baselines
 */
export async function listBaselines(config: VisualRegressionConfig): Promise<
  Array<{
    path: string;
    url: string;
    viewport: string;
    created: Date;
  }>
> {
  if (!existsSync(config.baselineDir)) {
    return [];
  }
  
  const files = await readdir(config.baselineDir);
  const baselines: Array<{ path: string; url: string; viewport: string; created: Date }> = [];
  
  for (const file of files) {
    if (file.endsWith(".png")) {
      const fullPath = join(config.baselineDir, file);
      const stats = await readFile(fullPath).catch(() => null);
      
      if (stats) {
        // Parse filename for metadata
        const parts = file.replace(".png", "").split("_");
        const viewportMatch = parts[parts.length - 1]?.match(/(\d+)x(\d+)/);
        const viewport = viewportMatch ? `${viewportMatch[1]}x${viewportMatch[2]}` : "unknown";
        
        baselines.push({
          path: fullPath,
          url: parts.slice(0, -2).join("_"), // Rough approximation
          viewport,
          created: new Date(), // Would need actual file stats
        });
      }
    }
  }
  
  return baselines;
}

/**
 * Deletes a baseline
 */
export async function deleteBaseline(path: string): Promise<boolean> {
  try {
    const { unlink } = await import("fs/promises");
    await unlink(path);
    logger.info(`Baseline deleted: ${path}`);
    return true;
  } catch (e) {
    logger.error(`Failed to delete baseline: ${path}`, e);
    return false;
  }
}

export default {
  runVisualRegression,
  updateBaseline,
  listBaselines,
  deleteBaseline,
};
