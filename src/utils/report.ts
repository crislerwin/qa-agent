import { type AgentFinding } from "../types/index.ts";
import { promises as fs } from "fs";

export async function generateReport(
  findings: AgentFinding[],
  visitedUrls?: string[],
  sessionId?: string,
  baseUrl?: string,
): Promise<string> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = sessionId
    ? `report-${sessionId}.md`
    : `report-${timestamp}.md`;
  const path = `reports/${filename}`;

  // Extract target from baseUrl or visitedUrls
  let target = baseUrl || "Unknown";
  if (!baseUrl && visitedUrls && visitedUrls.length > 0) {
    try {
      const firstUrl = visitedUrls[0];
      if (firstUrl) {
        const url = new URL(firstUrl);
        target = url.host;
      }
    } catch {
      const firstUrl = visitedUrls[0];
      if (firstUrl) {
        target = firstUrl;
      }
    }
  }

  let content = `# Exploratory Testing Report
Date: ${new Date().toLocaleString()}
Target: ${target}

## Summary
Total Findings: ${findings.length}
Pages Explored: ${visitedUrls?.length || 0}
`;

  if (visitedUrls && visitedUrls.length > 0) {
    content += `\n## Navigated Pages\n`;
    visitedUrls.forEach((url) => {
      content += `- ${url}\n`;
    });
  }

  content += `\n## Findings\n\n`;

  if (findings.length === 0) {
    content += "No findings recorded.\n";
  } else {
    findings.forEach((finding, index) => {
      content += `### ${
        index + 1
      }. [${finding.type.toUpperCase()}] [${finding.severity.toUpperCase()}]
**URL**: ${finding.url}
**Description**: ${finding.description}
`;
      if (finding.occurrences && finding.occurrences.length > 0) {
        content += `**Additional Occurrences**: ${finding.occurrences.length} other pages\n`;
        const displayedOccurrences = finding.occurrences.slice(0, 5);
        displayedOccurrences.forEach((occ) => {
          content += `- ${occ}\n`;
        });
        if (finding.occurrences.length > 5) {
          content += `- ...and ${finding.occurrences.length - 5} more\n`;
        }
      }

      if (finding.selector) {
        content += `**Selector**: \`${finding.selector}\`\n`;
      }
      if (finding.screenshot) {
        content += `**Screenshot**:\n![](${finding.screenshot})\n`;
      }
      content += `\n---\n`;
    });
  }

  try {
    await fs.writeFile(path, content);
    return path;
  } catch (error) {
    console.error("Failed to write report:", error);
    return "";
  }
}
