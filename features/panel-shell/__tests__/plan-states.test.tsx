import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/fila" }));
vi.mock("@/features/panel-auth/actions", () => ({ logoutAction: vi.fn() }));

import { PlanBanner } from "@/features/panel-shell/components/plan-banner";
import { TopBar } from "@/features/panel-shell/components/top-bar";
import { planGate } from "@/features/panel-shell/plan-variant";
import { ShellStatusProvider } from "@/features/panel-shell/shell-status-context";
import type { Plano } from "@/lib/api/schemas/panel/me";

const TRIAL = { tipo: "teste", usadas: 40, limite: 200 } as const;
const EXHAUSTED = { tipo: "teste", usadas: 200, limite: 200 } as const;
const NONE = { tipo: "teste", usadas: 0, limite: 0 } as const;
const PAID = {
  tipo: "pago",
  nome: "Essencial",
  usadas: 1240,
  limite: 5000,
  ciclo_ate: "2026-11-04T23:59:59-03:00",
} as const;
const MAILTO = "mailto:vendas@exemplo.test";
const EXHAUSTED_TEXT =
  "As verificações do plano acabaram. Contrate para continuar verificando.";
const NONE_TEXT = "Esta conta ainda não tem verificações liberadas.";
const HINT_TEXT = "Contrate para começar a verificar.";

describe("planGate (the variant PlanBlock and PlanBanner share)", () => {
  it.each([
    ["none granted (limite 0)", NONE, "none"],
    ["used up", EXHAUSTED, "exhausted"],
    ["over the limit", { ...EXHAUSTED, usadas: 210 }, "exhausted"],
    ["trial with checks left", TRIAL, undefined],
    ["paid with checks left", PAID, undefined],
    ["no plano", undefined, undefined],
  ] as const)("%s → %s", (_, plano, gate) => {
    expect(planGate(plano as Plano | undefined)).toBe(gate);
  });
});

function openMenu(plano: Plano | undefined, contratarHref?: string): void {
  render(
    <ShellStatusProvider initial={{ contagens: undefined, plano }}>
      <TopBar workspaceNome="Loja Exemplo" contratarHref={contratarHref} />
    </ShellStatusProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Conta" }));
}

describe("Conta below lg: the plan variant (AC 10)", () => {
  it("describes the menu with the plan text, which is not a menu item", () => {
    openMenu(TRIAL);

    const menu = screen.getByRole("menu", { name: "Conta" });
    expect(menu).toHaveAccessibleDescription(
      "Teste grátis 40 de 200 verificações",
    );
    expect(
      screen.getAllByRole("menuitem").map((item) => item.textContent),
    ).toEqual(["Configurações", "Sair"]);
  });

  it("shows the plan above Sair", () => {
    openMenu(PAID);

    const title = screen.getByText("Plano Essencial");
    const sair = screen.getByRole("menuitem", { name: "Sair" });
    expect(
      title.compareDocumentPosition(sair) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      screen.getByRole("menu", { name: "Conta" }),
    ).toHaveAccessibleDescription(
      "Plano Essencial 1.240 de 5.000 verificações neste ciclo Ciclo até 04/11/2026",
    );
  });

  it("paid without nome reads Seu plano", () => {
    openMenu({ tipo: "pago", usadas: 10, limite: 5000 });
    expect(screen.getByRole("menu")).toHaveAccessibleDescription(
      "Seu plano 10 de 5.000 verificações neste ciclo",
    );
  });

  it("used up: plan.exhausted, and Contratar is a menu item when the contact is set", () => {
    openMenu(EXHAUSTED, MAILTO);

    expect(screen.getByRole("menu")).toHaveAccessibleDescription(
      `Teste grátis 200 de 200 verificações ${EXHAUSTED_TEXT}`,
    );
    const items = screen.getAllByRole("menuitem");
    expect(items.map((item) => item.textContent)).toEqual([
      "Contratar",
      "Configurações",
      "Sair",
    ]);
    expect(items[0]).toHaveAttribute("href", MAILTO);
  });

  it("none granted: plan.none, and the hint only with the contact", () => {
    openMenu(NONE, MAILTO);
    expect(screen.getByRole("menu")).toHaveAccessibleDescription(
      `Teste grátis ${NONE_TEXT} ${HINT_TEXT}`,
    );
  });

  it("none granted without the contact: no hint, no Contratar", () => {
    openMenu(NONE);
    expect(screen.getByRole("menu")).toHaveAccessibleDescription(
      `Teste grátis ${NONE_TEXT}`,
    );
    expect(
      screen.queryByRole("menuitem", { name: "Contratar" }),
    ).not.toBeInTheDocument();
  });

  it("without a plano: its items only, no description", () => {
    openMenu(undefined, MAILTO);

    const menu = screen.getByRole("menu");
    expect(menu).not.toHaveAttribute("aria-describedby");
    expect(
      screen.getAllByRole("menuitem").map((item) => item.textContent),
    ).toEqual(["Configurações", "Sair"]);
  });
});

describe("PlanBanner (AC 12, the Fila half)", () => {
  it("used up: plan.exhausted and Contratar, a warning Notice that is not a live region", () => {
    const { container } = render(
      <PlanBanner plano={EXHAUSTED} contratarHref={MAILTO} />,
    );

    expect(screen.getByText(EXHAUSTED_TEXT)).toBeVisible();
    expect(screen.getByRole("link", { name: "Contratar" })).toHaveAttribute(
      "href",
      MAILTO,
    );
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    const banner = container.firstElementChild;
    // DDR-0003: a warning left bar, ink text, never amber text.
    expect(banner).toHaveClass("border-l-warning", "text-ink");
    expect(banner).not.toHaveAttribute("tabindex");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("used up without the contact: the text only", () => {
    render(<PlanBanner plano={EXHAUSTED} contratarHref={undefined} />);
    expect(screen.getByText(EXHAUSTED_TEXT)).toBeVisible();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("none granted: plan.none, then the hint and Contratar only with the contact", () => {
    const { rerender } = render(
      <PlanBanner plano={NONE} contratarHref={MAILTO} />,
    );
    expect(screen.getByText(NONE_TEXT)).toBeVisible();
    expect(screen.getByText(HINT_TEXT)).toBeVisible();
    expect(screen.getByRole("link", { name: "Contratar" })).toBeVisible();

    rerender(<PlanBanner plano={NONE} contratarHref={undefined} />);
    expect(screen.getByText(NONE_TEXT)).toBeVisible();
    expect(screen.queryByText(HINT_TEXT)).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it.each([
    ["trial with checks left", TRIAL],
    ["paid with checks left", PAID],
    ["no plano", undefined],
  ] as const)("%s: nothing", (_, plano) => {
    const { container } = render(
      <PlanBanner plano={plano} contratarHref={MAILTO} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
