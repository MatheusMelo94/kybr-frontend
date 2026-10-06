import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { OriginChip } from "@/features/panel-fila/components/origin-chip";
import { SlaText } from "@/features/panel-fila/components/sla-text";
import { StatusWord } from "@/features/panel-lote/components/status-word";
import { CASE_STATUSES } from "@/lib/panel-api-values";

// G12: the list item's status is Lote's S7 status word (Tudo certo /
// Atenção / Crítico) beside its dot, reused as is (T96).
const NOW = "2026-10-06T14:00:00Z";

describe("the case status: Lote's StatusWord, reused (G12, DDR-0003)", () => {
  it.each([
    ["ok", "Tudo certo"],
    ["warn", "Atenção"],
    ["bad", "Crítico"],
  ] as const)("%s → an aria-hidden dot beside the word %s, in ink", (status, word) => {
    const { container } = render(<StatusWord status={status} />);
    expect(screen.getByText(word)).toBeInTheDocument();
    const dot = container.querySelector("[aria-hidden='true']");
    expect(dot).not.toBeNull();
    expect(dot?.parentElement).toHaveTextContent(word);
    expect(dot?.parentElement).toHaveClass("text-ink");
  });

  it("covers every case status", () => {
    expect(CASE_STATUSES).toEqual(["ok", "warn", "bad"]);
  });
});

describe("OriginChip (fila.origin.*)", () => {
  it.each([
    ["link", "Link"],
    ["lote", "Lote"],
    ["monitoramento", "Alerta"],
  ] as const)("%s → %s", (origem, text) => {
    render(<OriginChip origem={origem} />);
    expect(screen.getByText(text)).toBeInTheDocument();
  });
});

describe("SlaText (fila.sla.due / fila.sla.late, G12)", () => {
  it.each([
    ["2026-10-06T14:00:41Z", "Vence em 41 s"],
    ["2026-10-06T14:03:00Z", "Vence em 3 min"],
    ["2026-10-06T20:00:00Z", "Vence em 6 h"],
  ])("due at %s → %s, in ink, tabular figures", (slaAte, text) => {
    render(<SlaText slaAte={slaAte} vencido={false} now={NOW} />);
    const sla = screen.getByText(text);
    expect(sla).toHaveClass("text-ink-muted", "tabular-nums");
    expect(sla).not.toHaveClass("text-danger-ink");
  });

  it("late → Atrasado há {duracao}, in danger ink with the word (never color alone)", () => {
    render(<SlaText slaAte="2026-10-04T14:00:00Z" vencido now={NOW} />);
    const sla = screen.getByText("Atrasado há 2 dias");
    expect(sla).toHaveClass("text-danger-ink", "tabular-nums");
  });

  it("late per the API but ahead of its clock (skew) → Atrasado há 0 s", () => {
    render(<SlaText slaAte="2026-10-06T14:05:00Z" vencido now={NOW} />);
    expect(screen.getByText("Atrasado há 0 s")).toBeInTheDocument();
  });
});
