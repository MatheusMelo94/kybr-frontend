// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

import { settingsSchema } from "@/features/panel-settings/schemas";
import {
  openSession,
  panelStore,
  seedDashboard,
  seedScenario,
  setHomeFault,
} from "@/tests/fixtures/msw/panel-store";

const state = vi.hoisted(() => ({
  headers: new Headers(),
  token: undefined as string | undefined,
}));
const revalidatePath = vi.hoisted(() => vi.fn());
const revalidateTag = vi.hoisted(() => vi.fn());
vi.mock("next/headers", () => ({ headers: async () => state.headers }));
vi.mock("next/cache", () => ({ revalidatePath, revalidateTag }));
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
const reportMarker = vi.hoisted(() => vi.fn());
vi.mock("@/lib/monitoring", () => ({ reportMarker }));

import { saveSettingsAction } from "@/features/panel-settings/actions";
import { panelPath } from "@/lib/panel-paths";

// T130: saveSettingsAction (D-W3 then D-W4), owned by /configuracoes
// (ADR-0011 Addendum 2; Security O-F8).

const VALID = {
  nome_plataforma: "Plataforma Renomeada",
  contato_vendedor: { tipo: "email", valor: "ajuda@exemplo.test" },
  nome: "Pessoa Renomeada",
};

let email: string;
let slug: string;

beforeEach(() => {
  email = `ajustes-${crypto.randomUUID().slice(0, 8)}@exemplo.test`;
  seedDashboard(email, "populado");
  slug = panelStore().accounts.get(email)?.workspace.slug ?? "";
  state.headers = new Headers({ host: "app.kybr.test" });
  state.token = openSession(email).id;
  panelStore().calls.length = 0;
  vi.clearAllMocks();
});

const puts = () =>
  panelStore()
    .calls.filter((call) => call.method === "PUT")
    .map((call) => call.path);

describe("saveSettingsAction (D-W3 + D-W4)", () => {
  it("answers 404 off the panel host before any API call", async () => {
    state.headers = new Headers({ host: "kybr.test" });
    await expect(saveSettingsAction(VALID)).rejects.toThrow("NEXT_NOT_FOUND");
    expect(panelStore().calls).toEqual([]);
  });

  it("saves the workspace, then the own name, and drops the link's cache with the session's slug", async () => {
    expect(await saveSettingsAction(VALID)).toEqual({ ok: true });
    expect(puts()).toEqual(["/v1/workspace", "/v1/me"]);
    const account = panelStore().accounts.get(email);
    expect(account?.workspace.nome).toBe("Plataforma Renomeada");
    expect(account?.workspace.contato_vendedor).toEqual(VALID.contato_vendedor);
    expect(account?.nome).toBe("Pessoa Renomeada");
    expect(revalidateTag).toHaveBeenCalledWith(`public-link:${slug}`);
    expect(revalidatePath).toHaveBeenCalledWith(panelPath("/"), "layout");
  });

  it("the schema has no slug: a client-supplied one is refused (M2-07, O-F8)", () => {
    expect(settingsSchema.safeParse({ ...VALID, slug: "outro" }).success).toBe(
      false,
    );
  });

  it.each([
    ["javascript:", { tipo: "url", valor: "javascript:alert(1)" }],
    ["data:", { tipo: "url", valor: "data:text/html,oi" }],
    ["http:", { tipo: "url", valor: "http://ajuda.exemplo.test" }],
    ["userinfo", { tipo: "url", valor: "https://a:b@ajuda.exemplo.test" }],
    ["an e-mail with ?", { tipo: "email", valor: "a?b@exemplo.test" }],
  ])(
    "O-F8: refuses a %s contact with the onboarding rules, no API call",
    async (_, contato) => {
      expect(
        await saveSettingsAction({ ...VALID, contato_vendedor: contato }),
      ).toEqual({ ok: false, code: "INVALID", fields: ["valor"] });
      expect(panelStore().calls).toEqual([]);
    },
  );

  it("names every invalid field, in form order", async () => {
    expect(
      await saveSettingsAction({
        nome_plataforma: " ",
        contato_vendedor: { tipo: "url", valor: "x" },
        nome: "a".repeat(81),
      }),
    ).toEqual({
      ok: false,
      code: "INVALID",
      fields: ["nome_plataforma", "valor", "nome"],
    });
  });

  it("no session: SESSAO_EXPIRADA as a result, 0 API calls", async () => {
    state.token = undefined;
    expect(await saveSettingsAction(VALID)).toEqual({
      ok: false,
      code: "SESSAO_EXPIRADA",
    });
    expect(panelStore().calls).toEqual([]);
  });

  it("O-F8: PUT /workspace ok but PUT /me failed is a failure (UNAVAILABLE), and a retry is safe", async () => {
    setHomeFault(email, "me-put", { kind: "503", times: 1 });
    expect(await saveSettingsAction(VALID)).toEqual({
      ok: false,
      code: "UNAVAILABLE",
    });
    expect(await saveSettingsAction(VALID)).toEqual({ ok: true });
  });

  it("a failed PUT /workspace stops before PUT /me", async () => {
    setHomeFault(email, "workspace-put", { kind: "500", times: 1 });
    expect(await saveSettingsAction(VALID)).toEqual({
      ok: false,
      code: "UNAVAILABLE",
    });
    expect(puts()).toEqual(["/v1/workspace"]);
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it("a dropped call is NETWORK", async () => {
    setHomeFault(email, "workspace-put", { kind: "drop", times: 1 });
    expect(await saveSettingsAction(VALID)).toEqual({
      ok: false,
      code: "NETWORK",
    });
  });

  it("the API's 422 on the contact maps to the contact field", async () => {
    seedScenario("workspace-invalido", email);
    expect(await saveSettingsAction(VALID)).toEqual({
      ok: false,
      code: "INVALID",
      fields: ["valor"],
    });
  });

  it("logs nothing from a refused input (shape only)", async () => {
    await saveSettingsAction({ ...VALID, nome: 42, segredo: "VALOR-X" });
    expect(JSON.stringify(reportMarker.mock.calls)).not.toContain("VALOR-X");
  });
});
