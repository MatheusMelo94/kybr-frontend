import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CaseDetail } from "@/features/panel-fila/components/case-detail";
import { CheckList } from "@/features/panel-fila/components/check-list";
import { CountsPill } from "@/features/panel-fila/components/counts-pill";
import { VerdictHeader } from "@/features/panel-fila/components/verdict-header";
import type { CaseView } from "@/lib/api/panel/cases";

// T100 (AC 29 first half, 30, 31 display half, 32): synthetic data only.

type Check = CaseView["verification"]["checagens"][number];

const CHECKS: Check[] = [
  ["situacao", "ok"],
  ["qsa", "warn"],
  ["idade", "ok"],
  ["cnae", "bad"],
  ["ie", "ok"],
  ["regime", "warn"],
].map(([chave, status]) => ({
  chave: chave as Check["chave"],
  titulo: `Título ${chave}`,
  descricao: `Descrição ${chave}`,
  valor: `Valor ${chave}`,
  status: status as Check["status"],
}));

function view(patch: Partial<CaseView> = {}): CaseView {
  return {
    id: "caso_0000000000000001",
    razao_social: "Empresa Exemplo Ltda",
    cnpj: "12.ABC.345/01DE-35",
    veredito: "revisar",
    status: "warn",
    motivos: ["Sócio novo"],
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
      checagens: CHECKS,
      criado_em: "2026-10-05T13:37:00Z",
    },
    estado: "aberto",
    consultado_em: "2026-10-05T13:37:00Z",
    responsavel_informado: "Maria Exemplo",
    vendedor_tem_email: true,
    ...patch,
  };
}

describe("VerdictHeader (AC 29, identity.md § VerdictHeader, D9)", () => {
  it("the sr prefix + the verdict word in Veredito type beside a ≈ 16 px dot", () => {
    render(<VerdictHeader view={view()} />);
    const verdict = screen.getByText("Revisar");
    expect(verdict).toHaveClass("text-verdict");
    expect(verdict.parentElement).toHaveTextContent(
      "Resultado das regras: Revisar",
    );
    expect(screen.getByText("Resultado das regras:")).toHaveClass("sr-only");
    const dot = verdict.parentElement?.querySelector("[aria-hidden='true']");
    expect(dot).toHaveClass("size-4");
    expect(dot).toHaveClass("bg-warning");
  });

  it.each([
    ["aprovar", "Aprovar", "bg-success"],
    ["bloquear", "Bloquear", "bg-danger"],
  ] as const)("%s → %s with %s", (veredito, word, tone) => {
    render(<VerdictHeader view={view({ veredito })} />);
    const dot = screen
      .getByText(word)
      .parentElement?.querySelector("[aria-hidden='true']");
    expect(dot).toHaveClass(tone);
  });

  it("the razão social is an h1 below lg and an h2 at lg, both focus targets", () => {
    render(<VerdictHeader view={view()} />);
    const h1 = screen.getByRole("heading", {
      level: 1,
      name: "Empresa Exemplo Ltda",
    });
    const h2 = screen.getByRole("heading", {
      level: 2,
      name: "Empresa Exemplo Ltda",
    });
    expect(h1).toHaveClass("lg:hidden");
    expect(h2).toHaveClass("max-lg:hidden");
    for (const heading of [h1, h2]) {
      expect(heading).toHaveAttribute("tabindex", "-1");
      expect(heading).toHaveAttribute("data-detail-heading");
    }
  });

  it("no razão social → the masked CNPJ as the name (G3); the CNPJ tabular", () => {
    render(<VerdictHeader view={view({ razao_social: null })} />);
    expect(
      screen.getByRole("heading", { level: 2, name: "12.ABC.345/01DE-35" }),
    ).toBeInTheDocument();
  });

  it("the CNPJ line is muted and tabular", () => {
    render(<VerdictHeader view={view()} />);
    expect(screen.getByText("12.ABC.345/01DE-35")).toHaveClass("tabular-nums");
  });

  it("DADOS_NAO_ENCONTRADOS: fila.nodata.title in place of the word, no counts", () => {
    render(
      <VerdictHeader
        view={view({
          variante: "DADOS_NAO_ENCONTRADOS",
          verification: { ...view().verification, checagens: [] },
        })}
      />,
    );
    expect(screen.getByText("Sem dados da Receita")).toHaveClass(
      "text-verdict",
    );
    expect(screen.queryByText("Revisar")).toBeNull();
    expect(screen.queryByText(/atenção/)).toBeNull();
  });
});

