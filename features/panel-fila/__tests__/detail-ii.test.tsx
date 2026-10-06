import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { BackLink } from "@/features/panel-fila/components/back-link";
import { CaseDetail } from "@/features/panel-fila/components/case-detail";
import { CaseDetailError } from "@/features/panel-fila/components/case-detail-error";
import { DecidedBanner } from "@/features/panel-fila/components/decided-banner";
import { DocumentList } from "@/features/panel-fila/components/document-list";
import { SellerBlock } from "@/features/panel-fila/components/seller-block";
import { Timeline } from "@/features/panel-fila/components/timeline";
import type { CaseView } from "@/lib/api/panel/cases";

// T101 (AC 28 detail half, AC 29 second half, AC 41 decided half): synthetic
// data only.

const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const NOW = new Date("2026-10-06T15:00:00Z");

function view(patch: Partial<CaseView> = {}): CaseView {
  return {
    id: "caso_0000000000000001",
    razao_social: "Empresa Exemplo Ltda",
    cnpj: "12.ABC.345/01DE-35",
    veredito: "revisar",
    status: "warn",
    motivos: [],
    origem: "link",
    sla_ate: "2026-10-06T18:00:00Z",
    vencido: false,
    criado_em: "2026-10-05T10:00:00Z",
    seller: {
      id: "vend_0000000000000001",
      razao_social: "Empresa Exemplo Ltda",
      cnpj: "12.ABC.345/01DE-35",
    },
    verification: {
      id: "verif_000000000000001",
      modo: "tempo_real",
      checagens: [],
      criado_em: "2026-10-05T13:37:00Z",
    },
    estado: "aberto",
    responsavel_informado: "Maria Exemplo",
    ext_id: "loja-0001",
    vendedor_tem_email: true,
    eventos: [],
    documentos: [],
    ...patch,
  };
}

