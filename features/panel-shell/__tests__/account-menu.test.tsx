import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AccountMenu } from "@/features/panel-shell/components/account-menu";

let pathname = "/";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));

function renderMenu() {
  render(
    <AccountMenu>
      <button type="button" role="menuitem">
        Sair
      </button>
    </AccountMenu>,
  );
  return screen.getByRole("button", { name: "Conta" });
}

describe("AccountMenu (plan § 2.8: a menu button)", () => {
  it("is a collapsed menu button", () => {
    const button = renderMenu();
    expect(button).toHaveAttribute("aria-haspopup", "menu");
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it.each(["Enter", " ", "ArrowDown"])(
    "%j opens it with focus on the first item",
    (key) => {
      const button = renderMenu();
      fireEvent.keyDown(button, { key });

      expect(button).toHaveAttribute("aria-expanded", "true");
      expect(screen.getByRole("menu", { name: "Conta" })).toBeInTheDocument();
      expect(screen.getByRole("menuitem", { name: "Sair" })).toHaveFocus();
    },
  );

  it("a click opens it too", () => {
    const button = renderMenu();
    fireEvent.click(button);
    expect(screen.getByRole("menu")).toBeInTheDocument();
  });

  it("Esc closes it and returns focus to the button", () => {
    const button = renderMenu();
    fireEvent.keyDown(button, { key: "Enter" });
    fireEvent.keyDown(screen.getByRole("menuitem", { name: "Sair" }), {
      key: "Escape",
    });

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(button).toHaveFocus();
    expect(button).toHaveAttribute("aria-expanded", "false");
  });

  it("closes when focus or a click leaves it", () => {
    const button = renderMenu();
    fireEvent.click(button);
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("has no Configurações until M8", () => {
    const button = renderMenu();
    fireEvent.click(button);
    expect(
      screen.queryByRole("menuitem", { name: "Configurações" }),
    ).not.toBeInTheDocument();
  });

  it("T135: a navigation (Configurações) closes it", () => {
    const { rerender } = render(
      <AccountMenu>
        <a href="/configuracoes" role="menuitem">
          Configurações
        </a>
      </AccountMenu>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Conta" }));
    expect(screen.getByRole("menu")).toBeInTheDocument();
    pathname = "/configuracoes";
    rerender(
      <AccountMenu>
        <a href="/configuracoes" role="menuitem">
          Configurações
        </a>
      </AccountMenu>,
    );
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    pathname = "/";
  });
});
