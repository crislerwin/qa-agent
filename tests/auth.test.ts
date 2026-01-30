import {
  describe,
  test,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
} from "bun:test";
import {
  chromium,
  type Browser,
  type Page,
  type BrowserContext,
} from "playwright-core";
import { AppDatabase } from "../src/database/database";
import { AuthenticationManager } from "../src/auth/auth-manager";
import { CredentialStorage } from "../src/auth/credential-storage";

describe("Authentication Functionality", () => {
  let browser: Browser;
  let context: BrowserContext;
  let page: Page;
  let db: AppDatabase;
  let authManager: AuthenticationManager;
  let credStorage: CredentialStorage;
  let server: any;

  beforeAll(async () => {
    // Start Bun server for test app
    server = Bun.serve({
      port: 8889,
      async fetch(req) {
        const url = new URL(req.url);
        let filePath = url.pathname;

        if (filePath === "/") {
          filePath = "/login.html";
        }

        const file = Bun.file(`./test-app${filePath}`);
        return new Response(file);
      },
    });

    console.log(`Test server running at http://localhost:${server.port}`);

    // Initialize database
    db = new AppDatabase(":memory:");
    const database = db.getDatabase();

    // Initialize auth components
    authManager = new AuthenticationManager(database);
    credStorage = new CredentialStorage(database);

    // Store test credentials
    await credStorage.set("testapp", {
      email: "test@example.com",
      password: "SecurePass123!",
    });

    // Launch browser
    browser = await chromium.launch({ headless: true });
  });

  beforeEach(async () => {
    // Create fresh context and page for each test
    context = await browser.newContext();
    page = await context.newPage();
  });

  afterAll(async () => {
    await browser.close();
    server.stop();
    db.close();
  });

  test("should detect login page", async () => {
    await page.goto("http://localhost:8889/login.html");

    // Check that we're on a login page
    const title = await page.title();
    expect(title).toContain("Login");

    // Check for login form elements
    const emailInput = await page.locator('input[type="email"]').count();
    const passwordInput = await page.locator('input[type="password"]').count();
    const submitButton = await page.locator('button[type="submit"]').count();

    expect(emailInput).toBeGreaterThan(0);
    expect(passwordInput).toBeGreaterThan(0);
    expect(submitButton).toBeGreaterThan(0);

    await context.close();
  });

  test("should not be authenticated on login page", async () => {
    await page.goto("http://localhost:8889/login.html");

    const isAuth = await authManager.isAuthenticated(page);
    expect(isAuth).toBe(false);

    await context.close();
  });

  test("should successfully login with valid credentials", async () => {
    await page.goto("http://localhost:8889/login.html");

    // Fill in credentials
    await page.fill('input[type="email"]', "test@example.com");
    await page.fill('input[type="password"]', "SecurePass123!");

    // Submit form
    await page.click('button[type="submit"]');

    // Wait for navigation to dashboard
    await page.waitForURL("**/dashboard.html", { timeout: 3000 });

    // Verify we're on the dashboard
    const url = page.url();
    expect(url).toContain("dashboard.html");

    // Verify we're authenticated
    const isAuth = await authManager.isAuthenticated(page);
    expect(isAuth).toBe(true);

    await context.close();
  });

  test("should detect authenticated state on dashboard", async () => {
    await page.goto("http://localhost:8889/login.html");

    // Login
    await page.fill('input[type="email"]', "test@example.com");
    await page.fill('input[type="password"]', "SecurePass123!");
    await page.click('button[type="submit"]');
    await page.waitForURL("**/dashboard.html", { timeout: 3000 });

    // Check for authentication indicators
    const hasLogoutButton = await page.evaluate(() => {
      const buttons = document.querySelectorAll("button, a");
      for (const el of buttons) {
        const text = el.textContent?.toLowerCase() || "";
        if (text.includes("logout")) return true;
      }
      return false;
    });

    expect(hasLogoutButton).toBe(true);

    await context.close();
  });

  test("should fail login with invalid credentials", async () => {
    await page.goto("http://localhost:8889/login.html");

    // Fill in wrong credentials
    await page.fill('input[type="email"]', "wrong@example.com");
    await page.fill('input[type="password"]', "WrongPassword!");

    // Submit form
    await page.click('button[type="submit"]');

    // Wait a bit for error message
    await page.waitForTimeout(1500);

    // Should still be on login page
    const url = page.url();
    expect(url).toContain("login.html");

    // Check for error message
    const errorVisible = await page.evaluate(() => {
      const errorMsg = document.getElementById("errorMessage");
      return errorMsg && errorMsg.style.display !== "none";
    });

    expect(errorVisible).toBe(true);

    await context.close();
  });

  test("should logout successfully", async () => {
    await page.goto("http://localhost:8889/login.html");

    // Login first
    await page.fill('input[type="email"]', "test@example.com");
    await page.fill('input[type="password"]', "SecurePass123!");
    await page.click('button[type="submit"]');
    await page.waitForURL("**/dashboard.html", { timeout: 3000 });

    // Click logout
    await page.click('button:has-text("Logout")');

    // Wait for redirect to login
    await page.waitForURL("**/login.html", { timeout: 3000 });

    // Verify we're back on login page
    const url = page.url();
    expect(url).toContain("login.html");

    // Verify we're not authenticated
    const isAuth = await authManager.isAuthenticated(page);
    expect(isAuth).toBe(false);

    await context.close();
  });

  test("should redirect to login when accessing dashboard without auth", async () => {
    // Clear localStorage to simulate logged out state
    await page.goto("http://localhost:8889/dashboard.html");
    await page.evaluate(() => {
      localStorage.clear();
    });

    // Reload to trigger redirect
    await page.reload();

    // Should redirect to login
    await page.waitForURL("**/login.html", { timeout: 3000 });

    const url = page.url();
    expect(url).toContain("login.html");

    await context.close();
  });
});
