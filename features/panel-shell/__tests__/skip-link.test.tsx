import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SkipLink } from "@/features/panel-shell/components/skip-link";

describe("SkipLink (WCAG 2.4.1)", () => {
  // Hidden until focused, and its focus ring: primitives.spec (Playwright).
  it("jumps to main#conteudo", () => {
    render(<SkipLink />);

    const link = screen.getByRole("link", { name: "Pular para o conteúdo" });
    expect(link).toHaveAttribute("href", "#conteudo");
  });
});
