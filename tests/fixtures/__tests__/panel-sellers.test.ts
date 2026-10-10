// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";

import { meSchema } from "@/lib/api/schemas/panel/me";
import { policySchema } from "@/lib/api/schemas/panel/policies";
import {
  sellerListSchema,
  sellerSchema,
  type SellerList,
} from "@/lib/api/schemas/panel/sellers";
import { PANEL_PASSWORD } from "@/tests/fixtures/factories/panel";
import {
  AUDIT_ACOES,
  CSV_CAP_BYTES,
  PS10_N,
  SELLER_EMAILS,
  SELLER_NAMES,
  sellerCnpj,
} from "@/tests/fixtures/factories/panel-sellers";
import { panelControlHandlers } from "@/tests/fixtures/msw/handlers/panel-auth";
import { panelBatchControlHandlers } from "@/tests/fixtures/msw/handlers/panel-batches";
import { panelSellerControlHandlers } from "@/tests/fixtures/msw/handlers/panel-sellers";
import { panelStore } from "@/tests/fixtures/msw/panel-store";
import { server } from "@/tests/fixtures/msw/server";

// QA-owned shared fixtures (T138): the M8b mock answers PS1–PS10 and PR1–PR5
// (contract-request.md § M8 additions C-M8-2–C-M8-6) and QA's M8 fixture
// gaps G1–G3, G5, G6, G8 and G9 for Vendedores and Regras. Each JSON
// response is parsed with the frontend's own schemas (T137).

const API = "http://api.kybr.test";
const BFF = { "x-kybr-bff-key": "test-only-bff-key-0123456789abcdef" };
const KEY = "5c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f";
const OTHER_KEY = "6d2e3f4a-5b6c-4d7e-8f9a-0b1c2d3e4f5a";

beforeEach(() => {
  server.use(
    ...panelControlHandlers,
    ...panelBatchControlHandlers,
    ...panelSellerControlHandlers,
  );
});

async function call(
  method: string,
  path: string,
  token?: string,
  body?: unknown,
  headers: Record<string, string> = {},
): Promise<Response> {
  return fetch(`${API}${path}`, {
    method,
    headers: {
      ...BFF,
      "content-type": "application/json",
      ...(token !== undefined && { authorization: `Bearer ${token}` }),
      ...headers,
    },
    ...(body !== undefined && { body: JSON.stringify(body) }),
  });
}

function control(method: string, path: string, body?: unknown) {
  return fetch(`${API}/__mock/panel${path}`, {
    method,
    ...(body !== undefined && { body: JSON.stringify(body) }),
  });
}

let counter = 0;
/** A fresh account seeded with `preset` (QA G1), logged in. */
async function seeded(
  preset: "ps1" | "vazio" = "ps1",
): Promise<{ email: string; token: string }> {
  counter += 1;
  const email = `vendedores-${counter}-${Date.now()}@exemplo.test`;
  expect(
    (await control("POST", "/accounts", { email, preset: "pago" })).status,
  ).toBe(201);
  expect(
    (await control("POST", "/sellers/seed", { email, preset })).status,
  ).toBe(201);
  const login = await call("POST", "/v1/auth/login", undefined, {
    email,
    senha: PANEL_PASSWORD,
  });
  expect(login.status).toBe(200);
  const token = ((await login.json()) as { sessao: { id: string } }).sessao.id;
  return { email, token };
}

async function list(token: string, query = ""): Promise<SellerList> {
  const response = await call("GET", `/v1/sellers?limite=50${query}`, token);
  expect(response.status).toBe(200);
  return sellerListSchema.parse(await response.json());
}

type Needle = {
  id: string;
  n: number;
  cnpj: string;
  status: string;
  case_aberto_id?: string;
};
async function needles(email: string): Promise<Needle[]> {
  const response = await control(
    "GET",
    `/sellers?email=${encodeURIComponent(email)}`,
  );
  expect(response.status).toBe(200);
  return (await response.json()) as Needle[];
}
async function needle(email: string, n: number): Promise<Needle> {
  const found = (await needles(email)).find((item) => item.n === n);
  if (!found) throw new Error(`no seller ${n}`);
  return found;
}

