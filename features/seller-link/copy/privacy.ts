// Spec v2 § Content & Copy, verbatim. Privacy notice `/v/{slug}/privacidade`.
// Fill placeholders with fill() from features/seller-link/format.ts. Never edit
// a string here without the spec changing first (the UX Strategist owns the
// copy).
export const privacyCopy = {
  "privacy.h1": "Como tratamos seus dados",
  "privacy.who.h2": "Quem é responsável",
  "privacy.who":
    "{marketplace} decide como seus dados são usados neste cadastro (controladora). A Kybr faz a verificação em nome de {marketplace} (operadora).",
  "privacy.what.h2": "O que usamos",
  "privacy.what":
    "O CNPJ e o nome do responsável que você informa; os dados públicos da empresa na Receita Federal, no Simples Nacional e no SINTEGRA; o seu e-mail, só quando pedimos para avisar você; e os documentos que você enviar.",
  "privacy.why.h2": "Para quê",
  "privacy.why":
    "Para verificar a empresa antes de liberar as vendas e prevenir fraude.",
  "privacy.time.h2": "Por quanto tempo",
  "privacy.time":
    "Documentos e e-mail são apagados 12 meses depois da decisão sobre o cadastro. O registro da verificação fica guardado enquanto {marketplace} usar o serviço.",
  "privacy.rights.h2": "Seus direitos",
  "privacy.rights":
    "Para ver, corrigir ou apagar seus dados, fale com {marketplace}.",
  "privacy.contact": "Falar com {marketplace}",
  "privacy.back": "Voltar ao cadastro",
} as const;

/** Stands in for {marketplace} when the link info fails (spec v2 § States Matrix, privacy partial). */
export const MARKETPLACE_FALLBACK = "a plataforma";
