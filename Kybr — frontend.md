# Kybr — frontend

Oct 2, 2026

## Contexto

Kybr é verificação de empresas (KYB) por link para marketplaces brasileiros com vendedores PJ. O vendedor abre um link, digita CNPJ e nome do responsável; a plataforma recebe um veredito (aprovar, revisar, bloquear) com seis checagens, uma fila para decidir os casos duvidosos e alertas quando uma empresa muda na Receita depois de aprovada. Os dados vêm da API do CNPJá, sempre via nosso backend — o frontend nunca fala com o CNPJá.

Este doc é só o que o frontend precisa. O plano completo (produto, lógica de verificação, backend, riscos) está em [Kybr — plano do projeto](https://claude.ai/artifact/9hweN7ajcTWBNquHVD22Ni). O [protótipo navegável](https://claude.ai/artifact/7HkAWTTa8LAzD18KreYnkm) é a referência de layout, copy e comportamento de todas as telas: na dúvida, faz igual ao protótipo.

## O que o frontend entrega

Duas superfícies, dois bundles:

| Superfície | Quem usa | Como é |
| --- | --- | --- |
| **Painel** (`app.kybr.com.br`) | ops/financeiro do marketplace, logado | SPA, sidebar com 9 seções, desktop-first mas usável no celular |
| **Link público** (`kybr.com.br/v/{slug}`) | vendedor, sem login, quase sempre no celular | página leve: 3 passos, 3 resultados, upload de PDF |

Stack: React 18 + TypeScript + Vite, React Router, TanStack Query para dados, Zod para validar respostas da API, CSS modules ou vanilla-extract com os tokens abaixo (sem Tailwind, para seguir o design system à risca). Testes com Vitest + Testing Library; Playwright para os três fluxos críticos (link, fila, lote).

Estrutura sugerida:

```
apps/
  painel/        # SPA
  link/          # página pública, bundle separado
packages/
  ui/            # componentes e tokens
  api/           # cliente gerado do OpenAPI + tipos
```

O pacote `api` é gerado a partir do OpenAPI que o backend expõe via springdoc (`openapi-typescript` + `openapi-fetch`). Nunca escrever tipos de resposta à mão.

## Design system

Base: `DESIGN.md` do mobbin (`npx getdesign@latest add mobbin`). Monocromático, cantos de 16/24, botões em pílula, sem sombra, sem gradiente, sem ícone decorativo. Cor só onde carrega significado.

| Token | Light | Dark | Uso |
| --- | --- | --- | --- |
| `--ink` | #141414 | #f5f5f5 | texto, botão primário |
| `--canvas` | #ffffff | #111111 | fundo |
| `--canvas-soft` | #f3f3f3 | #1b1b1b | cards, nav ativa, campos |
| `--hair` / `--hair-soft` | #e0e0e0 / #f0f0f0 | #2e2e2e / #222222 | bordas |
| `--muted` / `--faint` | #707070 / #adadad | #9a9a9a / #6a6a6a | texto secundário / terciário |
| `--accent` | #0066ff | igual | só o selo "monitoramento" |
| `--ok` / `--warn` / `--bad` | #1f9d55 / #d99a1b / #d6372f | igual (warn text #e9b64a) | semáforo das checagens |

Tipografia: Inter variável (Saans do original não está em CDN). Pesos: 652 títulos, 456 corpo, 600 botões e labels, 300 lead. Tamanhos: h1 32, h2 20, corpo 15, secundário 13, label 12. `-webkit-font-smoothing: antialiased`.

Raios: 16 campos e cards pequenos, 24 cards, pílula para botões, chips e badges. Botão primário 40px de altura no painel, 48px no link público.

Componentes do pacote `ui`, todos já desenhados no protótipo:

- `AppShell` — sidebar 240px com workspace, nav com contadores e bloco de plano; abaixo de 900px vira tabs horizontais com scroll.
- `StatusDot`, `StatusPill` — ok/warn/bad; sempre com texto ao lado, nunca cor sozinha.
- `VerdictHeader` — ponto, veredito 26px, nome + CNPJ, pílula com contagens.
- `CheckList` — seis linhas: ponto, título, descrição, valor à direita.
- `QueueList` / `QueueItem` / `QueueDetail` — lista selecionável (`aria-selected`), detalhe com `Timeline` e ações.
- `KpiCard`, `DataTable` (scroll horizontal, min-width 560), `RuleRow`, `Toggle` (`role=switch`), `Toast`.
- `DropZone`, `BatchProgress`, `BatchDonut` (SVG, três arcos).
- `SellerFlow` — os 3 passos do link e os 3 resultados.
- `Seal` — "vendedor verificado" com ponto verde.

## Telas e fluxos

**Painel**

| Tela | Mostra | Interações |
| --- | --- | --- |
| Início | 4 KPIs, 4 casos mais antigos da fila, feed de mudanças, barras dos últimos 7 dias | clique no caso abre a Fila já nele; "Copiar link"; "Verificar em lote" |
| Fila de revisão | lista (mais antigo primeiro) com motivo e SLA; detalhe à direita | selecionar caso; aprovar (sem confirmação); pedir documento (escolhe tipos); bloquear (pede motivo); baixar comprovante. Após decidir, caso some da lista e toast confirma |
| Vendedores | tabela paginada, busca, filtro por status | reverificar (mostra aviso "consome crédito"); exportar CSV com filtro aplicado |
| Verificar em lote | drop zone → prévia 5 linhas → progresso → donut + tabela | "mandar para a fila"; "ativar monitoramento" |
| Monitoramento | alertas das últimas varreduras; canais; frequência | toggles salvam na hora; teste de webhook |
| Regras | política por categoria (select no topo); lista de regras com ação; documentos exigíveis; simulação | mudar regra mostra aviso "não reprocessa casos antigos" |
| Relatório | KPIs do mês, motivos de bloqueio, tempo até aprovação, auditoria | seletor de mês; baixar PDF; exportar auditoria |
| Integrações | chaves de API (criar/revogar), webhooks (url, segredo, eventos, testar), exemplo de requisição | chave aparece uma vez, com botão copiar |
| Ver como vendedor | preview do link público dentro do painel | copiar link |

**Link público**

1. CNPJ com máscara `00.000.000/0000-00`, validação de dígito verificador no cliente. Ao completar 14 dígitos válidos, chama `/public/v/{slug}/lookup` e preenche razão social, endereço e CNAE num bloco cinza (autopreenchimento). Nome do responsável obrigatório.
2. "Verificando" com barra animada. Polling em `/public/v/{slug}/cases/{token}` a cada 2s; após 10s sem resposta, troca para "em análise, avisamos por e-mail" e libera o vendedor.
3. Um de três resultados, com a copy do protótipo: **tudo certo** (selo, 3 linhas de confirmação); **quase lá** (lista do que falta; item de documento tem botão de upload; prazo de revisão); **não aprovado** (motivo em linguagem simples, link oficial para regularizar, contato da plataforma).

Nunca mostrar ao vendedor as seis checagens cruas nem termos internos (QSA, veredito, política).

## Contrato com a API

Tudo passa por `https://api.kybr.com.br`. Painel autentica com sessão (cookie httpOnly após login); o link público não autentica. A fonte da verdade é o OpenAPI do backend; o que está aqui é o resumo para planejar as telas.

**Painel (`/v1`, cookie de sessão)**

| Tela | Chamadas |
| --- | --- |
| Início | `GET /dashboard` (KPIs, 4 casos, 4 alertas, série de 7 dias) |
| Fila | `GET /cases?estado=aberto&sort=sla` · `GET /cases/{id}` · `POST /cases/{id}/decide` · `POST /cases/{id}/request-documents` · `GET /verifications/{id}/certificate` |
| Vendedores | `GET /sellers?q=&status=&page=` · `POST /sellers/{id}/reverify` · `GET /sellers/export?status=` |
| Lote | `POST /batches` (multipart) · `GET /batches/{id}` (polling 2s) · `POST /batches/{id}/to-queue` · `POST /batches/{id}/monitor` |
| Monitoramento | `GET /alerts?limit=50` · `GET/PUT /settings/notifications` |
| Regras | `GET/PUT /policies/{categoria}` · `GET /policies/{categoria}/simulate` |
| Relatório | `GET /reports/monthly?month=2026-09` · `GET /reports/monthly.pdf` · `GET /reports/audit.csv` |
| Integrações | `GET/POST/DELETE /api-keys` · `GET/POST/DELETE /webhooks` · `POST /webhooks/{id}/test` |

**Link público (`/public/v/{slug}`)**

- `GET /lookup?cnpj=` → `{ razao_social, endereco, cnae }` ou 404
- `POST /verify` body `{ cnpj, responsavel, ref?, ext_id? }` → `{ token }`
- `GET /cases/{token}` → `{ estado: processing | approved | pending | blocked, resultado }`
- `POST /cases/{token}/documents` (multipart, `tipo`)

**Shapes principais (resumo)**

```ts
type Status = 'ok' | 'warn' | 'bad'
type Veredito = 'aprovar' | 'revisar' | 'bloquear'

interface Checagem { chave: string; titulo: string; descricao: string; valor: string; status: Status }

interface Verification {
  id: string; sellerId: string; modo: 'cache' | 'tempo_real'
  veredito: Veredito; checagens: Checagem[]; criadoEm: string
  comprovanteUrl?: string
}

interface Case {
  id: string; seller: SellerSummary; verification: Verification
  estado: 'aberto' | 'aguardando_doc' | 'decidido'
  motivos: string[]; slaAte: string; vencido: boolean
  eventos: { tipo: string; ator: string; em: string; dados?: unknown }[]
  documentos: { id: string; tipo: string; url: string; enviadoEm: string }[]
}

interface Seller {
  id: string; cnpj: string; razaoSocial: string; responsavel: string
  verificadoEm: string; statusAtual: Status; statusLabel: string
  seloAtivo: boolean; monitorado: boolean; mudou?: { campo: string; de: string; para: string }
}
```

Erros vêm como `{ code, message, field? }` com 4xx. O cliente mostra `message` no toast ou no campo; nunca o `code` cru.

## Estados, regras de UI e acessibilidade

| Tela | Vazio | Carregando | Erro |
| --- | --- | --- | --- |
| Fila | "Nenhum caso aberto" + link para o Lote | esqueleto de 5 itens | banner "Não carregou" com tentar de novo |
| Vendedores | "Ninguém verificado ainda" + copiar link | esqueleto da tabela | idem |
| Lote | drop zone | barra com `processados / total` | linha a linha: CNPJ inválido, falha de consulta; botão baixar erros |
| Monitoramento | "Ative para começar" | — | entrega de webhook falhou aparece como alerta |
| Link, passo 2 | — | barra animada até 10s; depois "em análise" | "CNPJ inválido" inline; "tente de novo" para rede |

Regras:

- Toda ação que grava mostra toast de confirmação; só "bloquear" pede motivo antes.
- Mutations usam atualização otimista só na Fila (caso some da lista na hora); no resto, espera a resposta.
- Dark mode por `prefers-color-scheme`, sem toggle manual na v1.
- Números em pt-BR (`Intl.NumberFormat('pt-BR')`), datas relativas no feed ("hoje 11:37", "ontem", "3 dias") e absolutas nas tabelas.
- CNPJ sempre formatado na tela, sempre só dígitos na API.
- Acessibilidade mínima: foco visível, `label` em todo input, `aria-selected` na fila, `role=switch` nos toggles, `aria-live=polite` nos toasts, contraste AA (os tokens já cumprem).
- Performance do link público: bundle < 60 kB gzip, sem React se o time preferir Preact ou vanilla; LCP < 2s em 4G.

## Entregas por fase

Mesmo calendário do plano principal: 10 semanas, fase 0 sem código. Enquanto o backend não existe, o front roda contra um mock do OpenAPI (MSW com as respostas do protótipo) — as telas podem ficar prontas antes da API.

**Fase 1 · Fundação (semanas 3–5)**

- [ ] Monorepo, Vite, lint, CI com Vitest
- [ ] Pacote `ui`: tokens, dark mode, `StatusDot`, `StatusPill`, `CheckList`, `VerdictHeader`, `Toast`, botões e campos
- [ ] Pacote `api`: geração a partir do OpenAPI (ou do mock, até existir); MSW com fixtures dos 3 CNPJs de exemplo
- [ ] Link público: 3 passos, 3 resultados, máscara e validação de CNPJ, autopreenchimento, upload, fallback "em análise" após 10s
- [ ] Playwright: fluxo do link ponta a ponta contra o mock

**Fase 2 · Operação (semanas 6–8)**

- [ ] `AppShell` com nav, contadores e versão mobile; login e sessão
- [ ] Início, Fila (lista + detalhe + timeline + ações), Vendedores (tabela, busca, filtro, export)
- [ ] Lote: drop zone, prévia, progresso por polling, donut, ações
- [ ] Regras: política por categoria, documentos, aviso de reprocessamento
- [ ] Trocar o mock pela API real; Playwright da fila e do lote

**Fase 3 · Monitorar (semanas 9–10)**

- [ ] Monitoramento: alertas, canais, frequência, teste de webhook
- [ ] Integrações: chaves, webhooks, exemplo de requisição
- [ ] Relatório básico e exportações
- [ ] Ver como vendedor; selo `Seal`; polimento, estados vazios e de erro em todas as telas

## Perguntas abertas e dependências do backend

- [ ] Autenticação do painel: cookie de sessão (proposta) ou JWT em header? Decide junto com o backend na semana 3.
- [ ] Progresso do lote: polling a cada 2s (proposta) ou SSE? Polling é mais simples; SSE se o backend já tiver.
- [ ] `GET /dashboard` agrega tudo do Início numa chamada, ou o front compõe de 4 endpoints? Proposta: um endpoint.
- [ ] Upload de documento: direto para o storage com URL assinada, ou via backend? Via backend na v1 (mais simples, 10 MB cabe).
- [ ] Link público em React, Preact ou vanilla? Decide pelo peso do bundle após o primeiro build.
- [ ] Onde hospedar o front: Vercel/Cloudflare Pages (proposta) com `api.kybr.com.br` apontando para o backend.

Qualquer dúvida de comportamento que não esteja aqui nem no protótipo: perguntar antes de inventar, e registrar a resposta neste doc.
