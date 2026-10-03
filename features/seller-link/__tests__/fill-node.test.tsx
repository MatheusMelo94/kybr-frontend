import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { fillNode } from "@/features/seller-link/fill-node";

describe("fillNode", () => {
  it("fills placeholders with text or elements, keeping the sentence whole", () => {
    const { container } = render(
      <p>
        {fillNode("A empresa {razao_social} consta como {situacao}.", {
          razao_social: <strong>Exemplo Ltda.</strong>,
          situacao: "inapta",
        })}
      </p>,
    );

    expect(container.textContent).toBe(
      "A empresa Exemplo Ltda. consta como inapta.",
    );
    expect(container.querySelector("strong")?.textContent).toBe(
      "Exemplo Ltda.",
    );
  });

  it("fills the same placeholder twice", () => {
    const { container } = render(
      <p>{fillNode("{a} e {a}", { a: <em>x</em> })}</p>,
    );

    expect(container.querySelectorAll("em")).toHaveLength(2);
    expect(container.textContent).toBe("x e x");
  });
});
