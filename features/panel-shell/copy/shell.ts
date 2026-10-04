// Ops panel spec v1.2 § Content & Copy, verbatim. S5 Shell, plus the M4 Fila stub (fila.h1, fila.lead; S6).
// Fill placeholders with fill() from features/panel-shell/format.ts; pick
// plurals with plural(). Never edit a string here without the spec changing
// first (the UX Strategist owns the copy).
export const shellCopy = {
  "nav.label": "Navegação do painel",
  "nav.inicio": "Início",
  "nav.fila": "Fila de revisão",
  "nav.monitor": "Monitoramento",
  "nav.lote": "Verificar em lote",
  "nav.vendedores": "Vendedores",
  "nav.regras": "Regras",
  "nav.relatorio": "Relatório",
  "nav.integracoes": "Integrações",
  "nav.link": "Ver como vendedor",
  "nav.fila.count_sr.one": "{n} caso para decidir",
  "nav.fila.count_sr.other": "{n} casos para decidir",
  "nav.fila.count_sr_late.one": "{n} caso para decidir, fora do prazo",
  "nav.fila.count_sr_late.other": "{n} casos para decidir, {m} fora do prazo",
  "nav.fila.late.one": "{m} fora do prazo",
  "nav.fila.late.other": "{m} fora do prazo",
  "nav.monitor.count_sr.one": "{n} alerta crítico sem decisão",
  "nav.monitor.count_sr.other": "{n} alertas críticos sem decisão",
  "nav.lote.running": "Verificando",
  "ws.sellers.one": "{n} vendedor",
  "ws.sellers.other": "{n} vendedores",
  "account.menu": "Conta",
  "account.settings": "Configurações",
  "account.logout": "Sair",
  "plan.trial.title": "Teste grátis",
  "plan.trial.usage": "{usadas} de {limite} verificações",
  "plan.trial.cta": "Contratar",
  "plan.paid.title": "Plano {nome}",
  "plan.paid.usage": "{usadas} de {limite} verificações neste ciclo",
  "plan.paid.cycle": "Ciclo até {data}",
  "plan.exhausted":
    "As verificações do plano acabaram. Contrate para continuar verificando.",
  "plan.none": "Esta conta ainda não tem verificações liberadas.",
  "plan.none.cta_hint": "Contrate para começar a verificar.",
  "fila.h1": "Fila de revisão",
  "fila.lead":
    "Casos que as regras não decidiram sozinhas. Mais antigo primeiro.",
} as const;
