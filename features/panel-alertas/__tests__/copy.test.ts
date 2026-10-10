import { describe, expect, it } from "vitest";

import { alertasCopy } from "@/features/panel-alertas/copy";
import { shellCopy } from "@/features/panel-shell/copy/shell";
import { fill } from "@/features/panel-shell/format";
import { ALERT_SEVERIDADES, ALERT_TIPOS } from "@/lib/panel-api-values";

// Spec v1.4 § Content & Copy › S8 Monitoramento, MVP half, verbatim (the T49
// fixture test, extended to S8). The P3 settings keys stay out.
const SPEC_S8_MVP: Record<string, string> = {
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
};

describe("alertasCopy (T119, spec § Content & Copy › S8)", () => {
  it("holds every S8 MVP key, verbatim, and nothing else", () => {
    expect(alertasCopy).toEqual(SPEC_S8_MVP);
  });

  it("leaves the P3 settings keys out", () => {
    for (const key of Object.keys(alertasCopy))
      expect(key).not.toMatch(/^mon\.(where|channel|webhook|toggle|settings)/);
  });

  it("has a sentence for every alert type and a word for every severity", () => {
    for (const tipo of ALERT_TIPOS)
      expect(alertasCopy[`alert.${tipo}`]).toBeTruthy();
    for (const sev of ALERT_SEVERIDADES)
      expect(alertasCopy[`alert.sev.${sev}`]).toBeTruthy();
  });

  it("keeps the nav keys in the shell copy", () => {
    expect(shellCopy["nav.monitor"]).toBe("Monitoramento");
    expect(shellCopy["nav.monitor.count_sr.other"]).toBe(
      "{n} alertas críticos sem decisão",
    );
  });

  it("fills as the spec reads", () => {
    expect(
      fill(alertasCopy["mon.status.on"], {
        dia_semana: "segunda-feira",
        hora: "06:00",
      }),
    ).toBe("Ativo. Próxima varredura: segunda-feira, 06:00");
  });
});
