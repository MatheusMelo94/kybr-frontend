// @vitest-environment node
import { HttpResponse, http } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  AC16,
  BATCH_SETS,
  PANEL_EMAILS,
} from "@/tests/fixtures/factories/panel";
import { openSession, panelStore } from "@/tests/fixtures/msw/panel-store";
import { server } from "@/tests/fixtures/msw/server";

const state = vi.hoisted(() => ({ token: undefined as string | undefined }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ host: "app.kybr.test" }),
}));
vi.mock("next/navigation", () => ({ notFound: vi.fn(), redirect: vi.fn() }));
vi.mock("@/lib/api/panel/cookies", () => ({
  readSessionToken: async () => state.token,
}));
vi.mock("@/lib/monitoring", () => ({ reportMarker: vi.fn() }));

import {
  getBatch,
  listBatchRows,
  listBatches,
  monitorBatch,
  resumeBatch,
  sendToQueue,
  startBatch,
  streamBatchCsv,
} from "@/lib/api/panel/batches";
import { CSV_MAX_BYTES } from "@/lib/api/panel/csv-limits";

const KEY = "0b7f3c1e-2a4d-4e5f-8a6b-9c0d1e2f3a4b";
const ACTION_KEY = "2d9b5e3a-4c6f-4a71-8c8d-1e2f3a4b5c6d";
const POLL_TIMEOUT_MS = 4_000;
const TUDO_OK = BATCH_SETS.tudoOk.map((cnpj) => ({ cnpj }));

let fetchSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  state.token = openSession(PANEL_EMAILS.pago).id;
  fetchSpy = vi.spyOn(globalThis, "fetch");
});

afterEach(() => {
  fetchSpy.mockRestore();
  vi.restoreAllMocks();
});

/** The headers and init of the last call the data function made. */
function lastRequest(): { headers: Headers; init: RequestInit; url: string } {
  const [input, init] = fetchSpy.mock.calls.at(-1) as [
    URL | string,
    RequestInit,
  ];
  return { url: String(input), init, headers: new Headers(init.headers) };
}

async function started(linhas = TUDO_OK): Promise<string> {
  const result = await startBatch(linhas, KEY);
  if (!result.ok) throw result.error;
  return result.data.id;
}

