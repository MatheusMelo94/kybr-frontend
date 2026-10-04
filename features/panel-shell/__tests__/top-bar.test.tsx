import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const pathname = vi.hoisted(() => ({ value: "/fila" }));
vi.mock("next/navigation", () => ({ usePathname: () => pathname.value }));
vi.mock("@/features/panel-auth/actions", () => ({ logoutAction: vi.fn() }));

import { PanelNav } from "@/features/panel-shell/components/panel-nav";
import { TopBar } from "@/features/panel-shell/components/top-bar";

const ITEMS = [
  { key: "fila", href: "/fila", label: "Fila de revisão" },
] as const;
const scrollIntoView = vi.fn();

function reducedMotion(reduce: boolean): void {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: reduce && query.includes("prefers-reduced-motion: reduce"),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
}

beforeEach(() => {
  scrollIntoView.mockClear();
  Element.prototype.scrollIntoView = scrollIntoView;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("PanelNav tabs (AC 10)", () => {
  it("is a row that scrolls inside itself, the active tab scrolled into view on load", () => {
    reducedMotion(false);
    render(<PanelNav items={ITEMS} contagens={undefined} variant="tabs" />);

    const list = screen.getByRole("list");
    expect(list).toHaveClass("overflow-x-auto", "flex-row");
    expect(scrollIntoView).toHaveBeenCalledWith({
      inline: "nearest",
      block: "nearest",
      behavior: "smooth",
    });
    expect(screen.getByRole("link", { name: "Fila de revisão" })).toHaveClass(
      "pointer-coarse:min-h-11",
      "whitespace-nowrap",
    );
  });

  it("scrolls instantly under reduced motion", () => {
    reducedMotion(true);
    render(<PanelNav items={ITEMS} contagens={undefined} variant="tabs" />);

    expect(scrollIntoView).toHaveBeenCalledWith({
      inline: "nearest",
      block: "nearest",
      behavior: "instant",
    });
  });

  it("the sidebar variant scrolls nothing", () => {
    reducedMotion(false);
    render(<PanelNav items={ITEMS} contagens={undefined} />);
    expect(scrollIntoView).not.toHaveBeenCalled();
  });
});

describe("TopBar (AC 10)", () => {
  it("shows the workspace name and the Conta menu, opening downward", () => {
    reducedMotion(false);
    render(<TopBar workspaceNome="Loja Exemplo" />);

    expect(screen.getByText("Loja Exemplo")).toBeInTheDocument();
    const button = screen.getByRole("button", { name: "Conta" });
    expect(button).toHaveClass("pointer-coarse:min-h-11");
    fireEvent.click(button);
    expect(screen.getByRole("menu")).toHaveClass("top-full");
    expect(screen.getByRole("menuitem", { name: "Sair" })).toBeInTheDocument();
  });
});
