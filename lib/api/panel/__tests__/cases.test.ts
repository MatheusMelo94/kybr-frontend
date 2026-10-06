// @vitest-environment node
import { HttpResponse, http } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POLL_TIMEOUT_MS } from "@/features/panel-shell/polling";
import { AppError } from "@/lib/api/errors";
import {
  FOREIGN_CASE_ID,
  PANEL_EMAILS,
} from "@/tests/fixtures/factories/panel";
import {
  casesOf,
  openSession,
  seedCases,
  setCaseFault,
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

import {
  CASE_CHAIN_MAX_CALLS,
  countNewCases,
  decideCase,
  getCase,
  getCaseForPage,
  getDocumentUrl,
  listCases,
  listCasesForPage,
  requestDocuments,
  streamCertificate,
  type CaseView,
} from "@/lib/api/panel/cases";

const API = "http://api.kybr.test";
const KEY = "0b7f3c1e-2a4d-4e5f-8a6b-9c0d1e2f3a4b";
const KEY_2 = "1c8a4d2f-3b5e-4f60-9b7c-0d1e2f3a4b5c";

let fetchSpy: ReturnType<typeof vi.spyOn>;
let email: string;

/** A valid D-C1 item, numbered i (synthetic). */
function summary(i: number): Record<string, unknown> {
  return {
    id: `caso_${String(i).padStart(16, "0")}`,
    razao_social: `Empresa ${i} Ltda`,
    cnpj: "12ABC34501DE35",
    veredito: "revisar",
    status: "warn",
    motivos: [],
    origem: "link",
    sla_ate: "2026-10-06T18:00:00Z",
    vencido: false,
    criado_em: "2026-10-05T10:00:00Z",
  };
}

beforeEach(() => {
  email = `dados-${crypto.randomUUID().slice(0, 8)}@exemplo.test`;
  seedCases(email, "cada-tipo");
  state.token = openSession(email).id;
  fetchSpy = vi.spyOn(globalThis, "fetch");
  reportMarker.mockClear();
});

afterEach(() => {
  fetchSpy.mockRestore();
  vi.restoreAllMocks();
});

function idOf(kind: string): string {
  const found = casesOf(email).find((record) => record.kind === kind);
  if (!found) throw new Error(kind);
  return found.id;
}

function requests(): { url: string; headers: Headers; init: RequestInit }[] {
  return fetchSpy.mock.calls.map((args: unknown[]) => {
    const [input, init] = args as [URL | string, RequestInit];
    return { url: String(input), init, headers: new Headers(init.headers) };
  });
}

async function codeOf(promise: Promise<unknown>): Promise<string> {
  const error = await promise.then(
    () => undefined,
    (thrown: unknown) => thrown,
  );
  expect(error).toBeInstanceOf(AppError);
  return (error as AppError).code;
}

describe("the panel client on every call (P06, ADR-0011)", () => {
  it("no-store, the bearer, the BFF key", async () => {
    await listCases({ estado: "aberto", limit: 25 });
    const [first] = requests();
    expect(first?.init.cache).toBe("no-store");
    expect(first?.headers.get("authorization")).toBe(`Bearer ${state.token}`);
    expect(first?.headers.get("x-kybr-bff-key")).toBeTruthy();
  });

  it("no session → SESSAO_EXPIRADA, nothing sent", async () => {
    state.token = undefined;
    expect(await codeOf(listCases({ estado: "aberto", limit: 25 }))).toBe(
      "SESSAO_EXPIRADA",
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("a 401 → SESSAO_EXPIRADA", async () => {
    state.token = "sessao-inexistente";
    expect(await codeOf(getCase(idOf("link")))).toBe("SESSAO_EXPIRADA");
  });
});

describe("listCases (D-C1, C-M6-2, PC1, PC2)", () => {
  it("one request with the limit; the page parsed", async () => {
    const page = await listCases({ estado: "aberto", limit: 50 });
    expect(requests()).toHaveLength(1);
    expect(requests()[0]?.url).toBe(`${API}/v1/cases?estado=aberto&limit=50`);
    expect(page.itens.length).toBeGreaterThan(0);
    expect(page.gerado_em).toMatch(/Z$/);
  });

  it("chains cursors when the backend caps limit (the fallback), into one page", async () => {
    const all = Array.from({ length: 220 }, (_, i) => summary(i));
    const seen: string[] = [];
    server.use(
      http.get(`${API}/v1/cases`, ({ request }) => {
        // A backend that caps limit at 25.
        const url = new URL(request.url);
        seen.push(url.search);
        const offset = Number(url.searchParams.get("cursor") ?? "0");
        const next = offset + 25 < all.length ? String(offset + 25) : null;
        return HttpResponse.json({
          itens: all.slice(offset, offset + 25),
          proximo_cursor: next,
          total: all.length,
          gerado_em: "2026-10-06T14:00:00Z",
        });
      }),
    );
    const page = await listCases({ estado: "aberto", limit: 100 });
    expect(page.itens).toHaveLength(100);
    expect(page.itens.map((item) => item.id)).toEqual(
      all.slice(0, 100).map((item) => item.id),
    );
    expect(page.total).toBe(220);
    expect(seen).toEqual([
      "?estado=aberto&limit=100",
      "?estado=aberto&limit=75&cursor=25",
      "?estado=aberto&limit=50&cursor=50",
      "?estado=aberto&limit=25&cursor=75",
    ]);
  });

  it(`F12: the chain stops at ${8} calls even if the cursor never ends`, async () => {
    expect(CASE_CHAIN_MAX_CALLS).toBe(8);
    let calls = 0;
    server.use(
      http.get(`${API}/v1/cases`, () => {
        calls += 1;
        return HttpResponse.json({
          itens: [],
          proximo_cursor: "eyJvIjoyNX0",
          total: 999,
          gerado_em: "2026-10-06T14:00:00Z",
        });
      }),
    );
    await listCases({ estado: "aberto", limit: 200 });
    expect(calls).toBe(8);
  });

  it("a failing list → UNAVAILABLE", async () => {
    setCaseFault(email, "list", { kind: "500", times: 1 });
    expect(await codeOf(listCases({ estado: "aberto", limit: 25 }))).toBe(
      "UNAVAILABLE",
    );
  });

  it("F11: a schema failure → UNAVAILABLE and a shape-only CASE_SCHEMA_INVALID marker", async () => {
    setCaseFault(email, "list", { kind: "invalido", times: 1 });
    expect(await codeOf(listCases({ estado: "aberto", limit: 25 }))).toBe(
      "UNAVAILABLE",
    );
    expect(reportMarker).toHaveBeenCalledWith("CASE_SCHEMA_INVALID", {
      operation: "cases-list",
      paths: "itens.0.veredito",
    });
    expect(JSON.stringify(reportMarker.mock.calls)).not.toContain("talvez");
  });
});

describe("getCase (D-C2, PC5, PC9)", () => {
  it("parses the case, documents with their signed URL (server only)", async () => {
    const record = await getCase(idOf("decidido-com-documentos"));
    expect(record.documentos?.[0]?.url).toMatch(
      /^https:\/\/documentos\.exemplo\.test\//,
    );
  });

  it("PC9: a foreign id and an unknown id are CASO_NAO_ENCONTRADO", async () => {
    expect(await codeOf(getCase(FOREIGN_CASE_ID))).toBe("CASO_NAO_ENCONTRADO");
    expect(await codeOf(getCase("00000000-0000-4000-8000-000000000000"))).toBe(
      "CASO_NAO_ENCONTRADO",
    );
  });

  it("an id outside A-X3 throws before any request", async () => {
    await expect(getCase("../x")).rejects.toThrow();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("F11: a schema failure logs the case id and the failing paths only", async () => {
    const id = idOf("link");
    setCaseFault(email, "case", { kind: "invalido", times: 1 });
    expect(await codeOf(getCase(id))).toBe("UNAVAILABLE");
    expect(reportMarker).toHaveBeenCalledWith("CASE_SCHEMA_INVALID", {
      operation: "case",
      caseId: id,
      paths: "veredito",
    });
  });

  it("F8: a link_vendedor that fails parseLinkVendedor is dropped and marked", async () => {
    const id = idOf("aguardando-sem-email");
    setCaseFault(email, "case", { kind: "link-estranho", times: 1 });
    const record = await getCase(id);
    expect(record.link_vendedor).toBeUndefined();
    expect(reportMarker).toHaveBeenCalledWith("LINK_VENDEDOR_INVALID", {
      operation: "case",
      caseId: id,
    });
  });
});

describe("getCaseForPage (F1, F11)", () => {
  it("the projection has no document url and a masked CNPJ", async () => {
    const result = await getCaseForPage(idOf("decidido-com-documentos"));
    if (!result.ok) throw new Error("expected ok");
    const view: CaseView = result.case;
    expect(view.cnpj).toMatch(
      /^[0-9A-Z]{2}\.[0-9A-Z]{3}\.[0-9A-Z]{3}\/[0-9A-Z]{4}-\d{2}$/,
    );
    expect(view.seller.cnpj).toBe(view.cnpj);
    const doc = view.documentos?.[0];
    expect(doc).toEqual({
      id: expect.any(String),
      tipo: "CARTAO_CNPJ",
      enviadoEm: expect.any(String),
    });
    // @ts-expect-error F1: the page's projection has no url.
    expect(view.documentos?.[0]?.url).toBeUndefined();
    expect(JSON.stringify(view)).not.toContain("documentos.exemplo.test");
  });

  it("UNAVAILABLE and NETWORK come back as results", async () => {
    const id = idOf("link");
    setCaseFault(email, "case", { kind: "500", times: 1 });
    expect(await getCaseForPage(id)).toEqual({
      ok: false,
      code: "UNAVAILABLE",
    });
    setCaseFault(email, "case", { kind: "drop", times: 1 });
    expect(await getCaseForPage(id)).toEqual({ ok: false, code: "NETWORK" });
  });

  it("CASO_NAO_ENCONTRADO and SESSAO_EXPIRADA still throw", async () => {
    expect(await codeOf(getCaseForPage(FOREIGN_CASE_ID))).toBe(
      "CASO_NAO_ENCONTRADO",
    );
    state.token = "sessao-inexistente";
    expect(await codeOf(getCaseForPage(idOf("link")))).toBe("SESSAO_EXPIRADA");
  });

  it("partial: eventos missing stays missing (fila.detail.partial)", async () => {
    setCaseFault(email, "eventos", { kind: "omit", times: 1 });
    const result = await getCaseForPage(idOf("link"));
    expect(result.ok && result.case.eventos).toBeUndefined();
  });
});

describe("getDocumentUrl (D-C6)", () => {
  it("reads the case and returns that document's fresh signed URL and its type", async () => {
    const id = idOf("decidido-com-documentos");
    const docId =
      casesOf(email).find((record) => record.id === id)?.documentos[0]?.id ??
      "";
    const doc = await getDocumentUrl(id, docId);
    expect(doc.url).toMatch(/\?sig=/);
    expect(doc.tipo).toBe("CARTAO_CNPJ");
  });

  it("a document that isn't on the case → RECURSO_NAO_ENCONTRADO", async () => {
    expect(
      await codeOf(
        getDocumentUrl(idOf("link"), "00000000-0000-4000-8000-000000000000"),
      ),
    ).toBe("RECURSO_NAO_ENCONTRADO");
  });

  it("documents missing from the case (partial) → UNAVAILABLE", async () => {
    const id = idOf("decidido-com-documentos");
    const docId =
      casesOf(email).find((record) => record.id === id)?.documentos[0]?.id ??
      "";
    setCaseFault(email, "documentos", { kind: "omit", times: 1 });
    expect(await codeOf(getDocumentUrl(id, docId))).toBe("UNAVAILABLE");
  });
});

describe("countNewCases (C-M6-1, F10)", () => {
  it("sends desde with X-Kybr-Poll: 1 and the 4 s poll timeout", async () => {
    const novos = await countNewCases(
      new Date(Date.now() - 60_000).toISOString(),
      { pollTimeoutMs: POLL_TIMEOUT_MS },
    );
    expect(novos).toBe(0);
    const [request] = requests();
    expect(request?.url).toContain("/v1/cases?estado=aberto&desde=");
    expect(request?.headers.get("x-kybr-poll")).toBe("1");
    expect(request?.init.signal).toBeDefined();
  });

  it("poll-falha → UNAVAILABLE", async () => {
    setCaseFault(email, "poll", { kind: "503", times: 1 });
    expect(
      await codeOf(
        countNewCases(new Date(Date.now() - 60_000).toISOString(), {
          pollTimeoutMs: POLL_TIMEOUT_MS,
        }),
      ),
    ).toBe("UNAVAILABLE");
  });
});

describe("decideCase (D-C3, PC12, PC13, PC15, PC22)", () => {
  it("sends the Idempotency-Key and the body; returns the decided case", async () => {
    const record = await decideCase(idOf("link"), { decisao: "aprovar" }, KEY);
    expect(record.estado).toBe("decidido");
    const [request] = requests();
    expect(request?.headers.get("idempotency-key")).toBe(KEY);
    expect(JSON.parse(String(request?.init.body))).toEqual({
      decisao: "aprovar",
    });
  });

  it("bloquear sends motivo_codigo and nota_vendedor", async () => {
    await decideCase(
      idOf("link"),
      { decisao: "bloquear", motivoCodigo: "MEI", notaVendedor: "Até logo." },
      KEY,
    );
    expect(JSON.parse(String(requests()[0]?.init.body))).toEqual({
      decisao: "bloquear",
      motivo_codigo: "MEI",
      nota_vendedor: "Até logo.",
    });
  });

  it("409 → CASO_JA_DECIDIDO with decididoEm and decisao", async () => {
    const error = await decideCase(
      idOf("decidido-bloquear"),
      { decisao: "aprovar" },
      KEY,
    ).then(
      () => undefined,
      (thrown: unknown) => thrown as AppError,
    );
    expect(error?.code).toBe("CASO_JA_DECIDIDO");
    expect(error?.decisao?.tipo).toBe("bloquear");
    expect(error?.decididoEm).toEqual(expect.any(String));
  });

  it("422 codes are kept: MOTIVO_OBRIGATORIO, VALOR_INVALIDO", async () => {
    expect(
      await codeOf(decideCase(idOf("link"), { decisao: "bloquear" }, KEY)),
    ).toBe("MOTIVO_OBRIGATORIO");
    expect(
      await codeOf(decideCase(idOf("link"), { decisao: "manter" }, KEY_2)),
    ).toBe("VALOR_INVALIDO");
  });

  it("a 503 → UNAVAILABLE; a dropped socket (F5) → NETWORK: the outcome is unknown", async () => {
    setCaseFault(email, "decide", { kind: "503", times: 1 });
    expect(
      await codeOf(decideCase(idOf("link"), { decisao: "aprovar" }, KEY)),
    ).toBe("UNAVAILABLE");
    setCaseFault(email, "decide", { kind: "drop-after", times: 1 });
    expect(
      await codeOf(decideCase(idOf("link"), { decisao: "aprovar" }, KEY)),
    ).toBe("NETWORK");
    // The retry with the same key: the first result (PC22).
    expect(
      (await decideCase(idOf("link"), { decisao: "aprovar" }, KEY)).estado,
    ).toBe("decidido");
  });
});

describe("requestDocuments (D-C4, PC14, F8)", () => {
  it("with an e-mail: the case, no link", async () => {
    const result = await requestDocuments(
      idOf("link"),
      { tipos: ["CARTAO_CNPJ"] },
      KEY,
    );
    expect(result.case.estado).toBe("aguardando_doc");
    expect(result.linkVendedor).toBeUndefined();
    expect(requests()[0]?.headers.get("idempotency-key")).toBe(KEY);
  });

  it("without an e-mail: the validated link", async () => {
    const result = await requestDocuments(
      idOf("link-sem-email"),
      { tipos: ["CARTAO_CNPJ"], notaVendedor: "Olá" },
      KEY,
    );
    expect(result.linkVendedor).toMatch(
      /^https:\/\/kybr\.test\/v\/[a-z0-9-]+\/c\//,
    );
    expect(JSON.parse(String(requests()[0]?.init.body))).toEqual({
      tipos: ["CARTAO_CNPJ"],
      nota_vendedor: "Olá",
    });
  });

  it("F8: an invalid link is dropped and marked, never logged", async () => {
    const id = idOf("link-sem-email");
    setCaseFault(email, "request-documents", { kind: "link-invalido" });
    const result = await requestDocuments(id, { tipos: ["CARTAO_CNPJ"] }, KEY);
    expect(result.linkVendedor).toBeUndefined();
    expect(reportMarker).toHaveBeenCalledWith("LINK_VENDEDOR_INVALID", {
      operation: "case-request-documents",
      caseId: id,
    });
    expect(JSON.stringify(reportMarker.mock.calls)).not.toContain("javascript");
  });

  it("422 DOCUMENTO_NAO_HABILITADO is kept", async () => {
    expect(
      await codeOf(
        requestDocuments(idOf("link"), { tipos: ["PROCURACAO"] }, KEY),
      ),
    ).toBe("DOCUMENTO_NAO_HABILITADO");
  });
});

describe("streamCertificate (D-C5, C-M6-9, F12)", () => {
  async function verificationOf(kind: string): Promise<string> {
    return (
      casesOf(email).find((record) => record.kind === kind)?.verification.id ??
      ""
    );
  }

  it("buffers and returns the PDF", async () => {
    const pdf = await streamCertificate(await verificationOf("link"));
    expect(new TextDecoder().decode(pdf.slice(0, 5))).toBe("%PDF-");
  });

  it.each(["html", "grande"] as const)(
    "refuses %s (text/html instead of a PDF; over 5 MB) → UNAVAILABLE",
    async (kind) => {
      setCaseFault(email, "certificate", { kind, times: 1 });
      expect(
        await codeOf(streamCertificate(await verificationOf("link"))),
      ).toBe("UNAVAILABLE");
    },
  );

  it("refuses a PDF type whose body isn't a PDF", async () => {
    server.use(
      http.get(
        `${API}/v1/verifications/:id/certificate`,
        () =>
          new HttpResponse("<html></html>", {
            headers: { "content-type": "application/pdf" },
          }),
      ),
    );
    expect(await codeOf(streamCertificate(await verificationOf("link")))).toBe(
      "UNAVAILABLE",
    );
  });

  it("no certificate (another workspace's, DADOS_NAO_ENCONTRADOS) → RECURSO_NAO_ENCONTRADO", async () => {
    expect(
      await codeOf(streamCertificate(await verificationOf("nodata"))),
    ).toBe("RECURSO_NAO_ENCONTRADO");
  });
});

describe("the seeded account still works for others", () => {
  it("PC1's fila@ list is unaffected", async () => {
    state.token = openSession(PANEL_EMAILS.fila).id;
    expect((await listCases({ estado: "aberto", limit: 200 })).total).toBe(30);
  });
});

describe("listCasesForPage (T98: the list pane's read)", () => {
  it("one read per (estado, limit), the CNPJs masked (F11)", async () => {
    const result = await listCasesForPage("aberto", 25);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.page.itens.length).toBeGreaterThan(0);
    for (const item of result.page.itens)
      expect(item.cnpj).toMatch(/^.{2}\..{3}\..{3}\/.{4}-.{2}$/);
    expect(result.page.total).toBeGreaterThan(0);
    expect(result.page.gerado_em).toMatch(/Z$/);
  });

  it("a failed or invalid read is a result, not a throw (AC 28)", async () => {
    setCaseFault(email, "list", { kind: "500", times: 1 });
    expect(await listCasesForPage("aberto", 25)).toEqual({ ok: false });
    setCaseFault(email, "list", { kind: "invalido", times: 1 });
    expect(await listCasesForPage("aberto", 50)).toEqual({ ok: false });
  });

  it("SESSAO_EXPIRADA still throws", async () => {
    state.token = undefined;
    expect(await codeOf(listCasesForPage("aguardando_doc", 25))).toBe(
      "SESSAO_EXPIRADA",
    );
  });
});
