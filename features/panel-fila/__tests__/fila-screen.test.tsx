import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DetailSkeleton } from "@/features/panel-fila/components/detail-skeleton";
import { FilaHeader } from "@/features/panel-fila/components/fila-header";
import { FilaScreen } from "@/features/panel-fila/components/fila-screen";
import { ListSkeleton } from "@/features/panel-fila/components/list-skeleton";
import type { Contagens } from "@/lib/api/schemas/panel/me";

const COUNTS: Contagens = {
  fila_abertos: 30,
  fila_vencidos: 4,
  fila_aguardando: 3,
  alertas_criticos_abertos: 0,
  vendedores: 120,
  lote_em_andamento: false,
};
const TRIAL = { tipo: "teste" as const, usadas: 40, limite: 200 };

describe("FilaHeader (T97, spec S6)", () => {
  it("shows fila.h1, fila.lead and the pills from /me contagens", () => {
    render(<FilaHeader contagens={COUNTS} />);
    expect(
      screen.getByRole("heading", { level: 1, name: "Fila de revisão" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Casos que as regras não decidiram sozinhas. Mais antigo primeiro.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("30 abertos")).toBeInTheDocument();
    expect(screen.getByText("4 fora do prazo")).toBeInTheDocument();
  });

  it("the late pill has the bad dot beside its text (DDR-0003)", () => {
    render(<FilaHeader contagens={COUNTS} />);
    const late = screen.getByText("4 fora do prazo").closest("span[data-pill]");
    expect(late?.querySelector("[aria-hidden='true']")).not.toBeNull();
    expect(late).toHaveClass("text-ink");
  });

  it("plurals: 1 aberto; no late pill when nothing is late", () => {
    render(
      <FilaHeader
        contagens={{ ...COUNTS, fila_abertos: 1, fila_vencidos: 0 }}
      />,
    );
    expect(screen.getByText("1 aberto")).toBeInTheDocument();
    expect(screen.queryByText(/fora do prazo/)).toBeNull();
  });

  it("no contagens → no pills", () => {
    const { container } = render(<FilaHeader contagens={undefined} />);
    expect(container.querySelector("[data-pill]")).toBeNull();
  });

  it("on a case (below lg) the title is display: none, so the case's name is the only h1 (D9, P6-002)", () => {
    render(<FilaHeader contagens={COUNTS} caseOpen />);
    const heading = screen.getByRole("heading", { level: 1 });
    const title = heading.closest("[data-fila-title]");
    expect(title).toHaveClass("max-lg:hidden");
    expect(title).not.toHaveClass("max-lg:sr-only");
  });

  it("on a case whose detail failed (no case name to head it) the title stays the h1, visually hidden below lg", () => {
    render(<FilaHeader contagens={COUNTS} caseOpen caseHeading={false} />);
    const heading = screen.getByRole("heading", { level: 1 });
    const title = heading.closest("[data-fila-title]");
    expect(title).toHaveClass("max-lg:sr-only");
    expect(title).not.toHaveClass("max-lg:hidden");
  });
});

describe("FilaScreen (T97)", () => {
  it("two panes: the list and the detail; the plan banner under the header (S5, Q10)", () => {
    render(
      <FilaScreen
        contagens={COUNTS}
        plano={{ ...TRIAL, usadas: 200 }}
        contratarHref={undefined}
        list={<p>lista</p>}
        detail={<p>detalhe</p>}
        caseOpen
      />,
    );
    const heading = screen.getByRole("heading", { level: 1 });
    const banner = screen.getByText(
      "As verificações do plano acabaram. Contrate para continuar verificando.",
    );
    expect(
      heading.compareDocumentPosition(banner) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.getByText("lista").closest("[data-pane='list']")).toHaveClass(
      "max-lg:hidden",
    );
    expect(
      screen.getByText("detalhe").closest("[data-pane='detail']"),
    ).not.toHaveClass("max-lg:hidden");
  });

  it("on /fila (no case) the list is the one pane below lg", () => {
    render(
      <FilaScreen
        contagens={COUNTS}
        plano={TRIAL}
        contratarHref={undefined}
        list={<p>lista</p>}
        detail={<p>detalhe</p>}
        caseOpen={false}
      />,
    );
    expect(
      screen.getByText("lista").closest("[data-pane='list']"),
    ).not.toHaveClass("max-lg:hidden");
    expect(
      screen.getByText("detalhe").closest("[data-pane='detail']"),
    ).toHaveClass("max-lg:hidden");
  });
});

describe("skeletons (DC § Screen States Matrix: static, fixed heights)", () => {
  it("ListSkeleton: 5 items, aria-hidden, no animation", () => {
    const { container } = render(<ListSkeleton />);
    const root = within(container).getByTestId("fila-list-skeleton");
    expect(root.querySelectorAll("[data-skeleton-item]")).toHaveLength(5);
    expect(container.innerHTML).not.toMatch(/animate-/);
  });

  it("DetailSkeleton renders static blocks", () => {
    const { container } = render(<DetailSkeleton />);
    expect(
      within(container).getByTestId("fila-detail-skeleton"),
    ).toBeInTheDocument();
    expect(container.innerHTML).not.toMatch(/animate-/);
  });
});

describe("CaseNotFound (AC 41, 73)", () => {
  it("fila.notfound.h, .body and Voltar para a fila → /fila", async () => {
    const { CaseNotFound } =
      await import("@/features/panel-fila/components/case-not-found");
    render(<CaseNotFound />);
    expect(
      screen.getByRole("heading", { level: 1, name: "Caso não encontrado" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Ele não existe ou não pertence a esta conta."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Voltar para a fila" }),
    ).toHaveAttribute("href", "/fila");
  });
});
