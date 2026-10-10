import "server-only";

import { redirect } from "next/navigation";

import { AppError } from "@/lib/api/errors";
import { getMonitoring, listAlerts } from "@/lib/api/panel/alerts";
import { sessionExpiredUrl } from "@/lib/api/panel/session";
import type { AlertList, Monitoring } from "@/lib/api/schemas/panel/alerts";

// The Monitoramento page's reads: D-M1 and D-M2 in parallel, once per render
// (no poll, plan-m7 Q1). An ended session → /entrar (a navigation: ADR-0011
// Addendum 2 rule 5); a failed read throws to error.tsx.

export type MonData = { alerts: AlertList; monitoring: Monitoring };

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
  if (monitoring.status === "rejected") throw monitoring.reason;
  return { alerts: alerts.value, monitoring: monitoring.value };
}
