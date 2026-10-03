import { afterEach, describe, expect, it, vi } from "vitest";

// A standalone server serializes next.config.ts, so the build-time env check
// doesn't re-run at container start. register() runs at boot instead (F09).
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("instrumentation register()", () => {
  it("passes with a valid environment", async () => {
    const { register } = await import("@/instrumentation");

    await expect(register()).resolves.toBeUndefined();
  });

  it("fails the boot when API_BFF_KEY is missing in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("API_BASE_URL", "https://api.kybr.test");
    vi.stubEnv("API_BFF_KEY", "");
    const { register } = await import("@/instrumentation");

    await expect(register()).rejects.toThrow("API_BFF_KEY");
  });

  it("exits the Node.js server process with code 1, so the container restarts loudly", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("API_BASE_URL", "https://api.kybr.test");
    vi.stubEnv("API_BFF_KEY", "");
    const exit = vi
      .spyOn(process, "exit")
      .mockImplementation((() => undefined) as never);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const { register } = await import("@/instrumentation");

    await register().catch(() => undefined);

    expect(exit).toHaveBeenCalledWith(1);
    expect(String(log.mock.calls[0]?.[0])).toContain("API_BFF_KEY");
    exit.mockRestore();
    log.mockRestore();
  });
});
