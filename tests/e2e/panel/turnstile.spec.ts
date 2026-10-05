import { expect, test } from "@playwright/test";

// ADR-0009 rule 13, P03.4: Turnstile is the panel's only third-party script,
// on the auth pages only. The form-level cases (the token reaching the mock,
// the failure copy) live with the forms: login.spec.ts, signup.spec.ts.

const TURNSTILE = "challenges.cloudflare.com";

test.describe("Turnstile scope @feature-ops-panel @panel-access", () => {
  test("a non-auth panel page makes no request to Turnstile", async ({
    page,
    context,
  }) => {
    await context.addCookies([
      {
        name: "kybr_session",
        value: "presenca-somente-0123456789",
        url: "http://127.0.0.1:3000",
      },
    ]);
    const requests: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes(TURNSTILE)) requests.push(request.url());
    });

    await page.goto("/fila");
    await page.waitForLoadState("networkidle");

    expect(requests).toEqual([]);
  });
});

test.describe("Turnstile on an auth page @feature-ops-panel @panel-access", () => {
  test("/cadastro loads the real widget under the nonce CSP, with no violation", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const store = window as unknown as { __csp: string[] };
      store.__csp = [];
      document.addEventListener("securitypolicyviolation", (event) => {
        store.__csp.push(
          `${event.violatedDirective} ${event.blockedURI} ${event.sourceFile}`,
        );
      });
    });
    await page.goto("/cadastro");

    // Cloudflare's always-pass test key: the widget renders and solves itself.
    await expect(page.locator('input[name="turnstile"]')).toHaveValue(
      "XXXX.DUMMY.TOKEN.XXXX",
      {
        timeout: 20_000,
      },
    );
    // No refusal at all: Turnstile needs no relaxation, and the panel's Zod
    // runs jitless (lib/zod-jitless.ts), so it never probes eval.
    expect(
      await page.evaluate(
        () => (window as unknown as { __csp: string[] }).__csp,
      ),
    ).toEqual([]);
  });
});
