// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  openSession,
  panelStore,
  seedDashboard,
  setHomeFault,
} from "@/tests/fixtures/msw/panel-store";

const state = vi.hoisted(() => ({
  headers: new Headers(),
  token: undefined as string | undefined,
}));
const revalidatePath = vi.hoisted(() => vi.fn());
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
vi.mock("@/lib/monitoring", () => ({ reportMarker: vi.fn() }));

import { hideFirstStepsAction } from "@/features/panel-home/actions";
import { panelPath } from "@/lib/panel-paths";

// T130: hideFirstStepsAction (D-H2), owned by / (ADR-0011 Addendum 2).

let email: string;

beforeEach(() => {
  email = `passos-${crypto.randomUUID().slice(0, 8)}@exemplo.test`;
  seedDashboard(email, "novo");
  state.headers = new Headers({ host: "app.kybr.test" });
  state.token = openSession(email).id;
  panelStore().calls.length = 0;
  vi.clearAllMocks();
});

const dashboardCalls = () =>
  panelStore().calls.filter((call) => call.path.startsWith("/v1/dashboard"));

describe("hideFirstStepsAction (D-H2)", () => {
  it("answers 404 off the panel host before any API call", async () => {
    state.headers = new Headers({ host: "kybr.test" });
    await expect(hideFirstStepsAction({ oculto: true })).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    expect(panelStore().calls).toEqual([]);
  });

  it("hides the card and refreshes /", async () => {
    expect(await hideFirstStepsAction({ oculto: true })).toEqual({ ok: true });
    expect(panelStore().dashboards.get(email)?.primeiros_passos.oculto).toBe(
      true,
    );
    expect(revalidatePath).toHaveBeenCalledWith(panelPath("/"));
  });

  it.each([[undefined], [{}], [{ oculto: false }], [{ oculto: true, x: 1 }]])(
    "refuses the input %j with no API call",
    async (input) => {
      expect(await hideFirstStepsAction(input)).toEqual({
        ok: false,
        code: "VALOR_INVALIDO",
      });
      expect(panelStore().calls).toEqual([]);
    },
  );

  it("no session: SESSAO_EXPIRADA as a result, 0 API calls", async () => {
    state.token = undefined;
    expect(await hideFirstStepsAction({ oculto: true })).toEqual({
      ok: false,
      code: "SESSAO_EXPIRADA",
    });
    expect(panelStore().calls).toEqual([]);
  });

  it("a 503 is UNAVAILABLE, a drop is NETWORK (unknown outcome: re-read)", async () => {
    setHomeFault(email, "first-steps", { kind: "503", times: 1 });
    expect(await hideFirstStepsAction({ oculto: true })).toEqual({
      ok: false,
      code: "UNAVAILABLE",
    });
    setHomeFault(email, "first-steps", { kind: "drop", times: 1 });
    expect(await hideFirstStepsAction({ oculto: true })).toEqual({
      ok: false,
      code: "NETWORK",
    });
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(dashboardCalls()).toHaveLength(2);
  });
});
