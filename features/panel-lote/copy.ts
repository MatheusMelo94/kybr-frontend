// Spec v1.4 § Content & Copy › S7 Verificar em lote, verbatim (+ its toasts).
// Fill placeholders with fill() from features/panel-shell/format.ts; pick
// plurals with plural(). Never edit a string here without the spec changing
// first (the UX Strategist owns the copy). nav.lote.running is the shell's.
export const loteCopy = {
  "lote.h1": "Verificar em lote",
  "lote.lead":
    "Suba a lista de vendedores que já estão na plataforma e veja a situação de cada um hoje.",
  "lote.onb.title": "Último passo: verifique a base que você já tem",
  "lote.onb.body":
    "Suba a planilha com os CNPJs dos seus vendedores. Leva poucos minutos.",
  "lote.onb.skip": "Fazer depois",
  "lote.drop.title": "Arraste uma planilha ou escolha o arquivo",
  "lote.drop.body": "CSV ou Excel com uma coluna de CNPJ. Até 5.000 linhas.",
  "lote.drop.cta": "Escolher arquivo",
  "lote.template": "Baixar modelo",
  "lote.template.hint":
    "Colunas: CNPJ (obrigatória), Responsável e ID na plataforma (opcionais).",
  "lote.cost.line": "Cada CNPJ consome uma verificação do seu plano.",
  "lote.cost.remaining.one": "Você tem {n} verificação disponível.",
  "lote.cost.remaining.other": "Você tem {n} verificações disponíveis.",
  "lote.reading": "Lendo o arquivo…",
  "lote.error.type": "Este arquivo não é CSV nem Excel. Escolha outro.",
  "lote.error.empty": "O arquivo está vazio.",
  "lote.error.too_many":
    "A lista tem mais de 5.000 linhas. Divida em arquivos menores.",
  "lote.error.unreadable":
    "Não conseguimos ler o arquivo. Salve de novo como CSV e tente outra vez.",
  "lote.preview.h": "Confira antes de verificar",
  "lote.preview.found": 'Encontramos {validos} CNPJs na coluna "{coluna}".',
  "lote.preview.column.label": "Coluna do CNPJ",
  "lote.preview.column.locked":
    "Para usar outra coluna, escolha o arquivo de novo.",
  "lote.preview.dupes.one": "1 CNPJ repetido: verificamos uma vez só.",
  "lote.preview.dupes.other": "{n} CNPJs repetidos: verificamos uma vez só.",
  "lote.preview.invalid.one": "1 CNPJ inválido: não será consultado.",
  "lote.preview.invalid.other": "{n} CNPJs inválidos: não serão consultados.",
  "lote.preview.nocolumn": "Não achamos a coluna de CNPJ. Escolha qual é.",
  "lote.preview.novalid":
    "Nenhum CNPJ válido nesta coluna. Escolha outra coluna ou outro arquivo.",
  "lote.preview.over_allowance":
    "A lista tem {validos} CNPJs e você tem {n} verificações disponíveis. Remova linhas ou contrate um plano.",
  "lote.start.one": "Verificar 1 CNPJ",
  "lote.start.other": "Verificar {n} CNPJs",
  "lote.start.busy": "Começando…",
  "lote.change_file": "Trocar arquivo",
  "lote.progress.h": "Verificando {total} CNPJs",
  "lote.progress.count": "{processados} de {total}",
  "lote.progress.leave":
    "Pode sair desta tela. A verificação continua e o resultado fica aqui.",
  "lote.progress.stale":
    "Reconectando… Os números voltam a atualizar sozinhos.",
  "lote.result.h": "Resultado",
  "lote.result.summary": "{total} CNPJs consultados em {duracao}.",
  "lote.legend.ok": "Tudo certo",
  "lote.legend.warn": "Atenção",
  "lote.legend.bad": "Crítico",
  "lote.legend.err": "Não consultados",
  "lote.result.errors.one":
    "1 CNPJ não foi consultado e não consumiu verificação.",
  "lote.result.errors.other":
    "{n} CNPJs não foram consultados e não consumiram verificações.",
  "lote.result.errors.cta": "Baixar erros (CSV)",
  "lote.result.download": "Baixar resultado (CSV)",
  "lote.table.filter": "Mostrar",
  "lote.table.filter.all": "Todos",
  "lote.table.next": "Próximos 25",
  "lote.table.first": "Voltar ao início",
  "lote.table.empty": "Nenhuma empresa com esse status neste lote.",
  "lote.table.cnpj": "CNPJ",
  "lote.table.razao": "Razão social",
  "lote.table.status": "Situação",
  "lote.table.motivos": "Motivos",
  "lote.toqueue.one": "Mandar 1 para a fila",
  "lote.toqueue.other": "Mandar os {n} para a fila",
  "lote.toqueue.done": "Abrir fila",
  "lote.monitor": "Ativar monitoramento semanal",
  "lote.monitor.on": "Monitoramento ativo",
  "lote.action.error": "Não deu certo. Tente de novo.",
  "toast.batch_queued.one": "1 caso na fila",
  "toast.batch_queued.other": "{n} casos na fila",
  "toast.monitor_on.one": "Monitoramento ativado para 1 vendedor",
  "toast.monitor_on.other": "Monitoramento ativado para {n} vendedores",
  "lote.failed.h": "A verificação parou no meio",
  "lote.failed.body":
    "{processados} de {total} CNPJs foram consultados. Os que faltam não consumiram verificações.",
  "lote.failed.cta": "Verificar os que faltam",
  "lote.why.h": "O que isso resolve",
  "lote.why.sub": "A base que já existe nunca foi checada.",
  "lote.why.generic.1":
    "Empresas inaptas ou baixadas que ainda vendem na plataforma.",
  "lote.why.generic.2":
    "Vendedores sem inscrição estadual, com risco de nota fiscal rejeitada.",
  "lote.why.generic.3": "Atividade fora da sua categoria.",
  "lote.why.bad.one": "1 vendedor inapto ou baixado",
  "lote.why.bad.other": "{n} vendedores inaptos ou baixados",
  "lote.why.bad.desc":
    "Ainda ativos na loja. A nota fiscal deles pode estar sendo rejeitada.",
  "lote.why.ie.one": "1 sem inscrição estadual",
  "lote.why.ie.other": "{n} sem inscrição estadual",
  "lote.why.ie.desc": "Risco de rejeição de NF-e em venda para outro estado.",
  "lote.why.cnae.one": "1 com CNAE fora da categoria",
  "lote.why.cnae.other": "{n} com CNAE fora da categoria",
  "lote.why.cnae.desc": "Vale olhar o que estão vendendo.",
  "lote.history.h": "Lotes anteriores",
  "lote.history.row": "{data}: {total} CNPJs",
  "lote.history.running": "Em andamento",
  "lote.history.error": "Não conseguimos carregar os lotes anteriores.",
  "lote.notfound.h": "Lote não encontrado",
  "lote.notfound.body": "Ele não existe ou não pertence a esta conta.",
} as const;
