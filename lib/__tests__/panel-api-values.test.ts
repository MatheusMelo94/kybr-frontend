import { describe, expect, it } from "vitest";

import {
  isDocumentoTipo,
  isMotivoCodigo,
  parseLinkVendedor,
} from "@/lib/panel-api-values";

const HOST = "kybr.test";
const TOKEN = "AbCdEfGhIjKlMnOpQrStUv"; // 22 characters

describe("parseLinkVendedor (F8: the copyable seller link)", () => {
  it("accepts https://{LINK_HOST}/v/{slug}/c/{token}", () => {
    const link = `https://${HOST}/v/loja-exemplo/c/${TOKEN}`;
    expect(parseLinkVendedor(link, HOST)).toBe(link);
  });

  it("accepts a LINK_HOST with a port (local E2E)", () => {
    const link = `https://localhost:3000/v/demo/c/${TOKEN}`;
    expect(parseLinkVendedor(link, "localhost:3000")).toBe(link);
  });

  it.each([
    ["not a URL", "não é link"],
    ["javascript:", `javascript:alert(1)//${HOST}/v/demo/c/${TOKEN}`],
    ["http:", `http://${HOST}/v/demo/c/${TOKEN}`],
    ["another host", `https://exemplo.test/v/demo/c/${TOKEN}`],
    ["a subdomain of the host", `https://x.${HOST}/v/demo/c/${TOKEN}`],
    ["another port", `https://${HOST}:8443/v/demo/c/${TOKEN}`],
    ["a path with ..", `https://${HOST}/v/demo/../c/${TOKEN}`],
    ["an encoded ..", `https://${HOST}/v/demo/c/%2e%2e/${TOKEN}`],
    ["a query", `https://${HOST}/v/demo/c/${TOKEN}?x=1`],
    ["a bare ?", `https://${HOST}/v/demo/c/${TOKEN}?`],
    ["a fragment", `https://${HOST}/v/demo/c/${TOKEN}#x`],
    ["userinfo", `https://user@${HOST}/v/demo/c/${TOKEN}`],
    ["a short token", `https://${HOST}/v/demo/c/curto`],
    ["a token with a dot", `https://${HOST}/v/demo/c/${TOKEN}.x`],
    ["outside /v/", `https://${HOST}/painel/c/${TOKEN}`],
    ["an extra segment", `https://${HOST}/v/demo/c/${TOKEN}/x`],
    ["an invalid slug", `https://${HOST}/v/Demo_/c/${TOKEN}`],
  ])("refuses %s", (_, value) => {
    expect(parseLinkVendedor(value, HOST)).toBeNull();
  });
});

describe("the closed sets (plain, no zod: ADR-0010 rule 8)", () => {
  it("isDocumentoTipo", () => {
    expect(isDocumentoTipo("CARTAO_CNPJ")).toBe(true);
    expect(isDocumentoTipo("cartao_cnpj")).toBe(false);
  });

  it("isMotivoCodigo", () => {
    expect(isMotivoCodigo("GENERICO")).toBe(true);
    expect(isMotivoCodigo("OUTRO")).toBe(false);
  });
});
