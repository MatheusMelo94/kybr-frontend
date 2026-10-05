import { expect, test } from "@playwright/test";

import { actionId } from "../fixtures/actions.ts";
import {
  PANEL_URL,
  callsFor,
  createAccount,
  uniqueEmail,
} from "../fixtures/panel-mock.ts";

// H-07 (G7): the same build started with PANEL_HOST unset (P-U2, the panel
// "dark"). This project's baseURL is 127.0.0.1:3001, no longer a panel host;
// localhost:3001 is the link host (playwright.config.ts).

const DARK_PANEL = "http://127.0.0.1:3001";
const DARK_LINK = "http://localhost:3001";
const PANEL_PATHS = ["/", "/entrar", "/cadastro", "/fila", "/senha/nova"];

test.describe("PANEL_HOST unset @feature-ops-panel @panel-dark", () => {
  for (const path of PANEL_PATHS) {
    test(`the former panel host answers ${path} with an empty 404`, async ({
      request,
    }) => {
      const response = await request.get(`${DARK_PANEL}${path}`, {
        maxRedirects: 0,
      });
      expect(response.status()).toBe(404);
      expect(await response.text()).toBe("");
    });
  }

  test("the link still works, and a panel path on it is the link's 404 with no panel markup or Turnstile", async ({
    page,
  }) => {
    const turnstile: string[] = [];
    page.on("request", (req) => {
      if (req.url().includes("challenges.cloudflare.com"))
        turnstile.push(req.url());
    });

    const link = await page.goto(`${DARK_LINK}/v/loja-exemplo`);
    expect(link?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    for (const path of ["/entrar", "/cadastro"]) {
      const response = await page.goto(`${DARK_LINK}${path}`);
      expect(response?.status()).toBe(404);
      await expect(page.getByText("Link não encontrado")).toBeVisible();
      await expect(page.getByLabel("Senha")).toHaveCount(0);
    }
    expect(turnstile).toEqual([]);
  });

  test("a panel Server Action replayed on either dark host answers 404 with no API call", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("dark", testInfo);
    await createAccount(request, email);
    // Capture a real loginAction on the lit server (the same build).
    await page.goto(`${PANEL_URL}/entrar`);
    const captured = new Promise<{
      headers: Record<string, string>;
      body: string;
    }>((resolve) => {
      void page.route("**/entrar", async (route) => {
        const req = route.request();
        if (req.method() === "POST") {
          resolve({ headers: req.headers(), body: req.postData() ?? "" });
          await route.abort();
        } else await route.continue();
      });
    });
    await page.getByLabel("E-mail").fill(email);
    await page.getByLabel("Senha").fill("senha-correta-123");
    await page.getByRole("button", { name: "Entrar" }).click();
    const { headers, body } = await captured;

    for (const origin of [DARK_PANEL, DARK_LINK]) {
      const response = await request.post(`${origin}/entrar`, {
        headers: {
          "next-action": headers["next-action"] ?? "",
          "content-type": headers["content-type"] ?? "text/plain;charset=UTF-8",
          accept: "text/x-component",
          origin,
        },
        data: body,
      });
      expect(response.status()).toBe(404);
    }
    expect(await callsFor(request, email)).toEqual([]);
  });

  test("/api/health answers 200 on both hosts", async ({ request }) => {
    for (const origin of [DARK_PANEL, DARK_LINK]) {
      const response = await request.get(`${origin}/api/health`);
      expect(response.status()).toBe(200);
    }
  });

  test("a panel action id POSTed with an HTML Accept to the dark link host ends at once, with no API call", async ({
    request,
  }, testInfo) => {
    const email = uniqueEmail("dark-encaminhada", testInfo);
    for (const path of ["/v/loja-exemplo", "/entrar"]) {
      const started = Date.now();
      const response = await request.post(`${DARK_LINK}${path}`, {
        headers: {
          "next-action": actionId("loginAction"),
          "content-type": "text/plain;charset=UTF-8",
          accept: "text/html",
          origin: DARK_LINK,
        },
        data: JSON.stringify([{ email, senha: "senha-correta-123" }]),
        timeout: 10_000,
      });
      expect(Date.now() - started).toBeLessThan(3_000);
      expect([200, 404]).toContain(response.status());
    }
    expect(await callsFor(request, email)).toEqual([]);
    expect((await request.get(`${DARK_LINK}/api/health`)).status()).toBe(200);
  });
});
