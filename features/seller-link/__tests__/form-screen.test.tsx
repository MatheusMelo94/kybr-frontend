import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MarketplaceName } from "@/features/seller-link/components/marketplace-name";
import { PrivacyFooter } from "@/features/seller-link/components/privacy-footer";
import { StepIndicator } from "@/features/seller-link/components/step-indicator";

describe("MarketplaceName", () => {
  it("shows the workspace name as text, not as a heading or a logo", () => {
    const { container } = render(<MarketplaceName nome="Loja Exemplo" />);

    expect(screen.getByText("Loja Exemplo")).toBeInTheDocument();
    expect(screen.queryByRole("heading")).toBeNull();
    expect(container.querySelector("img, svg")).toBeNull();
  });
});

describe("StepIndicator", () => {
  it.each([1, 2, 3] as const)("exposes Passo %i de 3 as text", (step) => {
    render(<StepIndicator step={step} />);

    expect(screen.getByText(`Passo ${step} de 3`)).toBeInTheDocument();
  });

  it.each([
    [1, 1],
    [2, 2],
    [3, 3],
  ] as const)(
    "at step %i fills %i of the 3 aria-hidden segments",
    (step, filled) => {
      const { container } = render(<StepIndicator step={step} />);
      const segments = container.querySelectorAll("[data-segment]");

      expect(segments).toHaveLength(3);
      for (const segment of segments)
        expect(segment).toHaveAttribute("aria-hidden", "true");
      expect(
        container.querySelectorAll('[data-segment="filled"]'),
      ).toHaveLength(filled);
    },
  );
});

describe("PrivacyFooter", () => {
  it("shows privacy.line and links privacy.link to this link's notice", () => {
    render(<PrivacyFooter slug="loja-exemplo" />);

    expect(
      screen.getByText("Usamos estes dados só para verificar sua empresa."),
    ).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "Como tratamos seus dados" });
    expect(link).toHaveAttribute("href", "/v/loja-exemplo/privacidade");
    expect(link).not.toHaveAttribute("target");
    expect(link).toHaveClass("min-h-11");
  });
});
