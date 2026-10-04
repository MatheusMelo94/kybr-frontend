// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CATEGORIES, PANEL_EMAILS } from "@/tests/fixtures/factories/panel";
import { openSession, panelStore } from "@/tests/fixtures/msw/panel-store";

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

  it("without a session cookie: SESSAO_EXPIRADA, no API call", async () => {
    state.token = undefined;
    expect(await saveOnboardingAction(VALID)).toEqual({
      ok: false,
      code: "SESSAO_EXPIRADA",
    });
    expect(panelStore().calls).toEqual([]);
  });

  it("a revoked session: SESSAO_EXPIRADA", async () => {
    panelStore().sessions.clear();
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
