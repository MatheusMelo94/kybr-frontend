// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PANEL_EMAILS } from "@/tests/fixtures/factories/panel";
import {
  openSession,
  panelStore,
  seedSellers,
  sellersOf,
} from "@/tests/fixtures/msw/panel-store";

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

import { sellerProofResponse } from "@/features/panel-sellers/proof-route";

// T143 (AC 58, F12, AC 73): the seller's proof reuses M6's proof body via
// the seller read: its current verification's certificate.

const EMAIL = PANEL_EMAILS.pago;
const OTHER = PANEL_EMAILS.renata;

beforeEach(() => {
  state.headers = new Headers({ host: "app.kybr.test" });
  seedSellers(EMAIL, "ps1");
  seedSellers(OTHER, "ps1");
  state.token = openSession(EMAIL).id;
  vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-10-06T02:30:00Z") });
});

afterEach(() => {
  vi.useRealTimers();
});

const first = (email: string) => {
  const seller = sellersOf(email)[0];
  if (!seller) throw new Error("no seller");
  return seller;
};

describe("sellerProofResponse", () => {
  it("200: %PDF- with the F12 headers, named by the São Paulo date", async () => {
    const response = await sellerProofResponse(first(EMAIL).id);
    expect(response.status).toBe(200);
    expect(Object.fromEntries(response.headers)).toMatchObject({
      "content-type": "application/pdf",
      "content-disposition":
        'attachment; filename="kybr-comprovante-2026-10-05.pdf"',
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
      "content-security-policy": "sandbox; default-src 'none'",
    });
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
  });

  it("a malformed id → not found with no API call", async () => {
    const before = panelStore().calls.length;
    await expect(sellerProofResponse("../x")).rejects.toThrow("NEXT_NOT_FOUND");
    expect(panelStore().calls.length).toBe(before);
  });

  it("a foreign or unknown seller → not found (AC 73)", async () => {
    await expect(sellerProofResponse(first(OTHER).id)).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    await expect(
      sellerProofResponse("0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d"),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("no session → the redirect to /entrar", async () => {
    state.token = undefined;
    await expect(sellerProofResponse(first(EMAIL).id)).rejects.toThrow(
      /NEXT_REDIRECT \/entrar/,
    );
  });
});
