import type { APIRequestContext, Page, TestInfo } from "@playwright/test";

import type { Preset } from "../../fixtures/factories/panel.ts";
import { MOCK_API } from "./mock-api.ts";

// Client for the panel mock's per-test controls (T45). Every test owns its
// account (a unique e-mail): never POST /__mock/panel/reset here, since the
// projects run fully in parallel against one mock.

export const PANEL_URL = "http://127.0.0.1:3000";
export const LINK_URL = "http://localhost:3000";
const CONTROLS = `${MOCK_API}/__mock/panel`;

/** An e-mail no other test (or project) uses. */
export function uniqueEmail(prefix: string, testInfo: TestInfo): string {
  const project = testInfo.project.name.replace(/[^a-z0-9]/gi, "");
  return `${prefix}-${project}-${Math.random().toString(36).slice(2, 8)}@exemplo.test`;
}

/** A per-test account cloned from a preset (default: onboarded "renata"). */
export async function createAccount(
  request: APIRequestContext,
  email: string,
  preset: Preset = "renata",
  senha?: string,
): Promise<void> {
  const response = await request.post(`${CONTROLS}/accounts`, {
    data: { email, preset, ...(senha !== undefined && { senha }) },
  });
  if (response.status() !== 201)
    throw new Error(`createAccount: ${response.status()}`);
}

export type MockCall = {
  method: string;
  path: string;
  email?: string;
  turnstile?: string;
  authorized: boolean;
};

/** The mock's request log for one e-mail. */
export async function callsFor(
  request: APIRequestContext,
  email: string,
): Promise<MockCall[]> {
  return (await (
    await request.get(`${CONTROLS}/calls?email=${encodeURIComponent(email)}`)
  ).json()) as MockCall[];
}

/** The whole request log (paths and queries, never bodies). */
export async function allCalls(
  request: APIRequestContext,
): Promise<MockCall[]> {
  return (await (await request.get(`${CONTROLS}/calls`)).json()) as MockCall[];
}

/** The last code and reset link mailed to an address. */
export async function outbox(
  request: APIRequestContext,
  email: string,
): Promise<{ codigo?: string; link?: string }> {
  const response = await request.get(
    `${CONTROLS}/outbox?to=${encodeURIComponent(email)}`,
  );
  return response.ok()
    ? ((await response.json()) as { codigo?: string; link?: string })
    : {};
}

export async function seed(
  request: APIRequestContext,
  scenario: "categorias-falham" | "teste-pausado",
  email: string,
): Promise<void> {
  await request.post(`${CONTROLS}/seed`, { data: { scenario, email } });
}

/** PA12: ends every session of an account. */
export async function expireSessions(
  request: APIRequestContext,
  email: string,
): Promise<void> {
  await request.post(`${CONTROLS}/expire-session`, { data: { email } });
}

export async function signupsFor(
  request: APIRequestContext,
  email: string,
): Promise<number> {
  return (
    (await (
      await request.get(
        `${CONTROLS}/signups?email=${encodeURIComponent(email)}`,
      )
    ).json()) as { count: number }
  ).count;
}

export async function logoutsFor(
  request: APIRequestContext,
  email: string,
): Promise<number> {
  return (
    (await (
      await request.get(
        `${CONTROLS}/logouts?email=${encodeURIComponent(email)}`,
      )
    ).json()) as { count: number }
  ).count;
}

/** The panel session cookie's value in this browser, if any. */
export async function sessionCookie(page: Page): Promise<string | undefined> {
  const cookies = await page.context().cookies(PANEL_URL);
  return cookies.find((cookie) => cookie.name === "kybr_session")?.value;
}

/** Logs in through /entrar (the UI) and waits to leave it. */
export async function logIn(
  page: Page,
  email: string,
  senha = "senha-correta-123",
  path = "/entrar",
): Promise<void> {
  await page.goto(path);
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill(senha);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/entrar"));
}

/** Fails if the page scrolls sideways at the current width. */
export async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
}
