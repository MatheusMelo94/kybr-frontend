import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ApprovedView } from "@/features/seller-link/components/case/approved-view";
import {
  publicCaseSchema,
  type CaseResult,
} from "@/lib/api/schemas/public-link";

const CONSULTED = "2026-10-01T12:00:00.000Z"; // 09:00 in Brasília, same day

function approved(resultado: Record<string, unknown>): CaseResult {
  const parsed = publicCaseSchema.parse({
    estado: "approved",
    criado_em: CONSULTED,
    resultado,
  });
  if (!parsed.resultado) throw new Error("fixture without resultado");
  return parsed.resultado;
}

const S4 = approved({
  razao_social: "Comercial Exemplo Ltda.",
  responsavel: "Maria Exemplo Silva",
  consultado_em: CONSULTED,
  // Out of spec order on purpose: the rows follow the spec, not the API.
  confirmacoes: [
    { codigo: "RESPONSAVEL_CONFERE" },
    { codigo: "IE_ATIVA", uf: "SP" },
    { codigo: "SITUACAO_ATIVA" },
  ],
});

const NO_DATA = approved({
  responsavel: "Maria Exemplo Silva",
  variante: "DADOS_NAO_ENCONTRADOS",
});

function rows(): string[] {
  return within(screen.getByRole("list"))
    .getAllByRole("listitem")
    .map((row) => row.textContent ?? "");
}

describe("ApprovedView (tudo certo)", () => {
  it("AC 19: the seal reads 'Vendedor verificado por Kybr' (a dot, ink text, the inline wordmark), and the h1 uses the first name as typed", () => {
    render(<ApprovedView resultado={S4} marketplace="Loja Exemplo" />);

    const seal = screen.getByTestId("seal");
    expect(seal.querySelector('[aria-hidden="true"]')).toBeEmptyDOMElement();
    expect(within(seal).getByText("Vendedor verificado")).toBeVisible();
    expect(within(seal).getByText("por")).toBeVisible();
    expect(within(seal).getByRole("img", { name: "Kybr" })).toBeVisible();
    // Words separated by real spaces, so it reads "… verificado por Kybr".
    expect(seal.textContent).toBe("Vendedor verificado por ");
    // DDR-0003: the green is the dot only; the words are ink.
    expect(seal.innerHTML).not.toMatch(/text-success/);
    expect(
      screen.getByRole("heading", { level: 1, name: "Tudo certo, Maria." }),
    ).toBeInTheDocument();
  });

  it("AC 19: body, rows in spec order, the IE row with its UF, consulted date and next step", () => {
    render(<ApprovedView resultado={S4} marketplace="Loja Exemplo" />);

    expect(
      screen.getByText(
        "A empresa Comercial Exemplo Ltda. está liberada para vender.",
      ),
    ).toBeInTheDocument();
    expect(rows()).toEqual([
      "Situação na Receitaativa",
      "Inscrição estadualativa (SP)",
      "Responsávelconfere",
    ]);
    expect(
      screen.getByText("Dados consultados em 01/10/2026."),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Pode fechar esta página e voltar para o cadastro na plataforma Loja Exemplo.",
      ),
    ).toBeInTheDocument();
  });

  it("AC 19: shows only the confirmation rows returned", () => {
    render(
      <ApprovedView
        resultado={approved({
          ...S4,
          confirmacoes: [{ codigo: "SITUACAO_ATIVA" }],
        })}
        marketplace="Loja Exemplo"
      />,
    );

    expect(rows()).toEqual(["Situação na Receitaativa"]);
  });

  it("AC 19: no e-mail block, no Verificar outro CNPJ and no store-seal claim", () => {
    const { container } = render(
      <ApprovedView resultado={S4} marketplace="Loja Exemplo" />,
    );

    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
    expect(container.textContent).not.toMatch(/outro CNPJ|sua loja|e-mail/i);
  });

  it("every confirmation pill carries text next to its dot (never color alone)", () => {
    render(<ApprovedView resultado={S4} marketplace="Loja Exemplo" />);

    for (const row of within(screen.getByRole("list")).getAllByRole(
      "listitem",
    )) {
      const dot = row.querySelector('[aria-hidden="true"]');
      expect(dot).not.toBeNull();
      expect(dot?.parentElement?.textContent).toMatch(/ativa|confere/);
      // DDR-0003: a neutral pill with ink text; the green is the dot only.
      expect(row.innerHTML).not.toMatch(/text-success|bg-success\//);
    }
  });

  it("renders the business name through RazaoSocial: a CPF is masked and read as CPF oculto", () => {
    render(
      <ApprovedView
        resultado={approved({
          ...S4,
          razao_social: "JOAO CARLOS SILVA 12345678909",
        })}
        marketplace="Loja Exemplo"
      />,
    );

    const body = screen.getByText(/está liberada para vender/);
    expect(body.textContent).toBe(
      "A empresa JOAO CARLOS SILVA ***.***.***-**CPF oculto está liberada para vender.",
    );
    expect(within(body).getByText("***.***.***-**")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });

  describe("no company data (spec v3, AC 18)", () => {
    it("uses approved.body.nodata, leaves out results.consulted and renders no rows", () => {
      const { container } = render(
        <ApprovedView resultado={NO_DATA} marketplace="Loja Exemplo" />,
      );

      expect(
        screen.getByText("Sua empresa está liberada para vender."),
      ).toBeInTheDocument();
      expect(container.textContent).not.toContain("A empresa");
      expect(container.textContent).not.toContain("Dados consultados");
      expect(screen.queryByRole("list")).toBeNull();
      expect(
        screen.getByRole("heading", { level: 1, name: "Tudo certo, Maria." }),
      ).toBeInTheDocument();
    });

    it("still shows confirmation rows when some are returned", () => {
      render(
        <ApprovedView
          resultado={approved({
            responsavel: "Maria Exemplo Silva",
            variante: "DADOS_NAO_ENCONTRADOS",
            confirmacoes: [{ codigo: "RESPONSAVEL_CONFERE" }],
          })}
          marketplace="Loja Exemplo"
        />,
      );

      expect(rows()).toEqual(["Responsávelconfere"]);
    });
  });
});
