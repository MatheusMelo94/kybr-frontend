// @vitest-environment node
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppError } from "@/lib/api/errors";
import { CSV_MAX_BYTES } from "@/lib/api/panel/csv-limits";
import {
  PS10_N,
  SELLER_NAMES,
  sellerCnpj,
} from "@/tests/fixtures/factories/panel-sellers";
import {
  openSession,
  panelStore,
  seedSellers,
  sellersOf,
  setSellerFault,
} from "@/tests/fixtures/msw/panel-store";
import { server } from "@/tests/fixtures/msw/server";

const state = vi.hoisted(() => ({ token: undefined as string | undefined }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ host: "app.kybr.test" }),
}));
vi.mock("next/navigation", () => ({ notFound: vi.fn(), redirect: vi.fn() }));
vi.mock("@/lib/api/panel/cookies", () => ({
  readSessionToken: async () => state.token,
}));
const reportMarker = vi.hoisted(() => vi.fn());
vi.mock("@/lib/monitoring", () => ({ reportMarker }));

import {
  getSeller,
  listSellers,
  reverifySeller,
  streamAuditCsv,
  streamSellersCsv,
} from "@/lib/api/panel/sellers";

// T139: the M8b sellers data functions (D-S1–D-S5), Pre-Contract.

const WIRE_CNPJ = /\b[0-9A-Z]{12}[0-9]{2}\b/;
const CPF_DIGITS = /123\.456\.789-09|12345678909/;
const KEY = "5c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f";

let email: string;

