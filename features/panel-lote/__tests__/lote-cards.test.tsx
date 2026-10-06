import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CostCard } from "@/features/panel-lote/components/cost-card";
import { HistoryList } from "@/features/panel-lote/components/history-list";
import { LoteSkeleton } from "@/features/panel-lote/components/lote-skeleton";
import { WhyCard } from "@/features/panel-lote/components/why-card";

const ID_1 = "3f2a1b4c-5d6e-4f70-8a9b-0c1d2e3f4a5b";
const ID_2 = "4a3b2c1d-6e5f-4a70-9b8c-1d2e3f4a5b6c";

describe("CostCard (S7 empty, AC 14)", () => {
  it("shows the cost line and the remaining checks (limite − usadas)", () => {
    render(
      <CostCard
        plano={{ tipo: "pago", nome: "Essencial", usadas: 1240, limite: 5000 }}
      />,
    );
    expect(
      screen.getByText("Cada CNPJ consome uma verificação do seu plano."),
    ).toBeVisible();
    expect(
      screen.getByText("Você tem 3.760 verificações disponíveis."),
    ).toBeVisible();
  });

  it("one left reads in the singular; none left reads 0 (pt-BR: one)", () => {
    const { rerender } = render(
      <CostCard plano={{ tipo: "teste", usadas: 199, limite: 200 }} />,
    );
    expect(
      screen.getByText("Você tem 1 verificação disponível."),
    ).toBeVisible();
    rerender(<CostCard plano={{ tipo: "teste", usadas: 210, limite: 200 }} />);
    expect(
      screen.getByText("Você tem 0 verificação disponível."),
    ).toBeVisible();
  });

  it("hides the remaining line without a plano", () => {
    render(<CostCard plano={undefined} />);
    expect(
      screen.getByText("Cada CNPJ consome uma verificação do seu plano."),
    ).toBeVisible();
    expect(screen.queryByText(/Você tem/)).not.toBeInTheDocument();
  });
});

describe("WhyCard, generic (S7 empty)", () => {
  it("lote.why.h, .sub and the three generic lines", () => {
    render(<WhyCard />);
    expect(
      screen.getByRole("heading", { level: 2, name: "O que isso resolve" }),
    ).toBeVisible();
    expect(
      screen.getByText("A base que já existe nunca foi checada."),
    ).toBeVisible();
    const items = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(items.map((item) => item.textContent)).toEqual([
      "Empresas inaptas ou baixadas que ainda vendem na plataforma.",
      "Vendedores sem inscrição estadual, com risco de nota fiscal rejeitada.",
      "Atividade fora da sua categoria.",
    ]);
  });
});

describe("HistoryList (D-B6)", () => {
  it("lists newest first, dd/mm/aaaa and {total}, each a link; a running one says so", () => {
    render(
      <HistoryList
        history={[
          {
            id: ID_1,
            total: 1240,
            estado: "processando",
            iniciado_em: "2026-10-05T23:30:00-03:00",
          },
          {
            id: ID_2,
            total: 184,
            estado: "concluido",
            iniciado_em: "2026-10-01T10:00:00-03:00",
            concluido_em: "2026-10-01T10:02:41-03:00",
          },
        ]}
      />,
    );
    expect(
      screen.getByRole("heading", { level: 2, name: "Lotes anteriores" }),
    ).toBeVisible();
    const links = screen.getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      `/lote/${ID_1}`,
      `/lote/${ID_2}`,
    ]);
    expect(links[0]).toHaveAccessibleName(
      "05/10/2026: 1.240 CNPJs Em andamento",
    );
    expect(links[1]).toHaveAccessibleName("01/10/2026: 184 CNPJs");
  });

  it("is hidden when there are none", () => {
    const { container } = render(<HistoryList history={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("a failed read shows lote.history.error inline", () => {
    render(<HistoryList history={undefined} />);
    expect(
      screen.getByText("Não conseguimos carregar os lotes anteriores."),
    ).toBeVisible();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});

describe("LoteSkeleton (S7 loading)", () => {
  it("a static skeleton of the drop zone card and the side card (no shimmer)", () => {
    const { container } = render(<LoteSkeleton />);
    expect(screen.getByTestId("lote-skeleton")).toBeInTheDocument();
    expect(container.innerHTML).not.toMatch(/animate-/);
  });
});
