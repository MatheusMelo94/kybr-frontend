// Spec v2 § Content & Copy, verbatim. *Não aprovado*: one reason per code, and
// the actions. Fill placeholders with fill() from features/seller-
// link/format.ts. Never edit a string here without the spec changing first (the
// UX Strategist owns the copy).
export const blockedCopy = {
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
  "blocked.reason.GENERICO": "Para saber como seguir, fale com {marketplace}.",
  "blocked.cta.receita": "Regularizar na Receita Federal",
  "blocked.cta.ie": "Como regularizar",
  "blocked.cta.contact": "Falar com {marketplace}",
} as const;
