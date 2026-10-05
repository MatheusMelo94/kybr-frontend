// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ host: "app.kybr.test" }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ host: state.host }),
}));
vi.mock("@/lib/monitoring", () => ({ reportMarker: vi.fn() }));

import * as route from "@/app/(panel)/painel/(app)/lote/modelo.csv/route";

beforeEach(() => {
  state.host = "app.kybr.test";
});

describe("GET /lote/modelo.csv (D-B8, ADR-0011 rule 4)", () => {
  it("answers the constant template as an attachment, nosniff", async () => {
    const response = await route.GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "text/csv; charset=utf-8",
    );
    expect(response.headers.get("content-disposition")).toBe(
      'attachment; filename="kybr-modelo-lote.csv"',
    );
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(new TextDecoder().decode(bytes.slice(3))).toBe(
      "CNPJ;Responsável;ID na plataforma\r\n",
    );
  });

  it("exports GET only", () => {
    expect(Object.keys(route).filter((name) => /^[A-Z]+$/.test(name))).toEqual([
      "GET",
    ]);
  });

  it("404s off the panel host (assertPanelHost)", async () => {
    state.host = "kybr.test";
    await expect(route.GET()).rejects.toThrow(
      /NEXT_HTTP_ERROR_FALLBACK;404|NEXT_NOT_FOUND/,
    );
  });
});
