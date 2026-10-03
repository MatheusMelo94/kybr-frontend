import { describe, expect, it } from "vitest";

import { toSafeHttpsUrl } from "@/lib/safe-url";

describe("toSafeHttpsUrl", () => {
  it("accepts an absolute https: URL and returns it normalized", () => {
    expect(toSafeHttpsUrl("https://www.gov.br/receitafederal")).toBe(
      "https://www.gov.br/receitafederal",
    );
    expect(toSafeHttpsUrl("HTTPS://Loja-Exemplo.test")).toBe(
      "https://loja-exemplo.test/",
    );
  });

  it.each([
    ["http:", "http://loja-exemplo.test"],
    ["javascript:", "javascript:alert(1)"],
    ["data:", "data:text/html,<script>alert(1)</script>"],
    ["mailto:", "mailto:vendedores@loja-exemplo.test"],
    ["relative", "/v/loja-exemplo"],
    ["protocol-relative", "//loja-exemplo.test"],
    ["malformed", "https://"],
    ["credentials", "https://user:pass@loja-exemplo.test"],
  ])("rejects a %s URL", (_kind, value) => {
    expect(toSafeHttpsUrl(value)).toBeUndefined();
  });
});
