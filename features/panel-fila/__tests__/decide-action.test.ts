// @vitest-environment node
import { HttpResponse, http } from "msw";
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

import { decideAction } from "@/features/panel-fila/actions";
import { panelPath } from "@/lib/panel-paths";

const KEY = "0b7f3c1e-2a4d-4e5f-8a6b-9c0d1e2f3a4b";
const NOTA = "NOTA-SENTINELA-104";

let email: string;
let consoleSpies: ReturnType<typeof vi.spyOn>[];

function idOf(kind: string): string {
  const found = casesOf(email).find((record) => record.kind === kind);
  if (!found) throw new Error(kind);
  return found.id;
}

const decidePosts = () =>
  panelStore().calls.filter(
    (call) =>
      call.method === "POST" && /^\/v1\/cases\/[^/]+\/decide$/.test(call.path),
  );

beforeEach(() => {
  email = `decide-${crypto.randomUUID().slice(0, 8)}@exemplo.test`;
  seedCases(email, "cada-tipo");
  state.token = openSession(email).id;
  state.headers = new Headers({ host: "app.kybr.test" });
  vi.clearAllMocks();
  consoleSpies = (["log", "warn", "error", "info", "debug"] as const).map((m) =>
    vi.spyOn(console, m).mockImplementation(() => undefined),
  );
});

/** Nothing logged or reported carries the note or a parse's detail (F11). */
function expectNothingLogged(...needles: string[]): void {
  const logged = JSON.stringify([
    ...consoleSpies.map((spy) => spy.mock.calls),
    reportMarker.mock.calls,
  ]);
  for (const needle of [NOTA, "ZodError", "invalid_", ...needles])
    expect(logged).not.toContain(needle);
}

