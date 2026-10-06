// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";

import {
  caseListSchema,
  caseSchema,
  newCasesSchema,
  requestDocumentsResultSchema,
} from "@/lib/api/schemas/panel/cases";
import { meSchema } from "@/lib/api/schemas/panel/me";
import {
  AC16,
  ERROR_SENTINEL,
  FOREIGN_CASE_ID,
  FOREIGN_DOC_ID,
  FOREIGN_VERIFICATION_ID,
  PANEL_EMAILS,
  PANEL_PASSWORD,
} from "@/tests/fixtures/factories/panel";
import { panelControlHandlers } from "@/tests/fixtures/msw/handlers/panel-auth";
import { panelBatchControlHandlers } from "@/tests/fixtures/msw/handlers/panel-batches";
import { panelCaseControlHandlers } from "@/tests/fixtures/msw/handlers/panel-cases";
import { server } from "@/tests/fixtures/msw/server";

// QA-owned shared fixtures (T92): the cases mock answers every M6 scenario of
// contract-request.md (PC1–PC22) by its documented key, and QA's fixture
// gaps G1–G12. Each response is also parsed with the frontend's own schemas
// (T91), so the mock and the client can't drift apart silently.

const API = "http://api.kybr.test";
const BFF = { "x-kybr-bff-key": "test-only-bff-key-0123456789abcdef" };
const KEY = "0b7f3c1e-2a4d-4e5f-8a6b-9c0d1e2f3a4b";
const KEY_2 = "1c8a4d2f-3b5e-4f60-9b7c-0d1e2f3a4b5c";
const UNKNOWN_ID = "00000000-0000-4000-8000-000000000000";

