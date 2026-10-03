import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { BlockedView } from "@/features/seller-link/components/case/blocked-view";
import type { PublicLink } from "@/lib/api/schemas/public-link";
import {
  publicCaseSchema,
  type CaseResult,
} from "@/lib/api/schemas/public-link";
import { toSafeHttpsUrl, type SafeHttpsUrl } from "@/lib/safe-url";

const CONSULTED = "2026-10-01T12:00:00.000Z";
const RECEITA_URL = "https://www.gov.br/receitafederal/exemplo-regularizar";
const SEFAZ_URL = "https://portal.fazenda.sp.gov.br/exemplo-regularizar-ie";

const EMAIL_CONTACT: PublicLink["contato_vendedor"] = {
  tipo: "email",
  valor: "vendedores@loja-exemplo.test",
};
const URL_CONTACT: PublicLink["contato_vendedor"] = {
  tipo: "url",
  valor: toSafeHttpsUrl("https://outra-loja.test/ajuda") as SafeHttpsUrl,
};

function blocked(resultado: Record<string, unknown>): CaseResult {
  const parsed = publicCaseSchema.parse({
    estado: "blocked",
    criado_em: CONSULTED,
    resultado: {
      razao_social: "Comercial Exemplo Ltda.",
      responsavel: "Maria Exemplo Silva",
      consultado_em: CONSULTED,
      ...resultado,
    },
  });
  if (!parsed.resultado) throw new Error("fixture without resultado");
  return parsed.resultado;
}

function renderBlocked(
  resultado: CaseResult,
  contact: PublicLink["contato_vendedor"] = EMAIL_CONTACT,
  marketplace = "Loja Exemplo",
): ReturnType<typeof render> {
  return render(
    <BlockedView
      resultado={resultado}
      marketplace={marketplace}
      contact={contact}
    />,
  );
}

