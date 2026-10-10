// @vitest-environment node
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createAccount,
  openSession,
  panelStore,
  policyOf,
  setSellerFault,
} from "@/tests/fixtures/msw/panel-store";
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

import { savePolicyAction } from "@/features/panel-regras/actions";
import { panelPath } from "@/lib/panel-paths";

// T139: savePolicyAction (D-R1 PUT, C-M8-6), owned by /regras (plan-m8 D8,
// O-F7). The category is the session's, never the client's.

let email: string;

const DRAFT = () => ({
  versao: 1,
  regras: [
    { chave: "situacao", acao: "block" },
    { chave: "recente", acao: "review", dias: 180 },
    { chave: "qsa", acao: "request" },
    { chave: "cnae", acao: "review" },
    { chave: "ie", acao: "approve_limit" },
    { chave: "mei", acao: "review" },
    { chave: "ok", acao: "auto" },
  ],
  documentos_habilitados: ["CONTRATO_SOCIAL_OU_CCMEI", "PROCURACAO"],
});

beforeEach(() => {
  email = `regras-${crypto.randomUUID().slice(0, 8)}@exemplo.test`;
  createAccount({ email, preset: "pago" });
  state.headers = new Headers({ host: "app.kybr.test" });
  state.token = openSession(email).id;
  panelStore().calls.length = 0;
  vi.clearAllMocks();
});

const policyCalls = () =>
  panelStore().calls.filter((call) => call.path.startsWith("/v1/policies"));

describe("savePolicyAction (D-R1 PUT)", () => {
  it("answers 404 off the panel host before any API call", async () => {
    state.headers = new Headers({ host: "kybr.test" });
    await expect(savePolicyAction(DRAFT())).rejects.toThrow("NEXT_NOT_FOUND");
    expect(panelStore().calls).toEqual([]);
  });

  it("saves the whole policy with versao to the session's category; revalidates /regras and the layout", async () => {
    const account = panelStore().accounts.get(email);
    expect(await savePolicyAction(DRAFT())).toEqual({ ok: true, versao: 2 });
    expect(policyCalls()).toMatchObject([
      {
        method: "PUT",
        path: `/v1/policies/${account?.workspace.categoria}`,
        versao: 1,
      },
    ]);
    expect(policyOf(email).regras.find((r) => r.chave === "mei")?.acao).toBe(
      "review",
    );
    expect(account?.workspace.documentos_habilitados).toEqual([
      "CONTRATO_SOCIAL_OU_CCMEI",
      "PROCURACAO",
    ]);
    expect(revalidatePath).toHaveBeenCalledWith(panelPath("/"), "layout");
  });

  it.each([
    ["no input", undefined],
    ["an extra key", { ...DRAFT(), categoria: "outra" }],
    [
      "an unknown chave",
      {
        ...DRAFT(),
        regras: [...DRAFT().regras.slice(1), { chave: "x", acao: "block" }],
      },
    ],
    [
      "an unknown acao",
      {
        ...DRAFT(),
        regras: DRAFT().regras.map((r) =>
          r.chave === "ok" ? { ...r, acao: "ignorar" } : r,
        ),
      },
    ],
    [
      "dias 0",
      {
        ...DRAFT(),
        regras: DRAFT().regras.map((r) =>
          r.chave === "recente" ? { ...r, dias: 0 } : r,
        ),
      },
    ],
    [
      "dias 3651",
      {
        ...DRAFT(),
        regras: DRAFT().regras.map((r) =>
          r.chave === "recente" ? { ...r, dias: 3651 } : r,
        ),
      },
    ],
    [
      "dias not an integer",
      {
        ...DRAFT(),
        regras: DRAFT().regras.map((r) =>
          r.chave === "recente" ? { ...r, dias: 1.5 } : r,
        ),
      },
    ],
    [
      "dias on another rule",
      {
        ...DRAFT(),
        regras: DRAFT().regras.map((r) =>
          r.chave === "qsa" ? { ...r, dias: 30 } : r,
        ),
      },
    ],
    [
      "recente without dias",
      {
        ...DRAFT(),
        regras: DRAFT().regras.map((r) =>
          r.chave === "recente" ? { chave: "recente", acao: "review" } : r,
        ),
      },
    ],
    [
      "a repeated chave",
      {
        ...DRAFT(),
        regras: DRAFT().regras.map((r) =>
          r.chave === "ok" ? { chave: "mei", acao: "review" } : r,
        ),
      },
    ],
    ["an unknown documento", { ...DRAFT(), documentos_habilitados: ["RG"] }],
    ["a negative versao", { ...DRAFT(), versao: -1 }],
    [
      "Pedir documento with no document (nodocs)",
      { ...DRAFT(), documentos_habilitados: [] },
    ],
  ])("refuses %s with no API call", async (_name, input) => {
    expect(await savePolicyAction(input)).toEqual({
      ok: false,
      code: "VALOR_INVALIDO",
    });
    expect(panelStore().calls).toEqual([]);
  });

  it("no session: SESSAO_EXPIRADA as a result, 0 API calls", async () => {
    state.token = undefined;
    expect(await savePolicyAction(DRAFT())).toEqual({
      ok: false,
      code: "SESSAO_EXPIRADA",
    });
    expect(policyCalls()).toEqual([]);
  });

  it("409 → POLITICA_DESATUALIZADA, never retried or merged", async () => {
    policyOf(email).versao = 5;
    expect(await savePolicyAction(DRAFT())).toEqual({
      ok: false,
      code: "POLITICA_DESATUALIZADA",
    });
    expect(policyCalls()).toHaveLength(1);
  });

  it("422 SEM_DOCUMENTO_HABILITADO from the API is mapped", async () => {
    server.use(
      http.put("*/v1/policies/:categoria", () =>
        HttpResponse.json(
          { code: "SEM_DOCUMENTO_HABILITADO", message: "x" },
          { status: 422 },
        ),
      ),
    );
    expect(await savePolicyAction(DRAFT())).toEqual({
      ok: false,
      code: "SEM_DOCUMENTO_HABILITADO",
    });
  });

  it("a drop → NETWORK, a 5xx → UNAVAILABLE", async () => {
    setSellerFault(email, "policy-put", { kind: "drop", times: 1 });
    expect(await savePolicyAction(DRAFT())).toEqual({
      ok: false,
      code: "NETWORK",
    });
    setSellerFault(email, "policy-put", { kind: "500", times: 1 });
    expect(await savePolicyAction(DRAFT())).toEqual({
      ok: false,
      code: "UNAVAILABLE",
    });
  });
});
