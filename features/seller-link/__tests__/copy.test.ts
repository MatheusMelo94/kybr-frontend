import { describe, expect, it } from "vitest";

import { formCopy } from "@/features/seller-link/copy/form";
import { caseCopy } from "@/features/seller-link/copy/case";
import { resultsCopy } from "@/features/seller-link/copy/results";
import { pendingCopy } from "@/features/seller-link/copy/pending";
import { uploadCopy } from "@/features/seller-link/copy/upload";
import { emailCopy } from "@/features/seller-link/copy/email";
import { blockedCopy } from "@/features/seller-link/copy/blocked";
import { privacyCopy } from "@/features/seller-link/copy/privacy";
import { sharedCopy } from "@/features/seller-link/copy/shared";

const MODULES = {
  form: formCopy,
  case: caseCopy,
  results: resultsCopy,
  pending: pendingCopy,
  upload: uploadCopy,
  email: emailCopy,
  blocked: blockedCopy,
  privacy: privacyCopy,
  shared: sharedCopy,
};

// Spec v3 § Content & Copy, verbatim, grouped by the per-screen module that holds
// each key. Item rows are keyed pending.item.<CODE>.title/.description, and
// document labels documento.<TIPO> (spec v3). Spec notes (e.g. "shown for … when a
// URL exists") are not copy and are left out.
const SPEC_DECK: Record<keyof typeof MODULES, Record<string, string>> = {
  form: {
    "form.marketplace": "{marketplace}",
    "form.h1": "Cadastro de vendedor",
    "form.lead":
      "Leva menos de um minuto. Só precisamos do CNPJ e de quem é o responsável.",
    "form.cnpj.label": "CNPJ da empresa",
    "form.cnpj.placeholder": "00.000.000/0000-00",
    "form.cnpj.hint": "CNPJs novos podem ter letras.",
    "form.cnpj.error.empty": "Informe o CNPJ da empresa.",
    "form.cnpj.error.incomplete":
      "O CNPJ tem 14 caracteres. Confira se falta algum.",
    "form.cnpj.error.invalid": "CNPJ inválido. Confira o que foi digitado.",
    "form.cnpj.error.check_letters":
      "CNPJ inválido. Os dois últimos caracteres são sempre números.",
    "form.lookup.loading": "Buscando os dados da empresa…",
    "form.lookup.found": "Empresa encontrada: {razao_social}.",
    "form.lookup.activity": "Atividade principal: {atividade}",
    "form.lookup.location": "{municipio}, {uf}",
    "form.lookup.notfound":
      "Ainda não encontramos os dados dessa empresa. Você pode continuar: vamos conferir com calma.",
    "form.lookup.failed":
      "Não conseguimos buscar os dados da empresa agora. Você pode continuar mesmo assim.",
    "form.name.label": "Nome completo do responsável",
    "form.name.hint": "Nome e sobrenome de quem está fazendo o cadastro.",
    "form.name.error.empty": "Informe o nome completo do responsável.",
    "form.name.error.single": "Escreva nome e sobrenome.",
    // Spec v2 amendment (M1 review, owner-approved), shipped by T17b.
    "form.name.error.invalid":
      "Não conseguimos usar esse nome. Escreva o nome completo como está no documento.",
    "form.submit": "Verificar empresa",
    "form.submit.busy": "Enviando…",
    "form.submit.error.network":
      "Não conseguimos enviar. Confira sua conexão e tente de novo.",
    "form.submit.error.limit_cnpj":
      "Esse CNPJ já foi verificado várias vezes na última hora. Tente de novo em {minutos} min.",
    "form.submit.error.limit_generic":
      "Muitas tentativas seguidas. Tente de novo em {minutos} min.",
    "loaderror.h1": "Não conseguimos abrir o cadastro",
    "loaderror.body": "Confira sua conexão e tente de novo.",
    "loaderror.cta": "Tentar de novo",
    "notfound.h1": "Link não encontrado",
    "notfound.body":
      "Este link de cadastro não existe ou foi desativado. Peça o link certo à plataforma onde você está se cadastrando.",
  },
  case: {
    "verifying.h1": "Verificando sua empresa",
    "verifying.status":
      "Consultando Receita Federal, Simples Nacional e SINTEGRA…",
    "offline.banner":
      "Sem conexão. Assim que a internet voltar, continuamos daqui.",
    "analysis.h1": "Sua empresa está em análise",
    "analysis.body.timeout":
      "A consulta está demorando mais que o normal. Você não precisa esperar aqui: avisamos o resultado por e-mail.",
    "analysis.body.notfound":
      "Ainda não encontramos os dados da sua empresa. Vamos conferir e avisar o resultado por e-mail.",
    "analysis.resume":
      "Este endereço também mostra o andamento. Guarde o link se quiser voltar.",
    "casenotfound.h1": "Cadastro não encontrado",
    "casenotfound.body":
      "Não encontramos este cadastro. Comece de novo pelo link de cadastro.",
    "casenotfound.cta": "Começar de novo",
    "caseerror.h1": "Não conseguimos carregar seu cadastro",
    "caseerror.body": "Confira sua conexão e tente de novo.",
    "caseerror.cta": "Tentar de novo",
  },
  results: {
    "results.consulted": "Dados consultados em {data}.",
    "approved.seal": "Vendedor verificado",
    "approved.h1": "Tudo certo, {primeiro_nome}.",
    "approved.body": "A empresa {razao_social} está liberada para vender.",
    "approved.body.nodata": "Sua empresa está liberada para vender.",
    "approved.row.situacao.label": "Situação na Receita",
    "approved.row.situacao.value": "ativa",
    "approved.row.ie.label": "Inscrição estadual",
    "approved.row.ie.value": "ativa ({uf})",
    "approved.row.responsavel.label": "Responsável",
    "approved.row.responsavel.value": "confere",
    "approved.next":
      "Pode fechar esta página e voltar para o cadastro na plataforma {marketplace}.",
  },
  pending: {
    "pending.h1": "Quase lá",
    "pending.body":
      "Encontramos a empresa {razao_social}. Falta pouco para liberar seu cadastro:",
    "pending.body.nodata": "Falta pouco para liberar seu cadastro:",
    "pending.deadline":
      "Prazo da análise: até {data_hora}. Avisamos por e-mail.",
    "pending.allreceived":
      "Recebemos tudo. Agora é com a gente: avisamos por e-mail até {data_hora}.",
    "pending.item.DOCUMENTO_RESPONSAVEL.title":
      "{responsavel} não aparece entre os sócios da empresa",
    "pending.item.DOCUMENTO_RESPONSAVEL.description":
      "Envie o contrato social ou uma procuração.",
    "pending.item.DOCUMENTO_SOLICITADO.title": "{documento}",
    "pending.item.DOCUMENTO_SOLICITADO.description":
      "Precisamos deste documento para liberar seu cadastro.",
    "pending.item.IE_NAO_ENCONTRADA.title": "Inscrição estadual não encontrada",
    "pending.item.IE_NAO_ENCONTRADA.description":
      "Sem ela, suas notas fiscais podem ser rejeitadas. Regularize na Secretaria da Fazenda do seu estado.",
    "pending.item.IE_SUSPENSA.title": "Inscrição estadual suspensa",
    "pending.item.IE_SUSPENSA.description":
      "Sem ela, suas notas fiscais podem ser rejeitadas. Regularize na Secretaria da Fazenda do seu estado.",
    "pending.item.SITUACAO_IRREGULAR.title":
      "Empresa {situacao} na Receita Federal",
    "pending.item.SITUACAO_IRREGULAR.description":
      "Regularize a situação para continuar o cadastro.",
    "pending.item.ATIVIDADE_FORA_DA_CATEGORIA.title":
      "Atividade registrada fora da categoria",
    "pending.item.ATIVIDADE_FORA_DA_CATEGORIA.description":
      "Vamos conferir o que você vende. Você não precisa fazer nada agora.",
    "pending.item.EMPRESA_RECENTE.title.one": "Empresa aberta há 1 dia",
    "pending.item.EMPRESA_RECENTE.title.many": "Empresa aberta há {dias} dias",
    "pending.item.EMPRESA_RECENTE.description":
      "Empresas novas passam por uma revisão rápida. Você não precisa fazer nada agora.",
    "pending.item.MEI.title": "Empresa MEI",
    "pending.item.MEI.description":
      "O MEI tem limite de faturamento por ano. Vamos conferir antes de liberar. Você não precisa fazer nada agora.",
    "pending.item.regularize": "Como regularizar",
    "documento.CONTRATO_SOCIAL_OU_CCMEI": "Contrato social ou CCMEI",
    "documento.PROCURACAO": "Procuração do responsável",
    "documento.COMPROVANTE_ENDERECO": "Comprovante de endereço da empresa",
    "documento.CARTAO_CNPJ": "Cartão CNPJ atualizado",
    "documento.RESPONSAVEL": "Contrato social ou procuração",
  },
  upload: {
    "upload.cta": "Enviar documento",
    "upload.hint": "PDF ou fotos, até 10 MB no total.",
    "upload.busy": "Enviando…",
    "upload.received.one": "Recebido: 1 arquivo",
    "upload.received.many": "Recebido: {n} arquivos",
    "upload.add": "Adicionar página",
    "upload.error.size":
      "Passou do limite de envio. Envie um PDF menor ou menos fotos.",
    "upload.error.type": "Formato não aceito. Envie PDF, JPG ou PNG.",
    "upload.error.mixed":
      "Cada documento aceita um único PDF ou só fotos. Escolha de novo.",
    "upload.error.network":
      "Não conseguimos enviar o documento. Tente de novo.",
    "upload.error.closed":
      "Este cadastro já foi decidido. Não é mais preciso enviar documentos.",
  },
  email: {
    "email.label": "Seu e-mail para avisos",
    "email.hint": "Só usamos para falar sobre este cadastro.",
    "email.submit": "Salvar e-mail",
    "email.busy": "Salvando…",
    "email.saved": "E-mail salvo. Vamos avisar em {email}.",
    "email.change": "Trocar e-mail",
    "email.error.empty": "Informe um e-mail.",
    "email.error.invalid": "Confira o e-mail. Exemplo: nome@empresa.com.br",
    "email.error.network": "Não conseguimos salvar o e-mail. Tente de novo.",
  },
  blocked: {
    "blocked.h1": "Não conseguimos aprovar seu cadastro",
    "blocked.reason.SITUACAO_IRREGULAR":
      "A empresa {razao_social} consta como {situacao} na Receita Federal. Regularize a situação e volte a este link: ele continua valendo.",
    "blocked.reason.RESPONSAVEL_NAO_SOCIO":
      "{responsavel} não aparece entre os sócios da empresa {razao_social}.",
    "blocked.reason.EMPRESA_RECENTE":
      "A empresa {razao_social} foi aberta há pouco tempo. Por enquanto, empresas tão novas não são aceitas.",
    "blocked.reason.ATIVIDADE_FORA_DA_CATEGORIA":
      "A atividade registrada da empresa {razao_social} está fora da categoria aceita.",
    "blocked.reason.IE_NAO_ENCONTRADA":
      "A inscrição estadual da empresa {razao_social} não foi encontrada. Regularize e volte a este link: ele continua valendo.",
    "blocked.reason.IE_SUSPENSA":
      "A inscrição estadual da empresa {razao_social} está suspensa. Regularize e volte a este link: ele continua valendo.",
    "blocked.reason.MEI": "No momento, empresas MEI não são aceitas.",
    "blocked.reason.GENERICO":
      "Para saber como seguir, fale com {marketplace}.",
    "blocked.cta.receita": "Regularizar na Receita Federal",
    "blocked.cta.ie": "Como regularizar",
    "blocked.cta.contact": "Falar com {marketplace}",
  },
  privacy: {
    "privacy.h1": "Como tratamos seus dados",
    "privacy.who.h2": "Quem é responsável",
    "privacy.who":
      "{marketplace} decide como seus dados são usados neste cadastro (controladora). A Kybr faz a verificação em nome de {marketplace} (operadora).",
    "privacy.who.fallback":
      "Quem decide como seus dados são usados neste cadastro é a plataforma onde você está se cadastrando (controladora). A Kybr faz a verificação em nome dela (operadora).",
    "privacy.what.h2": "O que usamos",
    "privacy.what":
      "O CNPJ e o nome do responsável que você informa; os dados públicos da empresa na Receita Federal, no Simples Nacional e no SINTEGRA; o seu e-mail, só quando pedimos para avisar você; e os documentos que você enviar.",
    "privacy.why.h2": "Para quê",
    "privacy.why":
      "Para verificar a empresa antes de liberar as vendas e prevenir fraude.",
    "privacy.time.h2": "Por quanto tempo",
    "privacy.time":
      "Documentos e e-mail são apagados 12 meses depois da decisão sobre o cadastro. O registro da verificação fica guardado enquanto {marketplace} usar o serviço.",
    "privacy.time.fallback":
      "Documentos e e-mail são apagados 12 meses depois da decisão sobre o cadastro. O registro da verificação fica guardado enquanto a plataforma usar o serviço.",
    "privacy.rights.h2": "Seus direitos",
    "privacy.rights":
      "Para ver, corrigir ou apagar seus dados, fale com {marketplace}.",
    "privacy.rights.fallback":
      "Para ver, corrigir ou apagar seus dados, fale com a plataforma onde você está se cadastrando.",
    "privacy.contact": "Falar com {marketplace}",
    "privacy.back": "Voltar ao cadastro",
  },
  shared: {
    "step.sr": "Passo {n} de 3",
    "privacy.line": "Usamos estes dados só para verificar sua empresa.",
    "privacy.link": "Como tratamos seus dados",
    "external.sr": "(abre em outra aba)",
    "a11y.cpf_masked": "CPF oculto",
  },
};

