// @vitest-environment node
import { HttpResponse, http } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  FOREIGN_CASE_ID,
  JPEG_BYTES,
  PDF_BYTES,
  PNG_BYTES,
} from "@/tests/fixtures/factories/panel";
import {
  casesOf,
  openSession,
  seedCases,
  setCaseFault,
} from "@/tests/fixtures/msw/panel-store";
import { server } from "@/tests/fixtures/msw/server";

const state = vi.hoisted(() => ({
  headers: new Headers(),
  token: undefined as string | undefined,
}));
vi.mock("next/headers", () => ({ headers: async () => state.headers }));
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

import {
  documentResponse,
  type DocumentsSettings,
} from "@/features/panel-fila/document-route";

const ORIGIN = "https://documentos.exemplo.test";
const REDIRECT: DocumentsSettings = {
  mode: "redirect",
  origin: ORIGIN,
  allowLoopbackHttp: false,
};
const ATTACHMENT: DocumentsSettings = { ...REDIRECT, mode: "attachment" };

let email: string;
let caseId: string;
let docId: string;
let fetchSpy: ReturnType<typeof vi.spyOn>;
let logSpies: ReturnType<typeof vi.spyOn>[];

beforeEach(() => {
  state.headers = new Headers({ host: "app.kybr.test" });
  email = `docs-${crypto.randomUUID().slice(0, 8)}@exemplo.test`;
  seedCases(email, "cada-tipo");
  state.token = openSession(email).id;
  const record = casesOf(email).find(
    (candidate) => candidate.kind === "decidido-com-documentos",
  );
  caseId = record?.id ?? "";
  docId = record?.documentos[0]?.id ?? "";
  reportMarker.mockClear();
  fetchSpy = vi.spyOn(globalThis, "fetch");
  logSpies = (["log", "info", "warn", "error", "debug"] as const).map((name) =>
    vi.spyOn(console, name).mockImplementation(() => undefined),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** Everything the handler logged or reported, as one string. */
function logged(): string {
  return JSON.stringify([
    ...logSpies.flatMap((spy) => spy.mock.calls),
    reportMarker.mock.calls,
  ]);
}

function docsRequests(): string[] {
  return fetchSpy.mock.calls
    .map((args: unknown[]) => String(args[0]))
    .filter((url: string) => url.includes("/__docs/"));
}

async function thrown(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  return "resolved";
}

function setFormat(format: "pdf" | "jpeg" | "png"): void {
  const doc = casesOf(email)
    .find((candidate) => candidate.id === caseId)
    ?.documentos.find((candidate) => candidate.id === docId);
  if (doc) doc.formato = format;
}

describe("documentResponse: the shared order (D6, Q1)", () => {
  it("an id that isn't a panel id → 404 with no API call", async () => {
    for (const [badCase, badDoc] of [
      ["../x", docId],
      [caseId, "a b"],
    ] as const) {
      expect(await thrown(documentResponse(badCase, badDoc, REDIRECT))).toBe(
        "NEXT_NOT_FOUND",
      );
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("no session → the requireSession() redirect, before any read", async () => {
    state.token = undefined;
    expect(await thrown(documentResponse(caseId, docId, REDIRECT))).toMatch(
      /^NEXT_REDIRECT /,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("off the panel host → 404 before anything else", async () => {
    state.headers = new Headers({ host: "kybr.test" });
    expect(await thrown(documentResponse(caseId, docId, REDIRECT))).toBe(
      "NEXT_NOT_FOUND",
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("an unknown document, or a foreign case → 404", async () => {
    expect(
      await thrown(
        documentResponse(
          caseId,
          "00000000-0000-4000-8000-000000000000",
          REDIRECT,
        ),
      ),
    ).toBe("NEXT_NOT_FOUND");
    expect(
      await thrown(documentResponse(FOREIGN_CASE_ID, docId, ATTACHMENT)),
    ).toBe("NEXT_NOT_FOUND");
  });

  it("the case's documents missing (partial) → 502 with no body", async () => {
    setCaseFault(email, "documentos", { kind: "omit", times: 1 });
    const response = await documentResponse(caseId, docId, REDIRECT);
    expect(response.status).toBe(502);
    expect(await response.text()).toBe("");
  });
});

describe("documentResponse: redirect mode (D6, F2)", () => {
  it("303 to the fresh signed URL, private no-store, no-referrer, no body", async () => {
    const response = await documentResponse(caseId, docId, REDIRECT);
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toMatch(
      new RegExp(`^${ORIGIN}/__docs/${docId}\\?sig=`),
    );
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(await response.text()).toBe("");
  });

  it("each click reads the case again for a new signature", async () => {
    const first = await documentResponse(caseId, docId, REDIRECT);
    const second = await documentResponse(caseId, docId, REDIRECT);
    expect(first.headers.get("location")).not.toBe(
      second.headers.get("location"),
    );
  });

  it.each(["userinfo", "http-externo"] as const)(
    "a %s URL fails the case schema first (T93) → 502, no Location, never the URL",
    async (kind) => {
      setCaseFault(email, "doc-url", { kind });
      const response = await documentResponse(caseId, docId, REDIRECT);
      expect(response.status).toBe(502);
      expect(response.headers.get("location")).toBeNull();
      expect(logged()).not.toMatch(/sig=|__docs|usuario|docs\.exemplo/);
    },
  );

  it.each(["host-estranho", "host-parecido", "porta"] as const)(
    "a %s URL → 404 + DOCUMENT_ORIGIN_REFUSED with the case id, never the URL",
    async (kind) => {
      setCaseFault(email, "doc-url", { kind });
      expect(await thrown(documentResponse(caseId, docId, REDIRECT))).toBe(
        "NEXT_NOT_FOUND",
      );
      expect(reportMarker).toHaveBeenCalledWith("DOCUMENT_ORIGIN_REFUSED", {
        caseId,
      });
      expect(logged()).not.toMatch(/sig=|__docs|exemplo\.test|estranho/);
    },
  );

  it("no documents origin configured → 404 + the marker", async () => {
    expect(
      await thrown(
        documentResponse(caseId, docId, { ...REDIRECT, origin: undefined }),
      ),
    ).toBe("NEXT_NOT_FOUND");
    expect(reportMarker).toHaveBeenCalledWith("DOCUMENT_ORIGIN_REFUSED", {
      caseId,
    });
  });
});

describe("documentResponse: attachment mode (F4)", () => {
  it.each([
    ["pdf", PDF_BYTES, "application/pdf", "pdf"],
    ["jpeg", JPEG_BYTES, "image/jpeg", "jpg"],
    ["png", PNG_BYTES, "image/png", "png"],
  ] as const)(
    "a %s: 200, the bytes, the type from the magic bytes, a server-built name and the F4 headers",
    async (format, bytes, type, ext) => {
      setFormat(format);
      const response = await documentResponse(caseId, docId, ATTACHMENT);
      expect(response.status).toBe(200);
      expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
      expect(Object.fromEntries(response.headers)).toMatchObject({
        "content-type": type,
        "content-disposition": `attachment; filename="documento-cartao-cnpj.${ext}"`,
        "x-content-type-options": "nosniff",
        "content-security-policy": "sandbox; default-src 'none'",
        "cross-origin-resource-policy": "same-origin",
        "cache-control": "private, no-store",
      });
      expect(response.headers.get("location")).toBeNull();
    },
  );

  it("never forwards the upstream Content-Type or name", async () => {
    server.use(
      http.get("*/__docs/:docId", () =>
        HttpResponse.arrayBuffer(PDF_BYTES.slice().buffer, {
          headers: {
            "Content-Type": "text/html",
            "Content-Disposition": 'attachment; filename="x.html"',
          },
        }),
      ),
    );
    const response = await documentResponse(caseId, docId, ATTACHMENT);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("content-disposition")).toBe(
      'attachment; filename="documento-cartao-cnpj.pdf"',
    );
  });

  it.each([
    ["an HTML body behind a PDF name", "html"],
    ["a body over the cap", "grande"],
    ["a truncated file", "truncado"],
    ["an upstream 500", "500"],
  ] as const)(
    "%s → 502 with no body and none of the F4 file headers",
    async (_name, kind) => {
      setCaseFault(email, "documento", { kind });
      const response = await documentResponse(caseId, docId, ATTACHMENT);
      expect(response.status).toBe(502);
      expect(await response.text()).toBe("");
      expect(response.headers.get("content-disposition")).toBeNull();
      expect(response.headers.get("cache-control")).toBe("private, no-store");
    },
  );

  it("an upstream redirect → 502 (never followed)", async () => {
    server.use(
      http.get("*/__docs/:docId", () =>
        HttpResponse.redirect("https://elsewhere.test/x", 302),
      ),
    );
    const response = await documentResponse(caseId, docId, ATTACHMENT);
    expect(response.status).toBe(502);
  });

  it("checks the allowlist before fetching: a foreign host is never requested", async () => {
    setCaseFault(email, "doc-url", { kind: "host-estranho" });
    expect(await thrown(documentResponse(caseId, docId, ATTACHMENT))).toBe(
      "NEXT_NOT_FOUND",
    );
    expect(docsRequests()).toEqual([]);
    expect(logged()).not.toMatch(/sig=|__docs|estranho/);
  });
});

describe("the route module", () => {
  it("exports GET only (anything else is a 405)", async () => {
    const route =
      await import("@/app/(panel)/painel/(app)/fila/[caseId]/documentos/[docId]/route");
    expect(Object.keys(route)).toEqual(["GET"]);
  });
});
