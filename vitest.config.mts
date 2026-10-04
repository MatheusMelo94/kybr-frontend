import react from "@vitejs/plugin-react";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Reads the `@/*` alias from tsconfig.json, so it has one source of truth.
    tsconfigPaths: true,
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    // A valid server environment for modules that import lib/env.ts.
    // Test-only values: the base URL is the MSW-mocked API.
    env: {
      API_BASE_URL: "http://api.kybr.test",
      API_PUBLIC_BASE_URL: "https://api.kybr.test",
      API_BFF_KEY: "test-only-bff-key-0123456789abcdef",
      CLIENT_IP_HEADER: "x-forwarded-for",
      CLIENT_IP_TRUSTED_HOPS: "1",
      // Panel hosts and config (ADR-0008, ADR-0009): placeholders, never deployed.
      LINK_HOST: "kybr.test",
      PANEL_HOST: "app.kybr.test",
      LEGAL_TERMS_URL: "https://kybr.test/termos",
      LEGAL_PRIVACY_URL: "https://kybr.test/privacidade",
      LEGAL_TERMS_VERSION: "teste-1",
      // Cloudflare's always-pass test site key.
      TURNSTILE_SITE_KEY: "1x00000000000000000000AA",
    },
    // Playwright owns tests/e2e. Agent worktrees under .claude/ hold other
    // branches' copies of the suite and must never be collected here.
    exclude: [...configDefaults.exclude, "tests/e2e/**", ".claude/**"],
  },
});
