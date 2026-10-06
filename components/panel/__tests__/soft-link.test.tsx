import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SoftLink } from "@/components/panel/soft-link";

const router = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

beforeEach(() => router.replace.mockClear());

// A real link whose plain click is a soft navigation with the stall fallback
// (useSoftNavigate, P5-004): Lote's pager (T83) and the Fila's tabs and
// "Carregar mais" (T98).
describe("SoftLink", () => {
  it("a plain click → router.replace(href, { scroll: false })", () => {
    render(
      <SoftLink href="/fila?ate=50" className="x">
        Carregar mais 5
      </SoftLink>,
    );
    const link = screen.getByRole("link", { name: "Carregar mais 5" });
    expect(link).toHaveAttribute("href", "/fila?ate=50");
    fireEvent.click(link);
    expect(router.replace).toHaveBeenCalledWith("/fila?ate=50", {
      scroll: false,
    });
  });

  it("disabled (offline, G9): aria-disabled, and a click goes nowhere", () => {
    render(
      <SoftLink href="/fila?ate=50" className="x" disabled>
        Carregar mais 5
      </SoftLink>,
    );
    const link = screen.getByRole("link", { name: "Carregar mais 5" });
    expect(link).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(link);
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("a modified click is the browser's (new tab)", () => {
    render(
      <SoftLink href="/fila" className="x">
        Para decidir
      </SoftLink>,
    );
    fireEvent.click(screen.getByRole("link"), { ctrlKey: true });
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("passes id and aria-current through", () => {
    render(
      <SoftLink href="/fila" className="x" id="aba" aria-current="page">
        Para decidir
      </SoftLink>,
    );
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("id", "aba");
    expect(link).toHaveAttribute("aria-current", "page");
  });
});
