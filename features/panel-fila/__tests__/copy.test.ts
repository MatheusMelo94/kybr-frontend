import { describe, expect, it } from "vitest";

import { filaCopy } from "@/features/panel-fila/copy";
import { pendingCopy } from "@/features/seller-link/copy/pending";
import { globalCopy } from "@/features/panel-shell/copy/global";
import { fill } from "@/features/panel-shell/format";
import { plural } from "@/features/panel-shell/plural";
import {
  CASE_ORIGENS,
  DECISAO_TIPOS,
  DOCUMENTO_TIPOS,
  MOTIVO_CODIGOS,
  VEREDITOS,
} from "@/lib/panel-api-values";

// Spec v1.4 § Content & Copy › S6 Fila + case detail, verbatim (the T49
// fixture test, extended to S6), with the dialogs and toasts. Plural rows
// are split into .one / .other; shorthand keys are expanded. Extracted from
// the spec table (G1–G14 final copy, 2026-10-06).
const SPEC_S6: Record<string, string> = {
  "fila.h1": "Fila de revisão",
  "fila.lead":
    "Casos que as regras não decidiram sozinhas. Mais antigo primeiro.",
  "fila.tab.open": "Para decidir ({n})",
  "fila.tab.waiting": "Aguardando vendedor ({n})",
  "fila.tab.open.nocount": "Para decidir",
  "fila.tab.waiting.nocount": "Aguardando vendedor",
  "fila.pill.open.one": "{n} aberto",
  "fila.pill.open.other": "{n} abertos",
  "fila.pill.late.one": "{n} fora do prazo",
  "fila.pill.late.other": "{n} fora do prazo",
  "fila.sla.due": "Vence em {duracao}",
  "fila.sla.late": "Atrasado há {duracao}",
  "fila.origin.link": "Link",
  "fila.origin.lote": "Lote",
  "fila.origin.alerta": "Alerta",
  "fila.new.one": "1 caso novo",
  "fila.new.other": "{n} casos novos",
  "fila.new.cta": "Mostrar",
  "fila.more": "Carregar mais {n}",
  "fila.empty.h": "Nenhum caso aberto",
  "fila.empty.body":
    "Quando as regras mandarem um vendedor para revisão, ele aparece aqui.",
  "fila.empty.cta": "Verificar em lote",
  "fila.waiting.empty": "Nenhum vendedor com documento pendente.",
  "fila.back": "Voltar para a fila",
  "fila.verdict.sr": "Resultado das regras:",
  "fila.verdict.aprovar": "Aprovar",
  "fila.verdict.revisar": "Revisar",
  "fila.verdict.bloquear": "Bloquear",
  "fila.counts": "{ok} ok, {warn} atenção, {bad} crítico",
  "fila.consulted": "Consultado em {data_hora}",
  "fila.consulted.cache": "Consultado em {data_hora}, dados guardados",
  "fila.change.h": "O que mudou",
  "fila.change.row": "{campo}: antes {de}, agora {para}",
  "fila.change.when": "Encontrado na varredura de {data}.",
  "fila.seller.h": "Vendedor",
  "fila.seller.responsavel": "Responsável informado: {nome}",
  "fila.seller.extid": "ID na sua plataforma: {ext_id} (não verificado)",
  "fila.seller.extid.help":
    "Esse valor vem do link e qualquer pessoa pode editá-lo. Confira o vendedor pelo CNPJ.",
  "fila.seller.email.yes": "O vendedor deixou e-mail para avisos.",
  "fila.seller.email.no":
    "O vendedor não deixou e-mail. Avisos sobre este caso precisam ser enviados por você.",
  "fila.check.qsa_missing":
    "Não informado no lote. Peça o documento do responsável se precisar confirmar.",
  "fila.nodata.title": "Sem dados da Receita",
  "fila.nodata.body":
    "Ainda não encontramos registro deste CNPJ. Você pode pedir um documento, aprovar ou bloquear.",
  "fila.docs.h": "Documentos",
  "fila.docs.item": "{documento}, enviado em {data_hora}",
  "fila.docs.open": "Abrir",
  "fila.docs.empty": "Nenhum documento enviado.",
  "fila.history.h": "Histórico",
  "fila.event.criado.link": "Caso aberto pelo link",
  "fila.event.criado.lote": "Caso aberto pelo lote",
  "fila.event.criado.monitoramento": "Caso aberto por um alerta",
  "fila.event.documento_pedido": "Documento pedido: {documentos}",
  "fila.event.documento_recebido": "Documento recebido: {documento}",
  "fila.event.decidido": "{decisao}",
  "fila.event.reverificado": "Consultado de novo",
  "fila.action.approve": "Aprovar",
  "fila.action.keep": "Manter aprovado",
  "fila.action.request": "Pedir documento",
  "fila.action.block": "Bloquear",
  "fila.action.proof": "Baixar comprovante",
  "fila.detail.error": "Não conseguimos abrir este caso.",
  "fila.detail.partial":
    "Parte do histórico não carregou. As decisões funcionam normalmente.",
  "fila.decide.error":
    "Não conseguimos registrar a decisão. O caso voltou para a fila. Tente de novo.",
  "fila.decide.conflict": "Este caso já tinha sido decidido em {data_hora}.",
  "fila.decided.banner": "Decidido: {decisao} em {data_hora}.",
  "fila.decision.aprovar": "Aprovado",
  "fila.decision.manter": "Mantido como aprovado",
  "fila.decision.bloquear": "Bloqueado",
  "fila.decided.reason": "Motivo: {motivo}",
  "fila.decided.note": 'Mensagem ao vendedor: "{nota}"',
  "fila.notfound.h": "Caso não encontrado",
  "fila.notfound.body": "Ele não existe ou não pertence a esta conta.",
  "fila.proof.error": "Não conseguimos baixar o comprovante. Tente de novo.",
  "toast.approved": "Aprovado: {razao_social}",
  "toast.kept": "Mantido como aprovado: {razao_social}",
  "toast.requested": "Documento pedido: {razao_social}",
  "toast.blocked": "Bloqueado: {razao_social}",
  "toast.audit": "Registrado na trilha de auditoria.",
  "doc.h": "Pedir documento",
  "doc.lead": "O vendedor recebe um e-mail com o link para enviar.",
  "doc.noemail.lead":
    "Este vendedor não deixou e-mail. Depois de pedir, copie o link e envie pelo canal que você usa com ele.",
  "doc.types.legend": "Quais documentos?",
  "documento.CONTRATO_SOCIAL_OU_CCMEI": "Contrato social ou CCMEI",
  "documento.PROCURACAO": "Procuração do responsável",
  "documento.COMPROVANTE_ENDERECO": "Comprovante de endereço da empresa",
  "documento.CARTAO_CNPJ": "Cartão CNPJ atualizado",
  "documento.RESPONSAVEL": "Contrato social ou procuração",
  "doc.note.label": "Mensagem para o vendedor (opcional)",
  "doc.note.hint": "O vendedor vê esta mensagem no link. Até 280 caracteres.",
  "doc.submit.one": "Pedir documento",
  "doc.submit.other": "Pedir {n} documentos",
  "doc.submit.busy": "Pedindo…",
  "doc.error.none": "Escolha pelo menos um documento.",
  "doc.link.h": "Pedido criado. Envie este link ao vendedor:",
  "doc.link.copy": "Copiar link",
  "block.h": "Bloquear {razao_social}?",
  "block.lead.webhook":
    "O vendedor vê o motivo no link, e avisamos seu sistema pelo webhook.",
  "block.lead.nowebhook":
    "O vendedor vê o motivo no link. Bloqueie também o vendedor na sua plataforma.",
  "block.reason.legend": "Motivo",
  "block.reason.SITUACAO_IRREGULAR": "Empresa irregular na Receita",
  "block.reason.RESPONSAVEL_NAO_SOCIO": "Responsável não é sócio",
  "block.reason.EMPRESA_RECENTE": "Empresa aberta há pouco tempo",
  "block.reason.ATIVIDADE_FORA_DA_CATEGORIA": "Atividade fora da categoria",
  "block.reason.IE_NAO_ENCONTRADA": "Sem inscrição estadual",
  "block.reason.IE_SUSPENSA": "Inscrição estadual suspensa ou cancelada",
  "block.reason.MEI": "MEI acima do limite",
  "block.reason.GENERICO": "Outro motivo",
  "block.note.label": "Mensagem para o vendedor (opcional)",
  "block.note.hint": "O vendedor vê esta mensagem no link. Até 280 caracteres.",
  "block.submit": "Bloquear vendedor",
  "block.submit.busy": "Bloqueando…",
  "block.error.reason": "Escolha um motivo.",
};

