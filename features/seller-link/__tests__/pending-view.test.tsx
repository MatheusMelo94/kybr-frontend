import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PendingView } from "@/features/seller-link/components/case/pending-view";
import {
  publicCaseSchema,
  type CaseResult,
} from "@/lib/api/schemas/public-link";

const CREATED = "2026-10-01T12:00:00.000Z";
const DEADLINE = "2026-10-03T12:00:00.000Z"; // 03/10, 09:00 in Brasília
const SEFAZ_URL = "https://portal.fazenda.sp.gov.br/exemplo-regularizar-ie";
const RECEITA_URL = "https://www.gov.br/receitafederal/exemplo-regularizar";

function pending(resultado: Record<string, unknown>): CaseResult {
  const parsed = publicCaseSchema.parse({
    estado: "pending",
    criado_em: CREATED,
    resultado: {
      razao_social: "Comercial Exemplo Ltda.",
      responsavel: "Maria Exemplo Silva",
      consultado_em: CREATED,
      prazo_revisao: DEADLINE,
      ...resultado,
    },
  });
  if (!parsed.resultado) throw new Error("fixture without resultado");
  return parsed.resultado;
}

// S5: not a partner, no IE, activity out of category, young company.
const S5 = pending({
  itens: [
    {
      codigo: "DOCUMENTO_RESPONSAVEL",
      documento_tipo: "RESPONSAVEL",
      documentos_enviados: 0,
    },
    { codigo: "IE_NAO_ENCONTRADA", url_regularizacao: SEFAZ_URL },
    { codigo: "ATIVIDADE_FORA_DA_CATEGORIA" },
    { codigo: "EMPRESA_RECENTE", dias: 3 },
  ],
});

function items(): HTMLElement[] {
  return within(screen.getByRole("list")).getAllByRole("listitem");
}

/** The view's last line of content. */
function lastLine(container: HTMLElement): string | null | undefined {
  return container.firstElementChild?.lastElementChild?.textContent;
}

