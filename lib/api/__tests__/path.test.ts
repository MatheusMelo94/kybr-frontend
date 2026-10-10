// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  apiPaths,
  isValidPanelId,
  isValidSlug,
  isValidToken,
  panelIdSegment,
} from "@/lib/api/path";

describe("apiPaths", () => {
  it("builds D1, D2 and D3 paths from valid segments", () => {
    expect(apiPaths.publicLink("loja-exemplo")).toBe("/public/v/loja-exemplo");
    expect(apiPaths.verify("loja-exemplo")).toBe(
      "/public/v/loja-exemplo/verify",
    );
    expect(apiPaths.lookup("loja-exemplo", "12ABC34501DE35")).toBe(
      "/public/v/loja-exemplo/lookup?cnpj=12ABC34501DE35",
    );
  });

  it.each([
    "../x",
    "..",
    "%2e%2e",
    "a%2Fb",
    "a/b",
    "a?b",
    "a#b",
    "@host",
    "loja@evil.test",
    "",
    "Loja-Exemplo",
    "-loja",
    "loja-",
    "a".repeat(65),
  ])("throws for the slug %j before anything is built", (slug) => {
    expect(() => apiPaths.publicLink(slug)).toThrow("Refused API path segment");
    expect(() => apiPaths.verify(slug)).toThrow("Refused API path segment");
    expect(() => apiPaths.lookup(slug, "11222333000181")).toThrow(
      "Refused API path segment",
    );
  });

  it.each([
    "12abc34501de35",
    "12.ABC.345/01DE-35",
    "12ABC34501DE3",
    "12ABC34501DE3A",
    "11222333000181&x=1",
    "11222333000181#x",
    "",
  ])("throws for the non-canonical CNPJ %j (X5 wire format only)", (cnpj) => {
    expect(() => apiPaths.lookup("loja-exemplo", cnpj)).toThrow(
      "Refused API path segment",
    );
  });

  it("builds the D4 path from a valid slug and token", () => {
    expect(
      apiPaths.publicCase("loja-exemplo", "tokaprovado0000000000000"),
    ).toBe("/public/v/loja-exemplo/cases/tokaprovado0000000000000");
  });

  it.each([
    "short",
    "tok/../../00000000000000",
    "tok%2e%2e0000000000000000",
    "tokaprovado00000000000?x=1",
    "tokaprovado00000000000#x",
    "",
  ])("throws for the token %j before the D4 path is built", (token) => {
    expect(() => apiPaths.publicCase("loja-exemplo", token)).toThrow(
      "Refused API path segment",
    );
  });

  it("throws for a malformed slug before the D4 path is built", () => {
    expect(() =>
      apiPaths.publicCase("../x", "tokaprovado0000000000000"),
    ).toThrow("Refused API path segment");
  });
});

describe("X3 identifier checks", () => {
  it.each(["loja-exemplo", "a", "loja1", "a".repeat(64)])(
    "accepts the slug %j",
    (slug) => {
      expect(isValidSlug(slug)).toBe(true);
    },
  );

  it.each(["tokaprovado0000000000000", "AbC_dEf-0123456789abcdefgh"])(
    "accepts the token %j",
    (token) => {
      expect(isValidToken(token)).toBe(true);
    },
  );

  it.each([
    "short",
    "tok/../../00000000000000",
    "tok%2e%2e0000000000000000",
    "a".repeat(65),
  ])("rejects the token %j", (token) => {
    expect(isValidToken(token)).toBe(false);
  });
});

describe("apiPaths.panel (A-X1, A-X3)", () => {
  it("builds the M4 paths under /v1/", () => {
    expect(apiPaths.panel.me()).toBe("/v1/me");
    expect(apiPaths.panel.categories()).toBe("/v1/categories");
    expect(apiPaths.panel.workspace()).toBe("/v1/workspace");
    expect(apiPaths.panel.signup()).toBe("/v1/auth/signup");
    expect(apiPaths.panel.confirm()).toBe("/v1/auth/confirm");
    expect(apiPaths.panel.confirmResend()).toBe("/v1/auth/confirm/resend");
    expect(apiPaths.panel.login()).toBe("/v1/auth/login");
    expect(apiPaths.panel.logout()).toBe("/v1/auth/logout");
    expect(apiPaths.panel.passwordReset()).toBe("/v1/auth/password-reset");
    expect(apiPaths.panel.passwordResetConfirm()).toBe(
      "/v1/auth/password-reset/confirm",
    );
  });

  it.each(["3f2b8c1e-4d5a-4b6c-8d7e-9f0a1b2c3d4e", "AbcDef_0123456789-xyz"])(
    "accepts the panel id %s (UUID or opaque, A-X3)",
    (id) => {
      expect(isValidPanelId(id)).toBe(true);
      expect(panelIdSegment(id)).toBe(id);
    },
  );

  it.each([
    "",
    "123",
    "../me",
    "a/b-0123456789abcdef",
    "abc%2F0123456789abcdef",
    "x".repeat(65),
    "3f2b8c1e-4d5a-4b6c-8d7e-9f0a1b2c3d4e?x=1",
  ])("refuses the panel id %j before any request", (id) => {
    expect(isValidPanelId(id)).toBe(false);
    expect(() => panelIdSegment(id)).toThrow(/Refused/);
  });
});

