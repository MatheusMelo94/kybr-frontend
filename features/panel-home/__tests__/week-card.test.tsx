import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { WeekCard } from "@/features/panel-home/components/week-card";
import { weekRows } from "@/features/panel-home/home-state";

// T134 (AC 54 chart half, D3): seven CSS bars, aria-hidden, plus a visually
// hidden table a screen reader reads instead.

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

// 2026-10-04 is a Sunday.
const SEMANA = [
  { dia: "2026-10-04", total: 0 },
  { dia: "2026-10-05", total: 10 },
  { dia: "2026-10-06", total: 5 },
  { dia: "2026-10-07", total: 1240 },
  { dia: "2026-10-08", total: 20 },
  { dia: "2026-10-09", total: 40 },
  { dia: "2026-10-10", total: 620 },
];

describe("weekRows (T134)", () => {
  it("names each day in pt-BR and scales against the max", () => {
    const rows = weekRows(SEMANA);
    expect(rows.map((row) => row.weekday)).toEqual([
      "domingo",
      "segunda-feira",
      "terça-feira",
      "quarta-feira",
      "quinta-feira",
      "sexta-feira",
      "sábado",
    ]);
    expect(rows[0]?.ratio).toBe(0);
    expect(rows[3]?.ratio).toBe(1);
    expect(rows[6]?.ratio).toBe(0.5);
  });

  it("an all-zero week is seven empty bars, not NaN", () => {
    const rows = weekRows(SEMANA.map((d) => ({ ...d, total: 0 })));
    expect(rows.every((row) => row.ratio === 0)).toBe(true);
  });
});

describe("WeekCard (T134)", () => {
  it("draws seven aria-hidden bars sized by --v", () => {
    const { container } = render(<WeekCard semana={SEMANA} />);
    const chart = container.querySelector("[data-week-bars]");
    expect(chart).toHaveAttribute("aria-hidden", "true");
    const bars = container.querySelectorAll<HTMLElement>("[data-week-bar]");
    expect(bars).toHaveLength(7);
    expect(bars[3]?.style.getPropertyValue("--v")).toBe("1");
    expect(bars[0]?.style.getPropertyValue("--v")).toBe("0");
    expect(bars[0]?.style.transform).toBe("scaleY(var(--v))");
  });

  it("a screen reader gets the table: seven rows, weekday and tabular count", () => {
    render(<WeekCard semana={SEMANA} />);
    const card = screen.getByRole("region", { name: "Semana" });
    const table = within(card).getByRole("table", {
      name: "Verificações por dia.",
    });
    const rows = within(table).getAllByRole("row");
    expect(rows).toHaveLength(7);
    expect(
      within(rows[3] as HTMLElement).getByRole("rowheader"),
    ).toHaveTextContent("quarta-feira");
    expect(within(rows[3] as HTMLElement).getByRole("cell")).toHaveTextContent(
      "1.240",
    );
    expect(table.parentElement).toHaveClass("sr-only");
  });

  it("PH3: a missing series shows the card error", () => {
    render(<WeekCard semana={undefined} />);
    const card = screen.getByRole("region", { name: "Semana" });
    expect(
      within(card).getByText("Esta parte não carregou."),
    ).toBeInTheDocument();
  });
});
