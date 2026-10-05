import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Button } from "@/components/ui/button";

describe("Button", () => {
  it("renders a non-submitting button with its label by default", () => {
    render(<Button>Verificar empresa</Button>);

    const button = screen.getByRole("button", { name: "Verificar empresa" });
    expect(button).toHaveAttribute("type", "button");
    expect(button).not.toHaveAttribute("aria-busy");
  });

  it("calls onClick when pressed", () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Salvar e-mail</Button>);

    fireEvent.click(screen.getByRole("button", { name: "Salvar e-mail" }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("is a 48 px pill in the accent color as primary", () => {
    render(<Button>Verificar empresa</Button>);

    expect(screen.getByRole("button")).toHaveClass(
      "h-12",
      "rounded-full",
      "bg-accent",
      "text-accent-ink",
    );
  });

  it("is neutral and at least 44 px tall as secondary", () => {
    render(<Button variant="secondary">Trocar e-mail</Button>);

    const button = screen.getByRole("button");
    expect(button).toHaveClass("min-h-11", "rounded-full", "text-ink");
    expect(button).not.toHaveClass("bg-accent");
  });

  it("shows a focus-visible ring in the focus token", () => {
    render(<Button>Verificar empresa</Button>);

    expect(screen.getByRole("button")).toHaveClass(
      "focus-visible:outline-2",
      "focus-visible:outline-focus",
    );
  });

  describe("when busy", () => {
    it("announces the busy label and exposes aria-busy", () => {
      render(
        <Button busy busyLabel="Enviando…">
          Verificar empresa
        </Button>,
      );

      const button = screen.getByRole("button", { name: "Enviando…" });
      expect(button).toHaveAttribute("aria-busy", "true");
      expect(button).toHaveAttribute("aria-disabled", "true");
    });

    it("keeps both labels laid out so its width doesn't change", () => {
      const { rerender } = render(
        <Button busyLabel="Enviando…">Verificar empresa</Button>,
      );
      const hiddenBusy = screen.getByText("Enviando…");
      expect(hiddenBusy).toHaveAttribute("aria-hidden", "true");
      expect(hiddenBusy).toHaveClass("invisible");

      rerender(
        <Button busy busyLabel="Enviando…">
          Verificar empresa
        </Button>,
      );
      const hiddenIdle = screen.getByText("Verificar empresa");
      expect(hiddenIdle).toHaveAttribute("aria-hidden", "true");
      expect(hiddenIdle).toHaveClass("invisible");
      expect(screen.getByText("Enviando…")).not.toHaveClass("invisible");
    });

    it("ignores clicks, including the form submission they would trigger", () => {
      const onClick = vi.fn();
      const onSubmit = vi.fn((event: SubmitEvent) => event.preventDefault());
      render(
        <form onSubmit={(event) => onSubmit(event.nativeEvent as SubmitEvent)}>
          <Button type="submit" busy busyLabel="Enviando…" onClick={onClick}>
            Verificar empresa
          </Button>
        </form>,
      );

      fireEvent.click(screen.getByRole("button", { name: "Enviando…" }));

      expect(onClick).not.toHaveBeenCalled();
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it("stays focusable, so keyboard focus isn't lost mid-submit", () => {
      render(
        <Button busy busyLabel="Enviando…">
          Verificar empresa
        </Button>,
      );

      expect(screen.getByRole("button")).not.toBeDisabled();
    });
  });

  it("is natively disabled when disabled", () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Enviar documento
      </Button>,
    );

    const button = screen.getByRole("button", { name: "Enviar documento" });
    fireEvent.click(button);

    expect(button).toBeDisabled();
    expect(onClick).not.toHaveBeenCalled();
  });

  it("passes aria-describedby through and merges extra classes", () => {
    render(
      <>
        <p id="item-title">Contrato social ou CCMEI</p>
        <Button aria-describedby="item-title" className="w-full">
          Enviar documento
        </Button>
      </>,
    );

    const button = screen.getByRole("button", { name: "Enviar documento" });
    expect(button).toHaveAccessibleDescription("Contrato social ou CCMEI");
    expect(button).toHaveClass("w-full");
  });

  // size="panel" (plan § 2.6): 40 px, at least 44 px on a coarse pointer,
  // secondary included; primitives.spec measures it (Playwright).
});
