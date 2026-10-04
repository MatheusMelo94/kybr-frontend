// @vitest-environment node
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CATEGORIES, PANEL_EMAILS } from "@/tests/fixtures/factories/panel";
import { openSession, panelStore } from "@/tests/fixtures/msw/panel-store";
import { server } from "@/tests/fixtures/msw/server";

const state = vi.hoisted(() => ({
  headers: new Headers(),
  token: undefined as string | undefined,
}));
const revalidatePath = vi.hoisted(() => vi.fn());
vi.mock("next/headers", () => ({ headers: async () => state.headers }));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  }),
}));
vi.mock("@/lib/api/panel/cookies", () => ({
  readSessionToken: async () => state.token,
}));
vi.mock("@/lib/monitoring", () => ({ reportMarker: vi.fn() }));

import { saveOnboardingAction } from "@/features/panel-onboarding/actions";
import { panelPath } from "@/lib/panel-paths";

const VALID = {
  contato_vendedor: { tipo: "url", valor: "https://ajuda.exemplo.test" },
  categoria: CATEGORIES[1].id,
};

beforeEach(() => {
  state.headers = new Headers({ host: "app.kybr.test" });
  state.token = openSession(PANEL_EMAILS.nova).id;
  vi.clearAllMocks();
});

describe("saveOnboardingAction (D-W3)", () => {
  it("answers 404 off the panel host before any API call", async () => {
    state.headers = new Headers({ host: "kybr.test" });
    await expect(saveOnboardingAction(VALID)).rejects.toThrow("NEXT_NOT_FOUND");
    expect(panelStore().calls).toEqual([]);
  });

  it("saves with the session, completes onboarding, refreshes the panel layout and goes to ONBOARDING_NEXT", async () => {
    expect(await saveOnboardingAction(VALID)).toEqual({
      ok: true,
      next: "/fila",
    });
    expect(
      panelStore().accounts.get(PANEL_EMAILS.nova)?.workspace
        .onboarding_concluido,
    ).toBe(true);
    expect(panelStore().calls.at(-1)).toMatchObject({
      method: "PUT",
      path: "/v1/workspace",
      authorized: true,
    });
    expect(revalidatePath).toHaveBeenCalledWith(panelPath("/"), "layout");
  });

  it("without a session cookie: requireSession() redirects to /entrar, no API call", async () => {
    state.token = undefined;
    await expect(saveOnboardingAction(VALID)).rejects.toThrow(
      "NEXT_REDIRECT /entrar?motivo=sessao",
    );
    expect(panelStore().calls).toEqual([]);
  });

  it("a session /me rejects: the same redirect, and no PUT", async () => {
    panelStore().sessions.clear();
    await expect(saveOnboardingAction(VALID)).rejects.toThrow(
      "NEXT_REDIRECT /entrar?motivo=sessao",
    );
    expect(panelStore().calls.map((call) => call.method)).toEqual(["GET"]);
  });

  it("a 401 on the PUT after requireSession() passed: SESSAO_EXPIRADA", async () => {
    server.use(
      http.put("*/v1/workspace", () =>
        HttpResponse.json(
          { code: "SESSAO_EXPIRADA", message: "m" },
          { status: 401 },
        ),
      ),
    );
    expect(await saveOnboardingAction(VALID)).toEqual({
      ok: false,
      code: "SESSAO_EXPIRADA",
    });
  });

  it("an invalid payload is a field result with no API call", async () => {
    expect(
      await saveOnboardingAction({
        ...VALID,
        contato_vendedor: { tipo: "url", valor: "http://x.co" },
      }),
    ).toEqual({ ok: false, code: "INVALID", fields: ["valor"] });
    expect(panelStore().calls).toEqual([]);
  });
});
