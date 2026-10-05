import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { NavCount } from "@/features/panel-shell/components/nav-count";
import { PlanBlock } from "@/features/panel-shell/components/plan-block";
import { WorkspaceBlock } from "@/features/panel-shell/components/workspace-block";

describe("NavCount (AC 11, Q9)", () => {
  it("a neutral count: the number is aria-hidden, the screen-reader name is nav.fila.count_sr.*, no late cue", () => {
    render(
      <a href="/fila">
        <NavCount abertos={7} vencidos={0} />
      </a>,
    );

    expect(screen.getByText("7")).toHaveAttribute("aria-hidden", "true");
    expect(
      screen.getByRole("link", { name: "7 casos para decidir" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("nav-count").querySelector("svg")).toBeNull();
  });

  it("1 case uses the .one form", () => {
    render(<NavCount abertos={1} vencidos={0} />);
    expect(screen.getByText("1 caso para decidir")).toBeInTheDocument();
  });

  it("with an overdue case: the danger badge with the glyph, the late line, and count_sr_late", () => {
    // The badge's and the late line's colours: primitives.spec (Playwright).
    render(
      <a href="/fila">
        <NavCount abertos={7} vencidos={2} />
      </a>,
    );

    expect(
      screen.getByTestId("nav-count").querySelector("svg"),
    ).toHaveAttribute("aria-hidden", "true");
    expect(
      screen.getByRole("link", {
        name: "7 casos para decidir, 2 fora do prazo",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("2 fora do prazo")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });

  it("is hidden at zero", () => {
    const { container } = render(<NavCount abertos={0} vencidos={0} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("WorkspaceBlock, the sidebar top (AC 9, brand v1)", () => {
  const trial = { tipo: "teste", usadas: 40, limite: 200 } as const;

  it("the 32 px dotless Kybr symbol (named, no visible 'Kybr'), the workspace name, the plan title", () => {
    const { container } = render(
      <WorkspaceBlock nome="Loja Exemplo" plano={trial} />,
    );

    const symbol = screen.getByRole("img", { name: "Kybr" });
    expect(symbol).toHaveAttribute("width", "32");
    expect(symbol.querySelector("circle")).toBeNull();
    expect(screen.getByText("Loja Exemplo")).toBeVisible();
    expect(screen.getByText("Teste grátis")).toBeVisible();
    expect(container.textContent).not.toMatch(/kybr/i);
  });

  it.each([
    [
      { tipo: "pago", nome: "Essencial", usadas: 1, limite: 9 },
      "Plano Essencial",
    ],
    [{ tipo: "pago", usadas: 1, limite: 9 }, "Seu plano"],
  ] as const)("a paid plan: %j → %s", (plano, title) => {
    render(<WorkspaceBlock nome="Loja Exemplo" plano={plano} />);
    expect(screen.getByText(title)).toBeVisible();
    expect(screen.queryByText("Teste grátis")).not.toBeInTheDocument();
  });

  it.each([
    ["none (limite 0)", { tipo: "teste", usadas: 0, limite: 0 } as const],
    ["failed", undefined],
  ])("no plan line when the plan is %s", (_name, plano) => {
    const { container } = render(
      <WorkspaceBlock nome="Loja Exemplo" plano={plano} />,
    );
    expect(container.querySelectorAll("p")).toHaveLength(1);
  });

  it("no longer shows ws.sellers.*", () => {
    render(<WorkspaceBlock nome="Loja Exemplo" plano={trial} />);
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
    // Its warning ink: primitives.spec (Playwright).
    expect(text).toBeVisible();
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