describe("PendingView (quase lá)", () => {
  it("AC 20 (S5): h1, body, one row per item with its code's copy, the deadline and the query date last", () => {
    const { container } = render(<PendingView resultado={S5} />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Quase lá" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Encontramos a empresa Comercial Exemplo Ltda.. Falta pouco para liberar seu cadastro:",
      ),
    ).toBeInTheDocument();
    expect(items().map((item) => item.textContent)).toEqual([
      "Maria Exemplo Silva não aparece entre os sócios da empresaEnvie o contrato social ou uma procuração.",
      "Inscrição estadual não encontradaSem ela, suas notas fiscais podem ser rejeitadas. Regularize na Secretaria da Fazenda do seu estado.Como regularizar (abre em outra aba)",
      "Atividade registrada fora da categoriaVamos conferir o que você vende. Você não precisa fazer nada agora.",
      "Empresa aberta há 3 diasEmpresas novas passam por uma revisão rápida. Você não precisa fazer nada agora.",
    ]);
    expect(
      screen.getByText(
        "Prazo da análise: até 03/10, 09:00. Avisamos por e-mail.",
      ),
    ).toBeInTheDocument();
    expect(lastLine(container)).toBe("Dados consultados em 01/10/2026.");
  });

  it("titles each item as a heading under the h1", () => {
    render(<PendingView resultado={S5} />);

    expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(4);
  });

  it("links Como regularizar to the gov.br URL in a new tab, only when there is one", () => {
    render(
      <PendingView
        resultado={pending({
          itens: [
            {
              codigo: "SITUACAO_IRREGULAR",
              situacao: "suspensa",
              url_regularizacao: RECEITA_URL,
            },
            { codigo: "IE_SUSPENSA" },
          ],
        })}
      />,
    );

    const links = screen.getAllByRole("link", {
      name: "Como regularizar (abre em outra aba)",
    });
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute("href", RECEITA_URL);
    expect(links[0]).toHaveAttribute("target", "_blank");
    expect(
      items().map((item) => item.querySelector("h2")?.textContent),
    ).toEqual([
      "Empresa suspensa na Receita Federal",
      "Inscrição estadual suspensa",
    ]);
  });

  it("uses the one-day title for a company opened yesterday, and MEI's copy", () => {
    render(
      <PendingView
        resultado={pending({
          itens: [{ codigo: "EMPRESA_RECENTE", dias: 1 }, { codigo: "MEI" }],
        })}
      />,
    );

    expect(items().map((item) => item.textContent)).toEqual([
      "Empresa aberta há 1 diaEmpresas novas passam por uma revisão rápida. Você não precisa fazer nada agora.",
      "Empresa MEIO MEI tem limite de faturamento por ano. Vamos conferir antes de liberar. Você não precisa fazer nada agora.",
    ]);
  });

  it.each([
    ["CONTRATO_SOCIAL_OU_CCMEI", "Contrato social ou CCMEI"],
    ["PROCURACAO", "Procuração do responsável"],
    ["COMPROVANTE_ENDERECO", "Comprovante de endereço da empresa"],
    ["CARTAO_CNPJ", "Cartão CNPJ atualizado"],
    ["RESPONSAVEL", "Contrato social ou procuração"],
  ])("AC 20 (v3): a requested %s is labeled %j", (documento_tipo, label) => {
    render(
      <PendingView
        resultado={pending({
          itens: [
            {
              codigo: "DOCUMENTO_SOLICITADO",
              documento_tipo,
              documentos_enviados: 0,
            },
          ],
        })}
      />,
    );

    expect(
      screen.getByRole("heading", { level: 2, name: label }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Precisamos deste documento para liberar seu cadastro."),
    ).toBeInTheDocument();
  });

  it("AC 20: QSA, veredito, política, CNAE and the raw codes appear nowhere", () => {
    const { container } = render(<PendingView resultado={S5} />);

    expect(container.textContent).not.toMatch(
      /QSA|veredito|política|CNAE|DOCUMENTO_|IE_NAO|ATIVIDADE_FORA|EMPRESA_RECENTE|RESPONSAVEL/,
    );
  });

  describe("AC 23: deadline vs all received", () => {
    it("shows pending.allreceived once every document item has a file, with the query date still last", () => {
      const { container } = render(
        <PendingView
          resultado={pending({
            itens: [
              {
                codigo: "DOCUMENTO_RESPONSAVEL",
                documento_tipo: "RESPONSAVEL",
                documentos_enviados: 2,
              },
              {
                codigo: "DOCUMENTO_SOLICITADO",
                documento_tipo: "CARTAO_CNPJ",
                documentos_enviados: 1,
              },
              { codigo: "MEI" },
            ],
          })}
        />,
      );

      expect(
        screen.getByText(
          "Recebemos tudo. Agora é com a gente: avisamos por e-mail até 03/10, 09:00.",
        ),
      ).toBeInTheDocument();
      expect(container.textContent).not.toContain("Prazo da análise");
      expect(lastLine(container)).toBe("Dados consultados em 01/10/2026.");
    });

    it("keeps the deadline while any document is still missing", () => {
      render(
        <PendingView
          resultado={pending({
            itens: [
              {
                codigo: "DOCUMENTO_RESPONSAVEL",
                documento_tipo: "RESPONSAVEL",
                documentos_enviados: 1,
              },
              {
                codigo: "DOCUMENTO_SOLICITADO",
                documento_tipo: "CARTAO_CNPJ",
                documentos_enviados: 0,
              },
            ],
          })}
        />,
      );

      expect(screen.getByText(/^Prazo da análise/)).toBeInTheDocument();
      expect(screen.queryByText(/^Recebemos tudo/)).toBeNull();
    });

    it("keeps the deadline when no document was requested", () => {
      render(
        <PendingView resultado={pending({ itens: [{ codigo: "MEI" }] })} />,
      );

      expect(screen.getByText(/^Prazo da análise/)).toBeInTheDocument();
    });
  });

  it("renders the business name through RazaoSocial: a CPF is masked and read as CPF oculto", () => {
    render(
      <PendingView
        resultado={pending({
          razao_social: "JOAO CARLOS SILVA 12345678909",
          itens: [{ codigo: "MEI" }],
        })}
      />,
    );

    expect(screen.getByText(/^Encontramos a empresa/).textContent).toBe(
      "Encontramos a empresa JOAO CARLOS SILVA ***.***.***-**CPF oculto. Falta pouco para liberar seu cadastro:",
    );
  });

  it("AC 18 (no company data): pending.body.nodata, the requested document, and no query date", () => {
    const { container } = render(
      <PendingView
        resultado={pending({
          razao_social: undefined,
          consultado_em: undefined,
          variante: "DADOS_NAO_ENCONTRADOS",
          itens: [
            {
              codigo: "DOCUMENTO_SOLICITADO",
              documento_tipo: "CONTRATO_SOCIAL_OU_CCMEI",
              documentos_enviados: 0,
            },
          ],
        })}
      />,
    );

    expect(
      screen.getByText("Falta pouco para liberar seu cadastro:"),
    ).toBeInTheDocument();
    expect(container.textContent).not.toContain("Encontramos a empresa");
    expect(container.textContent).not.toContain("Dados consultados");
    expect(
      screen.getByRole("heading", {
        level: 2,
        name: "Contrato social ou CCMEI",
      }),
    ).toBeInTheDocument();
    expect(lastLine(container)).toBe(
      "Prazo da análise: até 03/10, 09:00. Avisamos por e-mail.",
    );
  });

  it("leaves slots: the document action inside document items only, the e-mail block before the deadline", () => {
    const { container } = render(
      <PendingView
        resultado={S5}
        documentAction={(item) => (
          <button type="button">{item.documento_tipo}</button>
        )}
        emailBlock={<section aria-label="e-mail" />}
      />,
    );

    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(
      within(items()[0] as HTMLElement).getByRole("button"),
    ).toHaveTextContent("RESPONSAVEL");
    const email = screen.getByRole("region", { name: "e-mail" });
    const deadline = screen.getByText(/^Prazo da análise/);
    expect(
      email.compareDocumentPosition(deadline) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      screen.getByRole("list").compareDocumentPosition(email) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(lastLine(container)).toBe("Dados consultados em 01/10/2026.");
  });
});
