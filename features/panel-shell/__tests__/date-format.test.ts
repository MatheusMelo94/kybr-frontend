import { describe, expect, it } from "vitest";

import {
  formatDataHora,
  formatDuration,
  formatHora,
  formatRelativo,
} from "@/features/panel-shell/format";

// A fixed clock: 2026-03-10 14:00 in Brasília (UTC-3 all year, no DST since 2019).
const NOW = new Date("2026-03-10T17:00:00Z");

describe("the SLA's {duracao} reuses the panel's formatDuration (spec § Content & Copy › Durations)", () => {
  it.each([
    [41_000, "41 s"],
    [3 * 60_000, "3 min"],
    [6 * 3_600_000, "6 h"],
    [2 * 86_400_000, "2 dias"],
  ])("%d ms → %s", (ms, text) => {
    expect(formatDuration(ms)).toBe(text);
  });
});

describe("formatDataHora ({data_hora}: dd/mm, hh:mm, 24 h, Brasília)", () => {
  it.each([
    ["2026-03-10T14:37:00Z", "10/03, 11:37"],
    // 02:30 UTC is still the previous evening in Brasília.
    ["2026-03-10T02:30:00Z", "09/03, 23:30"],
    // January: once a DST month, now the same UTC-3 offset.
    ["2026-01-15T03:05:00Z", "15/01, 00:05"],
  ])("%s → %s", (iso, text) => {
    expect(formatDataHora(iso)).toBe(text);
  });
});

describe("formatRelativo (feed and timeline: hoje, ontem, há N dias)", () => {
  it.each([
    ["earlier today", "2026-03-10T14:37:00Z", "hoje, 11:37"],
    ["just after Brasília midnight", "2026-03-10T03:00:00Z", "hoje, 00:00"],
    [
      "just before Brasília midnight (UTC is already the 10th)",
      "2026-03-10T02:59:00Z",
      "ontem",
    ],
    ["yesterday morning", "2026-03-09T12:00:00Z", "ontem"],
    ["two calendar days ago", "2026-03-08T23:00:00Z", "há 2 dias"],
    ["three days ago", "2026-03-07T15:00:00Z", "há 3 dias"],
  ])("%s → %s", (_, iso, text) => {
    expect(formatRelativo(iso, NOW)).toBe(text);
  });

  it("counts calendar days in Brasília, not 24 h windows", () => {
    // 23:30 on the 9th vs 00:30 on the 10th: one hour, but "ontem".
    expect(
      formatRelativo("2026-03-10T02:30:00Z", new Date("2026-03-10T03:30:00Z")),
    ).toBe("ontem");
  });

  it("a date ahead of the clock (skew) on the same day is still today", () => {
    expect(formatRelativo("2026-03-10T17:05:00Z", NOW)).toBe("hoje, 14:05");
  });

  it("a date on a later day falls back to dd/mm, hh:mm", () => {
    expect(formatRelativo("2026-03-12T12:00:00Z", NOW)).toBe("12/03, 09:00");
  });
});

describe("formatHora (offline.panel's {hora}: hh:mm, 24 h, Brasília)", () => {
  it("reads the instant in Brasília time", () => {
    expect(formatHora(Date.parse("2026-10-06T13:05:00.000Z"))).toBe("10:05");
    expect(formatHora(Date.parse("2026-10-07T02:59:00.000Z"))).toBe("23:59");
  });
});