beforeEach(() => {
  email = `sellers-${crypto.randomUUID().slice(0, 8)}@exemplo.test`;
  seedSellers(email, "ps1");
  state.token = openSession(email).id;
  panelStore().calls.length = 0;
  reportMarker.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

const sellerCalls = () =>
  panelStore().calls.filter((call) =>
    /^\/v1\/(sellers|reports)/.test(call.path),
  );
const needle = (n: number) => {
  const seller = sellersOf(email).find((item) => item.n === n);
  if (!seller) throw new Error(`no seller ${n}`);
  return seller;
};

describe("no session (ADR-0011 Addendum 2)", () => {
  it("every function refuses with SESSAO_EXPIRADA and 0 API calls", async () => {
    state.token = undefined;
    await expect(listSellers({ pagina: 1 })).rejects.toMatchObject({
      code: "SESSAO_EXPIRADA",
    });
    await expect(getSeller(needle(1).id)).rejects.toMatchObject({
      code: "SESSAO_EXPIRADA",
    });
    await expect(reverifySeller(needle(1).id, KEY)).rejects.toMatchObject({
      code: "SESSAO_EXPIRADA",
    });
    expect(await streamSellersCsv({})).toMatchObject({
      ok: false,
      error: { code: "SESSAO_EXPIRADA" },
    });
    expect(
      await streamAuditCsv({ de: "2026-07-10", ate: "2026-10-10" }),
    ).toMatchObject({ ok: false, error: { code: "SESSAO_EXPIRADA" } });
    expect(sellerCalls()).toEqual([]);
  });
});

describe("listSellers (D-S1)", () => {
  it("a page of 50, with the query sent as given", async () => {
    const page = await listSellers({
      pagina: 2,
      status: "mudou",
      q: "exemplo",
    });
    expect(page.pagina).toBe(2);
    expect(page.itens.every((row) => row.status === "mudou")).toBe(true);
    expect(sellerCalls().at(-1)?.path).toBe(
      "/v1/sellers?limite=50&pagina=2&status=mudou&q=exemplo",
    );
  });

  it("O-F4: CNPJs masked and the CPF in MEI names masked in the data layer", async () => {
    const page = await listSellers({ pagina: 1 });
    const text = JSON.stringify(page);
    expect(text).not.toMatch(WIRE_CNPJ);
    expect(text).not.toMatch(CPF_DIGITS);
    const cnpj = sellerCnpj(1);
    expect(page.itens.map((row) => row.cnpj)).toContain(
      `${cnpj.slice(0, 2)}.${cnpj.slice(2, 5)}.${cnpj.slice(5, 8)}/${cnpj.slice(8, 12)}-${cnpj.slice(12)}`,
    );
    expect(page.itens.map((row) => row.razao_social)).toContain(
      SELLER_NAMES.hostile,
    );
  });

  it("a 5xx or a body failing the schema → UNAVAILABLE (a marker with paths only)", async () => {
    setSellerFault(email, "sellers", { kind: "503", times: 1 });
    await expect(listSellers({ pagina: 1 })).rejects.toMatchObject({
      code: "UNAVAILABLE",
    });
    server.use(
      http.get("*/v1/sellers", () =>
        HttpResponse.json({ itens: [{ id: "x" }], total: 1 }),
      ),
    );
    await expect(listSellers({ pagina: 1 })).rejects.toBeInstanceOf(AppError);
    expect(reportMarker).toHaveBeenCalledWith(
      "SELLER_SCHEMA_INVALID",
      expect.objectContaining({ operation: "sellers" }),
    );
  });

  it("O-F6: a CNPJ-like q is never logged or reported, on success or failure", async () => {
    const q = "98.765.432/0001-10";
    const spies = (["error", "warn", "info", "log", "debug"] as const).map(
      (level) => vi.spyOn(console, level).mockImplementation(() => {}),
    );
    await listSellers({ pagina: 1, q });
    setSellerFault(email, "sellers", { kind: "500", times: 1 });
    await expect(listSellers({ pagina: 1, q })).rejects.toBeInstanceOf(
      AppError,
    );
    server.use(
      http.get("*/v1/sellers", () => HttpResponse.json({ itens: "x" })),
    );
    await expect(listSellers({ pagina: 1, q })).rejects.toBeInstanceOf(
      AppError,
    );
    const logged = JSON.stringify([
      ...spies.flatMap((spy) => spy.mock.calls),
      reportMarker.mock.calls,
    ]);
    expect(logged).not.toContain("98.765.432");
    expect(logged).not.toContain("98765432");
  });
});

describe("getSeller (D-S2)", () => {
  it("the detail, masked, with the open case (PS10)", async () => {
    const target = needle(PS10_N);
    const seller = await getSeller(target.id);
    expect(seller.case_aberto_id).toBe(target.case_aberto_id);
    expect(seller.verificacao_atual?.id).toBe(target.verification.id);
    expect(JSON.stringify(seller)).not.toMatch(WIRE_CNPJ);
  });

  it("a foreign or unknown id → SELLER_NAO_ENCONTRADO (PS8)", async () => {
    const other = `outro-${crypto.randomUUID().slice(0, 8)}@exemplo.test`;
    seedSellers(other, "ps1");
    const foreign = sellersOf(other)[0];
    if (!foreign) throw new Error("no foreign seller");
    await expect(getSeller(foreign.id)).rejects.toMatchObject({
      code: "SELLER_NAO_ENCONTRADO",
    });
  });
});

describe("reverifySeller (D-S3)", () => {
  it("202 → resolves, with the key sent", async () => {
    await reverifySeller(needle(11).id, KEY);
    expect(sellerCalls().at(-1)).toMatchObject({
      method: "POST",
      idempotencyKey: KEY,
    });
  });

  it.each([
    ["402 SEM_SALDO", "SEM_SALDO"],
    ["409 REVERIFICACAO_EM_ANDAMENTO", "REVERIFICACAO_EM_ANDAMENTO"],
  ])("%s is definitive", async (_name, code) => {
    const target = needle(12);
    if (code === "SEM_SALDO") {
      const account = panelStore().accounts.get(email);
      const plano = account?.workspace.plano;
      if (!account || !plano) throw new Error("no plan");
      account.workspace.plano = { ...plano, usadas: plano.limite };
    } else {
      await reverifySeller(target.id, crypto.randomUUID());
    }
    await expect(reverifySeller(target.id, KEY)).rejects.toMatchObject({
      code,
    });
  });

  it("O-F7: a drop or a 5xx is an unknown outcome (NETWORK / UNAVAILABLE)", async () => {
    setSellerFault(email, "reverify", { kind: "drop", times: 1 });
    await expect(reverifySeller(needle(13).id, KEY)).rejects.toMatchObject({
      code: "NETWORK",
    });
    setSellerFault(email, "reverify", { kind: "503", times: 1 });
    await expect(reverifySeller(needle(13).id, KEY)).rejects.toMatchObject({
      code: "UNAVAILABLE",
    });
  });
});

describe("the CSV streams (D-S4, D-S5; O-F5)", () => {
  const text = async (body: ReadableStream<Uint8Array>) =>
    new TextDecoder("utf-8", { ignoreBOM: true }).decode(
      await new Response(body).arrayBuffer(),
    );

  it("streamSellersCsv: text/csv with the filter in the query", async () => {
    const result = await streamSellersCsv({ status: "mudou", q: "exemplo" });
    if (!result.ok) throw result.error;
    expect(await text(result.data.body)).toMatch(/^﻿"CNPJ";/);
    expect(sellerCalls().at(-1)?.path).toBe(
      "/v1/sellers/export?status=mudou&q=exemplo",
    );
  });

  it("streamAuditCsv: de/ate reach the API as given", async () => {
    const result = await streamAuditCsv({
      de: "2026-07-10",
      ate: "2026-10-10",
    });
    if (!result.ok) throw result.error;
    expect(await text(result.data.body)).toMatch(/^﻿"Data e hora";/);
    expect(sellerCalls().at(-1)?.path).toBe(
      "/v1/reports/audit.csv?de=2026-07-10&ate=2026-10-10",
    );
  });

  it.each([
    ["sellers-csv", () => streamSellersCsv({})],
    [
      "audit-csv",
      () => streamAuditCsv({ de: "2026-10-01", ate: "2026-10-10" }),
    ],
  ] as const)(
    "%s: exactly 4 MiB passes, 4 MiB + 1 errors with UNAVAILABLE, HTML is INVALID_RESPONSE",
    async (endpoint, stream) => {
      setSellerFault(email, endpoint, { kind: "csv-exato", times: 1 });
      const exact = await stream();
      if (!exact.ok) throw exact.error;
      expect(
        (await new Response(exact.data.body).arrayBuffer()).byteLength,
      ).toBe(CSV_MAX_BYTES);

      setSellerFault(email, endpoint, { kind: "csv-grande", times: 1 });
      const over = await stream();
      if (!over.ok) throw over.error;
      await expect(new Response(over.data.body).text()).rejects.toMatchObject({
        code: "UNAVAILABLE",
      });

      setSellerFault(email, endpoint, { kind: "csv-html", times: 1 });
      expect(await stream()).toMatchObject({
        ok: false,
        error: { code: "INVALID_RESPONSE" },
      });
    },
  );

  it("a declared length over the cap → UNAVAILABLE before streaming", async () => {
    server.use(
      http.get(
        "*/v1/sellers/export",
        () =>
          new HttpResponse("x", {
            headers: {
              "content-type": "text/csv; charset=utf-8",
              "content-length": String(CSV_MAX_BYTES + 1),
            },
          }),
      ),
    );
    expect(await streamSellersCsv({})).toMatchObject({
      ok: false,
      error: { code: "UNAVAILABLE" },
    });
  });

  it("a backend 422 on the audit range → VALOR_INVALIDO", async () => {
    expect(
      await streamAuditCsv({ de: "2026-10-10", ate: "2026-10-01" }),
    ).toMatchObject({ ok: false, error: { code: "VALOR_INVALIDO" } });
  });
});
