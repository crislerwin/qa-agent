# Test Application

A simple login test application for testing the QA Agent's authentication capabilities.

## Test Credentials

- **Email**: `test@example.com`
- **Password**: `SecurePass123!`

## Files

- `login.html` - Login page with form validation
- `dashboard.html` - Protected dashboard page (requires authentication)

## Running the Test App

### Option 1: Using Python HTTP Server

```bash
cd test-app
python3 -m http.server 8080
```

Then open: http://localhost:8080/login.html

### Option 2: Using Bun

```bash
cd test-app
bunx serve
```

### Option 3: Using Node.js

```bash
cd test-app
npx serve
```

## Testing with QA Agent

### 1. Store Credentials

```typescript
import { AppDatabase } from "./src/database/database.ts";
import { CredentialStorage } from "./src/auth/credential-storage.ts";

const db = AppDatabase.getInstance();
const credStorage = new CredentialStorage(db.getDatabase());

await credStorage.set("testapp", {
  email: "test@example.com",
  password: "SecurePass123!",
});
```

### 2. Configure Agent with Authentication

```typescript
import { ExploratoryAgent } from "./src/agents/exploratory.ts";

const agent = new ExploratoryAgent({
  baseUrl: "http://localhost:8080/login.html",
  auth: {
    required: true,
    appIdentifier: "testapp",
    autoLogin: true,
  },
});

await agent.start();
```

### 3. Or Use Environment Variables

```bash
# .env
AUTH_TESTAPP_EMAIL=test@example.com
AUTH_TESTAPP_PASSWORD=SecurePass123!
```

## Features

- ✅ Modern, responsive design
- ✅ Form validation
- ✅ Success/Error messages
- ✅ Session persistence (localStorage)
- ✅ Protected dashboard route
- ✅ Logout functionality
- ✅ Test credentials displayed on login page

## Authentication Flow

1. User enters credentials on `login.html`
2. JavaScript validates against hardcoded credentials
3. On success: Sets `localStorage` and redirects to `dashboard.html`
4. On failure: Shows error message
5. Dashboard checks `localStorage` and redirects to login if not authenticated
6. Logout clears `localStorage` and redirects to login
