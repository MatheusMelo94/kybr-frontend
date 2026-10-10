// @vitest-environment node
import { HttpResponse, http } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DOCUMENT_MAX_BYTES } from "@/features/panel-fila/document-route";
import { CERTIFICATE_MAX_BYTES } from "@/lib/api/panel/cases";
import { FOREIGN_CASE_ID, PDF_BYTES } from "@/tests/fixtures/factories/panel";
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
vi.mock("@/lib/monitoring", () => ({ reportMarker: vi.fn() }));

import { proofResponse } from "@/features/panel-fila/proof-route";

let email: string;
let fetchSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  state.headers = new Headers({ host: "app.kybr.test" });
  email = `prova-${crypto.randomUUID().slice(0, 8)}@exemplo.test`;
  seedCases(email, "cada-tipo");
  state.token = openSession(email).id;
  fetchSpy = vi.spyOn(globalThis, "fetch");
  // 2026-10-05 23:30 in São Paulo is already the 6th in UTC.
  vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-10-06T02:30:00Z") });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function caseOf(kind: string) {
  const found = casesOf(email).find((record) => record.kind === kind);
  if (!found) throw new Error(kind);
  return found;
}

async function thrown(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  return "resolved";
}

describe("proofResponse (D-C5, AC 42, F12)", () => {
  it("200: the PDF as an attachment named by the São Paulo date, with the F12 headers", async () => {
    const response = await proofResponse(caseOf("link").id);
    expect(response.status).toBe(200);
    expect(Object.fromEntries(response.headers)).toMatchObject({
      "content-type": "application/pdf",
      "content-disposition":
        'attachment; filename="kybr-comprovante-2026-10-05.pdf"',
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
      "content-security-policy": "sandbox; default-src 'none'",
      "cross-origin-resource-policy": "same-origin",
    });
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(PDF_BYTES);
  });

  it("asks for the certificate of the case's own verification only", async () => {
    const record = caseOf("decidido-aprovar");
    expect((await proofResponse(record.id)).status).toBe(200);
    const urls = fetchSpy.mock.calls.map((args: unknown[]) => String(args[0]));
    expect(
      urls.some((url: string) => url.endsWith(`/v1/cases/${record.id}`)),
    ).toBe(true);
    expect(urls.filter((url: string) => url.includes("/certificate"))).toEqual([
      expect.stringContaining(`/v1/verifications/${record.verification.id}/`),
    ]);
  });

  it("an id that isn't a panel id → 404 with no API call", async () => {
    expect(await thrown(proofResponse("../x"))).toBe("NEXT_NOT_FOUND");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("off the panel host → 404 before anything else", async () => {
    state.headers = new Headers({ host: "kybr.test" });
    expect(await thrown(proofResponse(caseOf("link").id))).toBe(
      "NEXT_NOT_FOUND",
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("no session → the requireSession() redirect", async () => {
    state.token = undefined;
    expect(await thrown(proofResponse(caseOf("link").id))).toMatch(
      /^NEXT_REDIRECT /,
    );
  });

  it("a foreign case → 404; no certificate is requested", async () => {
    expect(await thrown(proofResponse(FOREIGN_CASE_ID))).toBe("NEXT_NOT_FOUND");
    expect(
      fetchSpy.mock.calls.some((args: unknown[]) =>
        String(args[0]).includes("/certificate"),
      ),
    ).toBe(false);
  });

  it("a DADOS_NAO_ENCONTRADOS case (no certificate) → 404", async () => {
    expect(await thrown(proofResponse(caseOf("nodata").id))).toBe(
      "NEXT_NOT_FOUND",
    );
  });

  it.each([
    ["an HTML body", "html"],
    ["5 MB + 1 byte", "grande"],
    ["a backend failure", "500"],
  ] as const)(
    "%s → 502 with no body and no file headers",
    async (_name, kind) => {
      setCaseFault(email, "certificate", { kind });
      const response = await proofResponse(caseOf("link").id);
      expect(response.status).toBe(502);
      expect(await response.text()).toBe("");
      expect(response.headers.get("content-disposition")).toBeNull();
      expect(response.headers.get("content-type")).toBeNull();
    },
  );

  it("a PDF type with a body that isn't a PDF → 502", async () => {
    server.use(
      http.get("*/v1/verifications/:id/certificate", () =>
        HttpResponse.arrayBuffer(new TextEncoder().encode("<html>").buffer, {
          headers: { "Content-Type": "application/pdf" },
        }),
      ),
    );
    expect((await proofResponse(caseOf("link").id)).status).toBe(502);
  });

  it("the case read failing → 502", async () => {
    setCaseFault(email, "case", { kind: "500", times: 1 });
    expect((await proofResponse(caseOf("link").id)).status).toBe(502);
  });

  it("M6C-03: the cap is 4 MiB, the documents' (under Vercel's 4.5 MB response limit)", () => {
    expect(CERTIFICATE_MAX_BYTES).toBe(4 * 1024 * 1024);
    expect(CERTIFICATE_MAX_BYTES).toBe(DOCUMENT_MAX_BYTES);
  });

  it.each([
    [4 * 1024 * 1024, 200],
    [4 * 1024 * 1024 + 1, 502],
  ])("a %d-byte certificate → %d", async (bytes, status) => {
    const pdf = new Uint8Array(bytes);
    pdf.set(PDF_BYTES);
    pdf.set(PDF_BYTES.subarray(PDF_BYTES.length - 6), bytes - 6);
    server.use(
      http.get("*/v1/verifications/:id/certificate", () =>
        HttpResponse.arrayBuffer(pdf.buffer, {
          headers: { "Content-Type": "application/pdf" },
        }),
      ),
    );
    expect((await proofResponse(caseOf("link").id)).status).toBe(status);
  });
});

describe("the route module", () => {
  it("exports GET only (anything else is a 405)", async () => {
    const route =
      await import("@/app/(panel)/painel/(app)/fila/[caseId]/comprovante/route");
    expect(Object.keys(route)).toEqual(["GET"]);
  });
});
