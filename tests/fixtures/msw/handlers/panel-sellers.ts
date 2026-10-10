import {
  delay,
  http,
  HttpResponse,
  type JsonBodyType,
  type RequestHandler,
} from "msw";

import {
  DOCUMENTO_TIPOS,
  maskedCnpj,
  type DocumentoTipo,
} from "../../factories/panel.ts";
import {
  CSV_CAP_BYTES,
  POLICY_ACOES,
  POLICY_CHAVES,
  POLICY_DOCUMENTOS,
  SELLER_PAGE_SIZE,
  SELLER_QUERY_MAX,
  SELLER_STATUSES,
  auditRowsFor,
  checksFor,
  csvOfBytes,
  type PolicyAcao,
  type PolicyRule,
  type SellerRecord,
} from "../../factories/panel-sellers.ts";
import {
  SELLER_ENDPOINTS,
  SELLER_FAULT_KINDS,
  isSellerPreset,
  ownSeller,
  panelStore,
  policyOf,
  scenarioApplies,
  seedSellers,
  sellersOf,
  sessionAccount,
  setSellerFault,
  takeSellerFault,
  type Account,
  type SellerEndpoint,
  type SellerFault,
} from "../panel-store.ts";
import { csvBody } from "./panel-batches.ts";
import {
  apiError,
  incoming,
  networkDrop,
  ok,
  type Incoming,
} from "./panel-common.ts";

// Pre-Contract handlers for Vendedores and Regras (ops-panel
// contract-request.md D-S1–D-S5 and D-R1, C-M8-2–C-M8-6; MSW scenarios
// PS1–PS10, PR1–PR5) and the M8b loopback controls (QA's M8 fixture gaps
// G1–G3, G5, G6, G8, G9). Every fault and seed is per account: the E2E
// projects share one mock.

const DAY_MS = 86_400_000;
const SAO_PAULO_OFFSET_MS = 3 * 60 * 60_000; // UTC−3, no DST since 2019
const AUDIT_MAX_MONTHS = 12; // C-M8-5
const DIAS_MIN = 1;
const DIAS_MAX = 3650;
// X7: an MEI's CPF in a name, formatted or bare (the backend masks it, O-F4).
const CPF_IN_NAME = /\d{3}\.?\d{3}\.?\d{3}-?\d{2}/g;
const CPF_MASK = "***.***.***-**";

/** The session's account, with the call logged (QA G5) and its fault applied (G2). */
async function authed(
  request: Request,
  endpoint: SellerEndpoint,
): Promise<
  | { account: Account; fault?: SellerFault; incoming: Incoming }
  | { reply: Response }
> {
  const seen = await incoming(request);
  if (seen.refused) return { reply: seen.refused };
  const account = sessionAccount(seen.token);
  if (!account) return { reply: apiError(401, "SESSAO_EXPIRADA") };
  seen.call.email = account.email;
  const key = request.headers.get("idempotency-key");
  if (key) seen.call.idempotencyKey = key;
  const fault = takeSellerFault(account.email, endpoint);
  if (fault?.kind === "delay") await delay(fault.ms ?? 1_000);
  if (fault?.kind === "500") return { reply: apiError(500, "ERRO_INTERNO") };
  if (fault?.kind === "503") return { reply: apiError(503, "INDISPONIVEL") };
  if (fault?.kind === "drop") return { reply: networkDrop() };
  return { account, incoming: seen, ...(fault && { fault }) };
}

const notFound = (): Response => apiError(404, "RECURSO_NAO_ENCONTRADO");
const invalid = (field: string): Response =>
  apiError(422, "VALOR_INVALIDO", { field });

const ISO = (ms: number): string => new Date(ms).toISOString();

