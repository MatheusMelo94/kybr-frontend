import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AlertList } from "@/features/panel-alertas/components/alert-list";
import { AlertRow } from "@/features/panel-alertas/components/alert-row";
import type { Alert } from "@/lib/api/schemas/panel/alerts";

// Synthetic data only; CNPJs arrive masked from the data layer (A-F1).
const NOW = new Date("2026-10-07T15:00:00Z"); // 12:00 in Brasília
const CASE_ID = "b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e";

function alert(
  overrides: Partial<Alert> & Pick<Alert, "tipo" | "dados">,
): Alert {
  return {
    id: crypto.randomUUID(),
    severidade: "info",
    seller: {
      id: "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
      razao_social: "Empresa Exemplo Ltda",
      cnpj: "12.ABC.345/01DE-35",
    },
    detectado_em: "2026-10-07T13:37:00Z",
    ...overrides,
  } as Alert;
}

describe("AlertRow: the seven sentences (AC 48, AC 52)", () => {
  it.each([
    [
      alert({
        tipo: "SITUACAO_IRREGULAR",
        severidade: "critico",
        dados: { situacao: "inapta" },
        case_id: CASE_ID,
      }),
      "Empresa Exemplo Ltda ficou inapta na Receita.",
    ],
    [
      alert({
        tipo: "IE_SUSPENSA",
        severidade: "critico",
        dados: { estado_ie: "cancelada", uf: "SP" },
        case_id: CASE_ID,
      }),
      "Empresa Exemplo Ltda teve a inscrição estadual cancelada em SP.",
    ],
    [
      alert({
        tipo: "RESPONSAVEL_SAIU_QSA",
        severidade: "atencao",
        dados: { responsavel: "Pessoa Exemplo" },
      }),
      "Pessoa Exemplo saiu do quadro de sócios de Empresa Exemplo Ltda.",
    ],
    [
      alert({ tipo: "QSA_MUDOU", dados: {} }),
      "Empresa Exemplo Ltda mudou o quadro de sócios.",
    ],
    [
      alert({
        tipo: "CNAE_MUDOU",
        severidade: "atencao",
        dados: { cnae: "47.89-0-99 Comércio varejista" },
      }),
      "Empresa Exemplo Ltda mudou a atividade principal para 47.89-0-99 Comércio varejista.",
    ],
    [
      alert({
        tipo: "REGIME_MUDOU",
        dados: { de: "MEI", para: "Simples Nacional" },
      }),
      "Empresa Exemplo Ltda passou de MEI para Simples Nacional.",
    ],
    [
      alert({ tipo: "WEBHOOK_FALHOU", severidade: "atencao", dados: {} }),
      "O webhook não respondeu ao avisar sobre Empresa Exemplo Ltda. Confira em Integrações.",
    ],
  ])("%#: the sentence names the article", (item, sentence) => {
    render(<AlertRow alert={item} now={NOW} />);
    expect(screen.getByRole("article", { name: sentence })).toBeInTheDocument();
  });

  it("G1: a null razão social → the masked CNPJ in its place", () => {
    render(
      <AlertRow
        alert={alert({
          tipo: "QSA_MUDOU",
          dados: {},
          seller: {
            id: "x".repeat(16),
            razao_social: null,
            cnpj: "12.ABC.345/01DE-35",
          },
        })}
        now={NOW}
      />,
    );
    expect(
      screen.getByText("12.ABC.345/01DE-35 mudou o quadro de sócios."),
    ).toBeInTheDocument();
  });

  it("A-F2: hostile dados stay text", () => {
    render(
      <AlertRow
        alert={alert({
          tipo: "RESPONSAVEL_SAIU_QSA",
          dados: { responsavel: '<img src=x onerror="alert(1)">' },
        })}
        now={NOW}
      />,
    );
    expect(document.querySelector("img")).toBeNull();
    expect(screen.getByText(/^<img src=x/)).toBeInTheDocument();
  });
});

