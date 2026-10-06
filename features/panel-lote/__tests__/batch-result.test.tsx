import { render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/features/panel-lote/actions", () => ({
  sendToQueueAction: vi.fn(),
  monitorBatchAction: vi.fn(),
}));
vi.mock("@/features/panel-shell/use-session-expiry", () => ({
  useSessionExpiry: () => vi.fn(),
}));

import { BatchDonut } from "@/features/panel-lote/components/batch-donut";
import { BatchLegend } from "@/features/panel-lote/components/batch-legend";
import { BatchResult } from "@/features/panel-lote/components/batch-result";
import {
  BatchFocusKeeper,
  useBatchFocus,
} from "@/features/panel-lote/components/batch-focus-keeper";
import { ResultHeading } from "@/features/panel-lote/components/result-heading";
import { WhyCard } from "@/features/panel-lote/components/why-card";
import { ToastProvider } from "@/components/panel/toast";
import { formatDuration } from "@/features/panel-shell/format";
import { ShellStatusProvider } from "@/features/panel-shell/shell-status-context";
import type { Batch } from "@/lib/api/schemas/panel/batches";

const BATCH: Batch = {
  id: "3f2a1b4c-5d6e-4f70-8a9b-0c1d2e3f4a5b",
  estado: "concluido_com_erros",
  total: 184,
  processados: 184,
  contagens: { ok: 150, warn: 20, bad: 11, erro: 3 },
  iniciado_em: "2026-10-05T10:00:00-03:00",
  concluido_em: "2026-10-05T10:00:41-03:00",
  monitorado: false,
  enviado_para_fila: false,
  motivos_contagem: { inapta_baixada: 11, sem_ie: 9, cnae_fora: 0 },
};

describe("formatDuration (spec § Content & Copy › Durations)", () => {
  it.each([
    [0, "0 s"],
    [41_000, "41 s"],
    [59_400, "59 s"],
    [60_000, "1 min"],
    [3 * 60_000 + 20_000, "3 min"],
    [59 * 60_000, "59 min"],
    [2 * 3_600_000, "2 h"],
    [23 * 3_600_000, "23 h"],
    [24 * 3_600_000, "1 dia"],
    [50 * 3_600_000, "2 dias"],
  ])("%i ms → %s", (ms, text) => {
    expect(formatDuration(ms)).toBe(text);
  });
});

describe("BatchLegend (AC 20, 21, 69, 71, 76)", () => {
  it("four items: a dot (aria-hidden), the word in ink and the number, tabular", () => {
    render(<BatchLegend contagens={BATCH.contagens} />);
    const items = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(items.map((item) => item.textContent)).toEqual([
      "Tudo certo150",
      "Atenção20",
      "Crítico11",
      "Não consultados3",
    ]);
    for (const item of items) {
      expect(item.querySelector("[aria-hidden]")).not.toBeNull();
      expect(item).toHaveClass("text-ink");
      expect(item.querySelector(".tabular-nums")).not.toBeNull();
    }
  });

  it("Não consultados only when there are erro rows", () => {
    render(<BatchLegend contagens={{ ok: 3, warn: 0, bad: 0, erro: 0 }} />);
    expect(screen.queryByText("Não consultados")).not.toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
  });
});

describe("BatchDonut", () => {
  it("is aria-hidden, one arc per non-zero count, no text inside", () => {
    const { container } = render(
      <BatchDonut contagens={{ ok: 150, warn: 0, bad: 11, erro: 3 }} />,
    );
    const svg = container.querySelector("svg");
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg?.querySelectorAll("circle[data-arc]")).toHaveLength(3);
    expect(svg?.querySelector("text")).toBeNull();
    expect(svg?.textContent).toBe("");
  });

  it("arcs draw from @starting-style within --duration-slow; final at once under reduced motion", () => {
    const { container } = render(<BatchDonut contagens={BATCH.contagens} />);
    const arc = container.querySelector("circle[data-arc]");
    expect(arc?.getAttribute("class")).toContain("duration-(--duration-slow)");
    expect(arc?.getAttribute("class")).toContain(
      "motion-reduce:transition-none",
    );
    expect(arc?.getAttribute("class")).toContain("starting:");
  });
});

/** BatchResult holds BatchActions (T84): the shell and toast providers. */
function Shell({ children }: { children: ReactNode }) {
  return (
    <ShellStatusProvider initial={{ contagens: undefined, plano: undefined }}>
      <ToastProvider closeLabel="Fechar">{children}</ToastProvider>
    </ShellStatusProvider>
  );
}