function reverify(token: string, id: string, key = KEY) {
  return call(
    "POST",
    `/v1/sellers/${id}/reverify`,
    token,
    {},
    {
      "idempotency-key": key,
    },
  );
}

async function plan(token: string) {
  const me = meSchema.parse(await (await call("GET", "/v1/me", token)).json());
  return me.workspace?.plano;
}

describe("Vendedores D-S1 (PS1–PS4, PS9)", () => {
  it("PS1: 120 sellers on 3 pages of 50, newest first, mixed status/origem/monitorado/responsável", async () => {
    const { token } = await seeded();
    const first = await list(token, "&pagina=1");
    expect(first).toMatchObject({ total: 120, pagina: 1, paginas: 3 });
    expect(first.itens).toHaveLength(50);
    const third = await list(token, "&pagina=3");
    expect(third.itens).toHaveLength(20);
    const all = [
      ...first.itens,
      ...(await list(token, "&pagina=2")).itens,
      ...third.itens,
    ];
    const dates = all.map((row) => Date.parse(row.verificado_em));
    expect(dates).toEqual([...dates].sort((a, b) => b - a));
    expect(new Set(all.map((row) => row.status))).toEqual(
      new Set(["aprovado", "revisao", "bloqueado", "mudou"]),
    );
    expect(
      all.filter((row) => row.status === "mudou").every((row) => row.mudou),
    ).toBe(true);
    expect(new Set(all.map((row) => row.origem))).toEqual(
      new Set(["link", "lote"]),
    );
    expect(all.some((row) => row.monitorado)).toBe(true);
    expect(all.some((row) => !row.monitorado)).toBe(true);
    expect(all.some((row) => row.responsavel === undefined)).toBe(true);
    expect(all.some((row) => row.razao_social === null)).toBe(true);
  });

  it("QA G4: MEI names with a CPF (formatted and bare), markup and 200 characters", async () => {
    const { token } = await seeded();
    const names = (await list(token, "&pagina=1")).itens.map(
      (row) => row.razao_social,
    );
    for (const name of Object.values(SELLER_NAMES))
      expect(names).toContain(name);
    expect(SELLER_NAMES.long).toHaveLength(200);
  });

  it("PS2: q matches a name (case/accent-insensitive) or a CNPJ prefix, masked or not", async () => {
    const { token } = await seeded();
    const byName = await list(token, "&pagina=1&q=vendedor%20exemplo%2042");
    expect(byName.itens.map((row) => row.razao_social)).toEqual([
      "Vendedor Exemplo 42 Ltda",
    ]);
    expect(
      (await list(token, "&pagina=1&q=COMERCIO%20exemplo")).itens.map(
        (row) => row.razao_social,
      ),
    ).toEqual([SELLER_NAMES.long]);
    const cnpj = sellerCnpj(42);
    const masked = `${cnpj.slice(0, 2)}.${cnpj.slice(2, 5)}.${cnpj.slice(5, 8)}`;
    for (const q of [cnpj, masked, cnpj.slice(0, 8)]) {
      const found = await list(token, `&pagina=1&q=${encodeURIComponent(q)}`);
      expect(found.itens.map((row) => row.cnpj)).toContain(cnpj);
    }
  });

  it("PS2: q never finds another account's sellers (AC 68)", async () => {
    const mine = await seeded();
    const theirs = await seeded();
    const foreign = await needle(theirs.email, 42);
    await control("POST", "/sellers/seed", {
      email: mine.email,
      preset: "vazio",
    });
    const found = await list(mine.token, `&pagina=1&q=${foreign.cnpj}`);
    expect(found).toMatchObject({ itens: [], total: 0 });
  });

  it("PS3: the status filter, with the totals", async () => {
    const { token } = await seeded();
    for (const status of ["aprovado", "revisao", "bloqueado", "mudou"]) {
      const page = await list(token, `&pagina=1&status=${status}`);
      expect(page.total).toBeGreaterThan(0);
      expect(page.itens.every((row) => row.status === status)).toBe(true);
    }
  });

  it("refuses a q over 100 characters, an unknown status or a bad pagina (422)", async () => {
    const { token } = await seeded();
    for (const query of [
      `&pagina=1&q=${"x".repeat(101)}`,
      "&pagina=1&status=suspenso",
      "&pagina=0",
      "&pagina=x",
    ])
      expect(
        (await call("GET", `/v1/sellers?limite=50${query}`, token)).status,
      ).toBe(422);
  });

  it("PS4: vazio@ (read-only) and a vazio seed have nobody", async () => {
    const vazio = await call("POST", "/v1/auth/login", undefined, {
      email: SELLER_EMAILS.vazio,
      senha: PANEL_PASSWORD,
    });
    const token = ((await vazio.json()) as { sessao: { id: string } }).sessao
      .id;
    expect(await list(token, "&pagina=1")).toMatchObject({
      itens: [],
      total: 0,
      paginas: 0,
    });
    const own = await seeded("vazio");
    expect((await list(own.token, "&pagina=1")).total).toBe(0);
  });

  it("PS9: vendedores-falha (per account) → 500 on the list", async () => {
    const { email, token } = await seeded();
    expect(
      (
        await control("POST", "/seed", {
          scenario: "vendedores-falha",
          email,
        })
      ).status,
    ).toBe(204);
    expect(
      (await call("GET", "/v1/sellers?limite=50&pagina=1", token)).status,
    ).toBe(500);
  });

  it("QA G2: a per-account fault with times and ms on the list, then it works", async () => {
    const { email, token } = await seeded();
    await control("POST", "/sellers/fault", {
      email,
      endpoint: "sellers",
      kind: "503",
      times: 1,
    });
    expect(
      (await call("GET", "/v1/sellers?limite=50&pagina=1", token)).status,
    ).toBe(503);
    await control("POST", "/sellers/fault", {
      email,
      endpoint: "sellers",
      kind: "delay",
      ms: 200,
      times: 1,
    });
    const started = Date.now();
    expect((await list(token, "&pagina=1")).total).toBe(120);
    expect(Date.now() - started).toBeGreaterThanOrEqual(190);
  });

  it("QA G5: the calls log carries q, status and pagina under the account's e-mail", async () => {
    const { email, token } = await seeded();
    await list(token, "&pagina=2&status=mudou&q=exemplo");
    const logged = panelStore().calls.filter(
      (entry) => entry.email === email && entry.path.startsWith("/v1/sellers?"),
    );
    expect(logged.at(-1)?.path).toBe(
      "/v1/sellers?limite=50&pagina=2&status=mudou&q=exemplo",
    );
  });
});

