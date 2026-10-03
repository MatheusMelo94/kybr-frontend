import {
  expect,
  test,
  type APIResponse,
  type Response,
} from "@playwright/test";

// API_PUBLIC_BASE_URL for the E2E build (playwright.config.ts).
const API_ORIGIN = "http://localhost:4010";

function csp(response: APIResponse | Response | null): string {
  const value = response?.headers()["content-security-policy"];
  if (!value) throw new Error("no Content-Security-Policy header");
  return value;
}

function directive(policy: string, name: string): string | undefined {
  return policy
    .split(";")
    .map((part) => part.trim())
    .find((part) => part === name || part.startsWith(`${name} `))
    ?.slice(name.length)
    .trim();
}

test.describe("security headers @feature-seller-link", () => {
  test("every response carries the default security headers", async ({
    request,
  }) => {
    const headers = (await request.get("/v/loja-exemplo")).headers();

    expect(headers["strict-transport-security"]).toBe(
      "max-age=31536000; includeSubDomains; preload",
    );
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["permissions-policy"]).toBe(
      "camera=(), microphone=(), geolocation=(), payment=()",
    );
    expect(headers["cross-origin-opener-policy"]).toBe("same-origin");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["x-powered-by"]).toBeUndefined();
  });

  test("the CSP is strict, nonce-based and new on every request", async ({
    request,
  }) => {
    const first = csp(await request.get("/"));
    const second = csp(await request.get("/"));

    expect(directive(first, "default-src")).toBe("'self'");
    expect(directive(first, "script-src")).toMatch(
      /^'self' 'nonce-[A-Za-z0-9+/=]{16,}' 'strict-dynamic'$/,
    );
    expect(directive(first, "connect-src")).toBe(`'self' ${API_ORIGIN}`);
    expect(directive(first, "frame-ancestors")).toBe("'none'");
    expect(directive(first, "object-src")).toBe("'none'");
    expect(directive(first, "base-uri")).toBe("'self'");
    expect(directive(first, "form-action")).toBe("'self'");
    expect(first).not.toContain("'unsafe-eval'");
    expect(directive(second, "script-src")).not.toBe(
      directive(first, "script-src"),
    );
  });

  test("the page's scripts carry this request's nonce and run without CSP violations", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const store = window as unknown as { __cspViolations: string[] };
      store.__cspViolations = [];
      document.addEventListener("securitypolicyviolation", (event) => {
        store.__cspViolations.push(
          `${event.violatedDirective} ${event.blockedURI}`,
        );
      });
    });

    // "/" has no screen: the app router renders Link not found, per request.
    const response = await page.goto("/");
    await expect(
      page.getByRole("heading", { level: 1, name: "Link não encontrado" }),
    ).toBeVisible();
    expect(response?.status()).toBe(404);
    const nonce = /'nonce-([^']+)'/.exec(csp(response))?.[1];
    const scriptNonces = await page.$$eval("script", (scripts) =>
      scripts.map((script) => script.nonce),
    );

    expect(nonce).toBeDefined();
    expect(scriptNonces.length).toBeGreaterThan(0);
    expect(scriptNonces.every((value) => value === nonce)).toBe(true);
    expect(
      await page.evaluate(
        () =>
          (window as unknown as { __cspViolations: string[] }).__cspViolations,
      ),
    ).toEqual([]);
  });

  test("the production build ships no browser source maps", async ({
    page,
    request,
  }) => {
    await page.goto("/");
    const sources = await page.$$eval("script[src]", (scripts) =>
      scripts.map((script) => (script as HTMLScriptElement).src),
    );

    expect(sources.length).toBeGreaterThan(0);
    for (const source of sources) {
      expect(await (await request.get(source)).text()).not.toContain(
        "sourceMappingURL",
      );
      expect((await request.get(`${source}.map`)).status()).toBe(404);
    }
  });
});
