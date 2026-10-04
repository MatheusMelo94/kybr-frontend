import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const pathname = vi.hoisted(() => ({ value: "/fila" }));
vi.mock("next/navigation", () => ({ usePathname: () => pathname.value }));

import { PanelNav } from "@/features/panel-shell/components/panel-nav";
import { ShellStatusProvider } from "@/features/panel-shell/shell-status-context";

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

  it("inside the shell, the poller's live counts win over the server's (AC 11)", () => {
    pathname.value = "/fila";
    render(
      <ShellStatusProvider
        initial={{
          contagens: {
            fila_abertos: 3,
            fila_vencidos: 2,
            alertas_criticos_abertos: 0,
            vendedores: 1,
            lote_em_andamento: false,
          },
          plano: undefined,
        }}
      >
        <PanelNav
          items={ITEMS}
          contagens={{ fila_abertos: 7, fila_vencidos: 0 }}
        />
      </ShellStatusProvider>,
    );

    expect(
      screen.getByRole("link", {
        name: "Fila de revisão 3 casos para decidir, 2 fora do prazo",
      }),
    ).toBeInTheDocument();
  });
});