describe("filaCopy (T91, spec § Content & Copy › S6)", () => {
  it("holds every S6 key, verbatim, and nothing else", () => {
    expect(filaCopy).toEqual(SPEC_S6);
  });

  it("has no TODO(copy) placeholder left (G1–G14 are final)", () => {
    for (const value of Object.values(filaCopy))
      expect(value).not.toContain("TODO");
  });

  it("names every document type, block reason, verdict, decision and origin the API sends", () => {
    for (const tipo of DOCUMENTO_TIPOS)
      expect(filaCopy[`documento.${tipo}`]).toBeTruthy();
    for (const codigo of MOTIVO_CODIGOS)
      expect(filaCopy[`block.reason.${codigo}`]).toBeTruthy();
    for (const veredito of VEREDITOS)
      expect(filaCopy[`fila.verdict.${veredito}`]).toBeTruthy();
    for (const decisao of DECISAO_TIPOS)
      expect(filaCopy[`fila.decision.${decisao}`]).toBeTruthy();
    for (const origem of CASE_ORIGENS)
      expect(filaCopy[`fila.event.criado.${origem}`]).toBeTruthy();
  });

  it("keeps the global keys S6 uses in the global module", () => {
    expect(globalCopy["offline.actions"]).toBe(
      "As decisões voltam quando a internet voltar.",
    );
    expect(globalCopy["copy.error"]).toBe(
      "Não conseguimos copiar. Selecione o link e copie manualmente.",
    );
    expect(globalCopy["toast.link_copied"]).toBe("Link copiado");
  });

  it("fills and pluralizes as the spec reads", () => {
    expect(fill(plural(filaCopy, "doc.submit", 2), { n: 2 })).toBe(
      "Pedir 2 documentos",
    );
    expect(plural(filaCopy, "fila.new", 1)).toBe("1 caso novo");
    expect(fill(filaCopy["fila.sla.late"], { duracao: "2 dias" })).toBe(
      "Atrasado há 2 dias",
    );
  });
});

describe("document names shared with the seller link (spec 2026-10-06)", () => {
  it("documento.RESPONSAVEL matches the seller link's own name", () => {
    expect(filaCopy["documento.RESPONSAVEL"]).toBe(
      pendingCopy["documento.RESPONSAVEL"],
    );
  });
});
