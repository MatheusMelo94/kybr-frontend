import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { fillNode } from "@/features/seller-link/fill-node";
import { RazaoSocial } from "@/features/seller-link/razao-social";

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

  describe("T23a: one period after a value that already ends with one", () => {
    it("drops the template's period after a text value ending in '.'", () => {
      const { container } = render(
        <p>
          {fillNode("Da empresa {x}. Falta pouco.", { x: "Exemplo Ltda." })}
        </p>,
      );

      expect(container.textContent).toBe(
        "Da empresa Exemplo Ltda. Falta pouco.",
      );
    });

    it("reads the value's trailing text through elements, including <RazaoSocial>", () => {
      const { container } = render(
        <p>
          {fillNode("{a} e {b}.", {
            a: <strong>Um S.A.</strong>,
            b: <RazaoSocial value="Comércio Exemplo S.A." />,
          })}
        </p>,
      );

      expect(container.textContent).toBe("Um S.A. e Comércio Exemplo S.A.");
    });

    it("keeps the template's period after a value without one", () => {
      const { container } = render(
        <p>
          {fillNode("Da empresa {x}.", {
            x: <RazaoSocial value="Exemplo ME" />,
          })}
        </p>,
      );

      expect(container.textContent).toBe("Da empresa Exemplo ME.");
    });

    it("leaves a masked CPF's nodes alone and still drops the doubled period", () => {
      const { container } = render(
        <p>
          {fillNode("Da empresa {x}.", {
            x: <RazaoSocial value="JOAO SILVA 12345678909 Ltda." />,
          })}
        </p>,
      );

      expect(container.querySelector('[aria-hidden="true"]')?.textContent).toBe(
        "***.***.***-**",
      );
      expect(container.textContent).toBe(
        "Da empresa JOAO SILVA ***.***.***-**CPF oculto Ltda.",
      );
    });

    it("only touches a period right after the value, not other punctuation", () => {
      const { container } = render(
        <p>{fillNode("{x}: ok. {x}, fim", { x: "Exemplo Ltda." })}</p>,
      );

      expect(container.textContent).toBe(
        "Exemplo Ltda.: ok. Exemplo Ltda., fim",
      );
    });
  });
});