describe("BatchResult (AC 20, 21; QA Q4)", () => {
  it("the summary counts the consulted rows: {total} = total − erro, with the duration", () => {
    render(
      <Shell>
        <BatchFocusKeeper>
          <BatchResult batch={BATCH} />
        </BatchFocusKeeper>
      </Shell>,
    );
    expect(screen.getByRole("heading", { name: "Resultado" })).toBeVisible();
    expect(
      screen.getByText("181 CNPJs consultados em 41 s.", { selector: "p" }),
    ).toBeVisible();
    expect(
      screen.getByText(
        "3 CNPJs não foram consultados e não consumiram verificações.",
      ),
    ).toBeVisible();
    // T86: both downloads, the errors one next to its line.
    expect(
      screen.getByRole("button", { name: "Baixar resultado (CSV)" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Baixar erros (CSV)" }),
    ).toBeVisible();
  });

  it("P5-003: a timestamp that isn't a date never reads NaN", () => {
    render(
      <Shell>
        <BatchFocusKeeper>
          <BatchResult batch={{ ...BATCH, concluido_em: "x" }} />
        </BatchFocusKeeper>
      </Shell>,
    );
    expect(document.body.textContent).not.toContain("NaN");
  });

  it("no errors line without erro rows", () => {
    render(
      <Shell>
        <BatchFocusKeeper>
          <BatchResult
            batch={{
              ...BATCH,
              estado: "concluido",
              contagens: { ok: 184, warn: 0, bad: 0, erro: 0 },
            }}
          />
        </BatchFocusKeeper>
      </Shell>,
    );
    expect(
      screen.queryByText(/não foram consultados|não foi consultado/),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Baixar resultado (CSV)" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Baixar erros (CSV)" }),
    ).not.toBeInTheDocument();
  });
});

describe("ResultHeading (AC 20 focus, plan M5 accessibility mechanics)", () => {
  function Ended({ inside }: { inside: boolean }) {
    const focus = useBatchFocus();
    focus.record(inside);
    return <ResultHeading summary="181 CNPJs consultados em 41 s." />;
  }

  it("takes focus when focus was in the progress region; announces the summary", () => {
    render(
      <BatchFocusKeeper>
        <Ended inside />
      </BatchFocusKeeper>,
    );
    expect(screen.getByRole("heading", { name: "Resultado" })).toHaveFocus();
    expect(screen.getByRole("status")).toHaveTextContent(
      "181 CNPJs consultados em 41 s.",
    );
  });

  it("otherwise leaves focus alone, and still announces", () => {
    render(
      <BatchFocusKeeper>
        <Ended inside={false} />
      </BatchFocusKeeper>,
    );
    expect(
      screen.getByRole("heading", { name: "Resultado" }),
    ).not.toHaveFocus();
    expect(screen.getByRole("status")).toHaveTextContent(
      "181 CNPJs consultados em 41 s.",
    );
  });

  it("on a cold load (no live end) it neither moves focus nor announces", () => {
    render(
      <BatchFocusKeeper>
        <ResultHeading summary="181 CNPJs consultados em 41 s." />
      </BatchFocusKeeper>,
    );
    expect(
      screen.getByRole("heading", { name: "Resultado" }),
    ).not.toHaveFocus();
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });
});

describe("WhyCard on a finished batch (contract C1)", () => {
  it("the real breakdown with descriptions; zero items hidden", () => {
    render(<WhyCard motivos={BATCH.motivos_contagem} />);
    expect(
      screen.getByRole("heading", { name: "O que isso resolve" }),
    ).toBeVisible();
    expect(screen.getByText("11 vendedores inaptos ou baixados")).toBeVisible();
    expect(
      screen.getByText(
        "Ainda ativos na loja. A nota fiscal deles pode estar sendo rejeitada.",
      ),
    ).toBeVisible();
    expect(screen.getByText("9 sem inscrição estadual")).toBeVisible();
    expect(
      screen.getByText("Risco de rejeição de NF-e em venda para outro estado."),
    ).toBeVisible();
    expect(
      screen.queryByText(/CNAE fora da categoria/),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("Atividade fora da sua categoria."),
    ).not.toBeInTheDocument();
  });

  it("singular forms", () => {
    render(
      <WhyCard motivos={{ inapta_baixada: 1, sem_ie: 1, cnae_fora: 1 }} />,
    );
    expect(screen.getByText("1 vendedor inapto ou baixado")).toBeVisible();
    expect(screen.getByText("1 sem inscrição estadual")).toBeVisible();
    expect(screen.getByText("1 com CNAE fora da categoria")).toBeVisible();
  });

  it.each([
    ["all zero", { inapta_baixada: 0, sem_ie: 0, cnae_fora: 0 }],
    ["missing", undefined],
  ])("%s → the generic card", (_, motivos) => {
    render(<WhyCard motivos={motivos} />);
    expect(screen.getByText("Atividade fora da sua categoria.")).toBeVisible();
  });
});
