import { describe, expect, it } from "vitest";

import { regrasCopy } from "@/features/panel-regras/copy";

// Spec § Content & Copy › S11 Regras, verbatim, plus plan-m8 G4 (the 409).
const SPEC_S11: Record<string, string> = {
  "regras.h1": "Regras de aprovação",
  "regras.lead": "O que acontece com cada resultado para {categoria}.",
  "regras.rule.situacao": "Empresa inapta, baixada ou suspensa",
  "regras.rule.situacao.desc": "Situação na Receita Federal",
  "regras.rule.recente": "Aberta há menos de {dias} dias",
  "regras.rule.recente.desc": "Empresas muito novas têm mais fraude",
  "regras.rule.qsa": "Responsável não consta no quadro de sócios",
  "regras.rule.qsa.desc": "Pede contrato social ou procuração",
  "regras.rule.cnae": "CNAE fora da categoria",
  "regras.rule.cnae.desc": "{descricao_categoria}",
  "regras.rule.ie": "Sem inscrição estadual",
  "regras.rule.ie.desc": "Obrigatória para emitir NF-e de produto",
  "regras.rule.mei": "MEI",
  "regras.rule.mei.desc": "Limite anual de faturamento",
  "regras.rule.ok": "Tudo certo",
  "regras.action.auto": "Aprovar automaticamente",
  "regras.action.approve": "Aprovar",
  "regras.action.approve_limit": "Aprovar com limite",
  "regras.action.review": "Revisar",
  "regras.action.request": "Pedir documento",
  "regras.action.block": "Bloquear",
  "regras.days.label": "Prazo mínimo de abertura",
  "regras.docs.h": "Documentos que o link pode pedir",
  "regras.docs.sub":
    'Usados quando uma regra manda "Pedir documento" e quando você pede pela fila.',
  "regras.save.note":
    "As regras novas valem para as próximas verificações. Casos na fila ou já decididos não mudam.",
  "regras.save": "Salvar regras",
  "regras.save.busy": "Salvando…",
  "regras.discard": "Descartar",
  "regras.save.error":
    "Não conseguimos salvar as regras. Suas mudanças continuam aqui. Tente de novo.",
  "regras.error.nodocs":
    'Ative pelo menos um documento para usar "Pedir documento".',
  "regras.leave.h": "Sair sem salvar?",
  "regras.leave.body": "As mudanças nas regras vão se perder.",
  "regras.leave.confirm": "Sair sem salvar",
  "regras.leave.stay": "Continuar editando",
  "toast.rules_saved": "Regras salvas",
  // plan-m8 G4
  "regras.save.conflict":
    "As regras mudaram em outra aba. Recarregue a página para ver a versão atual.",
};

describe("regrasCopy (T137, spec § Content & Copy › S11)", () => {
  it("holds every S11 key and the G4 default, verbatim, and nothing else", () => {
    expect(regrasCopy).toEqual(SPEC_S11);
  });

  it("has no TODO(copy) placeholder", () => {
    for (const value of Object.values(regrasCopy))
      expect(value).not.toContain("TODO");
  });
});
