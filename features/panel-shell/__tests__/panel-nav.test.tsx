import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const pathname = vi.hoisted(() => ({ value: "/fila" }));
vi.mock("next/navigation", () => ({ usePathname: () => pathname.value }));

import { PanelNav } from "@/features/panel-shell/components/panel-nav";
import { ShellStatusProvider } from "@/features/panel-shell/shell-status-context";
import type { Contagens } from "@/lib/api/schemas/panel/me";

const ITEMS = [
  { key: "fila", href: "/fila", label: "Fila de revisão" },
] as const;

function counts(fila_abertos: number, fila_vencidos: number): Contagens {
  return {
    fila_abertos,
    fila_vencidos,
    alertas_criticos_abertos: 0,
    vendedores: 1,
    lote_em_andamento: false,
  };
}

function renderNav(contagens: Contagens | undefined): void {
  render(
    <ShellStatusProvider initial={{ contagens, plano: undefined }}>
      <PanelNav items={ITEMS} />
    </ShellStatusProvider>,
  );
}

describe("PanelNav (AC 9)", () => {
  it("is a nav named nav.label; the active item has aria-current=page (sub-paths included)", () => {
    pathname.value = "/fila/3f2b8c1e-4d5a-4b6c-8d7e-9f0a1b2c3d4e";
    renderNav(counts(7, 0));

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
    renderNav(undefined);

    const link = screen.getByRole("link", { name: "Fila de revisão" });
    expect(link).not.toHaveAttribute("aria-current");
    expect(link).toHaveAttribute("href", "/fila");
  });

  it("reads the shell's live counts (AC 11)", () => {
    pathname.value = "/fila";
    renderNav(counts(3, 2));

    expect(
      screen.getByRole("link", {
        name: "Fila de revisão 3 casos para decidir, 2 fora do prazo",
      }),
    ).toBeInTheDocument();
  });

  it("is a shell leaf: outside ShellStatusProvider it throws (P4-011)", () => {
    // React logs the thrown render; keep the run's output clean.
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<PanelNav items={ITEMS} />)).toThrow(
      "useShellStatus outside ShellStatusProvider",
    );
    logged.mockRestore();
  });
});
