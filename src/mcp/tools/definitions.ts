export const TOOL_DEFINITIONS = [
  {
    name: "run_exploratory_test",
    description: "Start an exploratory testing session to discover and test multiple pages",
    inputSchema: {
      type: "object" as const,
      properties: {
        baseUrl: {
          type: "string" as const,
          description: "Base URL of the application to test",
        },
        maxSteps: {
          type: "number" as const,
          description: "Maximum number of exploration steps (default: 50)",
          default: 50,
        },
        mode: {
          type: "string" as const,
          enum: ["autonomous", "guided"],
          description: "Testing mode: autonomous or guided",
          default: "autonomous",
        },
        sessionId: {
          type: "string" as const,
          description: "Optional session ID to resume existing session",
        },
        authRequired: {
          type: "boolean" as const,
          description: "Whether authentication is required to access the application",
          default: false,
        },
        authEmail: {
          type: "string" as const,
          description: "Email / username for authentication",
        },
        authPassword: {
          type: "string" as const,
          description: "Password for authentication",
        },
        authAppIdentifier: {
          type: "string" as const,
          description: "App identifier to store/retrieve saved credentials (default: 'mcp-test')",
          default: "mcp-test",
        },
      },
      required: ["baseUrl"] as const,
    },
  },
  {
    name: "run_single_page_test",
    description: "Run comprehensive testing on a single page using plan-execute approach",
    inputSchema: {
      type: "object" as const,
      properties: {
        targetUrl: {
          type: "string" as const,
          description: "URL of the page to test",
        },
        strategy: {
          type: "string" as const,
          enum: ["comprehensive", "critical-path", "edge-cases"],
          description: "Testing strategy to use",
          default: "comprehensive",
        },
        maxTestCases: {
          type: "number" as const,
          description: "Maximum number of test cases to execute",
          default: 20,
        },
        sessionId: {
          type: "string" as const,
          description: "Optional session ID to resume",
        },
        authRequired: {
          type: "boolean" as const,
          description: "Whether authentication is required to access the application",
          default: false,
        },
        authEmail: {
          type: "string" as const,
          description: "Email / username for authentication",
        },
        authPassword: {
          type: "string" as const,
          description: "Password for authentication",
        },
        authAppIdentifier: {
          type: "string" as const,
          description: "App identifier to store/retrieve saved credentials (default: 'mcp-test')",
          default: "mcp-test",
        },
        visualRegression: {
          type: "object" as const,
          description: "Visual regression testing configuration",
          properties: {
            enabled: {
              type: "boolean" as const,
              description: "Enable visual regression testing",
              default: false,
            },
            baselineDir: {
              type: "string" as const,
              description: "Directory to store baseline screenshots",
              default: "./test-results/baselines",
            },
            currentDir: {
              type: "string" as const,
              description: "Directory to store current test screenshots",
              default: "./test-results/current",
            },
            diffDir: {
              type: "string" as const,
              description: "Directory to store diff images",
              default: "./test-results/diffs",
            },
            viewports: {
              type: "array" as const,
              description: "Viewports to test",
              default: [
                { width: 1920, height: 1080, name: "desktop" },
                { width: 768, height: 1024, name: "tablet" },
                { width: 375, height: 667, name: "mobile" },
              ],
              items: {
                type: "object" as const,
                properties: {
                  width: { type: "number" as const },
                  height: { type: "number" as const },
                  name: { type: "string" as const },
                },
                required: ["width", "height", "name"],
              },
            },
            threshold: {
              type: "number" as const,
              description: "Pixel difference threshold (0-1, lower = stricter)",
              default: 0.1,
            },
            pixelmatchThreshold: {
              type: "number" as const,
              description: "Pixelmatch sensitivity (0-1, lower = stricter)",
              default: 0.1,
            },
            captureFullPage: {
              type: "boolean" as const,
              description: "Capture full page screenshots",
              default: true,
            },
            generateDiffImages: {
              type: "boolean" as const,
              description: "Generate diff images showing visual changes",
              default: true,
            },
          },
        },
        layoutAudit: {
          type: "object" as const,
          description: "Layout audit configuration",
          properties: {
            enabled: {
              type: "boolean" as const,
              description: "Enable layout audit",
              default: false,
            },
            maxElements: {
              type: "number" as const,
              description: "Maximum elements to audit (default: 300)",
              default: 300,
            },
            heuristics: {
              type: "array" as const,
              description: "Specific heuristics to run (default: all)",
              items: { type: "string" as const },
            },
            screenshots: {
              type: "object" as const,
              description: "Screenshot configuration for layout findings",
              properties: {
                enabled: {
                  type: "boolean" as const,
                  description: "Enable screenshots for layout findings",
                  default: true,
                },
                outputDir: {
                  type: "string" as const,
                  description: "Output directory for screenshots",
                  default: "./test-results/layout-audit",
                },
                highlightElements: {
                  type: "boolean" as const,
                  description: "Highlight elements in screenshots",
                  default: true,
                },
                type: {
                  type: "string" as const,
                  enum: ["png", "jpeg"],
                  description: "Screenshot format",
                  default: "png",
                },
              },
            },
          },
        },
      },
      required: ["targetUrl"] as const,
    },
  },
  {
    name: "get_test_status",
    description: "Get real-time status of a running test session",
    inputSchema: {
      type: "object" as const,
      properties: {
        sessionId: {
          type: "string" as const,
          description: "Session ID of the test",
        },
      },
      required: ["sessionId"] as const,
    },
  },
  {
    name: "stop_test",
    description: "Stop a running test session and generate final report",
    inputSchema: {
      type: "object" as const,
      properties: {
        sessionId: {
          type: "string" as const,
          description: "Session ID of the test to stop",
        },
      },
      required: ["sessionId"] as const,
    },
  },
  {
    name: "list_sessions",
    description: "List all test sessions with their status and metadata",
    inputSchema: {
      type: "object" as const,
      properties: {
        status: {
          type: "string" as const,
          enum: ["all", "active", "completed"],
          description: "Filter sessions by status",
          default: "all",
        },
        limit: {
          type: "number" as const,
          description: "Maximum number of sessions to return",
          default: 10,
        },
      },
    },
  },
];

export const RESOURCE_DEFINITIONS = [
  {
    uri: "test-report://latest",
    name: "Latest Test Report",
    mimeType: "text/markdown",
    description: "The most recent test report generated",
  },
];

export const PROMPT_DEFINITIONS = [
  {
    name: "test-login-page",
    description: "Comprehensive testing prompt for login pages",
    arguments: [
      {
        name: "loginUrl",
        description: "URL of the login page",
        required: true,
      },
    ],
  },
  {
    name: "test-checkout-flow",
    description: "E-commerce checkout flow testing prompt",
    arguments: [
      {
        name: "checkoutUrl",
        description: "URL of the checkout page",
        required: true,
      },
    ],
  },
];