const PLACEHOLDERS = new Set([
  "marketplace",
  "n",
  "razao_social",
  "atividade",
  "minutos",
  "email",
  "data",
  "primeiro_nome",
  "uf",
  "data_hora",
  "responsavel",
  "documento",
  "situacao",
  "dias",
  "municipio",
]);

const allStrings = Object.values(MODULES).flatMap(
  (module) => Object.values(module) as string[],
);

describe("copy deck", () => {
  it.each(Object.keys(MODULES) as (keyof typeof MODULES)[])(
    "the %s module holds exactly its spec v2 keys, verbatim",
    (name) => {
      expect(MODULES[name]).toEqual(SPEC_DECK[name]);
    },
  );

  it("covers every spec v2 key, including the alphanumeric-CNPJ and upload changes", () => {
    const keys = Object.values(MODULES).flatMap((module) =>
      Object.keys(module),
    );

    expect(keys).toHaveLength(
      Object.values(SPEC_DECK).flatMap((module) => Object.keys(module)).length,
    );
    expect(keys).toEqual(
      expect.arrayContaining([
        "form.cnpj.hint",
        "form.cnpj.error.incomplete",
        "form.cnpj.error.check_letters",
        "form.cnpj.error.invalid",
        "upload.error.mixed",
      ]),
    );
    expect(formCopy["form.cnpj.error.invalid"]).toBe(
      "CNPJ inválido. Confira o que foi digitado.",
    );
  });

  it("has no placeholder copy", () => {
    expect(allStrings.filter((value) => value.includes("[TBD]"))).toEqual([]);
  });

  it("AC 37: never puts a gendered article before {marketplace}", () => {
    const offending = allStrings.filter((value) =>
      /(^|[\s(])(a|o|na|no|da|do|à|ao)\s+\{marketplace\}/i.test(value),
    );

    expect(offending).toEqual([]);
  });

  it("only uses known placeholders", () => {
    const used = allStrings.flatMap((value) =>
      [...value.matchAll(/\{(\w+)\}/g)].map((match) => match[1]),
    );

    expect(used.filter((name) => !PLACEHOLDERS.has(name ?? ""))).toEqual([]);
  });

  it("AC 31 (v3): every privacy fallback starts with a capital letter and names no marketplace", () => {
    const fallbacks = Object.entries(privacyCopy).filter(([key]) =>
      key.endsWith(".fallback"),
    );

    expect(fallbacks.map(([key]) => key)).toEqual([
      "privacy.who.fallback",
      "privacy.time.fallback",
      "privacy.rights.fallback",
    ]);
    for (const [, text] of fallbacks) {
      expect(text).toMatch(/^\p{Lu}/u);
      expect(text).not.toContain("{marketplace}");
    }
  });
});
