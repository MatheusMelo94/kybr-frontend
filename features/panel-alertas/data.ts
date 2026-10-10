import "server-only";

import { redirect } from "next/navigation";

import { AppError } from "@/lib/api/errors";
import { getMonitoring, listAlerts } from "@/lib/api/panel/alerts";
import { sessionExpiredUrl } from "@/lib/api/panel/session";
import type { AlertList, Monitoring } from "@/lib/api/schemas/panel/alerts";

// The Monitoramento page's reads: D-M1 and D-M2 in parallel, once per render
// (no poll, plan-m7 Q1). An ended session → /entrar (a navigation: ADR-0011
// Addendum 2 rule 5). A failed D-M1 throws to error.tsx; a failed D-M2 with
// alerts to show is the partial state (G4: the alerts render, the pill
// hides); with no alerts it throws too, since the empty states depend on it
// (QA Q3).

export type MonData = {
  alerts: AlertList;
  /** undefined: D-M2 failed but alerts loaded (G4). */
  monitoring: Monitoring | undefined;
};

const expired = (result: PromiseSettledResult<unknown>): boolean =>
  result.status === "rejected" &&
  result.reason instanceof AppError &&
  result.reason.code === "SESSAO_EXPIRADA";

export async function loadMonitoramento(): Promise<MonData> {
  const [alerts, monitoring] = await Promise.allSettled([
    listAlerts(),
    getMonitoring(),
  ]);
  if (expired(alerts) || expired(monitoring))
    redirect(await sessionExpiredUrl());
  if (alerts.status === "rejected") throw alerts.reason;
  if (monitoring.status === "fulfilled")
    return { alerts: alerts.value, monitoring: monitoring.value };
  if (alerts.value.length === 0) throw monitoring.reason;
  return { alerts: alerts.value, monitoring: undefined };
}
