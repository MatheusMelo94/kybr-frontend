import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { EmailCard } from "@/features/panel-alertas/components/email-card";
import { MonHeader } from "@/features/panel-alertas/components/mon-header";
import { MonSkeleton } from "@/features/panel-alertas/components/mon-skeleton";
import { formatProximaVarredura } from "@/features/panel-alertas/format";

const MONITORED = {
  ativo: true,
  monitorados: 12,
  ultima_varredura: "2026-10-05T09:00:00.000Z",
  proxima_varredura: "2026-10-12T09:00:00.000Z",
};

describe("formatProximaVarredura (G3)", () => {
  it("the full weekday and a 24 h time, in São Paulo", () => {
    expect(formatProximaVarredura("2026-10-12T09:00:00.000Z")).toEqual({
      dia_semana: "segunda-feira",
      hora: "06:00",
    });
    expect(formatProximaVarredura("2026-10-14T02:30:00Z")).toEqual({
      dia_semana: "terça-feira",
      hora: "23:30",
    });
  });
});

describe("MonHeader (S8, AC 48 pill half)", () => {
  it("the h1, the lead and the pill with mon.status.on", () => {
    render(<MonHeader monitoring={MONITORED} />);
    expect(
      screen.getByRole("heading", { level: 1, name: "Monitoramento" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Toda semana consultamos de novo os vendedores monitorados e avisamos o que mudou.",
      ),
    ).toBeInTheDocument();
    const pill = screen.getByText(
      "Ativo. Próxima varredura: segunda-feira, 06:00",
    );
    // DDR-0003: the neutral pill with the monitor dot (aria-hidden), ink text.
    const dot = pill.querySelector("[aria-hidden='true']");
    expect(dot).toHaveClass("bg-monitor");
    expect(pill).toHaveClass("text-ink");
  });

  it.each([
    ["nothing monitored", { ...MONITORED, monitorados: 0 }],
    ["inactive", { ...MONITORED, ativo: false }],
    ["status unavailable (G4)", undefined],
  ])("no pill when %s", (_, monitoring) => {
    render(<MonHeader monitoring={monitoring} />);
    expect(screen.queryByText(/^Ativo\./)).toBeNull();
    expect(document.querySelector(".bg-monitor")).toBeNull();
  });
});

describe("EmailCard (AC 50)", () => {
  it("mon.email.h, the login e-mail and mon.freq, read-only", () => {
    render(<EmailCard email="renata@exemplo.test" />);
    const card = screen.getByRole("region", { name: "Onde avisamos" });
    expect(
      within(card).getByText(
        "Alertas críticos chegam na hora por e-mail em renata@exemplo.test.",
      ),
    ).toBeInTheDocument();
    expect(
      within(card).getByText(
        "Varredura completa toda semana, segunda às 06:00. Vendedores marcados com pedido aberto pela API são consultados todo dia.",
      ),
    ).toBeInTheDocument();
    expect(
      card.querySelectorAll("input, button, select, textarea"),
    ).toHaveLength(0);
  });

  it("A-F2: hostile e-mail text stays text", () => {
    render(<EmailCard email={'<img src=x onerror="1">@exemplo.test'} />);
    expect(document.querySelector("img")).toBeNull();
  });
});

describe("MonSkeleton (T122 loading)", () => {
  it("a static pill, five rows and the card, hidden from assistive tech", () => {
    const { container } = render(<MonSkeleton />);
    expect(container.querySelectorAll("[data-skeleton-row]")).toHaveLength(5);
    expect(container.querySelector("[data-skeleton-pill]")).not.toBeNull();
    expect(container.querySelector("[data-skeleton-card]")).not.toBeNull();
    expect(container.querySelector(".animate-pulse")).toBeNull();
  });
});
