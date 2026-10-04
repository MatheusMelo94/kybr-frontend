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
