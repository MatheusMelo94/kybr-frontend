import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import NotFound, { metadata } from "@/app/not-found";

// Spec § Content & Copy, Form: notfound.h1 / notfound.body (verbatim).
// T13 moves these strings into the copy module and the LinkNotFound component.
describe("app/not-found", () => {
  it("explains that the link doesn't exist, in a main landmark with one h1", () => {
    render(<NotFound />);

    expect(screen.getByRole("main")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 1, name: "Link não encontrado" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Este link de cadastro não existe ou foi desativado. Peça o link certo à plataforma onde você está se cadastrando.",
      ),
    ).toBeInTheDocument();
  });

  it("ends with the Kybr footer, like every /v/* screen (link AC 40)", () => {
    render(<NotFound />);

    const footer = screen.getByRole("contentinfo");
    expect(footer).toHaveTextContent("Verificação por");
    expect(screen.getByRole("img", { name: "Kybr" })).toBeInTheDocument();
  });

  it("uses notfound.h1 as the page title", () => {
    expect(metadata.title).toBe("Link não encontrado");
  });
});