/** Case- and accent-insensitive. */
function fold(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** C-M8-2: own sellers whose name contains `q` or whose CNPJ starts with it (normalized). */
function matches(seller: SellerRecord, q: string): boolean {
  if (
    seller.razao_social !== null &&
    fold(seller.razao_social).includes(fold(q))
  )
    return true;
  const prefix = q.replace(/[.\-/\s]/g, "").toUpperCase();
  return /^[0-9A-Z]+$/.test(prefix) && seller.cnpj.startsWith(prefix);
}

type Filter = { q?: string; status?: string };

/** The D-S1 / D-S4 filter from the query, or the field it refuses. */
function filterFrom(params: URLSearchParams): Filter | { bad: string } {
  const q = params.get("q") ?? undefined;
  const status = params.get("status") ?? undefined;
  if (q !== undefined && q.length > SELLER_QUERY_MAX) return { bad: "q" };
  if (
    status !== undefined &&
    !(SELLER_STATUSES as readonly string[]).includes(status)
  )
    return { bad: "status" };
  return {
    ...(q !== undefined && q !== "" && { q }),
    ...(status !== undefined && { status }),
  };
}

function filtered(email: string, filter: Filter): SellerRecord[] {
  return sellersOf(email).filter(
    (seller) =>
      (filter.status === undefined || seller.status === filter.status) &&
      (filter.q === undefined || matches(seller, filter.q)),
  );
}

function rowView(seller: SellerRecord): Record<string, unknown> {
  return {
    id: seller.id,
    razao_social: seller.razao_social,
    cnpj: seller.cnpj,
    ...(seller.responsavel !== undefined && {
      responsavel: seller.responsavel,
    }),
    origem: seller.origem,
    verificado_em: ISO(seller.verificado_em),
    status: seller.status,
    ...(seller.mudou && { mudou: { ...seller.mudou } }),
    monitorado: seller.monitorado,
    reverificacao_pendente: seller.reverificacao_pendente,
  };
}

function detailView(seller: SellerRecord): Record<string, unknown> {
  return {
    ...rowView(seller),
    verificacao_atual: {
      id: seller.verification.id,
      modo: seller.verification.modo,
      checagens: seller.verification.checagens.map((check) => ({ ...check })),
      criado_em: ISO(seller.verification.criado_em),
    },
    verificacoes: seller.historico.slice(0, 20).map((item) => ({
      id: item.id,
      veredito: item.veredito,
      criado_em: ISO(item.criado_em),
    })),
    ...(seller.case_aberto_id !== undefined && {
      case_aberto_id: seller.case_aberto_id,
    }),
  };
}

function plano(account: Account): Account["workspace"]["plano"] {
  return account.workspace.plano;
}

/** C-M8-4: one credit, on a copy (presets share their plan objects). */
function charge(account: Account, credits: number): void {
  const current = plano(account);
  if (current)
    account.workspace.plano = {
      ...current,
      usadas: Math.max(0, current.usadas + credits),
    };
}

// --- CSVs (C-M8-5) --------------------------------------------------------------

const CSV_HEADERS = { "Content-Type": "text/csv; charset=utf-8" };

/** QA G3: the byte-exact and wrong-type replies for a CSV endpoint. */
function csvFault(fault: SellerFault | undefined): Response | undefined {
  const reply = (body: string, type = CSV_HEADERS["Content-Type"]) =>
    new HttpResponse(body, {
      status: 200,
      headers: { "Content-Type": type, "X-Request-Id": crypto.randomUUID() },
    });
  switch (fault?.kind) {
    case "csv-exato":
      return reply(csvOfBytes(CSV_CAP_BYTES));
    case "csv-grande":
      return reply(csvOfBytes(CSV_CAP_BYTES + 1));
    case "csv-html":
      return reply("<html><body>erro</body></html>", "text/html");
    default:
      return undefined;
  }
}

function csvReply(lines: string[][], escape: boolean): Response {
  return new HttpResponse(csvBody(lines, escape), {
    status: 200,
    headers: { ...CSV_HEADERS, "X-Request-Id": crypto.randomUUID() },
  });
}

const maskCpf = (name: string): string => name.replace(CPF_IN_NAME, CPF_MASK);

/** "dd/mm/aaaa hh:mm" in São Paulo. */
function brDateTime(ms: number): string {
  const local = new Date(ms - SAO_PAULO_OFFSET_MS).toISOString();
  return `${local.slice(8, 10)}/${local.slice(5, 7)}/${local.slice(0, 4)} ${local.slice(11, 16)}`;
}

const STATUS_LABEL: Record<string, string> = {
  aprovado: "Aprovado",
  revisao: "Em revisão",
  bloqueado: "Bloqueado",
  mudou: "Mudou desde a aprovação",
};

/** A real calendar day (YYYY-MM-DD) as the UTC midnight of that day, or undefined. */
function calendarDay(value: string | null): number | undefined {
  if (value === null || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const ms = Date.parse(`${value}T00:00:00Z`);
  return Number.isNaN(ms) || ISO(ms).slice(0, 10) !== value ? undefined : ms;
}

/** C-M8-5: ate >= de and at most 12 months apart. */
function auditRange(
  params: URLSearchParams,
): { from: number; to: number } | undefined {
  const de = calendarDay(params.get("de"));
  const ate = calendarDay(params.get("ate"));
  if (de === undefined || ate === undefined || ate < de) return undefined;
  const limit = new Date(de);
  limit.setUTCMonth(limit.getUTCMonth() + AUDIT_MAX_MONTHS);
  if (ate > limit.getTime()) return undefined;
  // São Paulo days: [de 00:00, ate+1 00:00) at UTC−3.
  return {
    from: de + SAO_PAULO_OFFSET_MS,
    to: ate + DAY_MS + SAO_PAULO_OFFSET_MS,
  };
}

// --- Policy (C-M8-6) ------------------------------------------------------------

function policyView(account: Account): Record<string, unknown> {
  const policy = policyOf(account.email);
  return {
    versao: policy.versao,
    regras: policy.regras.map((regra) => ({
      ...regra,
      acoes_permitidas: [...regra.acoes_permitidas],
    })),
    documentos_habilitados: [
      ...(account.workspace.documentos_habilitados ?? POLICY_DOCUMENTOS),
    ],
  };
}

/**
 * The PUT body's rules against the server's (O-F7: the server's own
 * acoes_permitidas, never the client's), or the field it refuses.
 */
function rulesFrom(
  value: unknown,
  current: readonly PolicyRule[],
): PolicyRule[] | { bad: string } {
  if (!Array.isArray(value) || value.length !== POLICY_CHAVES.length)
    return { bad: "regras" };
  const next: PolicyRule[] = [];
  for (const server of current) {
    const sent = (value as unknown[]).find(
      (item): item is Record<string, unknown> =>
        typeof item === "object" &&
        item !== null &&
        (item as Record<string, unknown>).chave === server.chave,
    );
    if (!sent) return { bad: "regras" };
    const acao = sent.acao;
    if (
      !(POLICY_ACOES as readonly unknown[]).includes(acao) ||
      !server.acoes_permitidas.includes(acao as PolicyAcao)
    )
      return { bad: `regras.${server.chave}.acao` };
    const rule: PolicyRule = { ...server, acao: acao as PolicyAcao };
    if (server.chave === "recente") {
      const dias = sent.dias;
      if (
        typeof dias !== "number" ||
        !Number.isInteger(dias) ||
        dias < DIAS_MIN ||
        dias > DIAS_MAX
      )
        return { bad: "regras.recente.dias" };
      rule.dias = dias;
    }
    next.push(rule);
  }
  return next;
}

function documentosFrom(value: unknown): DocumentoTipo[] | undefined {
  if (
    !Array.isArray(value) ||
    !value.every((item) =>
      (DOCUMENTO_TIPOS as readonly unknown[]).includes(item),
    )
  )
    return undefined;
  return [...new Set(value as DocumentoTipo[])];
}

export const panelSellerHandlers: RequestHandler[] = [
  // D-S4 (C-M8-5): before /v1/sellers/:id, which would take "export".
  http.get("*/v1/sellers/export", async ({ request }) => {
    const auth = await authed(request, "sellers-csv");
    if ("reply" in auth) return auth.reply;
    const faulty = csvFault(auth.fault);
    if (faulty) return faulty;
    const filter = filterFrom(new URL(request.url).searchParams);
    if ("bad" in filter) return invalid(filter.bad);
    const escape = !scenarioApplies("csv-sem-escape", auth.account.email);
    return csvReply(
      [
        [
          "CNPJ",
          "Razão social",
          "Responsável",
          "Origem",
          "Verificado em",
          "Status",
          "Monitorado",
        ],
        ...filtered(auth.account.email, filter).map((seller) => [
          maskedCnpj(seller.cnpj),
          maskCpf(seller.razao_social ?? ""),
          seller.responsavel ?? "",
          seller.origem === "link" ? "Link" : "Lote",
          brDateTime(seller.verificado_em),
          STATUS_LABEL[seller.status] ?? seller.status,
          seller.monitorado ? "Sim" : "Não",
        ]),
      ],
      escape,
    );
  }),

  // D-S1 (C-M8-2): PS1–PS4, PS9.
  http.get("*/v1/sellers", async ({ request }) => {
    const auth = await authed(request, "sellers");
    if ("reply" in auth) return auth.reply;
    if (scenarioApplies("vendedores-falha", auth.account.email))
      return apiError(500, "ERRO_INTERNO");
    const params = new URL(request.url).searchParams;
    const filter = filterFrom(params);
    if ("bad" in filter) return invalid(filter.bad);
    const pagina = Number(params.get("pagina") ?? "1");
    if (!Number.isInteger(pagina) || pagina < 1) return invalid("pagina");
    const limite = Number(params.get("limite") ?? String(SELLER_PAGE_SIZE));
    if (!Number.isInteger(limite) || limite < 1 || limite > SELLER_PAGE_SIZE)
      return invalid("limite");
    const rows = filtered(auth.account.email, filter);
    const start = (pagina - 1) * limite;
    return ok({
      itens: rows.slice(start, start + limite).map(rowView),
      total: rows.length,
      pagina,
      paginas: Math.ceil(rows.length / limite),
    } as JsonBodyType);
  }),

  // D-S2 (C-M8-3): PS8, PS10.
  http.get("*/v1/sellers/:id", async ({ request, params }) => {
    const auth = await authed(request, "seller");
    if ("reply" in auth) return auth.reply;
    sellersOf(auth.account.email);
    const seller = ownSeller(String(params.id), auth.account.email);
    if (!seller) return notFound();
    return ok(detailView(seller) as JsonBodyType);
  }),

  // D-S3 (C-M8-4): PS5. The key replays the first reply; a pending
  // reverify is a 409 that never spends a second credit.
  http.post("*/v1/sellers/:id/reverify", async ({ request, params }) => {
    const auth = await authed(request, "reverify");
    if ("reply" in auth) return auth.reply;
    const { account } = auth;
    const key = request.headers.get("idempotency-key") ?? "";
    if (!/^[0-9a-f-]{36}$/i.test(key)) return invalid("Idempotency-Key");
    sellersOf(account.email);
    const seller = ownSeller(String(params.id), account.email);
    if (!seller) return notFound();
    const store = panelStore();
    const previous = store.sellerKeys.get(`${account.email}|${key}`);
    if (previous) {
      if (previous.sellerId !== seller.id) return invalid("Idempotency-Key");
      return ok(previous.reply as JsonBodyType, previous.status);
    }
    if (seller.reverificacao_pendente)
      return apiError(409, "REVERIFICACAO_EM_ANDAMENTO");
    const current = plano(account);
    if (!current || current.limite - current.usadas < 1)
      return apiError(402, "SEM_SALDO", { disponiveis: 0 });
    charge(account, 1);
    seller.reverificacao_pendente = true;
    const reply = { reverificacao_pendente: true };
    store.sellerKeys.set(`${account.email}|${key}`, {
      sellerId: seller.id,
      status: 202,
      reply,
    });
    return ok(reply, 202);
  }),

  // D-S5 (C-M8-5): PS7. No IP or session hash; the CPF masked (O-F4).
  http.get("*/v1/reports/audit.csv", async ({ request }) => {
    const auth = await authed(request, "audit-csv");
    if ("reply" in auth) return auth.reply;
    const faulty = csvFault(auth.fault);
    if (faulty) return faulty;
    const range = auditRange(new URL(request.url).searchParams);
    if (!range) return invalid("de");
    const escape = !scenarioApplies("csv-sem-escape", auth.account.email);
    return csvReply(
      [
        ["Data e hora", "Ação", "Vendedor", "CNPJ", "Detalhe"],
        ...auditRowsFor(Date.now())
          .filter((row) => row.em >= range.from && row.em < range.to)
          .map((row) => [
            brDateTime(row.em),
            row.acao,
            maskCpf(row.vendedor),
            maskedCnpj(row.cnpj),
            row.detalhe,
          ]),
      ],
      escape,
    );
  }),

  // D-R1 (C-M8-6): PR1, PR5. Only the workspace's own category.
  http.get("*/v1/policies/:categoria", async ({ request, params }) => {
    const auth = await authed(request, "policy-get");
    if ("reply" in auth) return auth.reply;
    if (scenarioApplies("regras-falha", auth.account.email))
      return apiError(500, "ERRO_INTERNO");
    if (params.categoria !== auth.account.workspace.categoria)
      return notFound();
    return ok(policyView(auth.account) as JsonBodyType);
  }),

  // D-R1 PUT: PR2–PR4. The whole object with versao; documentos_habilitados
  // go to the workspace, so /me reflects them (C-M6-4).
  http.put("*/v1/policies/:categoria", async ({ request, params }) => {
    const auth = await authed(request, "policy-put");
    if ("reply" in auth) return auth.reply;
    const { account, incoming: seen } = auth;
    const { body } = seen;
    if (typeof body.versao === "number") seen.call.versao = body.versao;
    if (params.categoria !== account.workspace.categoria) return notFound();
    const policy = policyOf(account.email);
    if (typeof body.versao !== "number" || !Number.isInteger(body.versao))
      return invalid("versao");
    if (body.versao !== policy.versao)
      return apiError(409, "POLITICA_DESATUALIZADA");
    const regras = rulesFrom(body.regras, policy.regras);
    if ("bad" in regras) return invalid(regras.bad);
    const documentos = documentosFrom(body.documentos_habilitados);
    if (documentos === undefined) return invalid("documentos_habilitados");
    if (
      documentos.length === 0 &&
      regras.some((regra) => regra.acao === "request")
    )
      return apiError(422, "SEM_DOCUMENTO_HABILITADO");
    policy.versao += 1;
    policy.regras = regras;
    account.workspace.documentos_habilitados = documentos;
    return ok(policyView(account) as JsonBodyType);
  }),
];

// --- Loopback-only controls -----------------------------------------------------

async function controlBody(request: Request): Promise<Record<string, unknown>> {
  const parsed = (await request.json().catch(() => ({}))) as unknown;
  return typeof parsed === "object" && parsed !== null
    ? (parsed as Record<string, unknown>)
    : {};
}

export const panelSellerControlHandlers: RequestHandler[] = [
  // QA G1: { email, preset: ps1 | vazio } seeds the account's sellers.
  http.post("*/__mock/panel/sellers/seed", async ({ request }) => {
    const { email, preset } = await controlBody(request);
    if (typeof email !== "string" || !isSellerPreset(preset))
      return new HttpResponse(null, { status: 400 });
    seedSellers(email, preset);
    return new HttpResponse(null, { status: 201 });
  }),
  // QA G2 / G3: { email, endpoint, kind, ms?, times? } (kind null clears it).
  http.post("*/__mock/panel/sellers/fault", async ({ request }) => {
    const { email, endpoint, kind, ms, times } = await controlBody(request);
    if (
      typeof email !== "string" ||
      !(SELLER_ENDPOINTS as readonly unknown[]).includes(endpoint) ||
      (kind !== null &&
        !(SELLER_FAULT_KINDS as readonly unknown[]).includes(kind))
    )
      return new HttpResponse(null, { status: 400 });
    setSellerFault(
      email,
      endpoint as SellerEndpoint,
      kind === null
        ? undefined
        : {
            kind: kind as SellerFault["kind"],
            ...(typeof ms === "number" && { ms }),
            ...(typeof times === "number" && { times }),
          },
    );
    return new HttpResponse(null, { status: 204 });
  }),
  // PS5 / O-21: the lookup finishes. { resultado: "falha" } releases the
  // credit (C-M8-4) and changes nothing else; otherwise mudou clears.
  http.post(
    "*/__mock/panel/sellers/:id/complete-reverify",
    async ({ request, params }) => {
      const { resultado } = await controlBody(request);
      const seller = panelStore().sellers.get(String(params.id));
      if (!seller?.reverificacao_pendente)
        return new HttpResponse(null, { status: 404 });
      seller.reverificacao_pendente = false;
      const account = panelStore().accounts.get(seller.email);
      if (resultado === "falha") {
        if (account) charge(account, -1);
        return new HttpResponse(null, { status: 204 });
      }
      const now = Date.now();
      const id = crypto.randomUUID();
      if (seller.status === "mudou") seller.status = "bloqueado";
      delete seller.mudou;
      seller.verificado_em = now;
      seller.verification = {
        id,
        modo: "tempo_real",
        checagens: checksFor(seller.status),
        criado_em: now,
      };
      seller.historico.unshift({
        id,
        veredito: seller.status === "bloqueado" ? "bloquear" : "aprovar",
        criado_em: now,
      });
      return new HttpResponse(null, { status: 204 });
    },
  ),
  // The tests' needles: ?email= → each seller's id, n, CNPJ, status and open case.
  http.get("*/__mock/panel/sellers", ({ request }) => {
    const email = (
      new URL(request.url).searchParams.get("email") ?? ""
    ).toLowerCase();
    return HttpResponse.json(
      sellersOf(email).map((seller) => ({
        id: seller.id,
        n: seller.n,
        cnpj: seller.cnpj,
        status: seller.status,
        ...(seller.case_aberto_id !== undefined && {
          case_aberto_id: seller.case_aberto_id,
        }),
      })),
    );
  }),
  // QA G6: { email } → another tab saved: versao + 1 and mei's action flips.
  http.post("*/__mock/panel/policy/bump", async ({ request }) => {
    const { email } = await controlBody(request);
    if (typeof email !== "string")
      return new HttpResponse(null, { status: 400 });
    const policy = policyOf(email.toLowerCase());
    policy.versao += 1;
    policy.regras = policy.regras.map((regra) =>
      regra.chave === "mei"
        ? { ...regra, acao: regra.acao === "review" ? "approve" : "review" }
        : regra,
    );
    return new HttpResponse(null, { status: 204 });
  }),
];
