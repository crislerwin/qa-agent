# Exploratory Testing Agent - Project Guide

This document provides comprehensive guidance for AI agents and developers working on this project.

## Project Overview

**Exploratory Testing Agent** is an autonomous AI-powered QA testing agent that explores web applications, discovers bugs, and generates detailed reports. It uses an LLM-driven "Observe-Think-Act" loop to intelligently navigate and test web applications.

**Target Application**: https://with-bugs.practicesoftwaretesting.com (an e-commerce site with intentional bugs)

**Tech Stack**:

- TypeScript
- Playwright (browser automation)
- LangChain (LLM orchestration)
- Bun (runtime)
- @clack/prompts (CLI interface)

## Architecture

### Core Pattern: Observe-Think-Act Loop

1. **Observe**: Capture simplified DOM snapshot and page state
2. **Think**: LLM analyzes state and decides next action
3. **Act**: Execute action (navigate, click, fill form, scan for bugs)

### Project Structure

```
src/
├── agents/
│   └── exploratory.ts          # Main agent logic (ExploratoryAgent class)
├── tools/
│   ├── broken-images.ts        # Detects broken images
│   ├── console-errors.ts       # Monitors browser console errors
│   ├── network-errors.ts       # Monitors failed HTTP requests
│   ├── validation-errors.ts    # Detects form validation errors
│   └── crawler.ts              # Pre-execution site crawler
├── services/
│   └── llm.ts                  # LLM configuration and initialization
├── types/
│   └── index.ts                # TypeScript interfaces (AgentFinding, AgentState, AgentConfig)
├── utils/
│   ├── logger.ts               # Logging utilities
│   └── report.ts               # Report generation
└── index.ts                    # CLI entry point
```

## Key Components

### 1. ExploratoryAgent (`src/agents/exploratory.ts`)

**Purpose**: Main agent class that orchestrates exploration

**Key Methods**:

- `start()`: Initializes browser, monitors, and crawls the site
- `step(guidance?)`: Executes one Observe-Think-Act cycle
- `executeAction(action, params)`: Performs actions (navigate, click, fill_form, etc.)
- `performAutomaticBugScanning()`: Automatically scans for bugs after interactions

**State Management**:

- `visitedUrls`: Set of URLs already explored
- `findings`: Array of discovered bugs
- `todoQueue`: URLs to explore next
- `scannedUrls`: URLs scanned for broken images
- `history`: Recent actions for LLM context

**Monitors**:

- `ConsoleMonitor`: Captures browser console errors/warnings
- `NetworkMonitor`: Captures failed HTTP requests

### 2. Detection Tools (`src/tools/`)

#### broken-images.ts

- Scans page for broken images
- Detects: missing src, 404s, zero dimensions
- Returns structured findings with selectors and locations

#### console-errors.ts (NEW)

- Monitors browser console in real-time
- Filters noise (favicon, extensions)
- Captures error messages and stack traces

#### network-errors.ts (NEW)

- Monitors all network requests
- Detects 4xx/5xx errors and request failures
- Captures response bodies for debugging

#### validation-errors.ts (NEW)

- Scans DOM for visible error messages
- Detects common error patterns (`.error`, `[role="alert"]`, etc.)
- Finds invalid form inputs (`aria-invalid="true"`)

### 3. Type System (`src/types/index.ts`)

**AgentFinding**:

```typescript
{
  type: "broken_image" | "console_error" | "network_error" |
        "validation_error" | "functional_bug" | "ux_issue" | "bug" | "other"
  description: string
  url: string
  selector?: string
  severity: "low" | "medium" | "high" | "critical"
  screenshot?: string
  metadata?: Record<string, any>
}
```

**AgentConfig**:

```typescript
{
  baseUrl: string
  maxSteps?: number
  model?: BaseChatModel
}
```

## How the Agent Works

### 1. Initialization

- Launch headless browser
- Initialize console and network monitors
- Crawl site to discover all URLs
- Populate todo queue with discovered URLs

### 2. Exploration Loop

For each step:

1. **Observe**: Capture DOM snapshot (interactive elements only)
2. **Think**: LLM receives system prompt + current state + DOM snapshot
3. **Act**: Execute chosen action
4. **Auto-Scan**: Automatically check for console errors, network errors, validation errors

### 3. Bug Detection Strategy

**Automated Detection** (runs after every navigate/click/fill_form):

- Console errors from browser
- Network failures (4xx, 5xx)
- Visible validation errors

**LLM-Driven Detection** (via record_finding):

- Broken functionality (buttons that don't work)
- Missing validation
- UX issues
- Edge case failures

### 4. System Prompt Strategy

The LLM is guided to:

- Form hypotheses about what to test
- Test edge cases (empty forms, invalid inputs)
- Observe results after EVERY interaction
- Use `record_finding` when something seems broken
- Avoid loops by tracking visited URLs

## Development Guidelines

### Adding New Detection Tools

1. Create tool file in `src/tools/`
2. Export detection function or monitor class
3. Import in `src/agents/exploratory.ts`
4. Add to `performAutomaticBugScanning()` or as new action
5. Update `AgentFinding` type if needed

### Modifying Agent Behavior

**System Prompt** (`src/agents/exploratory.ts` line ~181):

- Add new instructions or examples
- Modify bug-hunting guidance
- Add new tool descriptions

**DOM Snapshot** (`src/agents/exploratory.ts` line ~94):

- Modify what elements are captured
- Add new attributes to extract
- Change filtering logic

### Testing

Run the agent:

```bash
bun run cli
```

Options:

- **Autonomous Mode**: Runs without user confirmation
- **Verbose Mode**: Shows detailed tool outputs
- **Guidance**: Provide specific instructions to the agent

## Common Issues & Solutions

### Agent Gets Stuck in Loops

- Check loop detection logic (line ~226)
- Verify visited URL tracking
- Ensure queue is being consumed

### Missing Bugs

- Check if automatic scanning is running
- Verify monitors are initialized
- Review system prompt guidance

### Too Many False Positives

- Adjust noise filters in monitors
- Refine validation error selectors
- Update severity thresholds

## Environment Variables

```env
# LLM Configuration (choose one)
GOOGLE_AI_STUDIO_API_KEY=your_key
GEMINI_MODEL=gemini-2.0-flash-exp

# OR
OPEN_ROUTER_API_KEY=your_key
OPEN_ROUTER_MODEL=anthropic/claude-3.5-sonnet
```

## Report Generation

Reports are saved to `reports/` directory:

- Markdown format
- Includes all findings with severity
- Screenshots for visual bugs
- Visited URLs summary

## Future Enhancements

Potential improvements:

- [ ] Add visual regression detection
- [ ] Implement test case generation
- [ ] Add performance monitoring
- [ ] Support for authenticated flows
- [ ] Multi-browser testing
- [ ] Parallel exploration

## Key Files to Understand

1. **src/agents/exploratory.ts** (515 lines) - Main agent logic
2. **src/tools/broken-images.ts** (113 lines) - Example detection tool
3. **src/types/index.ts** (27 lines) - Type definitions
4. **src/index.ts** (199 lines) - CLI interface

## Debugging Tips

- Enable verbose mode for detailed logs
- Check `reports/screenshots/` for visual evidence
- Review `state.history` for recent actions
- Monitor console output for errors
- Use guidance feature to direct agent

## Contributing

When making changes:

1. Update types if adding new finding types
2. Add tests for new detection tools
3. Update system prompt if changing agent behavior
4. Document new features in README
5. Test against target application
