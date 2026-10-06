import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const pathname = vi.hoisted(() => ({ value: "/fila" }));
vi.mock("next/navigation", () => ({ usePathname: () => pathname.value }));
vi.mock("@/features/panel-auth/actions", () => ({ logoutAction: vi.fn() }));

import { PanelNav } from "@/features/panel-shell/components/panel-nav";
import { TopBar } from "@/features/panel-shell/components/top-bar";
import { ShellStatusProvider } from "@/features/panel-shell/shell-status-context";

const ITEMS = [
  { key: "fila", href: "/fila", label: "Fila de revisão" },
] as const;
const scrollIntoView = vi.fn();

function renderNav(variant: "sidebar" | "tabs" = "sidebar"): void {
  render(
    <ShellStatusProvider initial={{ contagens: undefined, plano: undefined }}>
      <PanelNav items={ITEMS} variant={variant} />
    </ShellStatusProvider>,
  );
}

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
  // The row scrolling inside itself and the 44 px tabs: primitives.spec.
  it("scrolls the active tab into view on load", () => {
    reducedMotion(false);
    renderNav("tabs");

    expect(scrollIntoView).toHaveBeenCalledWith({
      inline: "nearest",
      block: "nearest",
      behavior: "smooth",
    });
  });

  it("scrolls instantly under reduced motion", () => {
    reducedMotion(true);
    renderNav("tabs");

    expect(scrollIntoView).toHaveBeenCalledWith({
      inline: "nearest",
      block: "nearest",
      behavior: "instant",
    });
  });

  it("the sidebar variant scrolls nothing", () => {
    reducedMotion(false);
    renderNav();
    expect(scrollIntoView).not.toHaveBeenCalled();
  });
});

describe("TopBar (AC 10)", () => {
  // The 44 px button and the menu opening below it: primitives.spec.
  it("shows the workspace name and the Conta menu", () => {
    reducedMotion(false);
    render(
      <ShellStatusProvider initial={{ contagens: undefined, plano: undefined }}>
        <TopBar workspaceNome="Loja Exemplo" contratarHref={undefined} />
      </ShellStatusProvider>,
    );

    expect(screen.getByText("Loja Exemplo")).toBeInTheDocument();
    const button = screen.getByRole("button", { name: "Conta" });
    fireEvent.click(button);
    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Sair" })).toBeInTheDocument();
  });
});
