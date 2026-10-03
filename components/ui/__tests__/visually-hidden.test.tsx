import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { VisuallyHidden } from "@/components/ui/visually-hidden";

describe("VisuallyHidden", () => {
  it("keeps its text for assistive technology while hiding it visually", () => {
    render(
      <button type="button">
        Enviar <VisuallyHidden>documento</VisuallyHidden>
      </button>,
    );

    expect(
      screen.getByRole("button", { name: "Enviar documento" }),
    ).toBeInTheDocument();
    expect(screen.getByText("documento")).toHaveClass("sr-only");
  });
});
