import { describe, expect, it } from "vitest";

import { homeCopy } from "@/features/panel-home/copy";
import { fill } from "@/features/panel-shell/format";

// Spec § Content & Copy › S9 Início, verbatim (the T49 fixture test, extended
// to S9), plus the plan-m8 § 9 G1 keys (allowlisted defaults, TODO(copy)).
const SPEC_S9: Record<string, string> = {
  "home.greet.morning": "Bom dia, {nome}.",
  "home.greet.afternoon": "Boa tarde, {nome}.",
  "home.greet.evening": "Boa noite, {nome}.",
  "home.summary.none": "Comece verificando a base que você já tem.",
  "home.summary.clear": "Nada esperando decisão.",
  "home.summary.cases.one": "1 vendedor esperando decisão.",
  "home.summary.cases.other": "{n} vendedores esperando decisão.",
  "home.summary.alerts.one": "1 alerta crítico novo.",
  "home.summary.alerts.other": "{n} alertas críticos novos.",
  "home.summary.both.other_other":
    "{n} vendedores esperando decisão e {m} alertas críticos novos.",
  "home.cta.copy": "Copiar link de cadastro",
  "home.cta.lote": "Verificar em lote",
  "home.kpi.verified": "vendedores verificados",
  "home.kpi.auto": "aprovados automaticamente",
  "home.kpi.review": "em revisão manual",
  "home.kpi.blocked": "bloqueados",
  "home.queue.h": "Precisa da sua atenção",
  "home.queue.sub": "Os casos mais antigos da fila.",
  "home.queue.cta": "Abrir fila",
  "home.queue.empty": "Nada esperando decisão.",
  "home.feed.h": "Mudanças na base",
  "home.feed.cta": "Ver monitoramento",
  "home.feed.empty": "Nenhuma mudança na última varredura.",
  "home.week.h": "Semana",
  "home.week.sub": "Verificações por dia.",
  "home.card.error": "Esta parte não carregou.",
  "home.steps.h": "Primeiros passos",
  "home.steps.lote": "Verificar a base que você já tem",
  "home.steps.link": "Colocar o link no seu cadastro de vendedores",
  "home.steps.monitor": "Ativar o monitoramento",
  "home.steps.done": "feito",
  "home.steps.hide": "Ocultar",
};

// G1: the spec names "four keys" for home.summary.both but only spells out
// other_other; the three .one variants are the plan's defaults.
const G_KEYS: Record<string, string> = {
  "home.summary.both.one_one":
    "1 vendedor esperando decisão e 1 alerta crítico novo.",
  "home.summary.both.one_other":
    "1 vendedor esperando decisão e {m} alertas críticos novos.",
  "home.summary.both.other_one":
    "{n} vendedores esperando decisão e 1 alerta crítico novo.",
};

describe("homeCopy (T128, spec § Content & Copy › S9)", () => {
  it("holds every S9 key verbatim plus the G1 defaults, and nothing else", () => {
    expect(homeCopy).toEqual({ ...SPEC_S9, ...G_KEYS });
  });

  it("AC 72: no string addresses the user with a gendered form", () => {
    for (const text of Object.values(homeCopy))
      expect(text).not.toMatch(/bem-vind|obrigad|você mesm/i);
  });

  it("fills the G1 sentence as the plan's example reads", () => {
    expect(fill(homeCopy["home.summary.both.one_other"], { m: 2 })).toBe(
      "1 vendedor esperando decisão e 2 alertas críticos novos.",
    );
  });
});
