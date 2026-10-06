// @vitest-environment node
import { HttpResponse, delay, http } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { FOREIGN_CASE_ID } from "@/tests/fixtures/factories/panel";
import {
  casesOf,
  openSession,
  panelStore,
  seedCases,
  setCaseFault,
} from "@/tests/fixtures/msw/panel-store";
import { server } from "@/tests/fixtures/msw/server";

const state = vi.hoisted(() => ({
  headers: new Headers(),
  token: undefined as string | undefined,
}));
const revalidatePath = vi.hoisted(() => vi.fn());
const reportMarker = vi.hoisted(() => vi.fn());
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
vi.mock("@/lib/monitoring", () => ({ reportMarker }));

import { requestDocumentsAction } from "@/features/panel-fila/actions";
import { DEFAULT_TIMEOUT_MS } from "@/lib/api/client";
import { panelPath } from "@/lib/panel-paths";

const KEY = "0b7f3c1e-2a4d-4e5f-8a6b-9c0d1e2f3a4b";
const NOTA = "NOTA-SENTINELA-108";

let email: string;
let consoleSpies: ReturnType<typeof vi.spyOn>[];

function idOf(kind: string): string {
  const found = casesOf(email).find((record) => record.kind === kind);
  if (!found) throw new Error(kind);
  return found.id;
}

const requestPosts = () =>
  panelStore().calls.filter(
    (call) =>
      call.method === "POST" &&
      /^\/v1\/cases\/[^/]+\/request-documents$/.test(call.path),
  );

beforeEach(() => {
  email = `pedir-${crypto.randomUUID().slice(0, 8)}@exemplo.test`;
  seedCases(email, "cada-tipo");
  state.token = openSession(email).id;
  state.headers = new Headers({ host: "app.kybr.test" });
  vi.clearAllMocks();
  consoleSpies = (["log", "warn", "error", "info", "debug"] as const).map((m) =>
    vi.spyOn(console, m).mockImplementation(() => undefined),
  );
});

/** Nothing logged or reported carries the note, the link or a parse's detail (F11). */
function expectNothingLogged(...needles: string[]): void {
  const logged = JSON.stringify([
    ...consoleSpies.map((spy) => spy.mock.calls),
    reportMarker.mock.calls,
  ]);
  for (const needle of [NOTA, "ZodError", "invalid_", "/v/", ...needles])
    expect(logged).not.toContain(needle);
}

