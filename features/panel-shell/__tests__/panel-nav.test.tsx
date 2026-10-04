import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const pathname = vi.hoisted(() => ({ value: "/fila" }));
vi.mock("next/navigation", () => ({ usePathname: () => pathname.value }));

import { PanelNav } from "@/features/panel-shell/components/panel-nav";

const ITEMS = [
  { key: "fila", href: "/fila", label: "Fila de revisão" },
] as const;

describe("PanelNav (AC 9)", () => {
  it("is a nav named nav.label; the active item has aria-current=page (sub-paths included)", () => {
    pathname.value = "/fila/3f2b8c1e-4d5a-4b6c-8d7e-9f0a1b2c3d4e";
    render(
      <PanelNav
        items={ITEMS}
        contagens={{ fila_abertos: 7, fila_vencidos: 0 }}
      />,
    );

    expect(
      screen.getByRole("navigation", { name: "Navegação do painel" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", {
        name: "Fila de revisão 7 casos para decidir",
      }),
    ).toHaveAttribute("aria-current", "page");
  });

  it("no aria-current elsewhere; no count when contagens is missing (AC 11: hidden silently)", () => {
    pathname.value = "/";
    render(<PanelNav items={ITEMS} contagens={undefined} />);

    const link = screen.getByRole("link", { name: "Fila de revisão" });
    expect(link).not.toHaveAttribute("aria-current");
    expect(link).toHaveAttribute("href", "/fila");
  });
});
