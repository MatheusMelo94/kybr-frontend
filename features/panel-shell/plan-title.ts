import { shellCopy } from "@/features/panel-shell/copy/shell";
import { fill } from "@/features/panel-shell/format";
import type { Plano } from "@/lib/api/schemas/panel/me";

/**
 * The plan's title (spec S5, AC 9 and 12): plan.trial.title for a trial,
 * plan.paid.title with its nome, plan.unnamed for a paid plan without one
 * (a paying customer must never read "Teste grátis").
 */
export function planTitle(plano: Plano): string {
  if (plano.tipo === "teste") return shellCopy["plan.trial.title"];
  return plano.nome === undefined
    ? shellCopy["plan.unnamed"]
    : fill(shellCopy["plan.paid.title"], { nome: plano.nome });
}
