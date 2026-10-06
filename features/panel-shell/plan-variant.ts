import type { Plano } from "@/lib/api/schemas/panel/me";

/**
 * The plan's gate (spec S5, AC 12): "none" when no checks are granted
 * (limite 0), "exhausted" when they're used up, undefined while checks are
 * left or /me lacks the plano. PlanBlock, the Conta menu and PlanBanner
 * share it (and Lote's CTA reuses it, T79).
 */
export type PlanGate = "none" | "exhausted";

export function planGate(plano: Plano | undefined): PlanGate | undefined {
  if (plano === undefined) return undefined;
  if (plano.limite === 0) return "none";
  return plano.usadas >= plano.limite ? "exhausted" : undefined;
}
