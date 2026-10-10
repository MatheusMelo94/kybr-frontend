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

describe("PanelNav: the Lote item (S5 batch running, T77)", () => {
  const LOTE_ITEMS = [
    { key: "fila", href: "/fila", label: "Fila de revisão" },
    { key: "lote", href: "/lote", label: "Verificar em lote" },
  ] as const;

  function renderLote(running: boolean): void {
    pathname.value = "/fila";
    render(
      <ShellStatusProvider
        initial={{
          contagens: { ...counts(7, 0), lote_em_andamento: running },
          plano: undefined,
        }}
      >
        <PanelNav items={LOTE_ITEMS} />
      </ShellStatusProvider>,
    );
  }

  it("while a batch runs, shows nav.lote.running as text, in its accessible name (no spinner)", () => {
    renderLote(true);
    const link = screen.getByRole("link", { name: /^Verificar em lote/ });
    expect(link).toHaveAccessibleName("Verificar em lote Verificando");
    expect(link.querySelector("[class*='animate-']")).toBeNull();
  });

  it("without a running batch, just the label", () => {
    renderLote(false);
    expect(
      screen.getByRole("link", { name: /^Verificar em lote/ }),
    ).toHaveAccessibleName("Verificar em lote");
  });
});

describe("PanelNav: the Monitoramento count (S5, T122)", () => {
  const MON_ITEMS = [
    { key: "monitor", href: "/monitoramento", label: "Monitoramento" },
  ] as const;

  function renderMonitor(alertas: number): void {
    render(
      <ShellStatusProvider
        initial={{
          contagens: { ...counts(0, 0), alertas_criticos_abertos: alertas },
          plano: undefined,
        }}
      >
        <PanelNav items={MON_ITEMS} />
      </ShellStatusProvider>,
    );
  }

  it("shows the undecided critical alerts, named by nav.monitor.count_sr.*", () => {
    pathname.value = "/fila";
    renderMonitor(2);
    expect(
      screen.getByRole("link", {
        name: "Monitoramento 2 alertas críticos sem decisão",
      }),
    ).toHaveAttribute("href", "/monitoramento");
    expect(screen.getByTestId("nav-count-monitor")).toHaveTextContent("2");
  });

  it("the singular, and zero hidden", () => {
    pathname.value = "/fila";
    renderMonitor(1);
    expect(
      screen.getByRole("link", {
        name: "Monitoramento 1 alerta crítico sem decisão",
      }),
    ).toBeInTheDocument();
  });

  it("zero is hidden", () => {
    pathname.value = "/fila";
    renderMonitor(0);
    expect(
      screen.getByRole("link", { name: "Monitoramento" }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("nav-count-monitor")).toBeNull();
  });
});

describe("PanelNav: the tab row's hidden count text (AC 74)", () => {
  it("each link (both variants share the class) is a positioning box, so a count's sr-only text can't widen the page", () => {
    pathname.value = "/fila";
    render(
      <ShellStatusProvider
        initial={{
          contagens: { ...counts(7, 2), alertas_criticos_abertos: 1 },
          plano: undefined,
        }}
      >
        <PanelNav
          items={[
            { key: "fila", href: "/fila", label: "Fila de revisão" },
            { key: "monitor", href: "/monitoramento", label: "Monitoramento" },
          ]}
        />
      </ShellStatusProvider>,
    );
    for (const link of screen.getAllByRole("link"))
      expect(link).toHaveClass("relative");
  });
});