describe("Seller detail D-S2 (PS8, PS10)", () => {
  it("PS10: the detail with M6's verification, the history and case_aberto_id (an open case of the account)", async () => {
    const { email, token } = await seeded();
    const target = await needle(email, PS10_N);
    expect(target.case_aberto_id).toBeDefined();
    const response = await call("GET", `/v1/sellers/${target.id}`, token);
    expect(response.status).toBe(200);
    const seller = sellerSchema.parse(await response.json());
    expect(seller).toMatchObject({
      id: target.id,
      status: "mudou",
      case_aberto_id: target.case_aberto_id,
    });
    expect(seller.verificacao_atual?.checagens.length).toBeGreaterThan(0);
    expect(seller.verificacoes[0]?.id).toBe(seller.verificacao_atual?.id);
    const kase = await call("GET", `/v1/cases/${target.case_aberto_id}`, token);
    expect(kase.status).toBe(200);
  });

  it("PS8: a foreign or unknown seller → 404 RECURSO_NAO_ENCONTRADO", async () => {
    const mine = await seeded();
    const theirs = await seeded();
    const foreign = await needle(theirs.email, 1);
    for (const id of [foreign.id, "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d"]) {
      const response = await call("GET", `/v1/sellers/${id}`, mine.token);
      expect(response.status).toBe(404);
      expect(await response.json()).toMatchObject({
        code: "RECURSO_NAO_ENCONTRADO",
      });
    }
  });
});

