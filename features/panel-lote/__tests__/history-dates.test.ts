// @vitest-environment node
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PANEL_EMAILS } from "@/tests/fixtures/factories/panel";
import { openSession } from "@/tests/fixtures/msw/panel-store";
import { server } from "@/tests/fixtures/msw/server";

const state = vi.hoisted(() => ({ token: undefined as string | undefined }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ host: "app.kybr.test" }),
}));
vi.mock("@/lib/api/panel/cookies", () => ({
  readSessionToken: async () => state.token,
}));
vi.mock("@/lib/monitoring", () => ({ reportMarker: vi.fn() }));

import { historyOrError } from "@/features/panel-lote/data";

// P5-003: one malformed timestamp in the history (D-B6) degrades the history
// section (lote.history.error), never the page (error.tsx).

beforeEach(() => {
  state.token = openSession(PANEL_EMAILS.pago).id;
});

describe("historyOrError with a malformed date (P5-003)", () => {
  it("a history row whose iniciado_em isn't an ISO date-time → undefined (the section's error), not a throw", async () => {
    server.use(
      http.get("*/v1/batches", () =>
        HttpResponse.json([
          {
            id: "3f2a1b4c-5d6e-4f70-8a9b-0c1d2e3f4a5b",
            total: 184,
            estado: "concluido",
            iniciado_em: "ontem à tarde",
          },
        ]),
      ),
    );
    await expect(historyOrError()).resolves.toBeUndefined();
  });
});