describe("AlertRow: severity, date, flag and case link", () => {
  it.each([
    ["critico", "Crítico", "bg-danger"],
    ["atencao", "Atenção", "bg-warning"],
    ["info", "Informativo", "bg-ink-muted"],
  ] as const)(
    "%s: the word beside an aria-hidden dot (AC 71)",
    (sev, word, tone) => {
      render(
        <AlertRow
          alert={alert({ tipo: "QSA_MUDOU", dados: {}, severidade: sev })}
          now={NOW}
        />,
      );
      const label = screen.getByText(word);
      const dot = label.parentElement?.querySelector("[aria-hidden='true']");
      expect(dot).toHaveClass(tone);
    },
  );

  it("a relative date in a <time dateTime>", () => {
    render(
      <AlertRow alert={alert({ tipo: "QSA_MUDOU", dados: {} })} now={NOW} />,
    );
    const time = screen.getByText("hoje, 10:37");
    expect(time.tagName).toBe("TIME");
    expect(time).toHaveAttribute("dateTime", "2026-10-07T13:37:00Z");
  });

  it("alert.pedido_aberto when flagged, and only then", () => {
    const { rerender } = render(
      <AlertRow
        alert={alert({ tipo: "QSA_MUDOU", dados: {}, pedido_aberto: true })}
        now={NOW}
      />,
    );
    expect(screen.getByText("Com pedido aberto")).toBeInTheDocument();
    rerender(
      <AlertRow alert={alert({ tipo: "QSA_MUDOU", dados: {} })} now={NOW} />,
    );
    expect(screen.queryByText("Com pedido aberto")).toBeNull();
  });

  it("an open case: Decidir → /fila/{case_id}", () => {
    render(
      <AlertRow
        alert={alert({
          tipo: "SITUACAO_IRREGULAR",
          severidade: "critico",
          dados: { situacao: "inapta" },
          case_id: CASE_ID,
        })}
        now={NOW}
      />,
    );
    expect(screen.getByRole("link", { name: "Decidir" })).toHaveAttribute(
      "href",
      `/fila/${CASE_ID}`,
    );
  });

  it.each([
    ["aprovar", "Decidido: Aprovado"],
    ["manter", "Decidido: Mantido como aprovado"],
    ["bloquear", "Decidido: Bloqueado"],
  ] as const)("G2: decided %s → %s, no link", (decisao, text) => {
    render(
      <AlertRow
        alert={alert({
          tipo: "SITUACAO_IRREGULAR",
          severidade: "critico",
          dados: { situacao: "inapta" },
          case_id: CASE_ID,
          case_decisao: decisao,
        })}
        now={NOW}
      />,
    );
    expect(screen.getByText(text)).toBeInTheDocument();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("AC 52: WEBHOOK_FALHOU has no case link at all", () => {
    render(
      <AlertRow
        alert={alert({
          tipo: "WEBHOOK_FALHOU",
          severidade: "atencao",
          dados: {},
        })}
        now={NOW}
      />,
    );
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.queryByText(/^Decidido/)).toBeNull();
  });
});

describe("AlertList (S8)", () => {
  it("mon.alerts.h, mon.alerts.sub and a list of articles in the API's order", () => {
    const items = [
      alert({
        tipo: "QSA_MUDOU",
        dados: {},
        seller: {
          id: "a".repeat(16),
          razao_social: "Primeira Ltda",
          cnpj: "12.ABC.345/01DE-35",
        },
      }),
      alert({
        tipo: "QSA_MUDOU",
        dados: {},
        seller: {
          id: "b".repeat(16),
          razao_social: "Segunda Ltda",
          cnpj: "12.ABC.345/01DE-35",
        },
      }),
    ];
    render(<AlertList alerts={items} now={NOW} />);
    const section = screen.getByRole("region", { name: "Alertas" });
    expect(
      within(section).getByText("Mudanças encontradas nas últimas varreduras."),
    ).toBeInTheDocument();
    const rows = within(within(section).getByRole("list")).getAllByRole(
      "listitem",
    );
    expect(
      rows.map((row) =>
        within(row).getByRole("article").getAttribute("aria-labelledby"),
      ),
    ).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("Primeira Ltda");
    expect(rows[1]).toHaveTextContent("Segunda Ltda");
  });
});