describe("CountsPill (AC 29)", () => {
  it("one sentence for screen readers, three dot + number + word items on screen", () => {
    const { container } = render(<CountsPill checagens={CHECKS} />);
    expect(screen.getByText("3 ok, 2 atenção, 1 crítico")).toHaveClass(
      "sr-only",
    );
    const visual = container.querySelector("[aria-hidden='true'][data-counts]");
    expect(visual).not.toBeNull();
    const items = visual?.querySelectorAll("[data-count]") ?? [];
    expect([...items].map((item) => item.textContent)).toEqual([
      "3 ok",
      "2 atenção",
      "1 crítico",
    ]);
    for (const item of items)
      expect(item.querySelector("[aria-hidden='true']")).not.toBeNull();
  });
});

describe("CheckList (AC 30, C-M6-6)", () => {
  it("six checks: backend text as text, a status word each, two columns from 32 rem of container", () => {
    const { container } = render(<CheckList view={view()} />);
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(6);
    const qsa = items[1];
    if (!qsa) throw new Error("no qsa row");
    expect(within(qsa).getByText("Título qsa")).toBeInTheDocument();
    expect(within(qsa).getByText("Descrição qsa")).toBeInTheDocument();
    expect(within(qsa).getByText("Valor qsa")).toBeInTheDocument();
    expect(within(qsa).getByText("Atenção")).toBeInTheDocument();
    expect(container.querySelector("ul")).toHaveClass("@lg/detail:grid-cols-2");
  });

  it("a lote case without responsavel_informado: the QSA row says fila.check.qsa_missing", () => {
    const lote = view({ origem: "lote" });
    delete lote.responsavel_informado;
    render(<CheckList view={lote} />);
    const qsa = screen.getAllByRole("listitem")[1];
    if (!qsa) throw new Error("no qsa row");
    expect(
      within(qsa).getByText(
        "Não informado no lote. Peça o documento do responsável se precisar confirmar.",
      ),
    ).toBeInTheDocument();
    expect(within(qsa).queryByText("Valor qsa")).toBeNull();
  });

  it("markup from the backend stays text", () => {
    const [first, ...others] = CHECKS;
    if (!first) throw new Error("no check");
    const { container } = render(
      <CheckList
        view={view({
          verification: {
            ...view().verification,
            checagens: [
              { ...first, descricao: "<script>alert(1)</script>" },
              ...others,
            ],
          },
        })}
      />,
    );
    expect(container.querySelector("script")).toBeNull();
    expect(screen.getByText("<script>alert(1)</script>")).toBeInTheDocument();
  });
});

describe("CaseDetail (AC 31, 32)", () => {
  it("is the @container/detail; consulted with {data_hora}", () => {
    const { container } = render(
      <CaseDetail view={view()} now={new Date("2026-10-06T15:00:00Z")} />,
    );
    expect(container.firstElementChild).toHaveClass("@container/detail");
    expect(screen.getByText("Consultado em 05/10, 10:37")).toBeInTheDocument();
  });

  it("modo cache → fila.consulted.cache", () => {
    render(
      <CaseDetail
        now={new Date("2026-10-06T15:00:00Z")}
        view={view({
          verification: { ...view().verification, modo: "cache" },
        })}
      />,
    );
    expect(
      screen.getByText("Consultado em 05/10, 10:37, dados guardados"),
    ).toBeInTheDocument();
  });

  it("origem monitoramento: O que mudou above the checks", () => {
    render(
      <CaseDetail
        now={new Date("2026-10-06T15:00:00Z")}
        view={view({
          origem: "monitoramento",
          mudanca: {
            tipo: "SITUACAO_CADASTRAL",
            campo: "Situação",
            de: "ATIVA",
            para: "SUSPENSA",
            detectado_em: "2026-10-04T15:00:00Z",
          },
        })}
      />,
    );
    const change = screen.getByRole("heading", { name: "O que mudou" });
    expect(
      screen.getByText("Situação: antes ATIVA, agora SUSPENSA"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Encontrado na varredura de 04/10/2026."),
    ).toBeInTheDocument();
    const firstCheck = screen.getByText("Título situacao");
    expect(
      change.compareDocumentPosition(firstCheck) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("no O que mudou outside monitoramento", () => {
    render(<CaseDetail view={view()} now={new Date("2026-10-06T15:00:00Z")} />);
    expect(screen.queryByRole("heading", { name: "O que mudou" })).toBeNull();
  });

  it("DADOS_NAO_ENCONTRADOS: fila.nodata.body in place of the checks", () => {
    render(
      <CaseDetail
        now={new Date("2026-10-06T15:00:00Z")}
        view={view({
          variante: "DADOS_NAO_ENCONTRADOS",
          verification: { ...view().verification, checagens: [] },
        })}
      />,
    );
    expect(
      screen.getByText(
        "Ainda não encontramos registro deste CNPJ. Você pode pedir um documento, aprovar ou bloquear.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("Título situacao")).toBeNull();
  });
});
