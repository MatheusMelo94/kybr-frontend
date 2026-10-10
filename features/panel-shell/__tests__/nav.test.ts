import { describe, expect, it } from "vitest";

import { NAV_ITEMS, navItemsInBuild } from "@/features/panel-shell/nav";

describe("nav registry (spec § Screens & Surfaces, O-15)", () => {
  it("keeps the spec's order", () => {
    expect(NAV_ITEMS.map((item) => item.key)).toEqual([
      "inicio",
      "fila",
      "monitor",
      "lote",
      "vendedores",
      "regras",
      "relatorio",
      "integracoes",
      "link",
    ]);
  });

  it("puts Fila and Monitoramento in the first three items (phone-critical)", () => {
    const firstThree = NAV_ITEMS.slice(0, 3).map((item) => item.key);
    expect(firstThree).toContain("fila");
    expect(firstThree).toContain("monitor");
  });

  it("shows only the screens this build ships, with no placeholders: M7 adds Monitoramento, in the spec's order", () => {
    expect(navItemsInBuild()).toEqual([
      { key: "fila", href: "/fila", label: "Fila de revisão" },
      { key: "monitor", href: "/monitoramento", label: "Monitoramento" },
      { key: "lote", href: "/lote", label: "Verificar em lote" },
    ]);
  });
});
