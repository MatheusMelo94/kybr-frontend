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

const state = vi.hoisted(() => ({ token: undefined as string | undefined }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ host: "app.kybr.test" }),
}));
vi.mock("next/navigation", () => ({ notFound: vi.fn(), redirect: vi.fn() }));
vi.mock("@/lib/api/panel/cookies", () => ({
  readSessionToken: async () => state.token,
}));
const reportMarker = vi.hoisted(() => vi.fn());
vi.mock("@/lib/monitoring", () => ({ reportMarker }));

import { getPolicy, savePolicy } from "@/lib/api/panel/policies";

// T139: D-R1 GET/PUT /v1/policies/{categoria} (C-M8-6), Pre-Contract.

let email: string;
let categoria: string;

beforeEach(() => {
  email = `regras-${crypto.randomUUID().slice(0, 8)}@exemplo.test`;
  const account = createAccount({ email, preset: "pago" });
  categoria = account.workspace.categoria ?? "";
  state.token = openSession(email).id;
  panelStore().calls.length = 0;
  reportMarker.mockClear();
});

const policyCalls = () =>
  panelStore().calls.filter((call) => call.path.startsWith("/v1/policies"));

async function draft() {
  const policy = await getPolicy(categoria);
  return {
    versao: policy.versao,
    regras: policy.regras.map(({ chave, acao, dias }) => ({
      chave,
      acao,
      ...(dias !== undefined && { dias }),
    })),
    documentos_habilitados: policy.documentos_habilitados,
  };
}

describe("getPolicy (D-R1)", () => {
  it("PR1: the parsed default policy", async () => {
    const policy = await getPolicy(categoria);
    expect(policy.versao).toBe(1);
    expect(policy.regras).toHaveLength(7);
  });

  it("no session → SESSAO_EXPIRADA, 0 API calls", async () => {
    state.token = undefined;
    await expect(getPolicy(categoria)).rejects.toMatchObject({
      code: "SESSAO_EXPIRADA",
    });
    await expect(
      savePolicy(categoria, {
        versao: 1,
        regras: [],
        documentos_habilitados: [],
      }),
    ).rejects.toMatchObject({ code: "SESSAO_EXPIRADA" });
    expect(policyCalls()).toEqual([]);
  });

  it("an acao outside acoes_permitidas → UNAVAILABLE with a marker (O-F7)", async () => {
    server.use(
      http.get("*/v1/policies/:categoria", () =>
        HttpResponse.json({
          versao: 1,
          regras: [{ chave: "ok", acao: "block", acoes_permitidas: ["auto"] }],
          documentos_habilitados: [],
        }),
      ),
    );
    await expect(getPolicy(categoria)).rejects.toMatchObject({
      code: "UNAVAILABLE",
    });
    expect(reportMarker).toHaveBeenCalledWith(
      "POLICY_SCHEMA_INVALID",
      expect.objectContaining({ operation: "policy" }),
    );
  });

  it("regras-falha (a 5xx) → UNAVAILABLE", async () => {
    setSellerFault(email, "policy-get", { kind: "500", times: 1 });
    await expect(getPolicy(categoria)).rejects.toMatchObject({
      code: "UNAVAILABLE",
    });
  });
});

describe("savePolicy (D-R1 PUT)", () => {
  it("sends the whole policy with versao and answers the new one", async () => {
    const input = await draft();
    const saved = await savePolicy(categoria, {
      ...input,
      regras: input.regras.map((regra) =>
        regra.chave === "mei" ? { ...regra, acao: "review" as const } : regra,
      ),
    });
    expect(saved.versao).toBe(input.versao + 1);
    expect(policyCalls().at(-1)).toMatchObject({
      method: "PUT",
      versao: input.versao,
      bodyKeys: ["documentos_habilitados", "regras", "versao"],
    });
  });

  it("PR2: a stale versao → POLITICA_DESATUALIZADA", async () => {
    const input = await draft();
    policyOf(email).versao += 1;
    await expect(savePolicy(categoria, input)).rejects.toMatchObject({
      code: "POLITICA_DESATUALIZADA",
    });
  });

  it("PR3: request with no document → SEM_DOCUMENTO_HABILITADO", async () => {
    const input = await draft();
    await expect(
      savePolicy(categoria, { ...input, documentos_habilitados: [] }),
    ).rejects.toMatchObject({ code: "SEM_DOCUMENTO_HABILITADO" });
  });

  it("an acao the server doesn't allow → VALOR_INVALIDO; a drop → NETWORK", async () => {
    const input = await draft();
    await expect(
      savePolicy(categoria, {
        ...input,
        regras: input.regras.map((regra) =>
          regra.chave === "situacao"
            ? { ...regra, acao: "auto" as const }
            : regra,
        ),
      }),
    ).rejects.toMatchObject({ code: "VALOR_INVALIDO" });
    setSellerFault(email, "policy-put", { kind: "drop", times: 1 });
    await expect(savePolicy(categoria, input)).rejects.toMatchObject({
      code: "NETWORK",
    });
  });
});
