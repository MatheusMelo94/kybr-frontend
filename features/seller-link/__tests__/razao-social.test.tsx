import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  RazaoSocial,
  razaoSocialText,
} from "@/features/seller-link/razao-social";

describe("RazaoSocial", () => {
  it("shows a masked CPF but reads it as 'CPF oculto' (spec v3 § Company data on the link)", () => {
    const { container } = render(
      <p data-testid="name">
        <RazaoSocial value="JOAO CARLOS SILVA ***.***.***-**" />
      </p>,
    );

    // Inside a named role, the accessible name is what a screen reader says.
    render(
      <button type="button">
        <RazaoSocial value="JOAO CARLOS SILVA ***.***.***-**" />
      </button>,
    );
    expect(screen.getByRole("button")).toHaveAccessibleName(
      "JOAO CARLOS SILVA CPF oculto",
    );
    expect(container.textContent).toBe(
      "JOAO CARLOS SILVA ***.***.***-**CPF oculto",
    );
  });

  it("masks a CPF that arrives unmasked, as a last backstop", () => {
    render(<RazaoSocial value="JOAO CARLOS SILVA 123.456.789-09" />);

    expect(screen.getByText("***.***.***-**")).toBeInTheDocument();
    expect(screen.queryByText(/123\.456/)).toBeNull();
  });

  it("renders a name without a CPF as plain text", () => {
    const { container } = render(
      <RazaoSocial value="AUTO PECAS EXEMPLO LTDA" />,
    );

    expect(container.textContent).toBe("AUTO PECAS EXEMPLO LTDA");
  });
});

describe("razaoSocialText", () => {
  it("replaces each masked CPF with 'CPF oculto' for announcements", () => {
    expect(razaoSocialText("JOAO CARLOS SILVA ***.***.***-**")).toBe(
      "JOAO CARLOS SILVA CPF oculto",
    );
    expect(razaoSocialText("JOAO CARLOS SILVA 12345678909")).toBe(
      "JOAO CARLOS SILVA CPF oculto",
    );
  });
});
