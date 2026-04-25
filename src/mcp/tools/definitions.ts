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
