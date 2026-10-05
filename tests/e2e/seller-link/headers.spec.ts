import {
  expect,
  test,
  type APIResponse,
  type Response,
} from "@playwright/test";

import { CASE_TOKENS, SLUGS } from "../../fixtures/factories/seller-link.ts";
import { createCase } from "../fixtures/mock-api.ts";

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
  test("T34a: the CSP reports to the same-origin collector, with Reporting-Endpoints", async ({
    request,
  }) => {
    const response = await request.get("/v/loja-exemplo");
    const policy = csp(response);

    expect(directive(policy, "report-uri")).toBe("/api/csp-report");
    expect(directive(policy, "report-to")).toBe("csp");
    expect(response.headers()["reporting-endpoints"]).toBe(
      'csp="http://localhost:3000/api/csp-report"',
    );
  });

  test("T34a: the collector takes a report and answers 204", async ({
    request,
  }) => {
    const response = await request.post("/api/csp-report", {
      headers: { "content-type": "application/csp-report" },
      data: JSON.stringify({
        "csp-report": {
          "document-uri": "http://localhost:3000/v/loja-exemplo",
          "blocked-uri": "javascript",
          "effective-directive": "form-action",
        },
      }),
    });

    expect(response.status()).toBe(204);
  });

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

  test("/v/* responses tell crawlers not to index or follow (F06d)", async ({
    request,
  }) => {
    const headers = (await request.get("/v/loja-exemplo")).headers();

    expect(headers["x-robots-tag"]).toBe("noindex, nofollow");
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

  // QA-M3-001: the case page's lazy leaves (upload, e-mail block) must not
  // leave a script preload the CSP refuses (no nonce): Chromium logs those as
  // console errors, and the hint is wasted.
  for (const [screen, open] of [
    ["quase lá", async () => `/v/${SLUGS.ok}/c/${CASE_TOKENS.pendente}`],
    [
      "em análise",
      async (request: Parameters<typeof createCase>[0]) =>
        `/v/${SLUGS.ok}/c/${await createCase(request, { ageMs: 11_000 })}`,
    ],
  ] as const) {
    test(`QA-M3-001: ${screen} has no script preload without the nonce, and no CSP console error`, async ({
      page,
      request,
    }) => {
      const errors: string[] = [];
      page.on("console", (message) => {
        if (message.type() === "error") errors.push(message.text());
      });

      const response = await page.goto(await open(request));
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await page.waitForLoadState("networkidle");

      const nonce = /'nonce-([^']+)'/.exec(csp(response))?.[1];
      const preloads = await page.$$eval(
        'link[rel="preload"][as="script"], link[rel="modulepreload"]',
        (links) =>
          links.map((link) => ({
            href: link.getAttribute("href"),
            nonce: (link as HTMLLinkElement).nonce,
          })),
      );
      expect(preloads.filter((link) => link.nonce !== nonce)).toEqual([]);
      expect(
        errors.filter((text) => /Content Security Policy|violates/i.test(text)),
      ).toEqual([]);
      // The leaves still render and work from the server HTML.
      await expect(
        page.getByRole("button", { name: "Salvar e-mail" }),
      ).toBeVisible();
    });
  }

  // Zod 4 probes eval with new Function() the first time it compiles a
  // schema; the strict CSP refuses it and the browser reports a violation.
  // The link runs zod jitless, so a full form visit raises none.
  test("the form page, through a full submit, raises no CSP violation", async ({
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
    await page.goto("/v/loja-exemplo");
    await page
      .getByRole("textbox", { name: "CNPJ da empresa" })
      .pressSequentially("12abc34501de35");
    await page
      .getByRole("textbox", { name: "Nome completo do responsável" })
      .fill("Maria Exemplo");
    await page.getByRole("button", { name: "Verificar empresa" }).click();
    await expect(page).toHaveURL(/\/v\/loja-exemplo\/c\/[A-Za-z0-9_-]{22,64}$/);

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
