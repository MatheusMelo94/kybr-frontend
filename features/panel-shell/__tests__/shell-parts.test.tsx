import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { NavCount } from "@/features/panel-shell/components/nav-count";
import { PlanBlock } from "@/features/panel-shell/components/plan-block";
import { WorkspaceBlock } from "@/features/panel-shell/components/workspace-block";

describe("NavCount (AC 11, Q9)", () => {
  it("a neutral count: the number is aria-hidden, the screen-reader name is nav.fila.count_sr.*", () => {
    render(<NavCount abertos={7} vencidos={0} />);

    expect(screen.getByText("7")).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByText("7 casos para decidir")).toHaveClass("sr-only");
    expect(screen.getByTestId("nav-count")).not.toHaveClass("bg-danger");
  });

  it("1 case uses the .one form", () => {
    render(<NavCount abertos={1} vencidos={0} />);
    expect(screen.getByText("1 caso para decidir")).toBeInTheDocument();
  });

  it("with an overdue case: the danger badge with the glyph, the late line, and count_sr_late", () => {
    render(<NavCount abertos={7} vencidos={2} />);

    expect(screen.getByTestId("nav-count")).toHaveClass(
      "bg-danger",
      "text-danger-badge-ink",
    );
    expect(
      screen.getByTestId("nav-count").querySelector("svg"),
    ).toHaveAttribute("aria-hidden", "true");
    expect(
      screen.getByText("7 casos para decidir, 2 fora do prazo"),
    ).toHaveClass("sr-only");
    const late = screen.getByText("2 fora do prazo");
    expect(late).toHaveAttribute("aria-hidden", "true");
    expect(late).toHaveClass("text-danger-ink");
  });

  it("is hidden at zero", () => {
    const { container } = render(<NavCount abertos={0} vencidos={0} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("WorkspaceBlock", () => {
  it("shows the workspace name and ws.sellers.* in pt-BR numbers", () => {
    render(<WorkspaceBlock nome="Loja Exemplo" vendedores={1240} />);
    expect(screen.getByText("Loja Exemplo")).toBeInTheDocument();
    expect(screen.getByText("1.240 vendedores")).toBeInTheDocument();
  });

  it.each([0, undefined])("hides the seller count at %s", (vendedores) => {
    render(<WorkspaceBlock nome="Loja Exemplo" vendedores={vendedores} />);
    expect(screen.queryByText(/vendedor/)).not.toBeInTheDocument();
  });
});

describe("PlanBlock (AC 12, S5)", () => {
  const trial = { tipo: "teste", usadas: 40, limite: 200 } as const;

  it("trial: plan.trial.*, no Contratar while the commercial address is unset (P-U4)", () => {
    render(<PlanBlock plano={trial} contratarHref={undefined} />);
    expect(screen.getByText("Teste grátis")).toBeInTheDocument();
    expect(screen.getByText("40 de 200 verificações")).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Contratar" }),
    ).not.toBeInTheDocument();
  });

  it("trial with the commercial address: Contratar is a mailto:", () => {
    render(
      <PlanBlock plano={trial} contratarHref="mailto:vendas@exemplo.test" />,
    );
    expect(screen.getByRole("link", { name: "Contratar" })).toHaveAttribute(
      "href",
      "mailto:vendas@exemplo.test",
    );
  });

  it("paid: Plano {nome}, the cycle's usage and Ciclo até {data}", () => {
    render(
      <PlanBlock
        plano={{
          tipo: "pago",
          nome: "Essencial",
          usadas: 1240,
          limite: 5000,
          ciclo_ate: "2026-11-04T23:59:59-03:00",
        }}
        contratarHref={undefined}
      />,
    );
    expect(screen.getByText("Plano Essencial")).toBeInTheDocument();
    expect(
      screen.getByText("1.240 de 5.000 verificações neste ciclo"),
    ).toBeInTheDocument();
    expect(screen.getByText("Ciclo até 04/11/2026")).toBeInTheDocument();
  });

  it("allowance used up: plan.exhausted in warning ink", () => {
    render(
      <PlanBlock
        plano={{ tipo: "teste", usadas: 200, limite: 200 }}
        contratarHref="mailto:v@exemplo.test"
      />,
    );
    const text = screen.getByText(
      "As verificações do plano acabaram. Contrate para continuar verificando.",
    );
    expect(text).toHaveClass("text-warning-ink");
    expect(screen.getByRole("link", { name: "Contratar" })).toBeInTheDocument();
  });

  it("no checks granted (limite 0): plan.none and no usage line; the hint only with Contratar", () => {
    const { rerender } = render(
      <PlanBlock
        plano={{ tipo: "teste", usadas: 0, limite: 0 }}
        contratarHref={undefined}
      />,
    );
    expect(
      screen.getByText("Esta conta ainda não tem verificações liberadas."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/de 0 verificações/)).not.toBeInTheDocument();
    expect(
      screen.queryByText("Contrate para começar a verificar."),
    ).not.toBeInTheDocument();

    rerender(
      <PlanBlock
        plano={{ tipo: "teste", usadas: 0, limite: 0 }}
        contratarHref="mailto:v@exemplo.test"
      />,
    );
    expect(
      screen.getByText("Contrate para começar a verificar."),
    ).toBeInTheDocument();
  });

  it("is hidden without a plano (it failed to load)", () => {
    const { container } = render(
      <PlanBlock plano={undefined} contratarHref={undefined} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
