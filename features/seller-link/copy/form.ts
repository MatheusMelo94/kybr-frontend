// Spec v3 § Content & Copy, verbatim. Cadastro (form) `/v/{slug}`: form.*, plus
// the load error and Link not found screens. Fill placeholders with fill() from
// features/seller-link/format.ts. Never edit a string here without the spec
// changing first (the UX Strategist owns the copy).
export const formCopy = {
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
} as const;
