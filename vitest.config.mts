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
    },
    // Playwright owns tests/e2e.
    exclude: [...configDefaults.exclude, "tests/e2e/**"],
  },
});