describe("apiPaths.panel.batches (D-B1–D-B7)", () => {
  const ID = "3f2a1b4c-5d6e-4f70-8a9b-0c1d2e3f4a5b";

  it("builds every batch path under /v1/", () => {
    const b = apiPaths.panel.batches;
    expect(b.start()).toBe("/v1/batches");
    expect(b.history()).toBe("/v1/batches?limit=10");
    expect(b.get(ID)).toBe(`/v1/batches/${ID}`);
    expect(b.toQueue(ID)).toBe(`/v1/batches/${ID}/to-queue`);
    expect(b.monitor(ID)).toBe(`/v1/batches/${ID}/monitor`);
    expect(b.resume(ID)).toBe(`/v1/batches/${ID}/resume`);
    expect(b.csv(ID, "result")).toBe(`/v1/batches/${ID}/result.csv`);
    expect(b.csv(ID, "errors")).toBe(`/v1/batches/${ID}/errors.csv`);
  });

  it("rows: limit 25, then status and cursor when given", () => {
    const b = apiPaths.panel.batches;
    expect(b.rows(ID)).toBe(`/v1/batches/${ID}/rows?limit=25`);
    expect(b.rows(ID, { status: "warn", cursor: "eyJvIjoyNX0" })).toBe(
      `/v1/batches/${ID}/rows?limit=25&status=warn&cursor=eyJvIjoyNX0`,
    );
  });

  it.each([
    "../x",
    "short",
    // A-X3 allows 16–21 characters for other panel ids; batches need 22 (C10).
    "lote_ABCDEFGHIJKLMNOP",
    "a b c d e f g h i j",
    "%2e%2e%2fxxxxxxxxxxx",
    "",
  ])("throws before a request for batch id %j", (id) => {
    const b = apiPaths.panel.batches;
    expect(() => b.get(id)).toThrow(/Refused API path segment/);
    expect(() => b.rows(id)).toThrow(/Refused API path segment/);
    expect(() => b.csv(id, "result")).toThrow(/Refused API path segment/);
    expect(() => b.toQueue(id)).toThrow(/Refused API path segment/);
  });

  it("throws for a status or cursor outside their patterns", () => {
    const b = apiPaths.panel.batches;
    expect(() => b.rows(ID, { status: "todos" as never })).toThrow();
    expect(() => b.rows(ID, { cursor: "x&status=ok" })).toThrow();
  });
});

describe("apiPaths.panel.cases (D-C1–D-C5, C-M6-1/2, C-M6-10)", () => {
  const ID = "3f2a1b4c-5d6e-4f70-8a9b-0c1d2e3f4a5b";
  const DOC = "c3d4e5f6-a7b8-4c9d-8e0f-2a3b4c5d6e7f";
  const c = apiPaths.panel.cases;

  it("builds every case path under /v1/", () => {
    expect(c.get(ID)).toBe(`/v1/cases/${ID}`);
    expect(c.decide(ID)).toBe(`/v1/cases/${ID}/decide`);
    expect(c.requestDocuments(ID)).toBe(`/v1/cases/${ID}/request-documents`);
    expect(c.documentUrl(ID, DOC)).toBe(
      `/v1/cases/${ID}/documentos/${DOC}/url`,
    );
    expect(c.certificate(ID)).toBe(`/v1/verifications/${ID}/certificate`);
  });

  it("list: estado and limit, then the cursor when given", () => {
    expect(c.list({ estado: "aberto", limit: 50 })).toBe(
      "/v1/cases?estado=aberto&limit=50",
    );
    expect(
      c.list({ estado: "aguardando_doc", limit: 25, cursor: "eyJvIjoyNX0" }),
    ).toBe("/v1/cases?estado=aguardando_doc&limit=25&cursor=eyJvIjoyNX0");
  });

  it("newCount: estado=aberto with desde, encoded", () => {
    expect(c.newCount("2026-10-06T10:00:00.123-03:00")).toBe(
      "/v1/cases?estado=aberto&desde=2026-10-06T10%3A00%3A00.123-03%3A00",
    );
  });

  it.each(["../x", "short", "a b c d e f g h i j", "%2e%2e%2fxxxxxxxxxxx", ""])(
    "throws before a request for case or document id %j",
    (id) => {
      expect(() => c.get(id)).toThrow(/Refused API path segment/);
      expect(() => c.decide(id)).toThrow(/Refused API path segment/);
      expect(() => c.requestDocuments(id)).toThrow(/Refused API path segment/);
      expect(() => c.documentUrl(ID, id)).toThrow(/Refused API path segment/);
      expect(() => c.documentUrl(id, DOC)).toThrow(/Refused API path segment/);
      expect(() => c.certificate(id)).toThrow(/Refused API path segment/);
    },
  );

  it.each([
    ["an unknown estado", { estado: "decidido" as never, limit: 25 }],
    ["limit 0", { estado: "aberto" as const, limit: 0 }],
    ["limit 201", { estado: "aberto" as const, limit: 201 }],
    ["a fractional limit", { estado: "aberto" as const, limit: 25.5 }],
    ["a cursor with a query", { estado: "aberto" as const, limit: 25, cursor: "x&estado=decidido" }],
  ])("list throws for %s", (_, query) => {
    expect(() => c.list(query)).toThrow(/Refused API query/);
  });

  it.each(["ontem", "2026-10-06", "2026-10-06T10:00:00", "2026-13-40T99:00:00Z", ""])(
    "newCount throws for desde %j",
    (desde) => {
      expect(() => c.newCount(desde)).toThrow(/Refused API query/);
    },
  );
});