describe("BlockedView (não aprovado)", () => {
  it("AC 25 (S6): the inapta reason, the Receita CTA in a new tab, the contact CTA and the query date", () => {
    renderBlocked(
      blocked({
        motivo: {
          codigo: "SITUACAO_IRREGULAR",
          situacao: "inapta",
          url_regularizacao: RECEITA_URL,
        },
      }),
    );

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Não conseguimos aprovar seu cadastro",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "A empresa Comercial Exemplo Ltda. consta como inapta na Receita Federal. Regularize a situação e volte a este link: ele continua valendo.",
      ),
    ).toBeInTheDocument();

    const receita = screen.getByRole("link", {
      name: "Regularizar na Receita Federal (abre em outra aba)",
    });
    expect(receita).toHaveAttribute("href", RECEITA_URL);
    expect(receita).toHaveAttribute("target", "_blank");
    expect(receita).toHaveAttribute("rel", "noopener noreferrer");

    const contact = screen.getByRole("link", {
      name: "Falar com Loja Exemplo",
    });
    expect(contact).toHaveAttribute(
      "href",
      "mailto:vendedores@loja-exemplo.test",
    );
    expect(contact).not.toHaveAttribute("target");

    expect(
      screen.getByText("Dados consultados em 01/10/2026."),
    ).toBeInTheDocument();
  });

  it.each([["IE_NAO_ENCONTRADA" as const], ["IE_SUSPENSA" as const]])(
    "%s with a URL shows Como regularizar in a new tab",
    (codigo) => {
      renderBlocked(
        blocked({ motivo: { codigo, url_regularizacao: SEFAZ_URL } }),
      );

      expect(
        screen.getByRole("link", {
          name: "Como regularizar (abre em outra aba)",
        }),
      ).toHaveAttribute("href", SEFAZ_URL);
    },
  );

  it("shows no regularize CTA without a URL, nor when the URL isn't on gov.br (F14)", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { unmount } = renderBlocked(
      blocked({ motivo: { codigo: "SITUACAO_IRREGULAR", situacao: "nula" } }),
    );
    expect(screen.getAllByRole("link")).toHaveLength(1);
    unmount();

    renderBlocked(
      blocked({
        motivo: {
          codigo: "IE_SUSPENSA",
          url_regularizacao: "https://sefaz.example.test/ie",
        },
      }),
    );
    expect(screen.queryByRole("link", { name: /regularizar/i })).toBeNull();
    vi.restoreAllMocks();
  });

  it.each([
    [
      { codigo: "RESPONSAVEL_NAO_SOCIO" },
      // The spec string ends with "{razao_social}.", so a name ending in
      // "Ltda." shows ".." (flagged for the UX Strategist; copy is verbatim).
      "Maria Exemplo Silva não aparece entre os sócios da empresa Comercial Exemplo Ltda..",
    ],
    [
      { codigo: "EMPRESA_RECENTE" },
      "A empresa Comercial Exemplo Ltda. foi aberta há pouco tempo. Por enquanto, empresas tão novas não são aceitas.",
    ],
    [
      { codigo: "ATIVIDADE_FORA_DA_CATEGORIA" },
      "A atividade registrada da empresa Comercial Exemplo Ltda. está fora da categoria aceita.",
    ],
    [
      { codigo: "IE_NAO_ENCONTRADA" },
      "A inscrição estadual da empresa Comercial Exemplo Ltda. não foi encontrada. Regularize e volte a este link: ele continua valendo.",
    ],
    [
      { codigo: "IE_SUSPENSA" },
      "A inscrição estadual da empresa Comercial Exemplo Ltda. está suspensa. Regularize e volte a este link: ele continua valendo.",
    ],
    [{ codigo: "MEI" }, "No momento, empresas MEI não são aceitas."],
    [{ codigo: "GENERICO" }, "Para saber como seguir, fale com Loja Exemplo."],
  ])("shows the reason copy for %j", (motivo, copy) => {
    renderBlocked(blocked({ motivo }));

    expect(screen.getByText(copy)).toBeInTheDocument();
  });

  it("S15: a case decided by ops shows the GENERICO reason", () => {
    renderBlocked(blocked({ motivo: { codigo: "GENERICO" } }));

    expect(
      screen.getByText("Para saber como seguir, fale com Loja Exemplo."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /regularizar/i })).toBeNull();
  });

  it("opens a URL contact in a new tab, with the screen-reader suffix", () => {
    renderBlocked(
      blocked({ motivo: { codigo: "GENERICO" } }),
      URL_CONTACT,
      "Outra Loja",
    );

    const contact = screen.getByRole("link", {
      name: "Falar com Outra Loja (abre em outra aba)",
    });
    expect(contact).toHaveAttribute("href", "https://outra-loja.test/ajuda");
    expect(contact).toHaveAttribute("target", "_blank");
  });

  it("renders the business name through RazaoSocial: a CPF is masked and read as CPF oculto", () => {
    renderBlocked(
      blocked({
        razao_social: "JOAO CARLOS SILVA 12345678909",
        motivo: { codigo: "EMPRESA_RECENTE" },
      }),
    );

    expect(screen.getByText(/foi aberta há pouco tempo/).textContent).toBe(
      "A empresa JOAO CARLOS SILVA ***.***.***-**CPF oculto foi aberta há pouco tempo. Por enquanto, empresas tão novas não são aceitas.",
    );
  });

  it("no company data: only GENERICO can show, and results.consulted is left out", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { container } = renderBlocked(
      blocked({
        razao_social: undefined,
        consultado_em: undefined,
        variante: "DADOS_NAO_ENCONTRADOS",
        motivo: { codigo: "ATIVIDADE_FORA_DA_CATEGORIA" },
      }),
    );

    expect(
      screen.getByText("Para saber como seguir, fale com Loja Exemplo."),
    ).toBeInTheDocument();
    expect(container.textContent).not.toContain("A empresa");
    expect(container.textContent).not.toContain("Dados consultados");
    vi.restoreAllMocks();
  });
});
