import { describe, expect, it } from "vitest";

import { sellersCopy } from "@/features/panel-sellers/copy";
import { globalCopy } from "@/features/panel-shell/copy/global";
import { shellCopy } from "@/features/panel-shell/copy/shell";

// Spec § Content & Copy › S10 Vendedores, verbatim, plus the plan-m8 gap
// defaults: G3 (the pending row) and G11 (the audit range, too large).
const SPEC_S10: Record<string, string> = {
  "sellers.h1": "Vendedores",
  "sellers.lead":
    "Todo mundo que passou pelo link ou por um lote, com o status de hoje.",
  "sellers.search.label": "Buscar por nome ou CNPJ",
  "sellers.filter.label": "Status",
  "sellers.filter.all": "Todos",
  "sellers.filter.ok": "Aprovado",
  "sellers.filter.review": "Em revisão",
  "sellers.filter.blocked": "Bloqueado",
  "sellers.filter.changed": "Mudou desde a aprovação",
  "sellers.col.seller": "Vendedor",
  "sellers.col.resp": "Responsável",
  "sellers.col.origin": "Origem",
  "sellers.col.date": "Verificado em",
  "sellers.col.status": "Status hoje",
  "sellers.col.monitored": "Monitorado",
  "sellers.monitored.yes": "Sim",
  "sellers.monitored.no": "Não",
  "sellers.resp.none": "Não informado",
  "sellers.status.changed": "Mudou: {resumo}",
  "sellers.reverify": "Reverificar",
  "sellers.reverify.h": "Reverificar {razao_social}?",
  "sellers.reverify.body":
    "Consultamos a Receita de novo agora. Isso consome 1 verificação do seu plano.",
  "sellers.reverify.submit": "Reverificar",
  "toast.reverify": "Reverificação pedida: {razao_social}",
  "sellers.export": "Exportar CSV",
  "sellers.export.hint.one": "Exporta 1 vendedor do filtro atual.",
  "sellers.export.hint.other": "Exporta os {n} vendedores do filtro atual.",
  "sellers.audit": "Exportar trilha de auditoria",
  "sellers.empty.h": "Ninguém verificado ainda",
  "sellers.empty.body":
    "Coloque o link no seu cadastro de vendedores ou verifique sua base em lote.",
  "sellers.empty.search": 'Nenhum vendedor encontrado para "{busca}".',
  "sellers.empty.search.cta": "Limpar busca",
  "sellers.detail.open_case": "Abrir caso",
  "sellers.detail.history.h": "Verificações anteriores",
  "sellers.notfound.h": "Vendedor não encontrado",
  "sellers.notfound.body": "Ele não existe ou não pertence a esta conta.",
  // plan-m8 G3
  "sellers.reverify.pending": "Reverificando…",
  // plan-m8 G11 (Security O-F5)
  "export.too_large":
    "O arquivo ficou grande demais. Reduza o período e tente de novo.",
  "audit.de": "De",
  "audit.ate": "Até",
};

describe("sellersCopy (T137, spec § Content & Copy › S10)", () => {
  it("holds every S10 key and the G3/G11 defaults, verbatim, and nothing else", () => {
    expect(sellersCopy).toEqual(SPEC_S10);
  });

  it("has no TODO(copy) placeholder", () => {
    for (const value of Object.values(sellersCopy))
      expect(value).not.toContain("TODO");
  });

  it("reuses export.error and plan.exhausted from the shell instead of copying them", () => {
    expect(sellersCopy).not.toHaveProperty("export.error");
    expect(sellersCopy).not.toHaveProperty("plan.exhausted");
    expect(globalCopy["export.error"]).toBe(
      "Não conseguimos gerar o arquivo. Tente de novo.",
    );
    expect(shellCopy["plan.exhausted"]).toBeTruthy();
  });
});
