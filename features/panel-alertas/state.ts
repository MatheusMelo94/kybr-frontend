import type { AlertList, Monitoring } from "@/lib/api/schemas/panel/alerts";

/** The page's state (plan-m7 § 3); `data` is the ISO date the empty copy shows. */
export type MonState =
  | { kind: "success" }
  | { kind: "error" }
  | { kind: "unmonitored" }
  | { kind: "nosweep"; data: string }
  | { kind: "noalerts"; data: string };

/**
 * plan-m7 § 3: any alert → the list (with D-M2 failed, the pill hides, G4).
 * With none, the empty states depend on D-M2: failed → error (QA Q3);
 * nothing monitored → unmonitored; no sweep yet → nosweep (the next sweep's
 * date); otherwise noalerts (the last sweep's date).
 */
export function pickMonState(
  monitoring: Monitoring | undefined,
  alerts: AlertList,
): MonState {
  if (alerts.length > 0) return { kind: "success" };
  if (monitoring === undefined) return { kind: "error" };
  if (monitoring.monitorados === 0) return { kind: "unmonitored" };
  if (monitoring.ultima_varredura === undefined)
    return monitoring.proxima_varredura === undefined
      ? { kind: "unmonitored" }
      : { kind: "nosweep", data: monitoring.proxima_varredura };
  return { kind: "noalerts", data: monitoring.ultima_varredura };
}
