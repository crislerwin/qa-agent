#!/usr/bin/env bun
import { AppDatabase } from "./src/database/database.ts";
import { CredentialStorage } from "./src/auth/credential-storage.ts";
import * as clack from "@clack/prompts";

async function main() {
  clack.intro("🔐 Credential Setup");

  const appId = await clack.text({
    message: "Enter application identifier (e.g., 'localhost-testapp'):",
    placeholder: "localhost-testapp",
    validate: (value) => {
      if (!value) return "App identifier is required";
    },
  });

  if (clack.isCancel(appId)) {
    clack.outro("Cancelled");
    process.exit(0);
  }

  const email = await clack.text({
    message: "Enter email:",
    placeholder: "test@example.com",
  });

  if (clack.isCancel(email)) {
    clack.outro("Cancelled");
    process.exit(0);
  }

  const password = await clack.password({
    message: "Enter password:",
  });

  if (clack.isCancel(password)) {
    clack.outro("Cancelled");
    process.exit(0);
  }

  // Store credentials
  const db = AppDatabase.getInstance();
  const credStorage = new CredentialStorage(db.getDatabase());

  await credStorage.set(appId as string, {
    email: email as string,
    password: password as string,
  });

  clack.outro(`✓ Credentials stored for '${appId}'`);

  clack.note(
    `To use these credentials, run the agent with:
    
bun run test-login.ts

Or configure your agent with:
{
  auth: {
    required: true,
    appIdentifier: "${appId}",
    autoLogin: true
  }
}`,
    "Next Steps",
  );
}

main();
