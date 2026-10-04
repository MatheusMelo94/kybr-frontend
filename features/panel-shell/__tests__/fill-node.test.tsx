import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { fillNodes } from "@/features/panel-shell/fill-node";

describe("fillNodes", () => {
  it("puts elements where the template's placeholders are, keeping the sentence whole", () => {
    render(
      <p>
        {fillNodes("Li e aceito os {termos} e a {privacidade}.", {
          termos: <a href="https://x.invalid/t">Termos de uso</a>,
          privacidade: (
            <a href="https://x.invalid/p">Política de privacidade</a>
          ),
        })}
      </p>,
    );

    expect(screen.getByText(/Li e aceito os/).textContent).toBe(
      "Li e aceito os Termos de uso e a Política de privacidade.",
    );
    expect(screen.getAllByRole("link")).toHaveLength(2);
  });
});