describe("decideAction (D-C3; ADR-0011 order; ADR-0008 Addendum 2)", () => {
  it("off the panel host: 404 before anything", async () => {
    state.headers = new Headers({ host: "kybr.test" });
    await expect(
      decideAction({
        caseId: idOf("link"),
        idempotencyKey: KEY,
        decisao: "aprovar",
      }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(panelStore().calls.filter((c) => c.email === email)).toEqual([]);
  });

  it.each([
    [
      "a bad case id",
      { caseId: "../x", idempotencyKey: KEY, decisao: "aprovar" },
    ],
    ["a non-uuid key", { idempotencyKey: "nao-uuid", decisao: "aprovar" }],
    ["an unknown decision", { idempotencyKey: KEY, decisao: "ignorar" }],
    ["bloquear without a reason", { idempotencyKey: KEY, decisao: "bloquear" }],
    [
      "an unknown reason",
      { idempotencyKey: KEY, decisao: "bloquear", motivoCodigo: "QUALQUER" },
    ],
    [
      "a reason on aprovar",
      { idempotencyKey: KEY, decisao: "aprovar", motivoCodigo: "MEI" },
    ],
    [
      "a note on manter",
      { idempotencyKey: KEY, decisao: "manter", notaVendedor: NOTA },
    ],
    [
      "a 281-character note",
      {
        idempotencyKey: KEY,
        decisao: "bloquear",
        motivoCodigo: "MEI",
        notaVendedor: `${NOTA}${"x".repeat(281 - NOTA.length)}`,
      },
    ],
    [
      "an unknown key",
      { idempotencyKey: KEY, decisao: "aprovar", extra: NOTA },
    ],
  ])(
    "F11: refuses %s with VALOR_INVALIDO, before the session and the API, logging nothing",
    async (_, fields) => {
      const input = { caseId: idOf("link"), ...fields };
      expect(await decideAction(input)).toEqual({
        ok: false,
        code: "VALOR_INVALIDO",
      });
      expect(panelStore().calls.filter((c) => c.email === email)).toEqual([]);
      expectNothingLogged("QUALQUER", "ignorar");
    },
  );

  it("refuses a non-object", async () => {
    expect(await decideAction("aprovar")).toEqual({
      ok: false,
      code: "VALOR_INVALIDO",
    });
  });

  it("no session: requireSession() redirects to /entrar, no decide call", async () => {
    state.token = undefined;
    await expect(
      decideAction({
        caseId: idOf("link"),
        idempotencyKey: KEY,
        decisao: "aprovar",
      }),
    ).rejects.toThrow("NEXT_REDIRECT /entrar?motivo=sessao");
    expect(decidePosts()).toEqual([]);
  });

  it("aprovar: forwards the client's key unchanged, revalidates the panel layout, answers ok", async () => {
    const id = idOf("link");
    expect(
      await decideAction({
        caseId: id,
        idempotencyKey: KEY,
        decisao: "aprovar",
      }),
    ).toEqual({ ok: true });
    const [post] = decidePosts();
    expect(post?.idempotencyKey).toBe(KEY);
    expect(post?.decisao).toBe("aprovar");
    expect(revalidatePath).toHaveBeenCalledWith(panelPath("/"), "layout");
    expect(casesOf(email).find((c) => c.id === id)?.estado).toBe("decidido");
  });

  it("F7: forwards the page path the middleware set (x-kybr-panel-path), without its query", async () => {
    const id = idOf("link");
    state.headers.set("x-kybr-panel-path", `/fila/${id}?aba=aberto`);
    await decideAction({ caseId: id, idempotencyKey: KEY, decisao: "aprovar" });
    expect(decidePosts()[0]?.pagePath).toBe(`/fila/${id}`);
  });

  it("F7: a page path that isn't a panel screen isn't forwarded", async () => {
    state.headers.set("x-kybr-panel-path", "https://outro.test/fila");
    await decideAction({
      caseId: idOf("link"),
      idempotencyKey: KEY,
      decisao: "aprovar",
    });
    expect(decidePosts()).toHaveLength(1);
    expect(decidePosts()[0]?.pagePath).toBeUndefined();
  });

  it("manter on an alert", async () => {
    expect(
      await decideAction({
        caseId: idOf("alerta"),
        idempotencyKey: KEY,
        decisao: "manter",
      }),
    ).toEqual({ ok: true });
  });

  it("bloquear with a reason and a note: sent, and the note is never logged", async () => {
    expect(
      await decideAction({
        caseId: idOf("link"),
        idempotencyKey: KEY,
        decisao: "bloquear",
        motivoCodigo: "MEI",
        notaVendedor: NOTA,
      }),
    ).toEqual({ ok: true });
    expect(decidePosts()[0]?.motivoCodigo).toBe("MEI");
    expectNothingLogged();
  });

  it("409: CASO_JA_DECIDIDO with the validated decididoEm and decisao; no revalidation", async () => {
    const result = await decideAction({
      caseId: idOf("decidido-bloquear"),
      idempotencyKey: KEY,
      decisao: "aprovar",
    });
    expect(result).toEqual({
      ok: false,
      code: "CASO_JA_DECIDIDO",
      decididoEm: expect.stringMatching(/Z$|[+-]\d{2}:\d{2}$/),
      decisao: { tipo: "bloquear", motivoCodigo: expect.any(String) },
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("409 with an unknown decision or a non-ISO date: those fields are dropped", async () => {
    server.use(
      http.post("*/v1/cases/:id/decide", () =>
        HttpResponse.json(
          {
            code: "CASO_JA_DECIDIDO",
            decidido_em: "ontem",
            decisao: { tipo: "ignorar" },
          },
          { status: 409 },
        ),
      ),
    );
    expect(
      await decideAction({
        caseId: idOf("link"),
        idempotencyKey: KEY,
        decisao: "aprovar",
      }),
    ).toEqual({ ok: false, code: "CASO_JA_DECIDIDO" });
  });

  it("a 401 after the session check: SESSAO_EXPIRADA (a result, not a redirect)", async () => {
    server.use(
      http.post("*/v1/cases/:id/decide", () =>
        HttpResponse.json({ code: "SESSAO_EXPIRADA" }, { status: 401 }),
      ),
    );
    expect(
      await decideAction({
        caseId: idOf("link"),
        idempotencyKey: KEY,
        decisao: "aprovar",
      }),
    ).toEqual({ ok: false, code: "SESSAO_EXPIRADA" });
  });

  it.each([
    ["MOTIVO_OBRIGATORIO", 422, "MOTIVO_OBRIGATORIO"],
    ["VALOR_INVALIDO", 422, "VALOR_INVALIDO"],
    ["ERRO_INTERNO", 500, "UNAVAILABLE"],
  ])("the API's %s (%d) → %s", async (code, status, expected) => {
    server.use(
      http.post("*/v1/cases/:id/decide", () =>
        HttpResponse.json({ code }, { status }),
      ),
    );
    expect(
      await decideAction({
        caseId: idOf("link"),
        idempotencyKey: KEY,
        decisao: "aprovar",
      }),
    ).toEqual({ ok: false, code: expected });
  });

  it("manter on a case that isn't an alert: the API's VALOR_INVALIDO", async () => {
    expect(
      await decideAction({
        caseId: idOf("link"),
        idempotencyKey: KEY,
        decisao: "manter",
      }),
    ).toEqual({ ok: false, code: "VALOR_INVALIDO" });
  });

  it("a foreign or unknown id: CASO_NAO_ENCONTRADO", async () => {
    expect(
      await decideAction({
        caseId: FOREIGN_CASE_ID,
        idempotencyKey: KEY,
        decisao: "aprovar",
      }),
    ).toEqual({ ok: false, code: "CASO_NAO_ENCONTRADO" });
  });

  it("F5: a 503 is UNAVAILABLE and a dropped socket NETWORK (the outcome is unknown); the same key replays the first result", async () => {
    const id = idOf("link");
    const input = { caseId: id, idempotencyKey: KEY, decisao: "aprovar" };
    setCaseFault(email, "decide", { kind: "503", times: 1 });
    expect(await decideAction(input)).toEqual({
      ok: false,
      code: "UNAVAILABLE",
    });
    setCaseFault(email, "decide", { kind: "drop-after", times: 1 });
    expect(await decideAction(input)).toEqual({ ok: false, code: "NETWORK" });
    expect(await decideAction(input)).toEqual({ ok: true });
    expect(new Set(decidePosts().map((call) => call.idempotencyKey))).toEqual(
      new Set([KEY]),
    );
  });
});