describe("requestDocumentsAction (D-C4; ADR-0011 order; ADR-0008 Addendum 2)", () => {
  it("off the panel host: 404 before anything", async () => {
    state.headers = new Headers({ host: "kybr.test" });
    await expect(
      requestDocumentsAction({
        caseId: idOf("link"),
        idempotencyKey: KEY,
        tipos: ["CARTAO_CNPJ"],
      }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(panelStore().calls.filter((c) => c.email === email)).toEqual([]);
  });

  it.each([
    [
      "a bad case id",
      { caseId: "../x", idempotencyKey: KEY, tipos: ["CARTAO_CNPJ"] },
    ],
    ["a non-uuid key", { idempotencyKey: "nao-uuid", tipos: ["CARTAO_CNPJ"] }],
    ["no types", { idempotencyKey: KEY, tipos: [] }],
    ["no tipos field", { idempotencyKey: KEY }],
    ["an unknown type", { idempotencyKey: KEY, tipos: ["QUALQUER"] }],
    [
      "a repeated type",
      { idempotencyKey: KEY, tipos: ["CARTAO_CNPJ", "CARTAO_CNPJ"] },
    ],
    [
      "six types",
      {
        idempotencyKey: KEY,
        tipos: [
          "CONTRATO_SOCIAL_OU_CCMEI",
          "PROCURACAO",
          "COMPROVANTE_ENDERECO",
          "CARTAO_CNPJ",
          "RESPONSAVEL",
          "CARTAO_CNPJ",
        ],
      },
    ],
    [
      "a 281-character note",
      {
        idempotencyKey: KEY,
        tipos: ["CARTAO_CNPJ"],
        notaVendedor: `${NOTA}${"x".repeat(281 - NOTA.length)}`,
      },
    ],
    [
      "an unknown key",
      { idempotencyKey: KEY, tipos: ["CARTAO_CNPJ"], extra: NOTA },
    ],
  ])(
    "F11: refuses %s with VALOR_INVALIDO, before the session and the API, logging nothing",
    async (_, fields) => {
      const input = { caseId: idOf("link"), ...fields };
      expect(await requestDocumentsAction(input)).toEqual({
        ok: false,
        code: "VALOR_INVALIDO",
      });
      expect(panelStore().calls.filter((c) => c.email === email)).toEqual([]);
      expectNothingLogged("QUALQUER");
    },
  );

  it("five unique types and a 280-character note pass the schema", async () => {
    const result = await requestDocumentsAction({
      caseId: idOf("link"),
      idempotencyKey: KEY,
      tipos: [
        "CONTRATO_SOCIAL_OU_CCMEI",
        "PROCURACAO",
        "COMPROVANTE_ENDERECO",
        "CARTAO_CNPJ",
        "RESPONSAVEL",
      ],
      notaVendedor: "x".repeat(280),
    });
    // The schema let it through; the mock's default set refuses PROCURACAO.
    expect(result).toEqual({ ok: false, code: "DOCUMENTO_NAO_HABILITADO" });
    expect(requestPosts()).toHaveLength(1);
  });

  it("no session: SESSAO_EXPIRADA as a result (ADR-0011 Addendum 2, AC 7): no redirect, 0 API calls", async () => {
    state.token = undefined;
    expect(
      await requestDocumentsAction({
        caseId: idOf("link"),
        idempotencyKey: KEY,
        tipos: ["CARTAO_CNPJ"],
      }),
    ).toEqual({ ok: false, code: "SESSAO_EXPIRADA" });
    expect(panelStore().calls).toEqual([]);
  });

  it("a session the API rejects at /me: the same result, no request call", async () => {
    panelStore().sessions.clear();
    expect(
      await requestDocumentsAction({
        caseId: idOf("link"),
        idempotencyKey: KEY,
        tipos: ["CARTAO_CNPJ"],
      }),
    ).toEqual({ ok: false, code: "SESSAO_EXPIRADA" });
    expect(requestPosts()).toEqual([]);
  });

  it("with an e-mail: forwards the key and the types unchanged, revalidates the panel layout, ok without a link", async () => {
    const id = idOf("link");
    expect(
      await requestDocumentsAction({
        caseId: id,
        idempotencyKey: KEY,
        tipos: ["CARTAO_CNPJ", "COMPROVANTE_ENDERECO"],
        notaVendedor: NOTA,
      }),
    ).toEqual({ ok: true });
    const [post] = requestPosts();
    expect(post?.idempotencyKey).toBe(KEY);
    expect(post?.tipos).toEqual(["CARTAO_CNPJ", "COMPROVANTE_ENDERECO"]);
    expect(revalidatePath).toHaveBeenCalledWith(panelPath("/"), "layout");
    expect(casesOf(email).find((c) => c.id === id)?.estado).toBe(
      "aguardando_doc",
    );
    expectNothingLogged();
  });

  it("without an e-mail: ok with the F8-validated linkVendedor, never logged", async () => {
    const result = await requestDocumentsAction({
      caseId: idOf("link-sem-email"),
      idempotencyKey: KEY,
      tipos: ["CARTAO_CNPJ"],
    });
    expect(result).toEqual({
      ok: true,
      linkVendedor: expect.stringMatching(/^https:\/\/kybr\.test\/v\//),
    });
    expectNothingLogged();
  });

  it("F8: an invalid link from the API → ok with no link, and only the marker", async () => {
    const id = idOf("link-sem-email");
    setCaseFault(email, "request-documents", { kind: "link-invalido" });
    expect(
      await requestDocumentsAction({
        caseId: id,
        idempotencyKey: KEY,
        tipos: ["CARTAO_CNPJ"],
      }),
    ).toEqual({ ok: true });
    expect(reportMarker).toHaveBeenCalledWith("LINK_VENDEDOR_INVALID", {
      operation: "case-request-documents",
      caseId: id,
    });
    expectNothingLogged("javascript");
  });

  it("F7: forwards the page path the middleware set (x-kybr-panel-path), without its query", async () => {
    const id = idOf("link");
    state.headers.set("x-kybr-panel-path", `/fila/${id}?aba=aberto`);
    await requestDocumentsAction({
      caseId: id,
      idempotencyKey: KEY,
      tipos: ["CARTAO_CNPJ"],
    });
    expect(requestPosts()[0]?.pagePath).toBe(`/fila/${id}`);
  });

  it("F7: a page path that isn't a panel screen isn't forwarded", async () => {
    state.headers.set("x-kybr-panel-path", "https://outro.test/fila");
    await requestDocumentsAction({
      caseId: idOf("link"),
      idempotencyKey: KEY,
      tipos: ["CARTAO_CNPJ"],
    });
    expect(requestPosts()).toHaveLength(1);
    expect(requestPosts()[0]?.pagePath).toBeUndefined();
  });

  it("409: CASO_JA_DECIDIDO with decididoEm; no revalidation", async () => {
    const result = await requestDocumentsAction({
      caseId: idOf("decidido-bloquear"),
      idempotencyKey: KEY,
      tipos: ["CARTAO_CNPJ"],
    });
    expect(result).toMatchObject({
      ok: false,
      code: "CASO_JA_DECIDIDO",
      decididoEm: expect.any(String),
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("422 DOCUMENTO_NAO_HABILITADO is kept", async () => {
    expect(
      await requestDocumentsAction({
        caseId: idOf("link"),
        idempotencyKey: KEY,
        tipos: ["PROCURACAO"],
      }),
    ).toEqual({ ok: false, code: "DOCUMENTO_NAO_HABILITADO" });
  });

  it.each([
    ["SESSAO_EXPIRADA", 401, "SESSAO_EXPIRADA"],
    ["VALOR_INVALIDO", 422, "VALOR_INVALIDO"],
    ["ERRO_INTERNO", 500, "UNAVAILABLE"],
  ])("the API's %s (%d) → %s", async (code, status, expected) => {
    server.use(
      http.post("*/v1/cases/:id/request-documents", () =>
        HttpResponse.json({ code }, { status }),
      ),
    );
    expect(
      await requestDocumentsAction({
        caseId: idOf("link"),
        idempotencyKey: KEY,
        tipos: ["CARTAO_CNPJ"],
      }),
    ).toEqual({ ok: false, code: expected });
  });

  it("a foreign or unknown id: CASO_NAO_ENCONTRADO", async () => {
    expect(
      await requestDocumentsAction({
        caseId: FOREIGN_CASE_ID,
        idempotencyKey: KEY,
        tipos: ["CARTAO_CNPJ"],
      }),
    ).toEqual({ ok: false, code: "CASO_NAO_ENCONTRADO" });
  });

  it("F5: a dropped socket is NETWORK; the same key replays the first result (one link)", async () => {
    const input = {
      caseId: idOf("link-sem-email"),
      idempotencyKey: KEY,
      tipos: ["CARTAO_CNPJ"],
    };
    setCaseFault(email, "request-documents", { kind: "drop-after", times: 1 });
    expect(await requestDocumentsAction(input)).toEqual({
      ok: false,
      code: "NETWORK",
    });
    const first = await requestDocumentsAction(input);
    const again = await requestDocumentsAction(input);
    expect(first).toEqual(again);
    expect(new Set(requestPosts().map((call) => call.idempotencyKey))).toEqual(
      new Set([KEY]),
    );
  });
  describe("M6C-01: the server's unknown outcomes are UNAVAILABLE or NETWORK (the client keeps the key for both)", () => {
    it.each([502, 503, 504])("a %d with no envelope", async (status) => {
      server.use(
        http.post(
          "*/v1/cases/:id/request-documents",
          () => new HttpResponse(null, { status }),
        ),
      );
      expect(
        await requestDocumentsAction({
          caseId: idOf("link"),
          idempotencyKey: KEY,
          tipos: ["CARTAO_CNPJ"],
        }),
      ).toEqual({ ok: false, code: "UNAVAILABLE" });
    });

    it("the API past the server's own bound (TIMEOUT at DEFAULT_TIMEOUT_MS, shortened here) is NETWORK, like a dropped call", async () => {
      const timeout = AbortSignal.timeout.bind(AbortSignal);
      const bound = vi
        .spyOn(AbortSignal, "timeout")
        .mockImplementation(() => timeout(20));
      server.use(
        http.post("*/v1/cases/:id/request-documents", async () => {
          await delay("infinite");
          return HttpResponse.json({});
        }),
      );
      try {
        expect(
          await requestDocumentsAction({
            caseId: idOf("link"),
            idempotencyKey: KEY,
            tipos: ["CARTAO_CNPJ"],
          }),
        ).toEqual({
          ok: false,
          code: "NETWORK",
        });
        expect(bound).toHaveBeenCalledWith(DEFAULT_TIMEOUT_MS);
      } finally {
        bound.mockRestore();
      }
    });

    it("a 2xx whose body fails the schema (the decision may have applied)", async () => {
      server.use(
        http.post("*/v1/cases/:id/request-documents", () =>
          HttpResponse.json({ inesperado: true }),
        ),
      );
      expect(
        await requestDocumentsAction({
          caseId: idOf("link"),
          idempotencyKey: KEY,
          tipos: ["CARTAO_CNPJ"],
        }),
      ).toEqual({ ok: false, code: "UNAVAILABLE" });
    });
  });
});
