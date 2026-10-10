// Spec v1.4 § Content & Copy › S8 Monitoramento, MVP half, verbatim (the P3
// settings keys stay out until P3). Fill placeholders with fill() from
// features/panel-shell/format.ts. Never edit a string here without the spec
// changing first (the UX Strategist owns the copy). nav.monitor* is the
// shell's (features/panel-shell/copy/shell.ts); offline.* and error.load.*
// are global (features/panel-shell/copy/global.ts).
export const alertasCopy = {
  "mon.h1": "Monitoramento",
  "mon.lead":
    "Toda semana consultamos de novo os vendedores monitorados e avisamos o que mudou.",
  "mon.status.on": "Ativo. Próxima varredura: {dia_semana}, {hora}",
  "mon.alerts.h": "Alertas",
  "mon.alerts.sub": "Mudanças encontradas nas últimas varreduras.",
  "mon.empty.unmonitored":
    "Nenhum vendedor monitorado ainda. Ative o monitoramento no resultado de um lote.",
  "mon.empty.unmonitored.cta": "Verificar em lote",
  "mon.empty.noalerts":
    "Nenhuma mudança encontrada. A última varredura foi em {data}.",
  "mon.empty.nosweep":
    "A primeira varredura acontece em {data}. Os alertas aparecem aqui.",
  "alert.sev.critico": "Crítico",
  "alert.sev.atencao": "Atenção",
  "alert.sev.info": "Informativo",
  "alert.SITUACAO_IRREGULAR": "{razao_social} ficou {situacao} na Receita.",
  "alert.IE_SUSPENSA":
    "{razao_social} teve a inscrição estadual {estado_ie} em {uf}.",
  "alert.RESPONSAVEL_SAIU_QSA":
    "{responsavel} saiu do quadro de sócios de {razao_social}.",
  "alert.QSA_MUDOU": "{razao_social} mudou o quadro de sócios.",
  "alert.CNAE_MUDOU": "{razao_social} mudou a atividade principal para {cnae}.",
  "alert.REGIME_MUDOU": "{razao_social} passou de {de} para {para}.",
  "alert.WEBHOOK_FALHOU":
    "O webhook não respondeu ao avisar sobre {razao_social}. Confira em Integrações.",
  "alert.pedido_aberto": "Com pedido aberto",
  "alert.case.open": "Decidir",
  "alert.case.decided": "Decidido: {decisao}",
  "mon.email.h": "Onde avisamos",
  "mon.email.body": "Alertas críticos chegam na hora por e-mail em {email}.",
  "mon.freq":
    "Varredura completa toda semana, segunda às 06:00. Vendedores marcados com pedido aberto pela API são consultados todo dia.",
} as const;
