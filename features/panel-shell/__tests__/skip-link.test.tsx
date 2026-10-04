import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SkipLink } from "@/features/panel-shell/components/skip-link";

describe("SkipLink (WCAG 2.4.1)", () => {
  it("jumps to main#conteudo, hidden until focused, with the token focus ring", () => {
    render(<SkipLink />);

    const link = screen.getByRole("link", { name: "Pular para o conteúdo" });
    expect(link).toHaveAttribute("href", "#conteudo");
    expect(link).toHaveClass(
      "sr-only",
      "focus:not-sr-only",
      "focus-visible:outline-focus",
    );
  });
});
