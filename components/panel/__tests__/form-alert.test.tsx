import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { FormAlert } from "@/components/panel/form-alert";

describe("FormAlert", () => {
  it("stays mounted as an empty alert region, so a later message is announced", () => {
    render(<FormAlert />);

    expect(screen.getByRole("alert")).toBeEmptyDOMElement();
  });

  // Its danger ink: primitives.spec (Playwright).
  it("renders the form-level message, links included", () => {
    render(
      <FormAlert id="erro">
        Já existe uma conta. <a href="/entrar">Entrar</a>
      </FormAlert>,
    );

    const alert = screen.getByRole("alert");
    expect(alert).toHaveAttribute("id", "erro");
    expect(screen.getByRole("link", { name: "Entrar" })).toBeInTheDocument();
  });
});