beforeEach(() => {
  server.use(
    ...panelControlHandlers,
    ...panelBatchControlHandlers,
    ...panelCaseControlHandlers,
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

async function control(
  method: string,
  path: string,
  body?: unknown,
): Promise<Response> {
  return fetch(`${API}/__mock/panel${path}`, {
    method,
    ...(body !== undefined && { body: JSON.stringify(body) }),
  });
}

async function json<T = Record<string, unknown>>(
  response: Response,
): Promise<T> {
  return (await response.json()) as T;
}

async function errorCode(response: Response): Promise<string> {
  const body = await json(response);
  expect(body.message).toBe(ERROR_SENTINEL);
  expect(response.headers.get("x-request-id")).toBeTruthy();
  return String(body.code);
}

async function login(email: string): Promise<string> {
  const response = await call("POST", "/v1/auth/login", undefined, {
    email,
    senha: PANEL_PASSWORD,
  });
  expect(response.status).toBe(200);
  return (await json<{ sessao: { id: string } }>(response)).sessao.id;
}

type Listed = {
  id: string;
  kind: string;
  estado: string;
  origem: string;
  verification_id: string;
  documentos: string[];
};

/** A fresh account with a preset (QA G1), logged in. */
async function seeded(
  preset: string,
  name = preset,
): Promise<{ email: string; token: string; cases: Listed[] }> {
  const email = `${name}-${crypto.randomUUID().slice(0, 8)}@exemplo.test`;
  const response = await control("POST", "/cases/seed", { email, preset });
  expect(response.status).toBe(201);
  const cases = await json<Listed[]>(response);
  return { email, token: await login(email), cases };
}

async function list(
  token: string,
  query = "estado=aberto",
  headers: Record<string, string> = {},
) {
  const response = await call(
    "GET",
    `/v1/cases?${query}`,
    token,
    undefined,
    headers,
  );
  expect(response.status).toBe(200);
  return caseListSchema.parse(await response.json());
}

async function read(token: string, id: string) {
  const response = await call("GET", `/v1/cases/${id}`, token);
  expect(response.status).toBe(200);
  return caseSchema.parse(await response.json());
}

async function me(token: string) {
  return meSchema.parse(await (await call("GET", "/v1/me", token)).json());
}

function decide(token: string, id: string, body: unknown, key = KEY) {
  return call("POST", `/v1/cases/${id}/decide`, token, body, {
    "idempotency-key": key,
  });
}

function request(token: string, id: string, body: unknown, key = KEY) {
  return call("POST", `/v1/cases/${id}/request-documents`, token, body, {
    "idempotency-key": key,
  });
}

const byKind = (cases: Listed[], kind: string): Listed => {
  const found = cases.find((item) => item.kind === kind);
  if (!found) throw new Error(`no ${kind} case`);
  return found;
};

describe("PC1, PC3, PC4: the seeded Fila accounts", () => {
  it("PC1: fila@ has 30 open (4 late, one nodata), 3 waiting, 2 decided; 25 + a cursor by default", async () => {
    const token = await login(PANEL_EMAILS.fila);
    const page = await list(token);
    expect(page.total).toBe(30);
    expect(page.itens).toHaveLength(25);
    expect(page.proximo_cursor).not.toBeNull();
    expect(page.itens.filter((item) => item.vencido)).toHaveLength(4);
    expect(new Set(page.itens.map((item) => item.origem))).toEqual(
      new Set(["link", "lote", "monitoramento"]),
    );
    expect(page.itens.some((item) => item.razao_social === null)).toBe(true);
    const rest = await list(
      token,
      `estado=aberto&cursor=${page.proximo_cursor}`,
    );
    expect(rest.itens).toHaveLength(5);
    expect(rest.proximo_cursor).toBeNull();
    expect((await list(token, "estado=aguardando_doc")).total).toBe(3);
  });

  it("D-C1 sort: sla_ate ascending, then id", async () => {
    const page = await list(
      await login(PANEL_EMAILS.fila),
      "estado=aberto&limit=200",
    );
    const keys = page.itens.map(
      (item) => [Date.parse(item.sla_ate), item.id] as const,
    );
    const sorted = [...keys].sort(
      (a, b) => a[0] - b[0] || (a[1] < b[1] ? -1 : 1),
    );
    expect(keys).toEqual(sorted);
  });

  it("PC3: filavazia@ has nothing open or waiting", async () => {
    const token = await login(PANEL_EMAILS.filavazia);
    expect((await list(token)).total).toBe(0);
    expect((await list(token, "estado=aguardando_doc")).total).toBe(0);
  });

  it("PC4: semwebhook@ has webhook_configurado false; fila@ true", async () => {
    expect(
      (await me(await login(PANEL_EMAILS.semwebhook))).workspace
        .webhook_configurado,
    ).toBe(false);
    expect(
      (await me(await login(PANEL_EMAILS.fila))).workspace.webhook_configurado,
    ).toBe(true);
  });
});

describe("PC2: limit up to 200, gerado_em (C-M6-1, C-M6-2)", () => {
  it("one call returns up to 200, with gerado_em from the account's clock", async () => {
    const { email, token } = await seeded("duzentos-e-vinte");
    await control("POST", "/case-clock", {
      email,
      now: "2026-10-06T14:00:00Z",
    });
    const page = await list(token, "estado=aberto&limit=200");
    expect(page.itens).toHaveLength(200);
    expect(page.total).toBe(220);
    expect(page.gerado_em).toBe("2026-10-06T14:00:00.000Z");
  });

  it.each([
    "limit=0",
    "limit=201",
    "limit=2.5",
    "limit=x",
    "cursor=%%%",
    "estado=decidido",
  ])("%s → 422 VALOR_INVALIDO", async (query) => {
    const token = await login(PANEL_EMAILS.fila);
    const response = await call(
      "GET",
      `/v1/cases?${query.startsWith("estado") ? query : `estado=aberto&${query}`}`,
      token,
    );
    expect(response.status).toBe(422);
    expect(await errorCode(response)).toBe("VALOR_INVALIDO");
  });
});

describe("PC5–PC8, PC10, PC11: the detail kinds", () => {
  it("each kind parses with the frontend's schema and carries its shape", async () => {
    const { token, cases } = await seeded("cada-tipo");
    const link = await read(token, byKind(cases, "link").id);
    expect(link).toMatchObject({ origem: "link", vendedor_tem_email: true });
    expect(link.ext_id).toBeTruthy();
    const semQsa = await read(token, byKind(cases, "lote-sem-qsa").id);
    expect(semQsa.origem).toBe("lote");
    expect(semQsa.responsavel_informado).toBeUndefined();
    const alerta = await read(token, byKind(cases, "alerta").id);
    expect(alerta.origem).toBe("monitoramento");
    expect(alerta.mudanca).toBeDefined();
    const nodata = await read(token, byKind(cases, "nodata").id);
    expect(nodata).toMatchObject({
      variante: "DADOS_NAO_ENCONTRADOS",
      razao_social: null,
    });
    const decided = await read(token, byKind(cases, "decidido-bloquear").id);
    expect(decided.decisao).toMatchObject({
      tipo: "bloquear",
      motivo_codigo: "ATIVIDADE_FORA_DA_CATEGORIA",
    });
    const manter = await read(token, byKind(cases, "decidido-manter").id);
    expect(manter.decisao?.tipo).toBe("manter");
    const waiting = await read(token, byKind(cases, "aguardando-sem-email").id);
    expect(waiting.estado).toBe("aguardando_doc");
    expect(waiting.link_vendedor).toMatch(
      /^https:\/\/kybr\.test\/v\/[a-z0-9-]+\/c\/[A-Za-z0-9_-]{22,}$/,
    );
    const withEmail = await read(token, byKind(cases, "aguardando").id);
    expect(withEmail.link_vendedor).toBeUndefined();
  });

  it("history is newest first, with the closed event types and no ator", async () => {
    const { token, cases } = await seeded("cada-tipo");
    const decided = await read(token, byKind(cases, "decidido-aprovar").id);
    expect(decided.eventos?.map((event) => event.tipo)).toEqual([
      "decidido",
      "caso_criado",
    ]);
  });
});

describe("PC9 / G8: foreign and unknown ids → the identical 404", () => {
  it("case, decide, request and certificate", async () => {
    const token = await login(PANEL_EMAILS.fila);
    const bodies: string[] = [];
    for (const id of [FOREIGN_CASE_ID, UNKNOWN_ID]) {
      const response = await call("GET", `/v1/cases/${id}`, token);
      expect(response.status).toBe(404);
      const { code, message } = await json(response);
      bodies.push(JSON.stringify({ code, message }));
      expect((await decide(token, id, { decisao: "aprovar" })).status).toBe(
        404,
      );
      expect(
        (await request(token, id, { tipos: ["CARTAO_CNPJ"] })).status,
      ).toBe(404);
    }
    expect(bodies[0]).toBe(bodies[1]);
    expect(
      (
        await call(
          "GET",
          `/v1/verifications/${FOREIGN_VERIFICATION_ID}/certificate`,
          token,
        )
      ).status,
    ).toBe(404);
    // The foreign case has a document, for DR-05.
    const outro = await login(PANEL_EMAILS.outro);
    expect((await read(outro, FOREIGN_CASE_ID)).documentos?.[0]?.id).toBe(
      FOREIGN_DOC_ID,
    );
  });

  it("no bearer → 401", async () => {
    const response = await call("GET", "/v1/cases?estado=aberto");
    expect(response.status).toBe(401);
    expect(await errorCode(response)).toBe("SESSAO_EXPIRADA");
  });
});

describe("D-C3 decide (PC12, PC13, PC15, PC22)", () => {
  it("aprovar: the case is decided, leaves the open list, and the counts follow (G3)", async () => {
    const { token, cases } = await seeded("dois");
    const before = await me(token);
    expect(before.workspace.contagens?.fila_abertos).toBe(2);
    const id = cases[0]?.id ?? "";
    const response = await decide(token, id, { decisao: "aprovar" });
    expect(response.status).toBe(200);
    expect(caseSchema.parse(await response.json()).estado).toBe("decidido");
    expect((await list(token)).itens.map((item) => item.id)).not.toContain(id);
    expect((await me(token)).workspace.contagens?.fila_abertos).toBe(1);
  });

  it("PC22: the same key and body → the first result; another body → 422", async () => {
    const { token, cases } = await seeded("dois");
    const id = cases[0]?.id ?? "";
    const first = await decide(token, id, { decisao: "aprovar" });
    const again = await decide(token, id, { decisao: "aprovar" });
    expect(again.status).toBe(200);
    expect(await again.json()).toEqual(await first.json());
    const other = await decide(token, id, {
      decisao: "bloquear",
      motivo_codigo: "MEI",
    });
    expect(other.status).toBe(422);
  });

  it("PC22 / F5: decide-rede applies, drops the socket, and a retry with the key gets the first result", async () => {
    const { email, token, cases } = await seeded("um");
    await control("POST", "/case-seed", { email, seed: "decide-rede", n: 1 });
    const id = cases[0]?.id ?? "";
    await expect(decide(token, id, { decisao: "aprovar" })).rejects.toThrow();
    const retry = await decide(token, id, { decisao: "aprovar" });
    expect(retry.status).toBe(200);
    expect(caseSchema.parse(await retry.json()).estado).toBe("decidido");
  });

  it("decide-queda: the socket drops before anything applies", async () => {
    const { email, token, cases } = await seeded("um");
    await control("POST", "/case-seed", { email, seed: "decide-queda" });
    const id = cases[0]?.id ?? "";
    await expect(decide(token, id, { decisao: "aprovar" })).rejects.toThrow();
    expect((await read(token, id)).estado).toBe("aberto");
  });

  it("PC12: decide-falha { n } → 503 n times, then works", async () => {
    const { email, token, cases } = await seeded("um");
    await control("POST", "/case-seed", { email, seed: "decide-falha", n: 2 });
    const id = cases[0]?.id ?? "";
    expect((await decide(token, id, { decisao: "aprovar" })).status).toBe(503);
    expect((await decide(token, id, { decisao: "aprovar" })).status).toBe(503);
    expect((await decide(token, id, { decisao: "aprovar" })).status).toBe(200);
  });

  it("PC13: decided elsewhere → 409 CASO_JA_DECIDIDO with decidido_em and decisao", async () => {
    const { token, cases } = await seeded("um");
    const id = cases[0]?.id ?? "";
    await control("POST", `/cases/${id}/decide-elsewhere`, {
      decisao: "bloquear",
    });
    const response = await decide(token, id, { decisao: "aprovar" });
    expect(response.status).toBe(409);
    const body = await json(response);
    expect(body).toMatchObject({
      code: "CASO_JA_DECIDIDO",
      message: ERROR_SENTINEL,
      decisao: { tipo: "bloquear", motivo_codigo: "GENERICO" },
    });
    expect(typeof body.decidido_em).toBe("string");
  });

  it("PC15: bloquear without a reason → 422 MOTIVO_OBRIGATORIO; manter on a non-alert → 422", async () => {
    const { token, cases } = await seeded("cada-tipo");
    const link = byKind(cases, "link").id;
    const noReason = await decide(token, link, { decisao: "bloquear" });
    expect(noReason.status).toBe(422);
    expect(await errorCode(noReason)).toBe("MOTIVO_OBRIGATORIO");
    const manter = await decide(token, link, { decisao: "manter" }, KEY_2);
    expect(manter.status).toBe(422);
    const alerta = byKind(cases, "alerta").id;
    expect(
      (await decide(token, alerta, { decisao: "manter" }, crypto.randomUUID()))
        .status,
    ).toBe(200);
  });

  it("bloquear keeps the reason and the note (≤ 280); a longer note → 422", async () => {
    const { token, cases } = await seeded("dois");
    const [a, b] = cases;
    const tooLong = await decide(token, a?.id ?? "", {
      decisao: "bloquear",
      motivo_codigo: "MEI",
      nota_vendedor: "x".repeat(281),
    });
    expect(tooLong.status).toBe(422);
    const okReply = await decide(
      token,
      b?.id ?? "",
      {
        decisao: "bloquear",
        motivo_codigo: "MEI",
        nota_vendedor: "NOTA-SENTINELA-1",
      },
      KEY_2,
    );
    expect(caseSchema.parse(await okReply.json()).decisao).toMatchObject({
      tipo: "bloquear",
      motivo_codigo: "MEI",
      nota_vendedor: "NOTA-SENTINELA-1",
    });
  });

  it("a missing or malformed Idempotency-Key → 422", async () => {
    const { token, cases } = await seeded("um");
    const response = await call(
      "POST",
      `/v1/cases/${cases[0]?.id}/decide`,
      token,
      {
        decisao: "aprovar",
      },
    );
    expect(response.status).toBe(422);
  });
});

describe("D-C4 request documents (PC14, G7, G10, G11)", () => {
  it("with an e-mail: waiting, no link; the waiting count follows", async () => {
    const { token, cases } = await seeded("cada-tipo");
    const id = byKind(cases, "link").id;
    const response = await request(token, id, {
      tipos: ["CARTAO_CNPJ", "CONTRATO_SOCIAL_OU_CCMEI"],
    });
    expect(response.status).toBe(200);
    const result = requestDocumentsResultSchema.parse(await response.json());
    expect(result.case.estado).toBe("aguardando_doc");
    expect(result.link_vendedor).toBeUndefined();
    expect(result.case.eventos?.[0]).toMatchObject({
      tipo: "documento_pedido",
    });
  });

  it("without an e-mail: a seller link; a re-request issues a new one and revokes the old (G7)", async () => {
    const { token, cases } = await seeded("cada-tipo");
    const id = byKind(cases, "link-sem-email").id;
    const first = requestDocumentsResultSchema.parse(
      await (await request(token, id, { tipos: ["CARTAO_CNPJ"] })).json(),
    );
    expect(first.link_vendedor).toMatch(/^https:\/\/kybr\.test\/v\//);
    const second = requestDocumentsResultSchema.parse(
      await (
        await request(token, id, { tipos: ["RESPONSAVEL"] }, KEY_2)
      ).json(),
    );
    expect(second.link_vendedor).not.toBe(first.link_vendedor);
    expect(
      await json(await control("GET", `/case-links?caseId=${id}`)),
    ).toEqual({
      active: 1,
      revoked: 1,
    });
  });

  it("a type that isn't enabled → 422 DOCUMENTO_NAO_HABILITADO (G10 sets the list)", async () => {
    const { email, token, cases } = await seeded("um");
    const id = cases[0]?.id ?? "";
    // PROCURACAO is outside the default four.
    const refused = await request(token, id, { tipos: ["PROCURACAO"] });
    expect(refused.status).toBe(422);
    expect(await errorCode(refused)).toBe("DOCUMENTO_NAO_HABILITADO");
    await control("POST", "/workspace", {
      email,
      documentos_habilitados: ["PROCURACAO", "CARTAO_CNPJ"],
    });
    expect((await me(token)).workspace.documentos_habilitados).toEqual([
      "PROCURACAO",
      "CARTAO_CNPJ",
    ]);
    expect(
      (await request(token, id, { tipos: ["PROCURACAO"] }, KEY_2)).status,
    ).toBe(200);
  });

  it("an empty or repeated list → 422; a decided case → 409", async () => {
    const { token, cases } = await seeded("cada-tipo");
    const id = byKind(cases, "link").id;
    expect((await request(token, id, { tipos: [] })).status).toBe(422);
    expect(
      (
        await request(
          token,
          id,
          { tipos: ["CARTAO_CNPJ", "CARTAO_CNPJ"] },
          KEY_2,
        )
      ).status,
    ).toBe(422);
    const decided = byKind(cases, "decidido-aprovar").id;
    expect(
      (
        await request(
          token,
          decided,
          { tipos: ["CARTAO_CNPJ"] },
          crypto.randomUUID(),
        )
      ).status,
    ).toBe(409);
  });

  it("G11 link-invalido: the result's link_vendedor fails F8 (the schema drops it)", async () => {
    const { email, token, cases } = await seeded("cada-tipo");
    await control("POST", "/case-seed", { email, seed: "link-invalido" });
    const id = byKind(cases, "link-sem-email").id;
    const raw = await json(
      await request(token, id, { tipos: ["CARTAO_CNPJ"] }),
    );
    expect(raw.link_vendedor).toBe("javascript:alert(1)");
    expect(
      requestDocumentsResultSchema.parse(raw).link_vendedor,
    ).toBeUndefined();
  });
});

describe("PC16, PC17, C-M6-1: new cases and documents back", () => {
  it("POST /__mock/panel/cases creates a case now; desde counts it", async () => {
    const { email, token } = await seeded("um");
    await control("POST", "/case-clock", {
      email,
      now: "2026-10-06T14:00:00Z",
    });
    const desde = "2026-10-06T13:59:00Z";
    const before = await call(
      "GET",
      `/v1/cases?estado=aberto&desde=${desde}`,
      token,
    );
    expect(newCasesSchema.parse(await before.json()).novos).toBe(0);
    await control("POST", "/cases", { email, count: 2 });
    const after = await call(
      "GET",
      `/v1/cases?estado=aberto&desde=${desde}`,
      token,
      undefined,
      {
        "x-kybr-poll": "1",
      },
    );
    expect(newCasesSchema.parse(await after.json()).novos).toBe(2);
  });

  it("…/upload: a waiting case returns to aberto with documento_recebido and a document", async () => {
    const { token, cases } = await seeded("cada-tipo");
    const id = byKind(cases, "aguardando").id;
    await control("POST", `/cases/${id}/upload`, {
      tipo: "RESPONSAVEL",
      formato: "png",
    });
    const record = await read(token, id);
    expect(record.estado).toBe("aberto");
    expect(record.eventos?.[0]).toMatchObject({
      tipo: "documento_recebido",
      dados: { tipo: "RESPONSAVEL" },
    });
    expect(record.documentos?.at(-1)?.tipo).toBe("RESPONSAVEL");
  });

  it("desde older than 7 days, or malformed → 422", async () => {
    const token = await login(PANEL_EMAILS.fila);
    for (const desde of ["2020-01-01T00:00:00Z", "ontem"]) {
      const response = await call(
        "GET",
        `/v1/cases?estado=aberto&desde=${desde}`,
        token,
      );
      expect(response.status).toBe(422);
    }
  });
});

describe("PC18, PC19, PC21, G2: per-account faults", () => {
  it("PC18: lista-falha, detalhe-falha; eventos-falha and documentos-falha omit their list (partial)", async () => {
    const { email, token, cases } = await seeded("cada-tipo");
    const id = byKind(cases, "decidido-com-documentos").id;
    await control("POST", "/case-seed", { email, seed: "eventos-falha", n: 1 });
    await control("POST", "/case-seed", {
      email,
      seed: "documentos-falha",
      n: 1,
    });
    const partial = await read(token, id);
    expect(partial.eventos).toBeUndefined();
    expect(partial.documentos).toBeUndefined();
    const whole = await read(token, id);
    expect(whole.eventos).toBeDefined();
    expect(whole.documentos).toHaveLength(1);

    await control("POST", "/case-seed", { email, seed: "lista-falha", n: 1 });
    expect((await call("GET", "/v1/cases?estado=aberto", token)).status).toBe(
      500,
    );
    await control("POST", "/case-seed", { email, seed: "detalhe-falha", n: 1 });
    expect((await call("GET", `/v1/cases/${id}`, token)).status).toBe(500);
  });

  it("faults stay on their account", async () => {
    const a = await seeded("um", "a");
    const b = await seeded("um", "b");
    await control("POST", "/case-seed", {
      email: a.email,
      seed: "lista-falha",
    });
    expect((await call("GET", "/v1/cases?estado=aberto", a.token)).status).toBe(
      500,
    );
    expect((await call("GET", "/v1/cases?estado=aberto", b.token)).status).toBe(
      200,
    );
  });

  it("PC19: the certificate is a PDF; comprovante-falha → 500, comprovante-html → text/html, comprovante-grande > 5 MB", async () => {
    const { email, token, cases } = await seeded("um");
    const certificate = () =>
      call(
        "GET",
        `/v1/verifications/${cases[0]?.verification_id}/certificate`,
        token,
      );
    const pdf = await certificate();
    expect(pdf.headers.get("content-type")).toBe("application/pdf");
    expect(
      new TextDecoder().decode((await pdf.arrayBuffer()).slice(0, 5)),
    ).toBe("%PDF-");
    await control("POST", "/case-seed", {
      email,
      seed: "comprovante-falha",
      n: 1,
    });
    expect((await certificate()).status).toBe(500);
    await control("POST", "/case-seed", { email, seed: "comprovante-html" });
    expect((await certificate()).headers.get("content-type")).toBe("text/html");
    await control("POST", "/case-fault", {
      email,
      endpoint: "certificate",
      fault: "none",
    });
    await control("POST", "/case-seed", { email, seed: "comprovante-grande" });
    expect(
      (await (await certificate()).arrayBuffer()).byteLength,
    ).toBeGreaterThan(5 * 1024 * 1024);
  });

  it("no certificate for DADOS_NAO_ENCONTRADOS (C-M6-9)", async () => {
    const { token, cases } = await seeded("cada-tipo");
    const nodata = byKind(cases, "nodata");
    expect(
      (
        await call(
          "GET",
          `/v1/verifications/${nodata.verification_id}/certificate`,
          token,
        )
      ).status,
    ).toBe(404);
  });

  it("PC21: poll-falha { n } → 503 on desde reads only; decide-lento { ms } waits", async () => {
    const { email, token, cases } = await seeded("um");
    await control("POST", "/case-seed", { email, seed: "poll-falha", n: 1 });
    const desde = new Date(Date.now() - 60_000).toISOString();
    expect(
      (await call("GET", `/v1/cases?estado=aberto&desde=${desde}`, token))
        .status,
    ).toBe(503);
    expect((await call("GET", "/v1/cases?estado=aberto", token)).status).toBe(
      200,
    );
    await control("POST", "/case-seed", {
      email,
      seed: "decide-lento",
      ms: 300,
      n: 1,
    });
    const started = Date.now();
    expect(
      (await decide(token, cases[0]?.id ?? "", { decisao: "aprovar" })).status,
    ).toBe(200);
    expect(Date.now() - started).toBeGreaterThanOrEqual(250);
  });

  it("G11: caso-invalido breaks the schema; link-estranho fails F8; lista-atrasada keeps a decided id for n reads", async () => {
    const { email, token, cases } = await seeded("cada-tipo");
    const id = byKind(cases, "link").id;
    await control("POST", "/case-seed", { email, seed: "caso-invalido", n: 1 });
    expect(
      caseSchema.safeParse(
        await (await call("GET", `/v1/cases/${id}`, token)).json(),
      ).success,
    ).toBe(false);
    await control("POST", "/case-seed", { email, seed: "link-estranho" });
    const waiting = byKind(cases, "aguardando-sem-email").id;
    const raw = await json(await call("GET", `/v1/cases/${waiting}`, token));
    expect(String(raw.link_vendedor)).toContain("estranho.exemplo.test");
    expect(caseSchema.parse(raw).link_vendedor).toBeUndefined();

    await control("POST", "/case-seed", {
      email,
      seed: "lista-atrasada",
      n: 2,
    });
    await decide(token, id, { decisao: "aprovar" });
    const ids = async () =>
      (await list(token, "estado=aberto&limit=200")).itens.map(
        (item) => item.id,
      );
    expect(await ids()).toContain(id);
    expect(await ids()).toContain(id);
    expect(await ids()).not.toContain(id);
  });
});

describe("PC20, G9: signed document URLs and the documents origin", () => {
  it("a new sig per read; /__docs serves the file with the D-C6 + C-M6-10 headers", async () => {
    const { token, cases } = await seeded("hostil");
    const id = cases[0]?.id ?? "";
    const first = await read(token, id);
    const second = await read(token, id);
    const [a, b] = [
      first.documentos?.[0]?.url ?? "",
      second.documentos?.[0]?.url ?? "",
    ];
    expect(a).toMatch(/^https:\/\/documentos\.exemplo\.test\/__docs\/.+\?sig=/);
    expect(a).not.toBe(b);
    const file = await fetch(a);
    expect(file.status).toBe(200);
    expect(file.headers.get("content-type")).toBe("application/pdf");
    expect(file.headers.get("x-content-type-options")).toBe("nosniff");
    expect(file.headers.get("content-security-policy")).toBe(
      "sandbox; default-src 'none'",
    );
    expect(file.headers.get("cache-control")).toBe("private, no-store");
    expect(file.headers.get("cross-origin-resource-policy")).toBe(
      "same-origin",
    );
    expect(file.headers.get("referrer-policy")).toBe("no-referrer");
    expect(file.headers.get("content-disposition")).toBe(
      'inline; filename="documento.pdf"',
    );
    // JPEG and PNG too.
    const types = await Promise.all(
      (first.documentos ?? []).map(async (doc) =>
        (await fetch(doc.url)).headers.get("content-type"),
      ),
    );
    expect(types).toEqual(["application/pdf", "image/jpeg", "image/png"]);
    // A made-up sig is refused.
    expect((await fetch(a.replace(/sig=.*/, "sig=inventado"))).status).toBe(
      403,
    );
  });

  it.each([
    ["doc-host-estranho", /^https:\/\/docs\.estranho\.test\//],
    ["doc-userinfo", /^https:\/\/usuario:senha@documentos\.exemplo\.test\//],
    [
      "doc-host-parecido",
      /^https:\/\/documentos\.exemplo\.test\.exemplo\.test:/,
    ],
    ["doc-porta", /^https:\/\/documentos\.exemplo\.test:444\//],
    ["doc-http-externo", /^http:\/\/docs\.exemplo\.test\//],
  ])("%s bends the URL", async (seed, pattern) => {
    const { email, token, cases } = await seeded("hostil");
    await control("POST", "/case-seed", { email, seed });
    const raw = await json<{ documentos: { url: string }[] }>(
      await call("GET", `/v1/cases/${cases[0]?.id}`, token),
    );
    expect(raw.documentos[0]?.url).toMatch(pattern);
  });

  it.each([
    [
      "doc-html",
      (r: Response) => r.text().then((t) => expect(t).toContain("<html>")),
    ],
    [
      "doc-grande",
      (r: Response) =>
        r
          .arrayBuffer()
          .then((b) => expect(b.byteLength).toBeGreaterThan(5 * 1024 * 1024)),
    ],
    [
      "doc-truncado",
      (r: Response) => r.text().then((t) => expect(t).not.toContain("%%EOF")),
    ],
    ["doc-falha", (r: Response) => expect(r.status).toBe(500)],
  ] as const)("%s (attachment mode)", async (seed, check) => {
    const { email, token, cases } = await seeded("hostil");
    await control("POST", "/case-seed", { email, seed });
    const url =
      (await read(token, cases[0]?.id ?? "")).documentos?.[0]?.url ?? "";
    await check(await fetch(url));
  });

  it("F1: the docs origin is readable by the E2E", async () => {
    expect(await json(await control("GET", "/docs-origin"))).toEqual({
      origin: "https://documentos.exemplo.test",
    });
  });
});

describe("G1, G3, G4, G5, G6: presets, derived counts, clock, call log, hostile strings", () => {
  it.each([
    ["vazia", 0],
    ["um", 1],
    ["dois", 2],
    ["vinte-e-cinco", 25],
    ["vinte-e-seis", 26],
    ["tres-tardios-de-trinta", 30],
  ])("G1 preset %s → %d open", async (preset, open) => {
    const { token } = await seeded(preset);
    expect((await list(token)).total).toBe(open);
  });

  it("G3: /me counts come from the store: open, late, waiting", async () => {
    const { token } = await seeded("tres-tardios-de-trinta");
    expect((await me(token)).workspace.contagens).toMatchObject({
      fila_abertos: 30,
      fila_vencidos: 3,
      fila_aguardando: 0,
    });
    const fila = await me(await login(PANEL_EMAILS.fila));
    expect(fila.workspace.contagens).toMatchObject({
      fila_abertos: 30,
      fila_vencidos: 4,
      fila_aguardando: 3,
    });
  });

  it("G3: Lote's to-queue creates real lote cases (static counts + the new ones)", async () => {
    const email = `fila-lote-${crypto.randomUUID().slice(0, 8)}@exemplo.test`;
    await control("POST", "/accounts", { email });
    const { id } = await json<{ id: string }>(
      await control("POST", "/batches", { email, set: "ac16", finish: true }),
    );
    const token = await login(email);
    const before = (await me(token)).workspace.contagens?.fila_abertos ?? 0;
    const response = await call(
      "POST",
      `/v1/batches/${id}/to-queue`,
      token,
      undefined,
      {
        "idempotency-key": KEY,
      },
    );
    const { criados } = await json<{ criados: number }>(response);
    expect(criados).toBeGreaterThan(0);
    expect((await me(token)).workspace.contagens?.fila_abertos).toBe(
      before + criados,
    );
    const page = await list(token, "estado=aberto&limit=200");
    expect(page.itens.filter((item) => item.origem === "lote")).toHaveLength(
      criados,
    );
    expect(AC16.linhas.length).toBeGreaterThan(criados);
  });

  it("G4: the limites preset sits on the SLA and midnight boundaries of the account's clock", async () => {
    const email = `limites-${crypto.randomUUID().slice(0, 8)}@exemplo.test`;
    await control("POST", "/accounts", { email });
    await control("POST", "/case-clock", {
      email,
      now: "2026-10-06T14:00:00Z",
    });
    await control("POST", "/cases/seed", { email, preset: "limites" });
    const token = await login(email);
    const page = await list(token, "estado=aberto&limit=200");
    const now = Date.parse("2026-10-06T14:00:00Z");
    const offsets = page.itens.map((item) => Date.parse(item.sla_ate) - now);
    expect(offsets).toEqual(
      expect.arrayContaining([-2 * 86_400_000, 41_000, 180_000, 6 * 3_600_000]),
    );
    const criados = page.itens.map((item) => item.criado_em);
    // 23:59 yesterday and 00:30 today in Brasília; 23:30 two days back.
    expect(criados).toEqual(
      expect.arrayContaining([
        "2026-10-06T02:59:00.000Z",
        "2026-10-06T03:30:00.000Z",
        "2026-10-05T02:30:00.000Z",
      ]),
    );
  });

  it("G5: the call log has the case fields, filterable by e-mail, and never the note, a link or a sig", async () => {
    const { email, token, cases } = await seeded("cada-tipo");
    await list(token, "estado=aberto&limit=50");
    await call(
      "POST",
      `/v1/cases/${byKind(cases, "link").id}/decide`,
      token,
      {
        decisao: "bloquear",
        motivo_codigo: "MEI",
        nota_vendedor: "NOTA-SENTINELA-2",
      },
      { "idempotency-key": KEY, "x-kybr-panel-path": "/fila/abc" },
    );
    await request(
      token,
      byKind(cases, "link-sem-email").id,
      { tipos: ["CARTAO_CNPJ"] },
      KEY_2,
    );
    const doc = (await read(token, byKind(cases, "decidido-com-documentos").id))
      .documentos?.[0];
    await fetch(doc?.url ?? "");
    const calls = await json<Record<string, unknown>[]>(
      await control("GET", `/calls?email=${encodeURIComponent(email)}`),
    );
    expect(
      calls.some((c) => c.path === "/v1/cases?estado=aberto&limit=50"),
    ).toBe(true);
    expect(calls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          decisao: "bloquear",
          motivoCodigo: "MEI",
          idempotencyKey: KEY,
          pagePath: "/fila/abc",
        }),
        expect.objectContaining({
          tipos: ["CARTAO_CNPJ"],
          idempotencyKey: KEY_2,
        }),
        expect.objectContaining({ path: `/__docs/${doc?.id}` }),
      ]),
    );
    const log = JSON.stringify(calls);
    expect(log).not.toContain("NOTA-SENTINELA-2");
    expect(log).not.toContain("sig=");
    expect(log).not.toContain("/c/");
  });

  it("G6: hostile strings arrive as given, and an unknown vendedor_email is stripped by the schema (F11)", async () => {
    const { token, cases } = await seeded("hostil");
    const raw = await json(
      await call("GET", `/v1/cases/${cases[0]?.id}`, token),
    );
    expect(raw.vendedor_email).toBe("vendedor@exemplo.test");
    const parsed = caseSchema.parse(raw);
    expect(parsed).not.toHaveProperty("vendedor_email");
    expect(parsed.razao_social).toBe("<img src=x onerror=alert(1)>");
    expect(parsed.motivos).toContain("Motivo dois, com vírgula");
    expect(parsed.ext_id).toBe("<script>");
  });
});