describe("startBatch (D-B1)", () => {
  it("PB1: posts the rows with the Idempotency-Key, the bearer and the BFF key, no-store", async () => {
    const result = await startBatch(TUDO_OK, KEY);

    expect(result.ok).toBe(true);
    const { headers, init, url } = lastRequest();
    expect(url).toBe("http://api.kybr.test/v1/batches");
    expect(init.method).toBe("POST");
    expect(init.cache).toBe("no-store");
    expect(headers.get("idempotency-key")).toBe(KEY);
    expect(headers.get("authorization")).toBe(`Bearer ${state.token}`);
    expect(headers.get("x-kybr-bff-key")).toBeTruthy();
    expect(JSON.parse(String(init.body))).toEqual({ linhas: TUDO_OK });
  });

  it("PB5: the same key and body answer the same id", async () => {
    const first = await started();
    expect(await started()).toBe(first);
  });

  it("PB2: 402 → SEM_SALDO with disponiveis", async () => {
    state.token = openSession("cem@exemplo.test").id;
    const result = await startBatch(AC16.linhas, KEY);
    expect(result).toMatchObject({
      ok: false,
      error: { code: "SEM_SALDO", status: 402, disponiveis: 100 },
    });
  });

  it("PB13: a tampered body comes back as its code", async () => {
    const many = Array.from({ length: 5001 }, () => ({
      cnpj: TUDO_OK[0]?.cnpj ?? "",
    }));
    const result = await startBatch(many, KEY);
    expect(result).toMatchObject({
      ok: false,
      error: { code: "MUITAS_LINHAS" },
    });
  });

  it("a bare 402 still reads as SEM_SALDO", async () => {
    server.use(
      http.post("*/v1/batches", () => new HttpResponse(null, { status: 402 })),
    );
    const result = await startBatch(TUDO_OK, KEY);
    expect(result).toMatchObject({ ok: false, error: { code: "SEM_SALDO" } });
  });

  it("no session → SESSAO_EXPIRADA, with no call", async () => {
    state.token = undefined;
    const result = await startBatch(TUDO_OK, KEY);
    expect(result).toMatchObject({
      ok: false,
      error: { code: "SESSAO_EXPIRADA" },
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("a revoked session (401) → SESSAO_EXPIRADA", async () => {
    panelStore().sessions.clear();
    const result = await startBatch(TUDO_OK, KEY);
    expect(result).toMatchObject({
      ok: false,
      error: { code: "SESSAO_EXPIRADA" },
    });
  });
});

describe("getBatch (D-B2)", () => {
  it("returns the parsed batch", async () => {
    const id = await started();
    const result = await getBatch(id);
    expect(result).toMatchObject({
      ok: true,
      data: { id, estado: "processando" },
    });
    expect(lastRequest().headers.get("x-kybr-poll")).toBeNull();
  });

  it("a poll sends X-Kybr-Poll: 1 with the poll's 4 s timeout (M4-02, C7)", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout");
    const id = await started();
    await getBatch(id, { pollTimeoutMs: POLL_TIMEOUT_MS });
    expect(lastRequest().headers.get("x-kybr-poll")).toBe("1");
    expect(timeout).toHaveBeenLastCalledWith(POLL_TIMEOUT_MS);
  });

  it("PB10: a foreign or unknown id → LOTE_NAO_ENCONTRADO; a bare 404 too", async () => {
    const foreign = await started();
    state.token = openSession(PANEL_EMAILS.outro).id;
    for (const id of [foreign, "9d8c7b6a-5f4e-4d3c-8b2a-1f0e9d8c7b6a"])
      expect(await getBatch(id)).toMatchObject({
        ok: false,
        error: { code: "LOTE_NAO_ENCONTRADO", status: 404 },
      });

    server.use(
      http.get(
        "*/v1/batches/:id",
        () => new HttpResponse(null, { status: 404 }),
      ),
    );
    expect(await getBatch(foreign)).toMatchObject({
      ok: false,
      error: { code: "LOTE_NAO_ENCONTRADO" },
    });
  });

  it("an id outside A-X3 throws before any request", async () => {
    await expect(getBatch("../me")).rejects.toThrow(/Refused API path segment/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("listBatchRows (D-B3) and listBatches (D-B6)", () => {
  it("reads a page with the status filter, and the history newest first", async () => {
    const id = await started(AC16.linhas);
    for (let i = 0; i < 4; i++) await getBatch(id);

    const rows = await listBatchRows(id, { status: "erro" });
    expect(rows).toMatchObject({ ok: true, data: { total: 3 } });
    expect(lastRequest().url).toBe(
      `http://api.kybr.test/v1/batches/${id}/rows?limit=25&status=erro`,
    );

    const history = await listBatches();
    if (!history.ok) throw history.error;
    // Newest first; pago's boot-time batch (QA G8) is older.
    expect(history.data[0]).toMatchObject({ id, total: 184 });
  });

  it("PB10: rows of a foreign batch → LOTE_NAO_ENCONTRADO", async () => {
    const id = await started();
    state.token = openSession(PANEL_EMAILS.outro).id;
    expect(await listBatchRows(id)).toMatchObject({
      ok: false,
      error: { code: "LOTE_NAO_ENCONTRADO" },
    });
  });
});

describe("sendToQueue, monitorBatch, resumeBatch (D-B5, D-B7)", () => {
  it("send their key and parse the counts; resume answers 202", async () => {
    const id = await started(AC16.linhas);
    for (let i = 0; i < 4; i++) await getBatch(id);

    const queued = await sendToQueue(id, ACTION_KEY);
    expect(queued).toMatchObject({
      ok: true,
      data: { criados: expect.any(Number) },
    });
    expect(lastRequest().headers.get("idempotency-key")).toBe(ACTION_KEY);

    const monitored = await monitorBatch(
      id,
      "3eac6f4b-5d7a-4b82-9d9e-2f3a4b5c6d7e",
    );
    expect(monitored).toMatchObject({ ok: true, data: { monitorados: 181 } });

    expect(await resumeBatch(id)).toMatchObject({ ok: true });
    expect(lastRequest().headers.get("idempotency-key")).toBeNull();
  });
});

describe("streamBatchCsv (D-B4)", () => {
  it("returns the body stream and the content type", async () => {
    const id = await started(AC16.linhas);
    for (let i = 0; i < 4; i++) await getBatch(id);

    const result = await streamBatchCsv(id, "errors");
    if (!result.ok) throw result.error;
    expect(result.data.contentType).toBe("text/csv; charset=utf-8");
    const text = await new Response(result.data.body).text();
    expect(text).toContain('"CNPJ";"Responsável";"ID na plataforma"');
    const { url, init } = lastRequest();
    expect(url).toBe(`http://api.kybr.test/v1/batches/${id}/errors.csv`);
    expect(init.cache).toBe("no-store");
    expect(init.redirect).toBe("error");
  });

  it("refuses a response that isn't text/csv", async () => {
    server.use(
      http.get("*/v1/batches/:id/:file", () => HttpResponse.json({ x: 1 })),
    );
    const result = await streamBatchCsv(await started(), "result");
    expect(result).toMatchObject({
      ok: false,
      error: { code: "INVALID_RESPONSE" },
    });
  });

  /** A text/csv reply whose body streams `total` bytes in 1 MiB chunks. */
  function csvOf(total: number, declare = false) {
    const chunk = new Uint8Array(1024 * 1024).fill(0x61);
    return () =>
      new HttpResponse(
        new ReadableStream({
          start(controller) {
            let left = total;
            while (left > 0) {
              const size = Math.min(left, chunk.byteLength);
              controller.enqueue(chunk.subarray(0, size));
              left -= size;
            }
            controller.close();
          },
        }),
        {
          headers: {
            "content-type": "text/csv; charset=utf-8",
            ...(declare ? { "content-length": String(total) } : {}),
          },
        },
      );
  }

  it("O-F5: the shared cap is 4 MiB, under Vercel's 4.5 MB response limit", () => {
    expect(CSV_MAX_BYTES).toBe(4 * 1024 * 1024);
  });

  it("O-F5: a declared length of 4 MiB + 1 byte → UNAVAILABLE", async () => {
    server.use(
      http.get(
        "*/v1/batches/:id/:file",
        () =>
          new HttpResponse("x", {
            headers: {
              "content-type": "text/csv; charset=utf-8",
              "content-length": String(CSV_MAX_BYTES + 1),
            },
          }),
      ),
    );
    const result = await streamBatchCsv(await started(), "result");
    expect(result).toMatchObject({ ok: false, error: { code: "UNAVAILABLE" } });
  });

  it("O-F5: a stream of 4 MiB + 1 byte errors with UNAVAILABLE", async () => {
    server.use(http.get("*/v1/batches/:id/:file", csvOf(4 * 1024 * 1024 + 1)));
    const result = await streamBatchCsv(await started(), "result");
    if (!result.ok) throw result.error;
    await expect(new Response(result.data.body).text()).rejects.toMatchObject({
      code: "UNAVAILABLE",
    });
  });

  it("O-F5: exactly 4 MiB passes, declared or streamed", async () => {
    const id = await started();
    for (const declare of [true, false]) {
      server.use(
        http.get("*/v1/batches/:id/:file", csvOf(4 * 1024 * 1024, declare)),
      );
      const result = await streamBatchCsv(id, "result");
      if (!result.ok) throw result.error;
      const bytes = await new Response(result.data.body).arrayBuffer();
      expect(bytes.byteLength).toBe(4 * 1024 * 1024);
    }
  });

  it("PB10 and 401 map like the JSON calls", async () => {
    const id = await started();
    state.token = openSession(PANEL_EMAILS.outro).id;
    expect(await streamBatchCsv(id, "result")).toMatchObject({
      ok: false,
      error: { code: "LOTE_NAO_ENCONTRADO" },
    });
    panelStore().sessions.clear();
    expect(await streamBatchCsv(id, "result")).toMatchObject({
      ok: false,
      error: { code: "SESSAO_EXPIRADA" },
    });
  });
});
