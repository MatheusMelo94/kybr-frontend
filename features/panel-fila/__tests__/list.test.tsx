import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CaseOption } from "@/features/panel-fila/components/case-option";
import { EmptyOpen } from "@/features/panel-fila/components/empty-open";
import { EmptyWaiting } from "@/features/panel-fila/components/empty-waiting";
import {
  FILA_TAB_ACTIVE_ID,
  FilaTabs,
} from "@/features/panel-fila/components/fila-tabs";
import { LIST_ITEM_HEIGHT } from "@/features/panel-fila/components/list-skeleton";
import { ListError } from "@/features/panel-fila/components/list-error";
import { LoadMoreLink } from "@/features/panel-fila/components/load-more-link";
import type { Contagens } from "@/lib/api/schemas/panel/me";

const router = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
  replace: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

beforeEach(() => {
  router.push.mockClear();
  router.refresh.mockClear();
});

const COUNTS: Contagens = {
  fila_abertos: 30,
  fila_vencidos: 4,
  fila_aguardando: 3,
  alertas_criticos_abertos: 0,
  vendedores: 120,
  lote_em_andamento: false,
};
const NOW = "2026-10-06T14:00:00Z";

describe("FilaTabs (AC 27, G13)", () => {
  it("two links with /me's counts; aria-current on the active one", () => {
    render(<FilaTabs aba="aberto" contagens={COUNTS} />);
    const open = screen.getByRole("link", { name: "Para decidir (30)" });
    const waiting = screen.getByRole("link", {
      name: "Aguardando vendedor (3)",
    });
    expect(open).toHaveAttribute("href", "/fila");
    expect(open).toHaveAttribute("aria-current", "page");
    expect(open).toHaveAttribute("id", FILA_TAB_ACTIVE_ID);
    expect(waiting).toHaveAttribute("href", "/fila?aba=aguardando");
    expect(waiting).not.toHaveAttribute("aria-current");
  });

  it("the waiting tab active", () => {
    render(<FilaTabs aba="aguardando" contagens={COUNTS} />);
    expect(
      screen.getByRole("link", { name: "Aguardando vendedor (3)" }),
    ).toHaveAttribute("aria-current", "page");
  });

  it("without contagens: the count-less keys (G13)", () => {
    render(<FilaTabs aba="aberto" contagens={undefined} />);
    expect(screen.getByRole("link", { name: "Para decidir" })).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Aguardando vendedor" }),
    ).toBeVisible();
  });

  it("a missing fila_aguardando drops only that count", () => {
    const rest: Contagens = { ...COUNTS };
    delete rest.fila_aguardando;
    render(<FilaTabs aba="aberto" contagens={rest} />);
    expect(
      screen.getByRole("link", { name: "Aguardando vendedor" }),
    ).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Para decidir (30)" }),
    ).toBeVisible();
  });
});

describe("CaseOption (AC 27, G3, G12)", () => {
  it("status word, razão social, reasons joined, origin chip, SLA", () => {
    const { container } = render(
      <CaseOption
        status="warn"
        razao="Empresa Exemplo Ltda"
        motivos={["Sócio novo", "CNAE diferente, revisar"]}
        origem="lote"
        slaAte="2026-10-06T20:00:00Z"
        vencido={false}
        now={NOW}
      />,
    );
    expect(screen.getByText("Atenção")).toBeInTheDocument();
    expect(screen.getByText("Empresa Exemplo Ltda")).toBeInTheDocument();
    expect(
      screen.getByText("Sócio novo, CNAE diferente, revisar"),
    ).toBeInTheDocument();
    expect(screen.getByText("Lote")).toBeInTheDocument();
    expect(screen.getByText("Vence em 6 h")).toBeInTheDocument();
    // At least the skeleton's h-19: 200 % text may grow it (AC 74).
    expect(container.firstElementChild).toHaveClass("min-h-19");
    expect(LIST_ITEM_HEIGHT).toBe("h-19");
  });

  it("late: the SLA in danger ink, with words", () => {
    render(
      <CaseOption
        status="bad"
        razao="12.ABC.345/01DE-35"
        motivos={[]}
        origem="monitoramento"
        slaAte="2026-10-04T14:00:00Z"
        vencido
        now={NOW}
      />,
    );
    expect(screen.getByText("Atrasado há 2 dias")).toHaveClass(
      "text-danger-ink",
    );
    expect(screen.getByText("12.ABC.345/01DE-35")).toBeInTheDocument();
    expect(screen.getByText("Alerta")).toBeInTheDocument();
  });

  it("markup in backend text stays text", () => {
    const { container } = render(
      <CaseOption
        status="ok"
        razao="<img src=x onerror=alert(1)>"
        motivos={["<b>x</b>"]}
        origem="link"
        slaAte={NOW}
        vencido={false}
        now={NOW}
      />,
    );
    expect(container.querySelector("img, b")).toBeNull();
    expect(screen.getByText("<img src=x onerror=alert(1)>")).toHaveClass(
      "truncate",
    );
  });
});

describe("LoadMoreLink (AC 27, plan D2)", () => {
  it('"Carregar mais {n}" → ate + 25, keeping the path and aba', () => {
    render(
      <LoadMoreLink
        base="/fila/caso-a"
        aba="aguardando"
        ate={25}
        remaining={5}
      />,
    );
    expect(
      screen.getByRole("link", { name: "Carregar mais 5" }),
    ).toHaveAttribute("href", "/fila/caso-a?aba=aguardando&ate=50");
  });

  it("at most 25 more", () => {
    render(<LoadMoreLink base="/fila" aba="aberto" ate={50} remaining={170} />);
    expect(
      screen.getByRole("link", { name: "Carregar mais 25" }),
    ).toHaveAttribute("href", "/fila?ate=75");
  });
});

describe("the empty states (AC 46)", () => {
  it("EmptyOpen: fila.empty.h/.body and Verificar em lote → /lote", () => {
    render(<EmptyOpen />);
    expect(
      screen.getByRole("heading", { level: 2, name: "Nenhum caso aberto" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Quando as regras mandarem um vendedor para revisão, ele aparece aqui.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Verificar em lote" }),
    ).toHaveAttribute("href", "/lote");
  });

  it("EmptyWaiting: fila.waiting.empty", () => {
    render(<EmptyWaiting />);
    expect(
      screen.getByText("Nenhum vendedor com documento pendente."),
    ).toBeInTheDocument();
  });
});

describe("ListError (AC 28)", () => {
  it("error.load.* as an alert, and Tentar de novo refreshes", () => {
    render(<ListError />);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Não carregou");
    expect(alert).toHaveTextContent("Confira sua conexão e tente de novo.");
    fireEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));
    expect(router.refresh).toHaveBeenCalledTimes(1);
  });
});
