import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { TextContent } from "@modelcontextprotocol/sdk/types.js";

export async function handleTestReportResource(
  uri: string,
): Promise<{ contents: Array<{ uri: string; mimeType: string; text: string }> }> {
  const sessionId = uri.replace("test-report://", "");
  if (!sessionId) {
    throw new Error("Missing sessionId in resource URI");
  }

  // Strategy 1: Read the generated markdown report file
  const reportPath = join(process.cwd(), "reports", `report-${sessionId}.md`);
  try {
    const content = await readFile(reportPath, "utf-8");
    return {
      contents: [
        {
          uri,
          mimeType: "text/markdown",
          text: content,
        },
      ],
    };
  } catch {
    // Strategy 2: fall back to latest report in the directory
    try {
      const reportsDir = join(process.cwd(), "reports");
      // Bun.file for glob-read pattern
      const pattern = new Bun.Glob("*.md");
      let latestPath = "";
      let latestTime = 0;

      for await (const file of pattern.scan({ cwd: reportsDir, absolute: false })) {
        const fullPath = join(reportsDir, file);
        const info = await Bun.file(fullPath).stat();
        if (info.mtime && info.mtime.getTime() > latestTime) {
          latestTime = info.mtime.getTime();
          latestPath = fullPath;
        }
      }

      if (latestPath) {
        const content = await readFile(latestPath, "utf-8");
        return {
          contents: [
            {
              uri,
              mimeType: "text/markdown",
              text: content,
            },
          ],
        };
      }
    } catch {
      /* fall through */
    }
  }

  throw new Error(`Report not found for session ${sessionId}`);
}