describe("Reverificar D-S3 (PS5, QA G9)", () => {
  it("202 { reverificacao_pendente: true }, one credit, and the row reads pending", async () => {
    const { email, token } = await seeded();
    const target = await needle(email, 11);
    const before = await plan(token);
    const response = await reverify(token, target.id);
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ reverificacao_pendente: true });
    expect((await plan(token))?.usadas).toBe((before?.usadas ?? 0) + 1);
    const seller = sellerSchema.parse(
      await (await call("GET", `/v1/sellers/${target.id}`, token)).json(),
    );
    expect(seller.reverificacao_pendente).toBe(true);
  });

  it("the same key → the first result, no second credit; logged with the key (QA G5)", async () => {
    const { email, token } = await seeded();
    const target = await needle(email, 12);
    await reverify(token, target.id);
    const used = (await plan(token))?.usadas;
    const again = await reverify(token, target.id);
    expect(again.status).toBe(202);
    expect((await plan(token))?.usadas).toBe(used);
    const keyed = panelStore().calls.filter(
      (entry) => entry.email === email && entry.idempotencyKey === KEY,
    );
    expect(keyed).toHaveLength(2);
  });

  it("a pending one with a new key → 409 REVERIFICACAO_EM_ANDAMENTO, no credit", async () => {
    const { email, token } = await seeded();
    const target = await needle(email, 13);
    await reverify(token, target.id);
    const used = (await plan(token))?.usadas;
    const second = await reverify(token, target.id, OTHER_KEY);
    expect(second.status).toBe(409);
    expect(await second.json()).toMatchObject({
      code: "REVERIFICACAO_EM_ANDAMENTO",
    });
    expect((await plan(token))?.usadas).toBe(used);
  });

  it("no key → 422; a foreign seller → 404", async () => {
    const mine = await seeded();
    const theirs = await seeded();
    const target = await needle(mine.email, 14);
    expect(
      (await call("POST", `/v1/sellers/${target.id}/reverify`, mine.token, {}))
        .status,
    ).toBe(422);
    const foreign = await needle(theirs.email, 14);
    expect((await reverify(mine.token, foreign.id)).status).toBe(404);
  });

  it("QA G9: an exhausted plan (set mid-dialog) → 402 SEM_SALDO", async () => {
    const { email, token } = await seeded();
    const target = await needle(email, 15);
    const current = await plan(token);
    await control("POST", "/plan", { email, usadas: current?.limite });
    const response = await reverify(token, target.id);
    expect(response.status).toBe(402);
    expect(await response.json()).toMatchObject({ code: "SEM_SALDO" });
  });

  it("complete-reverify clears pending and mudou (O-21); a failed lookup releases the credit", async () => {
    const { email, token } = await seeded();
    const changed = (await needles(email)).find(
      (item) => item.status === "mudou" && item.case_aberto_id === undefined,
    );
    if (!changed) throw new Error("no mudou seller");
    await reverify(token, changed.id);
    expect(
      (await control("POST", `/sellers/${changed.id}/complete-reverify`, {}))
        .status,
    ).toBe(204);
    const done = sellerSchema.parse(
      await (await call("GET", `/v1/sellers/${changed.id}`, token)).json(),
    );
    expect(done.reverificacao_pendente).toBe(false);
    expect(done.mudou).toBeUndefined();
    expect(done.status).not.toBe("mudou");
    expect(done.verificacoes).toHaveLength(2);

    const other = await needle(email, 16);
    const before = (await plan(token))?.usadas ?? 0;
    await reverify(token, other.id, OTHER_KEY);
    await control("POST", `/sellers/${other.id}/complete-reverify`, {
      resultado: "falha",
    });
    expect((await plan(token))?.usadas).toBe(before);
  });

  it("deciding the seller's open case clears mudou and case_aberto_id (O-21)", async () => {
    const { email, token } = await seeded();
    const target = await needle(email, PS10_N);
    const decided = await call(
      "POST",
      `/v1/cases/${target.case_aberto_id}/decide`,
      token,
      { decisao: "bloquear", motivo_codigo: "SITUACAO_IRREGULAR" },
      { "idempotency-key": KEY },
    );
    expect(decided.status).toBe(200);
    const seller = sellerSchema.parse(
      await (await call("GET", `/v1/sellers/${target.id}`, token)).json(),
    );
    expect(seller.mudou).toBeUndefined();
    expect(seller.case_aberto_id).toBeUndefined();
    expect(seller.status).toBe("bloqueado");
  });
});

