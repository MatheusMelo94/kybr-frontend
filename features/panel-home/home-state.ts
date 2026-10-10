import type { Dashboard } from "@/lib/api/schemas/panel/home";

// Início's state (spec S9 states table; plan-m8 G1, G10). Pure.

export type HomeState = "new" | "ready";

/** "new": nothing verified yet. Missing KPIs aren't proof of that: "ready". */
export function pickHomeState(dashboard: Pick<Dashboard, "kpis">): HomeState {
  return dashboard.kpis?.verificados === 0 ? "new" : "ready";
}

export type SummaryKey =
  | "home.summary.clear"
  | `home.summary.cases.${"one" | "other"}`
  | `home.summary.alerts.${"one" | "other"}`
  | `home.summary.both.${"one" | "other"}_${"one" | "other"}`;

const plural = (n: number): "one" | "other" => (n === 1 ? "one" : "other");

/** The summary line for the open cases (n) and the new critical alerts (m). */
export function summaryKey(cases: number, alerts: number): SummaryKey {
  if (cases > 0 && alerts > 0)
    return `home.summary.both.${plural(cases)}_${plural(alerts)}`;
  if (cases > 0) return `home.summary.cases.${plural(cases)}`;
  if (alerts > 0) return `home.summary.alerts.${plural(alerts)}`;
  return "home.summary.clear";
}
