// Ops panel spec v1.2 § Content & Copy, verbatim. Global (shared by every panel screen).
// Fill placeholders with fill() from features/panel-shell/format.ts; pick
// plurals with plural(). Never edit a string here without the spec changing
// first (the UX Strategist owns the copy).
export const globalCopy = {
  brand: "Kybr",
  "error.network":
    "Não conseguimos falar com o servidor. Confira sua conexão e tente de novo.",
  "error.load.title": "Não carregou",
  "error.load.body": "Confira sua conexão e tente de novo.",
  "error.load.cta": "Tentar de novo",
  "offline.panel": "Sem conexão. Mostrando os dados de {hora}.",
  "offline.actions": "As decisões voltam quando a internet voltar.",
  "offline.back": "Conexão de volta. Dados atualizados.",
  "session.expired":
    "Sua sessão expirou. Entre de novo para continuar de onde parou.",
  "session.expired.lost": "O que estava aberto num formulário não foi salvo.",
  "copy.error": "Não conseguimos copiar. Selecione o link e copie manualmente.",
  "export.error": "Não conseguimos gerar o arquivo. Tente de novo.",
  "toast.link_copied": "Link copiado",
  "notfound.h1": "Página não encontrada",
  "notfound.body": "Este endereço não existe no painel.",
  "notfound.cta": "Ir para a fila",
  "fatal.h1": "Algo deu errado nesta tela",
  "fatal.body": "Tente de novo. Se continuar, volte para a fila.",
  "fatal.cta": "Tentar de novo",
  "common.cancel": "Cancelar",
  "common.close": "Fechar",
  "common.new_tab": "(abre em outra aba)",
} as const;
