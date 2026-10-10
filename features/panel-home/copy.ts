// Spec § Content & Copy › S9 Início, verbatim. Fill placeholders with fill()
// from features/panel-shell/format.ts. Never edit a string here without the
// spec changing first (the UX Strategist owns the copy). nav.inicio is the
// shell's; toast.link_copied, copy.error and error.load.* are global.
export const homeCopy = {
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
  // TODO(copy): plan-m8 G1 defaults; the spec names four keys but spells out
  // only other_other. Pending the UX Strategist.
  "home.summary.both.one_one":
    "1 vendedor esperando decisão e 1 alerta crítico novo.",
  "home.summary.both.one_other":
    "1 vendedor esperando decisão e {m} alertas críticos novos.",
  "home.summary.both.other_one":
    "{n} vendedores esperando decisão e 1 alerta crítico novo.",
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
} as const;
