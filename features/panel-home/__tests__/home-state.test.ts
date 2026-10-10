import { describe, expect, it } from "vitest";

import { pickHomeState, summaryKey } from "@/features/panel-home/home-state";

// T132: pickHomeState and the summary keys (spec S9; plan-m8 G1, G10).

describe("pickHomeState", () => {
  it("is new when nothing was verified", () => {
    expect(
      pickHomeState({
        kpis: { verificados: 0, auto: 0, revisao: 0, bloqueados: 0 },
      }),
    ).toBe("new");
  });

  it("is ready when something was verified, or the KPIs failed", () => {
    expect(
      pickHomeState({
        kpis: { verificados: 1, auto: 1, revisao: 0, bloqueados: 0 },
      }),
    ).toBe("ready");
    expect(pickHomeState({})).toBe("ready");
  });
});

describe("summaryKey", () => {
  it.each([
    [0, 0, "home.summary.clear"],
    [1, 0, "home.summary.cases.one"],
    [3, 0, "home.summary.cases.other"],
    [0, 1, "home.summary.alerts.one"],
    [0, 2, "home.summary.alerts.other"],
    [1, 1, "home.summary.both.one_one"],
    [1, 2, "home.summary.both.one_other"],
    [2, 1, "home.summary.both.other_one"],
    [5, 4, "home.summary.both.other_other"],
  ] as const)("%i cases, %i alerts → %s", (cases, alerts, key) => {
    expect(summaryKey(cases, alerts)).toBe(key);
  });
});
