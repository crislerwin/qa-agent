# Exploratory Testing Agent

Take-Home Challenge

Time: 5 days | Stack: TypeScript

---

## Overview

Build an AI agent that autonomously explores a web application, discovers potential issues, and generates a structured report of findings. The agent should leverage an LLM to make intelligent decisions about what to test next, while providing a human-in-the-loop mechanism for guidance.

---

## Target Application

Your agent will explore the following e-commerce application:

**https://with-bugs.practicesoftwaretesting.com**

This is a fully functional e-commerce site with intentional bugs. Your agent should discover issues across different areas: product browsing, cart operations, checkout flow, user authentication, and more.

---

## Requirements

### 1. Autonomous Exploration

The agent must navigate the application autonomously, making decisions about what to explore based on what it observes. It should be capable of:

- Navigating between pages
- Interacting with UI elements (clicks, form fills, selections)
- Capturing screenshots
- Extracting page content for analysis

### 2. Intelligent Decision Making

Use an LLM to analyze the current page state and decide the next action. The agent should:

- Form hypotheses about what might be worth testing
- Prioritize high-value interactions
- Explain its reasoning for each decision

### 3. Human-in-the-Loop Interaction

Implement a CLI-based interaction where the agent periodically asks the user whether to continue exploring or stop. This interaction should:

- Present a summary of what has been explored so far
- Show the agent's proposed next steps
- Allow the user to: continue, stop, or provide guidance
- Define your own trigger for when to ask (e.g., after N actions, when confidence is low, at natural breakpoints)

### 4. Required Custom Tool: Broken Image Detector

You must implement a custom tool **`find_broken_images`** that the agent can invoke to scan the current page for broken images. This tool should:

- Detect images that fail to load (HTTP errors, 404s)
- Detect images with invalid or empty src attributes
- Detect images that load but have zero dimensions (naturalWidth/naturalHeight = 0)
- Return a structured report including: image src, alt text, location on page, and failure reason

> **Note:** You may use libraries like browser-use or similar for other browser interactions, but this specific tool must be implemented by you to demonstrate understanding of tool creation patterns.

### 5. Findings Report

The agent must generate a structured report of all findings, including:

- List of potential bugs discovered with severity assessment
- Broken images found (from your custom tool)
- UX issues and edge cases identified
- Coverage summary: what areas were explored
- Screenshots or evidence supporting each finding

---

## Technical Constraints

- **Language:** TypeScript (required)
- **Browser Automation:** Playwright (required)
- **LLM:** Any provider (OpenAI, Anthropic, etc.) - document your choice and reasoning
- **Agent Framework:** Your choice (LangGraph, browser-use, Vercel AI SDK, or custom implementation)
- The solution must be runnable locally with clear setup instructions

---

## Evaluation Criteria

| Dimension | What We Look For |
|-----------|------------------|
| **Architecture** | Clear separation of concerns, extensibility, appropriate abstractions. How would this scale to test multiple applications? |
| **Agent Design** | Quality of LLM prompts, decision-making logic, balance between exploration and exploitation, error recovery strategies |
| **Tool Implementation** | Quality of the `find_broken_images` tool: edge case handling, performance, structured output, integration with agent flow |
| **Code Quality** | TypeScript best practices, type safety, error handling, testing approach, readability |
| **Communication** | README quality, documented trade-offs, clear explanations of why you made certain choices |
| **Results** | Did the agent actually find bugs? Quality and actionability of the generated report |

### What We're NOT Looking For

- 100% test coverage of the target site: Quality over quantity
- Over-engineered solutions: Solve the problem at hand, not hypothetical future problems
- Perfect code: We value pragmatic decisions and documented trade-offs
- Fancy UI: CLI is perfectly fine

---

## Deliverables

1. **Source code** in a private GitHub repository

2. **README** with:
   - Setup instructions
   - Architecture overview
   - Design decisions and trade-offs
   - How to run the agent
   - AI usage documentation (see below)

3. **Sample output** showing the agent running against the target application (terminal recording, screenshots, or generated report)

4. **Architecture diagram** (can be simple, hand-drawn is fine) explaining the agent's flow

5. **Video walkthrough** (maximum 5 minutes)
   - Brief explanation of your solution and approach
   - Demo of the agent in action
   - Record using Loom, OBS, or any screen recorder

---

## AI-Assisted Development (Required)

This challenge must be completed using AI assistance. We want to evaluate your ability to leverage AI tools effectively in your workflow.

### AI Usage Documentation

In your README, include a section explaining:

- Which AI tools you used (Cursor, Claude, GitHub Copilot, etc.)
- How you used AI to assist in development
- Specific examples of prompts or interactions that were particularly effective
- How you validated and refined AI-generated code
- What you learned about using AI for agent development

We're not looking for candidates who avoid AI — we want professionals who know how to use it strategically and understand what it generates.

---

## Stretch Goals

These are optional but will be highly valued:

- **Cloud Deployment:** Deploy the solution to a cloud provider (AWS, GCP, Vercel, Railway, etc.) with a simple way to trigger execution
- **Persistence:** Save exploration state and allow resuming from where it left off
- **Test Generation:** Automatically generate Playwright test scripts based on discovered issues
- **MCP Server:** Expose the agent as an MCP server so external LLMs can invoke it as a tool

---

## Timeline

- **Duration:** 5 days from when you receive this challenge
- **Effort:** 8-16 hours of focused work
- If you need more time due to other commitments, just let us know

---

## How to Submit

When you finish the challenge, follow these steps:

### Step 1: Grant Repository Access

Add **operationsvoidr** as a collaborator to your private GitHub repository.

### Step 2: Send Your Submission Email

Send an email to **people@voidr.co** with:

**Subject:** `[ Technical Challenge Voidr ] - Your Full Name`

**Body:**
- Brief text introduction of your solution (2-3 paragraphs)
- Link to your GitHub repository
- Link to your 5-minute video walkthrough

---

## What Happens Next

### If you pass this stage

You'll receive an email with a link to schedule a 30-minute technical session with our CTO, Victor Buchalla.

During this session, you'll:
- Walk through your solution and key decisions
- Explain the rationale behind technical choices
- Discuss what you would improve given more time
- Demonstrate deep understanding of all code, including AI-generated parts

Be prepared to extend or modify the solution live (pair programming style) and discuss how you'd adapt this for production use at scale.

### If you don't pass this stage

You'll receive structured, honest feedback explaining why it wasn't a match this time.

---

## Questions?

If anything is unclear or you encounter issues, reach out via email: **people@voidr.co**

Asking good questions is a positive signal, not a negative one.

---

Interested in joining the team? Check open positions at [voidr.co](https://voidr.co)
