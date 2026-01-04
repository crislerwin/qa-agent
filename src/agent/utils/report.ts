import { type AgentFinding } from "../core.ts";
import { promises as fs } from "fs";

export async function generateReport(
  findings: AgentFinding[],
  visitedUrls?: string[]
): Promise<string> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `report-${timestamp}.md`;
  const path = `reports/${filename}`;
  let content = `# Exploratory Testing Report
Date: ${new Date().toLocaleString()}
Target: with-bugs.practicesoftwaretesting.com

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
      content += `### ${index + 1}. [${finding.severity.toUpperCase()}] ${
        finding.type
      }
**URL**: ${finding.url}
**Description**: ${finding.description}
`;
      if (finding.screenshot) {
        // Relative path for markdown if viewing locally or served
        content += `**Screenshot**: ![](${finding.screenshot})\n`;
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
