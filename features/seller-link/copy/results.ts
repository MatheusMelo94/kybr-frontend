// Spec v3 § Content & Copy, verbatim. Results: the shared "consultado em" line
// and *tudo certo*. Fill placeholders with fill() from features/seller-
// link/format.ts. Never edit a string here without the spec changing first (the
// UX Strategist owns the copy).
export const resultsCopy = {
  "results.consulted": "Dados consultados em {data}.",
  "approved.seal": "Vendedor verificado",
  // Link spec v4 (brand v1) [DDR-0002]: followed by the inline wordmark.
  "approved.seal.by": "por",
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
} as const;
