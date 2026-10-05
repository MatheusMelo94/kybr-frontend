import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AuthColumn } from "@/features/panel-auth/components/auth-column";

// Panel AC 75 (brand v1): S1–S4 show the Kybr wordmark, 80 px wide and named
// "Kybr", at the top of the auth column in place of the text "Kybr".

describe("AuthColumn", () => {
  it("opens with the wordmark lockup, named Kybr, and no visible 'Kybr' text", () => {
    const { container } = render(
      <AuthColumn>
        <h1>Entrar no Kybr</h1>
      </AuthColumn>,
    );

    const mark = screen.getByRole("img", { name: "Kybr" });
    expect(mark).toHaveAttribute("viewBox", "0 0 4964 2727");
    expect(mark).toHaveAttribute("width", "80");
    expect(screen.getByRole("main").firstElementChild).toContainElement(mark);
    expect(
      [...container.querySelectorAll("p")].map((p) => p.textContent),
    ).not.toContain("Kybr");
  });
});
