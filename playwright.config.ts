import { defineConfig, devices } from "@playwright/test";

// Two loopback hosts (ADR-0008 rule 7): the link on localhost, the panel on
// 127.0.0.1. Both resolve in every Playwright engine, and cookies stay per host.
const APP_URL = "http://localhost:3000";
const PANEL_URL = "http://127.0.0.1:3000";
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
    // The seller link (never the panel's specs).
    ...[
      { name: "chromium-desktop", use: { ...devices["Desktop Chrome"] } },
      { name: "chromium-mobile", use: { ...devices["Pixel 7"] } },
      { name: "webkit-mobile", use: { ...devices["iPhone 14"] } },
      { name: "firefox-desktop", use: { ...devices["Desktop Firefox"] } },
    ].map((project) => ({ ...project, testIgnore: "panel/**" })),
    // The panel (plan § 2.12): desktop-first, plus the phone journeys.
    ...[
      {
        name: "panel-desktop",
        use: {
          ...devices["Desktop Chrome"],
          viewport: { width: 1280, height: 800 },
        },
      },
      {
        name: "panel-firefox",
        grep: /@panel-smoke/,
        use: {
          ...devices["Desktop Firefox"],
          viewport: { width: 1280, height: 800 },
        },
      },
      {
        name: "panel-768",
        grep: /@panel-phone/,
        use: {
          ...devices["Desktop Chrome"],
          viewport: { width: 768, height: 1024 },
          hasTouch: true,
        },
      },
      {
        name: "panel-360",
        grep: /@panel-phone/,
        use: {
          ...devices["Desktop Chrome"],
          viewport: { width: 360, height: 780 },
          isMobile: true,
          hasTouch: true,
        },
      },
      {
        name: "panel-webkit-360",
        grep: /@panel-phone/,
        use: { ...devices["iPhone 14"], viewport: { width: 360, height: 780 } },
      },
    ].map((project) => ({
      ...project,
      testDir: "./tests/e2e/panel",
      use: { ...project.use, baseURL: PANEL_URL },
    })),
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
        // Hosts (ADR-0008) and the panel's config: placeholders only.
        LINK_HOST: "localhost:3000",
        PANEL_HOST: "127.0.0.1:3000",
        LEGAL_TERMS_URL: "https://example.invalid/termos",
        LEGAL_PRIVACY_URL: "https://example.invalid/privacidade",
        LEGAL_TERMS_VERSION: "e2e-1",
        // Cloudflare's always-pass Turnstile test site key.
        TURNSTILE_SITE_KEY: "1x00000000000000000000AA",
      },
    },
  ],
});
