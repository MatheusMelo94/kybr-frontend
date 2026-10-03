import { defineConfig, devices } from "@playwright/test";

const APP_URL = "http://localhost:3000";
const MOCK_API_PORT = 4010;
const MOCK_API_URL = `http://localhost:${MOCK_API_PORT}`;

// Production posture matrix (frontend-qa-conventions.md § Browser & Device Matrix).
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: APP_URL,
    trace: "on-first-retry",
  },
  projects: [
    { name: "chromium-desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "chromium-mobile", use: { ...devices["Pixel 7"] } },
    { name: "webkit-mobile", use: { ...devices["iPhone 14"] } },
    { name: "firefox-desktop", use: { ...devices["Desktop Firefox"] } },
  ],
  // Pre-Contract: Server Components and Actions fetch on the Next server, so
  // page.route() can't mock them. The MSW handlers run as an HTTP mock API, and
  // a production build points at it (tests/fixtures/msw/mock-api.ts).
  webServer: [
    {
      command: "pnpm mock:api",
      url: `${MOCK_API_URL}/__mock/health`,
      reuseExistingServer: !process.env.CI,
      env: {
        MOCK_API_PORT: String(MOCK_API_PORT),
        MOCK_API_ALLOWED_ORIGINS: APP_URL,
      },
    },
    {
      command: "pnpm build && pnpm start",
      port: 3000,
      timeout: 300_000,
      reuseExistingServer: !process.env.CI,
      env: {
        API_BASE_URL: MOCK_API_URL,
        // The mock API is http: on loopback; production refuses http: otherwise (F08).
        API_ALLOW_LOOPBACK_HTTP: "true",
        API_PUBLIC_BASE_URL: MOCK_API_URL,
        // Not a secret: it only ever reaches the local mock API.
        API_BFF_KEY: "e2e-only-bff-key-for-the-local-mock-api",
        CLIENT_IP_HEADER: "x-forwarded-for",
        CLIENT_IP_TRUSTED_HOPS: "1",
      },
    },
  ],
});
