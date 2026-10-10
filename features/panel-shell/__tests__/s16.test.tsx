import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

import { PanelFatalError } from "@/features/panel-shell/components/panel-fatal-error";
import { PanelNotFound } from "@/features/panel-shell/components/panel-not-found";

describe("PanelNotFound (S16, AC 13)", () => {
  it("shows notfound.* and Ir para a fila", () => {
    render(<PanelNotFound />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Página não encontrada" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Este endereço não existe no painel."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Ir para a fila" }),
    ).toHaveAttribute("href", "/fila");
  });
});

describe("PanelFatalError (S16)", () => {
  it("shows fatal.*, retries with reset + refresh, and offers the Fila; never the digest", () => {
    const reset = vi.fn();
    render(<PanelFatalError reset={reset} digest="123456789" />);

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Algo deu errado nesta tela",
      }),
    ).toHaveFocus();
    expect(
      screen.getByText("Tente de novo. Se continuar, volte para a fila."),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));
    expect(reset).toHaveBeenCalledOnce();
    expect(router.refresh).toHaveBeenCalledOnce();
    expect(
      screen.getByRole("link", { name: "Ir para a fila" }),
    ).toHaveAttribute("href", "/fila");
    expect(document.body.textContent).not.toContain("123456789");
    expect(document.title).toBe("Algo deu errado nesta tela");
  });
});
