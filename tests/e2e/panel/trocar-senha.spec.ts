import { readFileSync } from "node:fs";

import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";

import { seedDashboard } from "../fixtures/home-mock.ts";
import { MOCK_API } from "../fixtures/mock-api.ts";
import {
  logIn,
  PANEL_URL,
  sessionCookie,
  uniqueEmail,
} from "../fixtures/panel-mock.ts";

// T136 (AC 60 password half; Security O-F1, O-F2, O-F3): Trocar senha in
// Configurações. The rotated cookie keeps the page working, the old one and
// every other session are refused, the notice goes out; a wrong current
// password keeps the session; the password never leaves the form.

const ATUAL = "senha-correta-123";
const NOVA = "uma-senha-nova-sintetica-9";

const current = (page: Page) => page.getByLabel("Senha atual");
const next = (page: Page) => page.getByLabel("Senha nova");
const submit = (page: Page) =>
  page.getByRole("button", { name: "Trocar senha" });

async function openSettings(
  page: Page,
  request: APIRequestContext,
  email: string,
): Promise<void> {
  await seedDashboard(request, email, "populado");
  await logIn(page, email);
  await page.goto("/configuracoes");
  await expect(
    page.getByRole("heading", { level: 2, name: "Trocar senha" }),
  ).toBeVisible();
}

async function avisos(
  request: APIRequestContext,
  email: string,
): Promise<string[]> {
  const response = await request.get(
    `${MOCK_API}/__mock/panel/outbox?to=${encodeURIComponent(email)}`,
  );
  if (!response.ok()) return [];
  return ((await response.json()) as { avisos?: string[] }).avisos ?? [];
}

test.describe("Trocar senha @feature-ops-panel @panel-operacao", () => {
  test("O-F3: success toasts, clears, keeps the page working; the old cookie and another session are refused; the notice goes out @panel-phone", async ({
    page,
    browser,
    request,
  }, testInfo) => {
    const email = uniqueEmail("senha-troca", testInfo);
    await openSettings(page, request, email);
    // A second browser, logged in before the change.
    const other = await browser.newContext({ baseURL: PANEL_URL });
    const otherPage = await other.newPage();
    await logIn(otherPage, email);
    const before = await sessionCookie(page);

    const consoleText: string[] = [];
    page.on("console", (message) => consoleText.push(message.text()));

    await current(page).fill(ATUAL);
    await next(page).fill(NOVA);
    await submit(page).click();
    await expect(
      page.getByRole("status").filter({ hasText: "Senha trocada" }),
    ).toBeVisible();
    await expect(current(page)).toHaveValue("");
    await expect(next(page)).toHaveValue("");

    // O-F2: the value is nowhere but where it was typed.
    const stored = await page.evaluate(() =>
      JSON.stringify([{ ...localStorage }, { ...sessionStorage }]),
    );
    expect(stored).not.toContain(NOVA);
    expect(await page.title()).not.toContain(NOVA);
    expect(consoleText.join("\n")).not.toContain(NOVA);
    expect(await page.content()).not.toContain(NOVA);

    // The rotated cookie keeps the page working.
    const after = await sessionCookie(page);
    expect(after).toBeDefined();
    expect(after).not.toBe(before);
    await page.goto("/fila");
    await expect(page).toHaveURL(/\/fila(\/[\w-]+)?$/);

    // Another session, logged in before, is out on its next navigation.
    await otherPage.goto("/fila");
    await expect(otherPage).toHaveURL(/\/entrar\?motivo=sessao/);
    await other.close();

    // The old cookie, replayed, is refused.
    const replay = await browser.newContext({ baseURL: PANEL_URL });
    await replay.addCookies([
      { name: "kybr_session", value: before ?? "", url: PANEL_URL },
    ]);
    const replayPage = await replay.newPage();
    await replayPage.goto("/fila");
    await expect(replayPage).toHaveURL(/\/entrar/);
    await replay.close();

    expect(await avisos(request, email)).toContain("mail.password_changed");
  });

  test("O-F1: a wrong current password is a field error; the session survives; the 6th try locks the button", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("senha-errada", testInfo);
    await openSettings(page, request, email);

    await current(page).fill("errada-errada-1");
    await next(page).fill(NOVA);
    await submit(page).click();
    await expect(current(page)).toHaveAccessibleDescription(
      "A senha atual não confere.",
    );
    await expect(current(page)).toBeFocused();

    // The next navigation still loads: no expiry.
    await page.goto("/fila");
    await expect(page).toHaveURL(/\/fila(\/[\w-]+)?$/);
    await page.goto("/configuracoes");

    for (let attempt = 2; attempt <= 6; attempt += 1) {
      await current(page).fill("errada-errada-1");
      await next(page).fill(NOVA);
      await submit(page).click();
      if (attempt < 6)
        await expect(current(page)).toHaveAccessibleDescription(
          "A senha atual não confere.",
        );
    }
    await expect(
      page.getByText(
        /^Muitas tentativas seguidas\. Tente de novo em \d+ min\.$/,
      ),
    ).toBeVisible();
    await expect(submit(page)).toBeDisabled();
    await page.goto("/fila");
    await expect(page).toHaveURL(/\/fila(\/[\w-]+)?$/);
  });

  test("O-F2: before hydration the submit is a POST; no URL or query carries the password", async ({
    page,
    browser,
    request,
  }, testInfo) => {
    const email = uniqueEmail("senha-sem-js", testInfo);
    await openSettings(page, request, email);
    const state = await page.context().storageState();
    // Pre-hydration: the app's chunks never load, so React never hydrates
    // (fully JS-off can't show a streamed route: its loading.tsx stays).
    const noJs = await browser.newContext({
      baseURL: PANEL_URL,
      storageState: state,
    });
    await noJs.route("**/_next/static/chunks/**", (route) => route.abort());
    const plain = await noJs.newPage();
    const requests: { method: string; url: string }[] = [];
    plain.on("request", (req) =>
      requests.push({ method: req.method(), url: req.url() }),
    );
    await plain.goto("/configuracoes");
    await expect(
      plain.locator("form").filter({ has: plain.getByLabel("Senha atual") }),
    ).toHaveAttribute("method", /post/i);
    await plain.getByLabel("Senha atual").fill(ATUAL);
    await plain.getByLabel("Senha nova").fill(NOVA);
    await Promise.all([
      plain.waitForLoadState("load"),
      plain.getByRole("button", { name: "Trocar senha" }).click(),
    ]);
    await plain.waitForLoadState("load");

    const posts = requests.filter(
      (req) => req.method === "POST" && req.url.includes("/configuracoes"),
    );
    expect(posts.length).toBeGreaterThan(0);
    for (const req of requests) {
      expect(req.url).not.toMatch(/senha/i);
      expect(req.url).not.toContain(NOVA);
    }
    expect(plain.url()).not.toMatch(/senha/i);
    await noJs.close();
  });

  test("ADR-0008 Addendum 2: changePasswordAction is owned by /configuracoes' page", async () => {
    const manifest = JSON.parse(
      readFileSync(".next/server/server-reference-manifest.json", "utf8"),
    ) as {
      node: Record<
        string,
        { exportedName?: string; workers: Record<string, unknown> }
      >;
    };
    const entry = Object.values(manifest.node).find(
      (value) => value.exportedName === "changePasswordAction",
    );
    expect(Object.keys(entry?.workers ?? {})).toContain(
      "app/(panel)/painel/(app)/configuracoes/page",
    );
  });
});
