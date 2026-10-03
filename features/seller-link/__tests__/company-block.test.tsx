import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CompanyBlock } from "@/features/seller-link/components/company-block";

const company = {
  razaoSocial: "JOAO CARLOS SILVA ***.***.***-**",
  atividade: "Comércio a varejo de peças",
  municipio: "Campinas",
  uf: "SP",
};

describe("CompanyBlock", () => {
  it("found: the name, the activity and the city, and no street address", () => {
    const { container } = render(
      <CompanyBlock state={{ status: "found", company }} />,
    );

    // The bold weight is checked in company-block-layout.spec.ts.
    expect(
      screen.getByText("JOAO CARLOS SILVA", { exact: false }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Atividade principal: Comércio a varejo de peças"),
    ).toBeInTheDocument();
    expect(screen.getByText("Campinas, SP")).toBeInTheDocument();
    expect(screen.getByText("CPF oculto")).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/rua|avenida|endere/i);
  });

  it.each([
    [
      "not_found",
      "Ainda não encontramos os dados dessa empresa. Você pode continuar: vamos conferir com calma.",
    ],
    [
      "failed",
      "Não conseguimos buscar os dados da empresa agora. Você pode continuar mesmo assim.",
    ],
  ] as const)("%s: shows its note in place of the block", (status, note) => {
    render(<CompanyBlock state={{ status }} />);

    expect(screen.getByText(note)).toBeInTheDocument();
  });

  it("loading: a hidden skeleton", () => {
    const { container } = render(
      <CompanyBlock state={{ status: "loading" }} />,
    );

    expect(container.querySelector('[aria-hidden="true"]')).not.toBeNull();
    expect(container.textContent).toBe("");
  });

  it("renders nothing while idle", () => {
    const { container } = render(<CompanyBlock state={{ status: "idle" }} />);

    expect(container).toBeEmptyDOMElement();
  });
});