describe("SellerBlock (AC 29)", () => {
  it("responsável, the ext_id with its help (aria-describedby), the e-mail yes", () => {
    render(<SellerBlock view={view()} />);
    expect(
      screen.getByRole("heading", { name: "Vendedor" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Responsável informado: Maria Exemplo"),
    ).toBeInTheDocument();
    const ext = screen.getByText(
      "ID na sua plataforma: loja-0001 (não verificado)",
    );
    const help = screen.getByText(
      "Esse valor vem do link e qualquer pessoa pode editá-lo. Confira o vendedor pelo CNPJ.",
    );
    expect(ext).toHaveAttribute("aria-describedby", help.id);
    expect(
      screen.getByText("O vendedor deixou e-mail para avisos."),
    ).toBeInTheDocument();
  });

  it("no responsável, no ext_id, no e-mail", () => {
    const bare = view({ vendedor_tem_email: false });
    delete bare.responsavel_informado;
    delete bare.ext_id;
    const { container } = render(<SellerBlock view={bare} />);
    expect(screen.queryByText(/^Responsável informado/)).toBeNull();
    expect(screen.queryByText(/^ID na sua plataforma/)).toBeNull();
    expect(
      screen.getByText(
        "O vendedor não deixou e-mail. Avisos sobre este caso precisam ser enviados por você.",
      ),
    ).toBeInTheDocument();
    expect(container.textContent).not.toContain("@");
  });
});

describe("DocumentList (AC 29, F1)", () => {
  it("each document: its name and date, and Abrir → the case's document route in a new tab", () => {
    render(
      <DocumentList
        caseId="caso_0000000000000001"
        documentos={[
          {
            id: "doc_00000000000000001",
            tipo: "CARTAO_CNPJ",
            enviadoEm: "2026-10-05T13:37:00Z",
          },
        ]}
      />,
    );
    expect(
      screen.getByText("Cartão CNPJ atualizado, enviado em 05/10, 10:37"),
    ).toBeInTheDocument();
    const open = screen.getByRole("link", {
      name: "Abrir (abre em outra aba)",
    });
    expect(open).toHaveAttribute(
      "href",
      "/fila/caso_0000000000000001/documentos/doc_00000000000000001",
    );
    expect(open).toHaveAttribute("target", "_blank");
    expect(open).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("none → fila.docs.empty", () => {
    render(<DocumentList caseId="caso_0000000000000001" documentos={[]} />);
    expect(screen.getByText("Nenhum documento enviado.")).toBeInTheDocument();
  });
});

describe("Timeline (AC 29, G1)", () => {
  it("newest first, the fila.event.* words, relative dates", () => {
    render(
      <Timeline
        now={NOW}
        eventos={[
          {
            tipo: "caso_criado",
            em: "2026-10-03T12:00:00Z",
            dados: { origem: "lote" },
          },
          {
            tipo: "documento_pedido",
            em: "2026-10-05T12:00:00Z",
            dados: { tipos: ["CARTAO_CNPJ", "COMPROVANTE_ENDERECO"] },
          },
          {
            tipo: "documento_recebido",
            em: "2026-10-06T14:37:00Z",
            dados: { tipo: "CARTAO_CNPJ" },
          },
          { tipo: "reverificado", em: "2026-10-04T12:00:00Z" },
          {
            tipo: "decidido",
            em: "2026-10-06T14:50:00Z",
            dados: { decisao: "manter" },
          },
        ]}
      />,
    );
    expect(
      screen.getByRole("heading", { name: "Histórico" }),
    ).toBeInTheDocument();
    const items = screen.getAllByRole("listitem").map((li) => li.textContent);
    expect(items).toEqual([
      expect.stringMatching(/^Mantido como aprovado.*hoje, 11:50$/),
      expect.stringMatching(
        /^Documento recebido: Cartão CNPJ atualizado.*hoje, 11:37$/,
      ),
      expect.stringMatching(
        /^Documento pedido: Cartão CNPJ atualizado, Comprovante de endereço da empresa.*ontem$/,
      ),
      expect.stringMatching(/^Consultado de novo.*há 2 dias$/),
      expect.stringMatching(/^Caso aberto pelo lote.*há 3 dias$/),
    ]);
  });
});

describe("DecidedBanner (AC 41)", () => {
  it("the decision, its reason and the note", () => {
    render(
      <DecidedBanner
        decisao={{
          tipo: "bloquear",
          em: "2026-10-05T13:37:00Z",
          motivo_codigo: "MEI",
          nota_vendedor: 'Diga "olá" <b>',
        }}
      />,
    );
    expect(
      screen.getByText("Decidido: Bloqueado em 05/10, 10:37."),
    ).toBeInTheDocument();
    expect(screen.getByText("Motivo: MEI acima do limite")).toBeInTheDocument();
    expect(
      screen.getByText('Mensagem ao vendedor: "Diga "olá" <b>"'),
    ).toBeInTheDocument();
  });

  it("approval: no reason, no note", () => {
    render(
      <DecidedBanner
        decisao={{ tipo: "aprovar", em: "2026-10-05T13:37:00Z" }}
      />,
    );
    expect(
      screen.getByText("Decidido: Aprovado em 05/10, 10:37."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/^Motivo/)).toBeNull();
  });
});

describe("BackLink", () => {
  it("fila.back → /fila with the tab, below lg only", () => {
    render(<BackLink search={{ aba: "aguardando", ate: 50 }} />);
    const link = screen.getByRole("link", { name: "Voltar para a fila" });
    expect(link).toHaveAttribute("href", "/fila?aba=aguardando&ate=50");
    expect(link.parentElement).toHaveClass("lg:hidden");
  });

  it("always shown on a decided case", () => {
    render(<BackLink search={{ aba: "aberto", ate: 25 }} always />);
    expect(
      screen.getByRole("link", { name: "Voltar para a fila" }).parentElement,
    ).not.toHaveClass("lg:hidden");
  });
});

describe("CaseDetail II: sections, partial, decided", () => {
  it("seller, documents and history in order", () => {
    render(<CaseDetail view={view()} now={NOW} />);
    const names = screen
      .getAllByRole("heading", { level: 3 })
      .map((h) => h.textContent);
    expect(names).toEqual(["Vendedor", "Documentos", "Histórico"]);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("history missing (eventos-falha): that block omitted, fila.detail.partial shown", () => {
    const partial = view();
    delete partial.eventos;
    render(<CaseDetail view={partial} now={NOW} />);
    expect(screen.queryByRole("heading", { name: "Histórico" })).toBeNull();
    expect(
      screen.getByText(
        "Parte do histórico não carregou. As decisões funcionam normalmente.",
      ),
    ).toBeInTheDocument();
  });

  it("documents missing: that block omitted, the notice shown", () => {
    const partial = view();
    delete partial.documentos;
    render(<CaseDetail view={partial} now={NOW} />);
    expect(screen.queryByRole("heading", { name: "Documentos" })).toBeNull();
    expect(screen.getByText(/^Parte do histórico não carregou/)).toBeVisible();
  });

  it("a decided case shows the banner", () => {
    render(
      <CaseDetail
        view={view({
          estado: "decidido",
          decisao: { tipo: "aprovar", em: "2026-10-05T13:37:00Z" },
        })}
        now={NOW}
      />,
    );
    expect(
      screen.getByText("Decidido: Aprovado em 05/10, 10:37."),
    ).toBeInTheDocument();
  });

  it("F11: no wire CNPJ and no e-mail reach the DOM", () => {
    const { container } = render(<CaseDetail view={view()} now={NOW} />);
    expect(container.textContent).not.toMatch(
      /(?<![.\/-])[0-9A-Z]{14}(?![.\/-])/,
    );
    expect(container.textContent).not.toContain("@");
  });
});

describe("CaseDetailError (AC 28)", () => {
  it("fila.detail.error as an alert; Tentar de novo refreshes", () => {
    render(<CaseDetailError />);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Não conseguimos abrir este caso.");
    fireEvent.click(
      within(alert).getByRole("button", { name: "Tentar de novo" }),
    );
    expect(router.refresh).toHaveBeenCalled();
  });
});