async function text(response: Response): Promise<string> {
  // Keep the BOM: the CSVs must start with it.
  return new TextDecoder("utf-8", { ignoreBOM: true }).decode(
    await response.arrayBuffer(),
  );
}

describe("Exports D-S4 / D-S5 (PS6, PS7, QA G3, G8)", () => {
  it("PS6: the sellers CSV: BOM, ;, the masked CNPJ, the CPF masked, ' escaping, honouring q + status", async () => {
    const { email, token } = await seeded();
    const response = await call("GET", "/v1/sellers/export", token);
    expect(response.headers.get("content-type")).toBe(
      "text/csv; charset=utf-8",
    );
    const body = await text(response);
    expect(body.startsWith("﻿")).toBe(true);
    const lines = body.slice(1).trimEnd().split("\r\n");
    expect(lines[0]).toBe(
      '"CNPJ";"Razão social";"Responsável";"Origem";"Verificado em";"Status";"Monitorado"',
    );
    expect(lines).toHaveLength(121);
    expect(body).toContain('"\'=HYPERLINK(""http://exemplo.test"")"');
    expect(body).toContain('"\'=1+1"');
    expect(body).not.toContain("123.456.789-09");
    expect(body).not.toContain("12345678909");
    const cnpj = sellerCnpj(42);
    expect(body).not.toContain(`"${cnpj}"`);
    expect(body).toContain(
      `"${cnpj.slice(0, 2)}.${cnpj.slice(2, 5)}.${cnpj.slice(5, 8)}/${cnpj.slice(8, 12)}-${cnpj.slice(12)}"`,
    );

    const filtered = await text(
      await call("GET", "/v1/sellers/export?status=mudou&q=exemplo", token),
    );
    expect(filtered.trimEnd().split("\r\n").length).toBeGreaterThan(1);
    expect(filtered.trimEnd().split("\r\n").length).toBeLessThan(121);

    await control("POST", "/seed", { scenario: "csv-sem-escape", email });
    const raw = await text(await call("GET", "/v1/sellers/export", token));
    expect(raw).toContain('"=HYPERLINK(""http://exemplo.test"")"');
  });

  it("PS7: the audit CSV over de..ate, no IP or session hash; 14 months seeded (QA G8)", async () => {
    const { token } = await seeded();
    const today = new Date().toISOString().slice(0, 10);
    const yearAgo = new Date(Date.now() - 360 * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const response = await call(
      "GET",
      `/v1/reports/audit.csv?de=${yearAgo}&ate=${today}`,
      token,
    );
    expect(response.status).toBe(200);
    const body = await text(response);
    const lines = body.slice(1).trimEnd().split("\r\n");
    expect(lines[0]).toBe('"Data e hora";"Ação";"Vendedor";"CNPJ";"Detalhe"');
    for (const acao of AUDIT_ACOES) expect(body).toContain(`"${acao}"`);
    expect(body).not.toMatch(/\bIP\b|sess/i);
    expect(body).not.toContain("123.456.789-09");
    expect(body).toContain('"\'=HYPERLINK(""http://exemplo.test"")"');
    const short = await text(
      await call(
        "GET",
        `/v1/reports/audit.csv?de=${today}&ate=${today}`,
        token,
      ),
    );
    expect(short.trimEnd().split("\r\n").length).toBeLessThan(lines.length);
  });

  it("the audit range: ate < de, over 12 months or a bad day → 422", async () => {
    const { token } = await seeded();
    for (const query of [
      "de=2026-10-10&ate=2026-10-01",
      "de=2025-01-01&ate=2026-10-10",
      "de=2026-13-01&ate=2026-10-10",
      "ate=2026-10-10",
    ])
      expect(
        (await call("GET", `/v1/reports/audit.csv?${query}`, token)).status,
      ).toBe(422);
  });

  it.each([
    ["sellers-csv", "/v1/sellers/export"],
    ["audit-csv", "/v1/reports/audit.csv?de=2026-10-01&ate=2026-10-10"],
  ])(
    "QA G3: %s byte-exact at the cap (4,194,304) and one over; a non-CSV type",
    async (endpoint, path) => {
      const { email, token } = await seeded();
      const sized = async (kind: string) => {
        await control("POST", "/sellers/fault", {
          email,
          endpoint,
          kind,
          times: 1,
        });
        return call("GET", path, token);
      };
      const exact = await sized("csv-exato");
      expect((await exact.arrayBuffer()).byteLength).toBe(CSV_CAP_BYTES);
      const over = await sized("csv-grande");
      expect((await over.arrayBuffer()).byteLength).toBe(CSV_CAP_BYTES + 1);
      const html = await sized("csv-html");
      expect(html.headers.get("content-type")).toBe("text/html");
    },
  );

  it("QA G3: M5's batch CSVs byte-exact at the cap too", async () => {
    const { email, token } = await seeded();
    const started = await call(
      "POST",
      "/v1/batches",
      token,
      { linhas: [{ cnpj: sellerCnpj(1) }] },
      { "idempotency-key": KEY },
    );
    const { id } = (await started.json()) as { id: string };
    await control("POST", "/batch-fault", {
      email,
      endpoint: "result.csv",
      fault: "csv-exato",
      times: 1,
    });
    const exact = await call("GET", `/v1/batches/${id}/result.csv`, token);
    expect((await exact.arrayBuffer()).byteLength).toBe(CSV_CAP_BYTES);
  });
});

describe("Regras D-R1 (PR1–PR5, QA G6)", () => {
  async function getPolicy(token: string, categoria: string) {
    const response = await call("GET", `/v1/policies/${categoria}`, token);
    expect(response.status).toBe(200);
    return policySchema.parse(await response.json());
  }
  async function categoria(token: string): Promise<string> {
    const me = meSchema.parse(
      await (await call("GET", "/v1/me", token)).json(),
    );
    if (!me.workspace?.categoria) throw new Error("no categoria");
    return me.workspace.categoria;
  }

  it("PR1: the default policy for the workspace's category; another category → 404", async () => {
    const { token } = await seeded();
    const policy = await getPolicy(token, await categoria(token));
    expect(policy.versao).toBe(1);
    expect(policy.regras.map((regra) => regra.chave)).toEqual([
      "situacao",
      "recente",
      "qsa",
      "cnae",
      "ie",
      "mei",
      "ok",
    ]);
    expect(policy.documentos_habilitados.length).toBeGreaterThan(0);
    expect(
      (await call("GET", "/v1/policies/outra-categoria", token)).status,
    ).toBe(404);
  });

  it("PR4: a save bumps versao and /me documentos_habilitados reflects it (QA G5: versao logged)", async () => {
    const { email, token } = await seeded();
    const cat = await categoria(token);
    const policy = await getPolicy(token, cat);
    const regras = policy.regras.map((regra) =>
      regra.chave === "mei" ? { ...regra, acao: "review" as const } : regra,
    );
    const saved = await call("PUT", `/v1/policies/${cat}`, token, {
      versao: policy.versao,
      regras,
      documentos_habilitados: ["PROCURACAO"],
    });
    expect(saved.status).toBe(200);
    const after = policySchema.parse(await saved.json());
    expect(after.versao).toBe(policy.versao + 1);
    expect(after.regras.find((regra) => regra.chave === "mei")?.acao).toBe(
      "review",
    );
    const me = meSchema.parse(
      await (await call("GET", "/v1/me", token)).json(),
    );
    expect(me.workspace?.documentos_habilitados).toEqual(["PROCURACAO"]);
    const logged = panelStore().calls.filter(
      (entry) => entry.email === email && entry.method === "PUT",
    );
    expect(logged.at(-1)?.versao).toBe(policy.versao);
  });

  it("PR2: a stale versao → 409 POLITICA_DESATUALIZADA; QA G6 bumps it", async () => {
    const { email, token } = await seeded();
    const cat = await categoria(token);
    const policy = await getPolicy(token, cat);
    expect((await control("POST", "/policy/bump", { email })).status).toBe(204);
    const bumped = await getPolicy(token, cat);
    expect(bumped.versao).toBe(policy.versao + 1);
    expect(bumped.regras).not.toEqual(policy.regras);
    const stale = await call("PUT", `/v1/policies/${cat}`, token, {
      versao: policy.versao,
      regras: policy.regras,
      documentos_habilitados: policy.documentos_habilitados,
    });
    expect(stale.status).toBe(409);
    expect(await stale.json()).toMatchObject({
      code: "POLITICA_DESATUALIZADA",
    });
  });

  it("PR3: Pedir documento with no document → 422 SEM_DOCUMENTO_HABILITADO", async () => {
    const { token } = await seeded();
    const cat = await categoria(token);
    const policy = await getPolicy(token, cat);
    const response = await call("PUT", `/v1/policies/${cat}`, token, {
      versao: policy.versao,
      regras: policy.regras,
      documentos_habilitados: [],
    });
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      code: "SEM_DOCUMENTO_HABILITADO",
    });
  });

  it("O-F7: an acao outside the rule's acoes_permitidas, a missing rule or dias out of range → 422 VALOR_INVALIDO", async () => {
    const { token } = await seeded();
    const cat = await categoria(token);
    const policy = await getPolicy(token, cat);
    const patch = (chave: string, change: Record<string, unknown>) =>
      policy.regras.map((regra) =>
        regra.chave === chave ? { ...regra, ...change } : regra,
      );
    for (const regras of [
      patch("situacao", { acao: "auto", acoes_permitidas: ["auto"] }),
      patch("recente", { dias: 0 }),
      patch("recente", { dias: 3651 }),
      policy.regras.slice(1),
    ]) {
      const response = await call("PUT", `/v1/policies/${cat}`, token, {
        versao: policy.versao,
        regras,
        documentos_habilitados: policy.documentos_habilitados,
      });
      expect(response.status).toBe(422);
      expect(await response.json()).toMatchObject({ code: "VALOR_INVALIDO" });
    }
  });

  it("PR5: regras-falha (per account) → 500 on the read; a put fault too (QA G2)", async () => {
    const { email, token } = await seeded();
    const cat = await categoria(token);
    await control("POST", "/seed", { scenario: "regras-falha", email });
    expect((await call("GET", `/v1/policies/${cat}`, token)).status).toBe(500);
    await control("POST", "/unseed", { scenario: "regras-falha", email });
    const policy = await getPolicy(token, cat);
    await control("POST", "/sellers/fault", {
      email,
      endpoint: "policy-put",
      kind: "drop",
      times: 1,
    });
    await expect(
      call("PUT", `/v1/policies/${cat}`, token, {
        versao: policy.versao,
        regras: policy.regras,
        documentos_habilitados: policy.documentos_habilitados,
      }),
    ).rejects.toThrow();
  });
});
