// Spec v2 § Content & Copy, verbatim. *Quase lá*: the screen, one
// title/description per item code (EMPRESA_RECENTE has one/many title keys) and
// the document labels for {documento}. Fill placeholders with fill() from
// features/seller-link/format.ts. Never edit a string here without the spec
// changing first (the UX Strategist owns the copy).
export const pendingCopy = {
  "pending.h1": "Quase lá",
  "pending.body":
    "Encontramos a empresa {razao_social}. Falta pouco para liberar seu cadastro:",
  "pending.deadline": "Prazo da análise: até {data_hora}. Avisamos por e-mail.",
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
  "pending.document.CONTRATO_SOCIAL_OU_CCMEI": "Contrato social ou CCMEI",
  "pending.document.PROCURACAO": "Procuração do responsável",
  "pending.document.COMPROVANTE_ENDERECO": "Comprovante de endereço da empresa",
  "pending.document.CARTAO_CNPJ": "Cartão CNPJ atualizado",
} as const;
