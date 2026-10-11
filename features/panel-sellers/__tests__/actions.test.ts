// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  openSession,
  panelStore,
  seedSellers,
  sellersOf,
  setSellerFault,
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

import { reverifyAction } from "@/features/panel-sellers/actions";
import { panelPath } from "@/lib/panel-paths";

// T139: reverifyAction (D-S3, C-M8-4), owned by /vendedores and
// /vendedores/[sellerId] (ADR-0011 Addendum 2; plan-m8 D6, O-F7).

const KEY = "5c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f";
let email: string;
let sellerId: string;

beforeEach(() => {
  email = `reverificar-${crypto.randomUUID().slice(0, 8)}@exemplo.test`;
  seedSellers(email, "ps1");
  sellerId = sellersOf(email).find((seller) => seller.n === 11)?.id ?? "";
  state.headers = new Headers({ host: "app.kybr.test" });
  state.token = openSession(email).id;
  panelStore().calls.length = 0;
  vi.clearAllMocks();
});

const reverifyCalls = () =>
  panelStore().calls.filter((call) => call.path.endsWith("/reverify"));

describe("reverifyAction (D-S3)", () => {
  it("answers 404 off the panel host before any API call", async () => {
    state.headers = new Headers({ host: "kybr.test" });
    await expect(
      reverifyAction({ sellerId, idempotencyKey: KEY }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(panelStore().calls).toEqual([]);
  });

  it("202 → ok, with the client's key, and the panel layout revalidated", async () => {
    expect(await reverifyAction({ sellerId, idempotencyKey: KEY })).toEqual({
      ok: true,
    });
    expect(reverifyCalls()).toMatchObject([{ idempotencyKey: KEY }]);
    expect(revalidatePath).toHaveBeenCalledWith(panelPath("/"), "layout");
  });

  it.each([
    [undefined],
    [{}],
    [{ sellerId: "curto", idempotencyKey: KEY }],
    [{ sellerId: "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d", idempotencyKey: "x" }],
    [
      {
        sellerId: "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
        idempotencyKey: KEY,
        extra: 1,
      },
    ],
  ])("refuses the input %j with no API call", async (input) => {
    expect(await reverifyAction(input)).toEqual({
      ok: false,
      code: "VALOR_INVALIDO",
    });
    expect(panelStore().calls).toEqual([]);
  });

  it("no session: SESSAO_EXPIRADA as a result, 0 API calls", async () => {
    state.token = undefined;
    expect(await reverifyAction({ sellerId, idempotencyKey: KEY })).toEqual({
      ok: false,
      code: "SESSAO_EXPIRADA",
    });
    expect(reverifyCalls()).toEqual([]);
  });

  it("402 → SEM_SALDO and 409 → REVERIFICACAO_EM_ANDAMENTO (definitive)", async () => {
    await reverifyAction({ sellerId, idempotencyKey: KEY });
    expect(
      await reverifyAction({ sellerId, idempotencyKey: crypto.randomUUID() }),
    ).toEqual({ ok: false, code: "REVERIFICACAO_EM_ANDAMENTO" });
    const account = panelStore().accounts.get(email);
    const plano = account?.workspace.plano;
    if (!account || !plano) throw new Error("no plan");
    account.workspace.plano = { ...plano, usadas: plano.limite };
    const other = sellersOf(email).find((seller) => seller.n === 12)?.id;
    expect(
      await reverifyAction({
        sellerId: other,
        idempotencyKey: KEY.replace("5c", "6c"),
      }),
    ).toEqual({ ok: false, code: "SEM_SALDO" });
  });

  it("O-F7: a drop → NETWORK, a 5xx → UNAVAILABLE (unknown: the client keeps the key)", async () => {
    setSellerFault(email, "reverify", { kind: "drop", times: 1 });
    expect(await reverifyAction({ sellerId, idempotencyKey: KEY })).toEqual({
      ok: false,
      code: "NETWORK",
    });
    setSellerFault(email, "reverify", { kind: "503", times: 1 });
    expect(await reverifyAction({ sellerId, idempotencyKey: KEY })).toEqual({
      ok: false,
      code: "UNAVAILABLE",
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("a foreign seller → SELLER_NAO_ENCONTRADO", async () => {
    const other = `outro-${crypto.randomUUID().slice(0, 8)}@exemplo.test`;
    seedSellers(other, "ps1");
    const foreign = sellersOf(other)[0]?.id;
    expect(
      await reverifyAction({ sellerId: foreign, idempotencyKey: KEY }),
    ).toEqual({ ok: false, code: "SELLER_NAO_ENCONTRADO" });
  });
});
