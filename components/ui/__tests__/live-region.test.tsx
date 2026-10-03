import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LiveRegion } from "@/components/ui/live-region";

describe("LiveRegion", () => {
  it("is a polite status region by default", () => {
    render(<LiveRegion>Buscando os dados da empresa…</LiveRegion>);

    const region = screen.getByRole("status");
    expect(region).toHaveAttribute("aria-live", "polite");
    expect(region).toHaveAttribute("aria-atomic", "true");
    expect(region).toHaveTextContent("Buscando os dados da empresa…");
  });

  it("is an alert region when asked", () => {
    render(
      <LiveRegion politeness="alert">
        Não conseguimos enviar. Confira sua conexão e tente de novo.
      </LiveRegion>,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Não conseguimos enviar. Confira sua conexão e tente de novo.",
    );
  });

  it("exists while empty, so a later message is announced", () => {
    render(<LiveRegion />);

    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });

  it("stays the same element when its text changes", () => {
    const { rerender } = render(
      <LiveRegion>Buscando os dados da empresa…</LiveRegion>,
    );
    const before = screen.getByRole("status");

    rerender(<LiveRegion>Empresa encontrada: Exemplo Ltda.</LiveRegion>);

    expect(screen.getByRole("status")).toBe(before);
    expect(before).toHaveTextContent("Empresa encontrada: Exemplo Ltda.");
  });

  it("can be visually hidden", () => {
    render(<LiveRegion className="sr-only">x</LiveRegion>);

    expect(screen.getByRole("status")).toHaveClass("sr-only");
  });
});
