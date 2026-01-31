import { ExploratoryAgent } from "./agents/exploratory.ts";
import type { AgentConfig } from "./types/index.ts";
import { createLogger, setVerbose } from "./utils/logger.ts";
import { generateReport } from "./utils/report.ts";
import * as clack from "@clack/prompts";

import { SessionRepository } from "./repositories/session.repository.ts";
import { AppDatabase } from "./database/database.ts";

import { CredentialProvider } from "./auth/credential-provider.ts";

const logger = createLogger("cli");

async function main() {
    clack.intro(`✨ Welcome to the Exploratory Agent CLI ✨`);
    const s = clack.spinner();

    const defaultUrl = "https://with-bugs.practicesoftwaretesting.com";

    const baseUrl = await clack.text({
        message: "Enter the target website URL:",
        placeholder: defaultUrl,
        defaultValue: defaultUrl,
    });

    if (clack.isCancel(baseUrl)) {
        clack.outro("Operation cancelled.");
        process.exit(0);
    }

    // 0. Configuration: Autonomous Mode
    const isAutonomous = await clack.confirm({
        message: "Run in Autonomous Mode? (No user confirmation between steps)",
        initialValue: false,
    });

    if (clack.isCancel(isAutonomous)) {
        clack.outro("Operation cancelled.");
        process.exit(0);
    }

    // 0b. Configuration: Verbose Mode
    const isVerbose = await clack.confirm({
        message: "Enable Verbose Logging? (Show detailed tool outputs)",
        initialValue: false,
    });

    // Set global log level
    setVerbose(isVerbose as boolean);

    // 0c. Configuration: Test Generation
    const enableTestGeneration = await clack.confirm({
        message: "Enable Test Generation? (Generate automated tests from findings)",
        initialValue: true,
    });

    if (clack.isCancel(enableTestGeneration)) {
        clack.outro("Operation cancelled.");
        process.exit(0);
    }

    let testConfig: {
        testOutputDir?: string;
        includeE2ETests?: boolean;
        includeIntegrationTests?: boolean;
        includeUnitTests?: boolean;
        testDryRun?: boolean;
        testParallelExecution?: boolean;
        testMaxConcurrency?: number;
        testTimeout?: number;
        testRetryCount?: number;
    } = {};

    if (enableTestGeneration) {
        // Test Generation Configuration
        const testTypes = await clack.multiselect({
            message: "Select test types to generate:",
            options: [
                { value: "e2e", label: "E2E Tests (Browser automation)" },
                { value: "integration", label: "Integration Tests (Component interactions)" },
                { value: "unit", label: "Unit Tests (Individual functions)" },
            ],
            initialValues: ["e2e", "integration"],
        });

        if (clack.isCancel(testTypes)) {
            clack.outro("Operation cancelled.");
            process.exit(0);
        }

        const testExecutionMode = await clack.select({
            message: "Test execution mode:",
            options: [
                { value: "dry-run", label: "Dry Run (Generate only, don't execute)" },
                { value: "sequential", label: "Sequential (Execute tests one by one)" },
                { value: "parallel", label: "Parallel (Execute multiple tests concurrently)" },
            ],
        });

        if (clack.isCancel(testExecutionMode)) {
            clack.outro("Operation cancelled.");
            process.exit(0);
        }

        // Advanced configuration (optional)
        const showAdvanced = await clack.confirm({
            message: "Configure advanced test options?",
            initialValue: false,
        });

        if (clack.isCancel(showAdvanced)) {
            clack.outro("Operation cancelled.");
            process.exit(0);
        }

        let maxConcurrencyValue = 4;
        let timeoutValue = 30000;
        let retryCountValue = 2;

        if (showAdvanced) {
            const maxConcurrencyInput = await clack.text({
                message: "Maximum parallel test executions:",
                defaultValue: "4",
                placeholder: "4",
            });

            if (clack.isCancel(maxConcurrencyInput)) {
                clack.outro("Operation cancelled.");
                process.exit(0);
            }

            const timeoutInput = await clack.text({
                message: "Test timeout (milliseconds):",
                defaultValue: "30000",
                placeholder: "30000",
            });

            if (clack.isCancel(timeoutInput)) {
                clack.outro("Operation cancelled.");
                process.exit(0);
            }

            const retryCountInput = await clack.text({
                message: "Retry count for failed tests:",
                defaultValue: "2",
                placeholder: "2",
            });

            if (clack.isCancel(retryCountInput)) {
                clack.outro("Operation cancelled.");
                process.exit(0);
            }

            maxConcurrencyValue = parseInt(String(maxConcurrencyInput)) || 4;
            timeoutValue = parseInt(String(timeoutInput)) || 30000;
            retryCountValue = parseInt(String(retryCountInput)) || 2;
        }

        testConfig = {
            testOutputDir: "./generated-tests",
            includeE2ETests: (testTypes as string[]).includes("e2e"),
            includeIntegrationTests: (testTypes as string[]).includes("integration"),
            includeUnitTests: (testTypes as string[]).includes("unit"),
            testDryRun: testExecutionMode === "dry-run",
            testParallelExecution: testExecutionMode === "parallel",
            testMaxConcurrency: maxConcurrencyValue,
            testTimeout: timeoutValue,
            testRetryCount: retryCountValue,
        };
    }

    // 0c. Session Management
    // Initialize shared database
    const db = AppDatabase.getInstance();
    const sessionRepo = new SessionRepository(db.getDatabase());
    const existingSessions = sessionRepo.listSessions().slice(0, 5); // Recent 5

    let sessionId: string;

    if (existingSessions.length > 0) {
        const sessionAction = await clack.select({
            message: "Session Management",
            options: [
                { value: "new", label: "Start New Session" },
                ...existingSessions.map((id) => ({
                    value: id,
                    label: `Resume: ${id}`,
                })),
            ],
        });

        if (clack.isCancel(sessionAction)) {
            clack.outro("Operation cancelled.");
            process.exit(0);
        }

        if (sessionAction === "new") {
            sessionId = `session-${new Date().toISOString().replace(/[:.]/g, "-")}`;
        } else {
            sessionId = sessionAction as string;
        }
    } else {
        sessionId = `session-${new Date().toISOString().replace(/[:.]/g, "-")}`;
    }

    clack.log.info(`Using Session ID: ${sessionId}`);

    // 0d. Authentication
    const isAuthRequired = await clack.confirm({
        message: "Does the application require authentication?",
        initialValue: false,
    });

    if (clack.isCancel(isAuthRequired)) {
        clack.outro("Operation cancelled.");
        process.exit(0);
    }

    let authConfig: AgentConfig["auth"] = undefined;

    if (isAuthRequired) {
        const credProvider = new CredentialProvider(db.getDatabase());
        const existingCreds = await credProvider.listCredentials();

        let useExisting = false;
        let selectedAppId = "";

        if (existingCreds.length > 0) {
            const credAction = await clack.select({
                message: "Select Credentials",
                options: [
                    { value: "new", label: "Enter New Credentials" },
                    ...existingCreds.map((id) => ({
                        value: id,
                        label: `Use saved: ${id}`,
                    })),
                ],
            });

            if (clack.isCancel(credAction)) {
                clack.outro("Operation cancelled.");
                process.exit(0);
            }

            if (credAction !== "new") {
                useExisting = true;
                selectedAppId = credAction as string;
            }
        }

        if (useExisting) {
            authConfig = {
                required: true,
                appIdentifier: selectedAppId,
            };
            clack.log.info(`Using saved credentials for: ${selectedAppId}`);
        } else {
            const appIdentifier = await clack.text({
                message:
                    "Enter an App Identifier for these credentials (e.g. 'local-app'):",
                defaultValue: "default-app",
                placeholder: "default-app",
            });

            if (clack.isCancel(appIdentifier)) {
                clack.outro("Operation cancelled.");
                process.exit(0);
            }

            const email = await clack.text({
                message: "Email / Username:",
                placeholder: "user@example.com",
            });

            if (clack.isCancel(email)) {
                clack.outro("Operation cancelled.");
                process.exit(0);
            }

            const password = await clack.password({
                message: "Password:",
            });

            if (clack.isCancel(password)) {
                clack.outro("Operation cancelled.");
                process.exit(0);
            }

            authConfig = {
                required: true,
                appIdentifier: appIdentifier as string,
                credentials: {
                    email: email as string,
                    password: password as string,
                },
            };
        }
    }

    const config: AgentConfig = {
        baseUrl: baseUrl as string,
        maxSteps: 10,
        sessionId: sessionId,
        auth: authConfig,
        enableTestGeneration: enableTestGeneration,
        ...testConfig,
    };

    const agent = new ExploratoryAgent(config);

    // Helper function to generate and display report
    const generateAndDisplayReport = async () => {
        try {
            s.start("Generating Report...");
            const reportPath = await generateReport(
                agent.getFindings(),
                agent.getVisitedUrls(),
                config.sessionId,
                config.baseUrl,
            );
            s.stop("Report Generated");

            clack.log.success(`Report saved to: ${reportPath}`);

            // Feature: See Report in Terminal
            try {
                const reportContent = await Bun.file(reportPath).text();
                console.log("\n"); // Spacing
                clack.note(reportContent, "Report Preview");
            } catch (error) {
                clack.log.error("Could not read report file for preview.");
            }
        } catch (error) {
            logger.error("Failed to generate report:", error);
            clack.log.error("Failed to generate report");
        }
    };

    try {
        s.start("Starting Agent & Browser...");
        await agent.start();
        s.stop("Agent Started");

        let nextGuidance: string | undefined = undefined;
        let running = true; // Keep running flag for normal loop termination

        while (running) {
            // 1. Run Step
            s.start("Agent is thinking & acting...");

            const result = await agent.step(nextGuidance);
            nextGuidance = undefined; // Clear guidance after single use

            s.stop(`Step Complete: ${result.action}`);

            // Helper to wrap text at a specific length to prevent UI breakage
            const wrapText = (str: string, maxWidth: number = 80): string => {
                if (!str) return "";
                const words = str.split(" ");
                if (words.length === 0) return "";

                let lines: string[] = [];
                let currentLine = words[0] || "";

                for (let i = 1; i < words.length; i++) {
                    const word = words[i] || "";
                    if (currentLine.length + 1 + word.length <= maxWidth) {
                        currentLine += " " + word;
                    } else {
                        lines.push(currentLine);
                        currentLine = word;
                    }
                }
                lines.push(currentLine);
                return lines.join("\n");
            };

            if (result.stats) {
                const { currentUrl, queueLength, visitedCount, findingsCount } =
                    result.stats;
                clack.note(
                    `Current Page: ${currentUrl}
Queue Size:   ${queueLength} items pending
Discovered:   ${visitedCount} pages visited
Issues Found: ${findingsCount}

Action:
${wrapText(result.action, 80)}

Reason:
${wrapText(result.reason, 80)}`,
                    "Agent Progress",
                );
            } else {
                clack.note(
                    `Reason:
${wrapText(result.reason, 80)}

Action:
${wrapText(result.action, 80)}`,
                    "Agent Status",
                );
            }

            if (result.completed) {
                clack.log.success("Agent has decided to finish exploration.");
                running = false;
                break;
            }

            if (isAutonomous) {
                // In autonomous mode, check if we should still be running
                if (!running) break;

                // Small delay to make output readable and allow I/O events (like keypress) to process
                await new Promise((resolve) => setTimeout(resolve, 1000));
                continue;
            }

            // 2. Human-in-the-loop
            const explorationOptions = [
                { value: "continue", label: "Continue Exploration" },
                { value: "guidance", label: "Give Guidance/Feedback" },
                { value: "stop", label: "Stop & Report" },
            ];

            if (enableTestGeneration) {
                explorationOptions.push({ value: "generate-tests", label: "Generate Tests Now (Continue after)" });
            }

            const answer = await clack.select({
                message: "What should the agent do next?",
                options: explorationOptions,
            });

            if (clack.isCancel(answer)) {
                running = false;
                break;
            }

            if (answer === "stop") {
                running = false;
            } else if (answer === "guidance") {
                const userGuidance = await clack.text({
                    message: "Enter your guidance for the next step:",
                    placeholder:
                        "e.g., 'Click on the login button' or 'Check the cart page'",
                });

                if (clack.isCancel(userGuidance)) {
                    // Treat cancel as generic continue
                    continue;
                }

                if (typeof userGuidance === "string") {
                    nextGuidance = userGuidance;
                    clack.log.info(`Guidance recorded: "${nextGuidance}"`);
                }
            } else if (answer === "generate-tests") {
                const testSpinner = clack.spinner();
                
                try {
                    testSpinner.start("Generating tests from current findings...");
                    
                    const generatedTests = await agent.generateTests();
                    
                    if (generatedTests.length > 0) {
                        testSpinner.stop(`Generated ${generatedTests.length} tests`);
                        clack.log.success(`✅ Generated ${generatedTests.length} automated tests from current findings`);
                        
                        // Brief summary
                        const summary = {
                            total: generatedTests.length,
                            e2e: generatedTests.filter(t => t.testType === 'e2e').length,
                            integration: generatedTests.filter(t => t.testType === 'integration').length,
                            unit: generatedTests.filter(t => t.testType === 'unit').length,
                        };
                        
                        clack.log.info(`📊 ${summary.total} tests (${summary.e2e} E2E, ${summary.integration} Integration, ${summary.unit} Unit)`);
                    } else {
                        testSpinner.stop("No tests generated");
                        clack.log.warn("No tests could be generated from current findings");
                    }
                } catch (error) {
                    testSpinner.stop("Test generation failed");
                    logger.error("Test generation failed:", error);
                    clack.log.warn("Test generation failed, continuing exploration...");
                }
                
                // Continue exploration after test generation
                continue;
            }
        }

        // Generate Report (normal flow)
        await generateAndDisplayReport();

        // Generate Tests (if enabled)
        if (enableTestGeneration) {
            const testSpinner = clack.spinner();
            
            try {
                testSpinner.start("Generating automated tests from findings...");
                
                const generatedTests = await agent.generateTests();
                
                if (generatedTests.length > 0) {
                    testSpinner.stop(`Generated ${generatedTests.length} automated tests`);
                    
                    // Show test summary
                    const testSummary = generatedTests.reduce((acc, test) => {
                        acc[test.testType] = (acc[test.testType] || 0) + 1;
                        acc[test.priority] = (acc[test.priority] || 0) + 1;
                        acc.total = (acc.total || 0) + 1;
                        return acc;
                    }, {} as Record<string, number>);
                    
                    clack.note(`
📊 Test Generation Summary:
• Total Tests: ${testSummary.total}
• E2E Tests: ${testSummary.e2e || 0}
• Integration Tests: ${testSummary.integration || 0}
• Unit Tests: ${testSummary.unit || 0}
• High Priority: ${testSummary.high || 0}
• Medium Priority: ${testSummary.medium || 0}
• Low Priority: ${testSummary.low || 0}

📁 Test files saved to: ./generated-tests/
📄 Execution report saved to: ./reports/`, "Tests Generated");
                } else {
                    testSpinner.stop("No tests generated (no findings or test generation disabled)");
                }
            } catch (error) {
                testSpinner.stop("Test generation failed");
                logger.error("Test generation failed:", error);
                clack.log.warn("Test generation encountered an error, but exploration was successful.");
            }
        }
    } catch (error: any) {
        // Check if this is a user cancellation
        if (
            error?.name === "AbortError" ||
            error?.message?.includes("cancel")
        ) {
            console.log("\n\n⚠️  User cancelled. Saving report...\n");
        } else {
            s.stop("Agent Failed");
            logger.error("Agent failed:", error);
            clack.log.error(`Critical Error: ${error}`);
        }

        // ALWAYS try to generate report even on error or cancellation
        await generateAndDisplayReport();
    } finally {
        await agent.stop();
        clack.outro("Goodbye! 👋");
    }
}

if (import.meta.main) {
    main();
}
