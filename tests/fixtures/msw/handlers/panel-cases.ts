import { delay, http, HttpResponse, type RequestHandler } from "msw";

import {
  CASE_KINDS,
  CASE_LIMIT_MAX,
  CASE_PAGE_SIZE,
  DEFAULT_DOCUMENTOS,
  DESDE_MAX_AGE_MS,
  DOC_REQUEST_DEADLINE_MS,
  DOCUMENTO_TIPOS,
  JPEG_BYTES,
  MOTIVO_CODIGOS,
  PDF_BYTES,
  PNG_BYTES,
  REOPENED_SLA_MS,
  caseFor,
  randomToken,
  type CaseKind,
  type CaseRecord,
  type DecisaoTipo,
  type DocumentoTipo,
  type MotivoCodigo,
} from "../../factories/panel.ts";
import {
  addCase,
  caseNow,
  casesOf,
  docForSig,
  isCasePreset,
  mintDocSig,
  ownCase,
  panelStore,
  recordCall,
  seedCases,
  sessionAccount,
  setCaseClock,
  CASE_FAULT_KINDS,
  setCaseFault,
  takeCaseFault,
  type Account,
  type CallRecord,
  type CaseEndpoint,
  type CaseFault,
} from "../panel-store.ts";
import { apiError, incoming, networkDrop, ok } from "./panel-common.ts";

// Pre-Contract handlers for the Fila (ops-panel contract-request.md D-C1–D-C6,
// C-M6-1–C-M6-10, MSW scenarios PC1–PC22) and their loopback controls
// (QA's fixture gaps G1–G12). Every fault and seed is per account: the E2E
// projects share one mock.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_OFFSET =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;
const NOTA_MAX = 280;
const CERTIFICATE_MAX_BYTES = 5 * 1024 * 1024;

/** The mock's own origin for signed document URLs (a different origin from the panel host). */
function docsOrigin(): string {
  return (
    process.env.MOCK_DOCS_ORIGIN ??
    `http://localhost:${process.env.MOCK_API_PORT ?? "4010"}`
  );
}

/** The link host the seller's case link lives on (D-C4, CR-P9). */
function linkHost(): string {
  return (
    process.env.MOCK_LINK_HOST ?? process.env.LINK_HOST ?? "localhost:3000"
  );
}

const ISO = (ms: number): string => new Date(ms).toISOString();

// --- Wire views ----------------------------------------------------------------

function summaryView(record: CaseRecord, now: number): Record<string, unknown> {
  return {
    id: record.id,
    razao_social: record.razao_social,
    cnpj: record.cnpj,
    veredito: record.veredito,
    status: record.status,
    motivos: record.motivos,
    origem: record.origem,
    sla_ate: ISO(record.sla_ate),
    vencido: record.estado === "aberto" && record.sla_ate < now,
    criado_em: ISO(record.criado_em),
  };
}

function sellerLink(account: Account, token: string): string {
  return `https://${linkHost()}/v/${account.workspace.slug}/c/${token}`;
}

/** A signed URL for one document read (C-M6-5), bent by a G9 fault. */
function documentUrl(
  record: CaseRecord,
  docId: string,
  fault: CaseFault | undefined,
): string {
  const sig = mintDocSig(record.email, record.id, docId);
  const path = `/__docs/${docId}?sig=${sig}`;
  const origin = new URL(docsOrigin());
  const port = origin.port || (origin.protocol === "https:" ? "443" : "80");
  switch (fault?.kind) {
    case "host-estranho":
      return `https://docs.estranho.test${path}`;
    case "userinfo":
      return `${origin.protocol}//usuario:senha@${origin.host}${path}`;
    case "host-parecido":
      return `${origin.protocol}//${origin.hostname}.exemplo.test:${port}${path}`;
    case "porta":
      return `${origin.protocol}//${origin.hostname}:${Number(port) + 1}${path}`;
    case "http-externo":
      return `http://docs.exemplo.test${path}`;
    default:
      return `${origin.origin}${path}`;
  }
}

function caseView(
  account: Account,
  record: CaseRecord,
  options: { omit?: { eventos?: boolean; documentos?: boolean } } = {},
): Record<string, unknown> {
  const now = caseNow(account.email);
  const urlFault = takeCaseFault(account.email, "doc-url");
  const view: Record<string, unknown> = {
    ...summaryView(record, now),
    seller: record.seller,
    verification: {
      ...record.verification,
      criado_em: ISO(record.verification.criado_em),
    },
    estado: record.estado,
    vendedor_tem_email: record.vendedor_tem_email,
    ...(record.consultado_em !== undefined && {
      consultado_em: ISO(record.consultado_em),
    }),
    ...(record.mudanca && {
      mudanca: {
        ...record.mudanca,
        detectado_em: ISO(record.mudanca.detectado_em),
      },
    }),
    ...(record.responsavel_informado !== undefined && {
      responsavel_informado: record.responsavel_informado,
    }),
    ...(record.ext_id !== undefined && { ext_id: record.ext_id }),
    ...(record.variante && { variante: record.variante }),
    ...(record.decisao && {
      decisao: { ...record.decisao, em: ISO(record.decisao.em) },
    }),
    // D-C2: while a request is open and the seller has no e-mail.
    ...(record.estado === "aguardando_doc" &&
      record.linkToken !== undefined && {
        link_vendedor: sellerLink(account, record.linkToken),
      }),
    ...(!options.omit?.eventos && {
      // C-M6-5: newest first, no `ator`.
      eventos: [...record.eventos].reverse(),
    }),
    ...(!options.omit?.documentos && {
      documentos: record.documentos.map((doc) => ({
        id: doc.id,
        tipo: doc.tipo,
        enviado_em: doc.enviado_em,
        url: documentUrl(record, doc.id, urlFault),
      })),
    }),
    ...record.extra,
  };
  return view;
}

// --- Plumbing --------------------------------------------------------------------

/**
 * The session's account (annotating the call log with its e-mail, the F7
 * page path and the poll flag), or a reply. The account's fault for this
 * endpoint applies here: delay waits; 500 / 503 / drop answer; the rest
 * come back in `fault`.
 */
async function authed(
  request: Request,
  endpoint: CaseEndpoint,
  touch = true,
): Promise<
  | {
      account: Account;
      body: Record<string, unknown>;
      call: CallRecord;
      fault: CaseFault | undefined;
    }
  | { reply: Response }
> {
  const { body, token, refused, call } = await incoming(request);
  if (refused) return { reply: refused };
  const account = sessionAccount(token, touch);
  if (!account) return { reply: apiError(401, "SESSAO_EXPIRADA") };
  call.email = account.email;
  const pagePath = request.headers.get("x-kybr-panel-path");
  if (pagePath) call.pagePath = pagePath;
  const key = request.headers.get("idempotency-key");
  if (key) call.idempotencyKey = key;
  const fault = takeCaseFault(account.email, endpoint);
  if (fault?.kind === "delay") await delay(fault.ms ?? 1_000);
  if (fault?.kind === "500") return { reply: apiError(500, "ERRO_INTERNO") };
  if (fault?.kind === "503") return { reply: apiError(503, "INDISPONIVEL") };
  if (fault?.kind === "drop") return { reply: networkDrop() };
  return { account, body, call, fault };
}

const notFound = (): Response => apiError(404, "CASO_NAO_ENCONTRADO");

function encodeCursor(offset: number): string {
  return Buffer.from(JSON.stringify({ o: offset })).toString("base64url");
}

function decodeCursor(cursor: string): number | undefined {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString()) as {
      o?: unknown;
    };
    return typeof parsed.o === "number" &&
      Number.isInteger(parsed.o) &&
      parsed.o >= 0
      ? parsed.o
      : undefined;
  } catch {
    return undefined;
  }
}

/** D-C1 sort: sla_ate ascending, then id (stable). */
function bySla(a: CaseRecord, b: CaseRecord): number {
  return a.sla_ate - b.sla_ate || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/** A-X7: the first reply for this key and body, or a conflict for another body. */
function keyed(
  email: string,
  key: string,
  fingerprint: string,
): { replay?: { status: number; reply: unknown }; conflict?: true } {
  const previous = panelStore().caseKeys.get(`${email}|${key}`);
  if (!previous) return {};
  if (previous.fingerprint !== fingerprint) return { conflict: true };
  return { replay: { status: previous.status, reply: previous.reply } };
}

function remember(
  email: string,
  key: string,
  fingerprint: string,
  status: number,
  reply: unknown,
): void {
  panelStore().caseKeys.set(`${email}|${key}`, { fingerprint, status, reply });
}

/** QA G11 lista-atrasada: keep showing the case as it was for n reads. */
function lag(account: Account, record: CaseRecord): void {
  const fault = takeCaseFault(account.email, "lag");
  if (fault?.kind !== "lista-atrasada") return;
  panelStore().lagging.set(account.email, {
    snapshot: structuredClone(record),
    reads: fault.reads ?? 2,
  });
}

function conflict(record: CaseRecord): Response {
  const decisao = record.decisao;
  return HttpResponse.json(
    {
      code: "CASO_JA_DECIDIDO",
      message: "MSG-BACKEND-NAO-EXIBIR",
      ...(decisao && {
        decidido_em: ISO(decisao.em),
        decisao: {
          tipo: decisao.tipo,
          ...(decisao.motivo_codigo && {
            motivo_codigo: decisao.motivo_codigo,
          }),
        },
      }),
    },
    { status: 409, headers: { "X-Request-Id": crypto.randomUUID() } },
  );
}

/** Applies a decision (D-C3); every open link token is revoked (CR-P9). */
function decide(
  record: CaseRecord,
  now: number,
  decisao: {
    tipo: DecisaoTipo;
    motivo_codigo?: MotivoCodigo;
    nota_vendedor?: string;
  },
): void {
  record.estado = "decidido";
  record.decisao = { ...decisao, em: now };
  record.eventos.push({
    tipo: "decidido",
    em: ISO(now),
    dados: { decisao: decisao.tipo },
  });
  if (record.linkToken !== undefined) {
    record.revokedTokens.push(record.linkToken);
    delete record.linkToken;
  }
}

function fileReply(
  bytes: Uint8Array,
  type: string,
  extra: Record<string, string> = {},
): Response {
  return new HttpResponse(bytes, {
    status: 200,
    headers: {
      "Content-Type": type,
      "X-Request-Id": crypto.randomUUID(),
      ...extra,
    },
  });
}

// --- API -------------------------------------------------------------------------

export const panelCaseHandlers: RequestHandler[] = [
  // D-C1 (+ C-M6-1 `desde`, C-M6-2 `limit` ≤ 200)
  http.get("*/v1/cases", async ({ request }) => {
    const url = new URL(request.url);
    const desde = url.searchParams.get("desde");
    const poll = request.headers.get("x-kybr-poll") === "1";
    // A poll doesn't keep the session alive (C-M6-1, F10).
    const auth = await authed(request, desde === null ? "list" : "poll", !poll);
    if ("reply" in auth) return auth.reply;
    const { account, fault } = auth;
    const now = caseNow(account.email);
    const estado = url.searchParams.get("estado");

    if (desde !== null) {
      const since = Date.parse(desde);
      if (
        estado !== "aberto" ||
        !ISO_OFFSET.test(desde) ||
        Number.isNaN(since) ||
        now - since > DESDE_MAX_AGE_MS
      )
        return apiError(422, "VALOR_INVALIDO", { field: "desde" });
      return ok({
        novos: casesOf(account.email).filter(
          (record) => record.estado === "aberto" && record.abertoEm > since,
        ).length,
      });
    }

    if (estado !== "aberto" && estado !== "aguardando_doc")
      return apiError(422, "VALOR_INVALIDO", { field: "estado" });
    const limitParam = url.searchParams.get("limit");
    const limit = limitParam === null ? CASE_PAGE_SIZE : Number(limitParam);
    if (!Number.isInteger(limit) || limit < 1 || limit > CASE_LIMIT_MAX)
      return apiError(422, "VALOR_INVALIDO", { field: "limit" });
    const cursor = url.searchParams.get("cursor");
    const offset = cursor === null ? 0 : decodeCursor(cursor);
    if (offset === undefined)
      return apiError(422, "VALOR_INVALIDO", { field: "cursor" });

    let items = casesOf(account.email).filter(
      (record) => record.estado === estado,
    );
    // G11: a case decided a moment ago, still listed for n reads.
    const lagging = panelStore().lagging.get(account.email);
    if (lagging && lagging.snapshot.estado === estado) {
      items = [
        ...items.filter((record) => record.id !== lagging.snapshot.id),
        lagging.snapshot,
      ];
      if (lagging.reads <= 1) panelStore().lagging.delete(account.email);
      else lagging.reads -= 1;
    }
    items.sort(bySla);
    const page = items.slice(offset, offset + limit);
    const next =
      offset + limit < items.length ? encodeCursor(offset + limit) : null;
    const itens = page.map((record) => summaryView(record, now));
    if (fault?.kind === "invalido" && itens[0]) itens[0].veredito = "talvez";
    return ok({
      itens,
      proximo_cursor: next,
      total: items.length,
      gerado_em: ISO(now),
    });
  }),

  // D-C2
  http.get("*/v1/cases/:id", async ({ request, params }) => {
    const auth = await authed(request, "case");
    if ("reply" in auth) return auth.reply;
    const { account, fault } = auth;
    const record = ownCase(String(params.id), account.email);
    if (!record) return notFound();
    const omitEventos =
      takeCaseFault(account.email, "eventos")?.kind === "omit";
    const omitDocumentos =
      takeCaseFault(account.email, "documentos")?.kind === "omit";
    const view = caseView(account, record, {
      omit: { eventos: omitEventos, documentos: omitDocumentos },
    });
    if (fault?.kind === "invalido") view.veredito = "talvez";
    if (fault?.kind === "link-estranho")
      view.link_vendedor = `https://estranho.exemplo.test/v/demo/c/${randomToken(24)}`;
    return ok(view as never);
  }),

  // D-C3 (+ C-M6-7)
  http.post("*/v1/cases/:id/decide", async ({ request, params }) => {
    const auth = await authed(request, "decide");
    if ("reply" in auth) return auth.reply;
    const { account, body, call, fault } = auth;
    const record = ownCase(String(params.id), account.email);
    if (!record) return notFound();
    const key = request.headers.get("idempotency-key") ?? "";
    if (!UUID.test(key))
      return apiError(422, "VALOR_INVALIDO", { field: "Idempotency-Key" });
    const tipo = body.decisao;
    if (typeof tipo === "string") call.decisao = tipo;
    if (typeof body.motivo_codigo === "string")
      call.motivoCodigo = body.motivo_codigo;

    const fingerprint = JSON.stringify([
      "decide",
      record.id,
      tipo,
      body.motivo_codigo,
      body.nota_vendedor,
    ]);
    const previous = keyed(account.email, key, fingerprint);
    if (previous.conflict)
      return apiError(422, "VALOR_INVALIDO", { field: "Idempotency-Key" });
    if (previous.replay)
      return ok(previous.replay.reply as never, previous.replay.status);

    if (tipo !== "aprovar" && tipo !== "manter" && tipo !== "bloquear")
      return apiError(422, "VALOR_INVALIDO", { field: "decisao" });
    if (record.estado === "decidido") return conflict(record);
    if (tipo === "manter" && record.origem !== "monitoramento")
      return apiError(422, "VALOR_INVALIDO", { field: "decisao" });
    const motivo = body.motivo_codigo;
    if (tipo === "bloquear" && motivo === undefined)
      return apiError(422, "MOTIVO_OBRIGATORIO", { field: "motivo_codigo" });
    if (
      motivo !== undefined &&
      !(MOTIVO_CODIGOS as readonly unknown[]).includes(motivo)
    )
      return apiError(422, "VALOR_INVALIDO", { field: "motivo_codigo" });
    const nota = body.nota_vendedor;
    if (
      nota !== undefined &&
      (typeof nota !== "string" || nota.length > NOTA_MAX)
    )
      return apiError(422, "VALOR_INVALIDO", { field: "nota_vendedor" });

    lag(account, record);
    decide(record, caseNow(account.email), {
      tipo,
      ...(motivo !== undefined && { motivo_codigo: motivo as MotivoCodigo }),
      ...(typeof nota === "string" && nota !== "" && { nota_vendedor: nota }),
    });
    const reply = caseView(account, record);
    remember(account.email, key, fingerprint, 200, reply);
    // F5: the decision happened, but the client never hears it.
    if (fault?.kind === "drop-after") return networkDrop();
    return ok(reply as never);
  }),

  // D-C4 (+ C-M6-7, CR-P9)
  http.post("*/v1/cases/:id/request-documents", async ({ request, params }) => {
    const auth = await authed(request, "request-documents");
    if ("reply" in auth) return auth.reply;
    const { account, body, call, fault } = auth;
    const record = ownCase(String(params.id), account.email);
    if (!record) return notFound();
    const key = request.headers.get("idempotency-key") ?? "";
    if (!UUID.test(key))
      return apiError(422, "VALOR_INVALIDO", { field: "Idempotency-Key" });
    const tipos = Array.isArray(body.tipos) ? body.tipos : undefined;
    if (tipos) call.tipos = tipos.map(String);

    const fingerprint = JSON.stringify([
      "request",
      record.id,
      tipos,
      body.nota_vendedor,
    ]);
    const previous = keyed(account.email, key, fingerprint);
    if (previous.conflict)
      return apiError(422, "VALOR_INVALIDO", { field: "Idempotency-Key" });
    if (previous.replay)
      return ok(previous.replay.reply as never, previous.replay.status);

    if (
      !tipos ||
      tipos.length === 0 ||
      new Set(tipos).size !== tipos.length ||
      !tipos.every((tipo) =>
        (DOCUMENTO_TIPOS as readonly unknown[]).includes(tipo),
      )
    )
      return apiError(422, "VALOR_INVALIDO", { field: "tipos" });
    const enabled =
      account.workspace.documentos_habilitados ?? DEFAULT_DOCUMENTOS;
    if (!tipos.every((tipo) => enabled.includes(tipo as DocumentoTipo)))
      return apiError(422, "DOCUMENTO_NAO_HABILITADO", { field: "tipos" });
    const nota = body.nota_vendedor;
    if (
      nota !== undefined &&
      (typeof nota !== "string" || nota.length > NOTA_MAX)
    )
      return apiError(422, "VALOR_INVALIDO", { field: "nota_vendedor" });
    if (record.estado === "decidido") return conflict(record);

    lag(account, record);
    const now = caseNow(account.email);
    record.estado = "aguardando_doc";
    record.sla_ate = now + DOC_REQUEST_DEADLINE_MS;
    record.eventos.push({
      tipo: "documento_pedido",
      em: ISO(now),
      dados: { tipos },
    });
    // CR-P9: a new token per request when there's no e-mail; the old one is revoked.
    if (record.linkToken !== undefined)
      record.revokedTokens.push(record.linkToken);
    if (record.vendedor_tem_email) delete record.linkToken;
    else record.linkToken = randomToken(24);

    const reply = {
      case: caseView(account, record),
      ...(record.linkToken !== undefined && {
        link_vendedor:
          fault?.kind === "link-invalido"
            ? "javascript:alert(1)"
            : sellerLink(account, record.linkToken),
      }),
    };
    remember(account.email, key, fingerprint, 200, reply);
    if (fault?.kind === "drop-after") return networkDrop();
    return ok(reply as never);
  }),

  // D-C5 (+ C-M6-9): keyed by the verification of one of the account's cases.
  http.get(
    "*/v1/verifications/:id/certificate",
    async ({ request, params }) => {
      const auth = await authed(request, "certificate");
      if ("reply" in auth) return auth.reply;
      const { account, fault } = auth;
      const record = casesOf(account.email).find(
        (candidate) => candidate.verification.id === String(params.id),
      );
      if (!record || record.variante === "DADOS_NAO_ENCONTRADOS")
        return apiError(404, "RECURSO_NAO_ENCONTRADO");
      if (fault?.kind === "html")
        return fileReply(
          new TextEncoder().encode("<html><body>erro</body></html>"),
          "text/html",
        );
      if (fault?.kind === "grande") {
        const big = new Uint8Array(CERTIFICATE_MAX_BYTES + 1);
        big.set(PDF_BYTES);
        return fileReply(big, "application/pdf");
      }
      return fileReply(PDF_BYTES, "application/pdf", {
        "Content-Disposition": 'attachment; filename="comprovante.pdf"',
      });
    },
  ),
];

// --- The documents origin (D-C6 + C-M6-10) ------------------------------------------

/** Served on the mock's own origin; a sig is good for one read's URL set (QA G9). */
export const panelDocumentHandlers: RequestHandler[] = [
  http.get("*/__docs/:docId", async ({ request, params }) => {
    const url = new URL(request.url);
    const target = docForSig(url.searchParams.get("sig") ?? "");
    // QA G5: the hit is logged without its sig.
    recordCall({
      method: "GET",
      path: url.pathname,
      ...(target && { email: target.email }),
      authorized: false,
    });
    if (!target || target.docId !== String(params.docId))
      return new HttpResponse(null, { status: 403 });
    const record = panelStore().cases.get(target.caseId);
    const doc = record?.documentos.find(
      (candidate) => candidate.id === target.docId,
    );
    if (!doc) return new HttpResponse(null, { status: 404 });
    const fault = takeCaseFault(target.email, "documento");
    if (fault?.kind === "delay") await delay(fault.ms ?? 1_000);
    if (fault?.kind === "500") return new HttpResponse(null, { status: 500 });
    const headers = {
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox; default-src 'none'",
      "Cache-Control": "private, no-store",
      "Cross-Origin-Resource-Policy": "same-origin",
      "Referrer-Policy": "no-referrer",
    };
    if (fault?.kind === "html")
      return new HttpResponse("<html><body>não é PDF</body></html>", {
        status: 200,
        headers: {
          ...headers,
          "Content-Type": "application/pdf",
          "Content-Disposition": 'inline; filename="documento.pdf"',
        },
      });
    if (fault?.kind === "grande") {
      const big = new Uint8Array(CERTIFICATE_MAX_BYTES + 1);
      big.set(PDF_BYTES);
      return new HttpResponse(big, {
        status: 200,
        headers: {
          ...headers,
          "Content-Type": "application/pdf",
          "Content-Disposition": 'inline; filename="documento.pdf"',
        },
      });
    }
    if (fault?.kind === "tamanho" && fault.bytes !== undefined) {
      // A real PDF head and tail, padded in the middle to the exact size.
      const sized = new Uint8Array(fault.bytes).fill(0x20);
      sized.set(PDF_BYTES.slice(0, Math.min(PDF_BYTES.length, fault.bytes)));
      const tail = new TextEncoder().encode("\n%%EOF\n");
      if (fault.bytes >= PDF_BYTES.length + tail.length)
        sized.set(tail, fault.bytes - tail.length);
      return new HttpResponse(sized, {
        status: 200,
        headers: {
          ...headers,
          "Content-Type": "application/pdf",
          "Content-Disposition": 'inline; filename="documento.pdf"',
        },
      });
    }
    if (fault?.kind === "truncado")
      return new HttpResponse(PDF_BYTES.slice(0, 24), {
        status: 200,
        headers: {
          ...headers,
          "Content-Type": "application/pdf",
          "Content-Disposition": 'inline; filename="documento.pdf"',
        },
      });
    const [bytes, type, name] =
      doc.formato === "png"
        ? [PNG_BYTES, "image/png", "documento.png"]
        : doc.formato === "jpeg"
          ? [JPEG_BYTES, "image/jpeg", "documento.jpg"]
          : [PDF_BYTES, "application/pdf", "documento.pdf"];
    return new HttpResponse(bytes, {
      status: 200,
      headers: {
        ...headers,
        "Content-Type": type,
        "Content-Disposition": `inline; filename="${name}"`,
      },
    });
  }),
];

// --- Controls (loopback only) ------------------------------------------------------

async function controlBody(request: Request): Promise<Record<string, unknown>> {
  const body = (await request.json().catch(() => ({}))) as unknown;
  return typeof body === "object" && body !== null
    ? (body as Record<string, unknown>)
    : {};
}

const CASE_ENDPOINTS: readonly CaseEndpoint[] = [
  "list",
  "poll",
  "case",
  "eventos",
  "documentos",
  "decide",
  "request-documents",
  "certificate",
  "documento",
  "doc-url",
  "lag",
];

/** T92's named seeds (PC12, PC18–PC22) and QA's G9 / G11, as per-account faults. */
const NAMED_SEEDS: Record<
  string,
  (
    n: number | undefined,
    ms: number | undefined,
    bytes: number | undefined,
  ) => [CaseEndpoint, CaseFault][]
> = {
  "decide-falha": (n) => [["decide", { kind: "503", times: n ?? 1 }]],
  "decide-lento": (n, ms) => [
    [
      "decide",
      { kind: "delay", ms: ms ?? 3_000, ...(n !== undefined && { times: n }) },
    ],
  ],
  // F5: applied, then the socket drops, on both writes.
  "decide-rede": (n) => [
    ["decide", { kind: "drop-after", times: n ?? 1 }],
    ["request-documents", { kind: "drop-after", times: n ?? 1 }],
  ],
  // PC22's NETWORK that didn't apply: the socket drops first.
  "decide-queda": (n) => [
    ["decide", { kind: "drop", times: n ?? 1 }],
    ["request-documents", { kind: "drop", times: n ?? 1 }],
  ],
  "pedido-falha": (n) => [
    ["request-documents", { kind: "503", times: n ?? 1 }],
  ],
  "lista-falha": (n) => [
    ["list", { kind: "500", ...(n !== undefined && { times: n }) }],
  ],
  "detalhe-falha": (n) => [
    ["case", { kind: "500", ...(n !== undefined && { times: n }) }],
  ],
  "eventos-falha": (n) => [
    ["eventos", { kind: "omit", ...(n !== undefined && { times: n }) }],
  ],
  "documentos-falha": (n) => [
    ["documentos", { kind: "omit", ...(n !== undefined && { times: n }) }],
  ],
  "comprovante-falha": (n) => [
    ["certificate", { kind: "500", ...(n !== undefined && { times: n }) }],
  ],
  "comprovante-html": () => [["certificate", { kind: "html" }]],
  "comprovante-grande": () => [["certificate", { kind: "grande" }]],
  "poll-falha": (n) => [["poll", { kind: "503", times: n ?? 1 }]],
  "doc-host-estranho": () => [["doc-url", { kind: "host-estranho" }]],
  "doc-userinfo": () => [["doc-url", { kind: "userinfo" }]],
  "doc-host-parecido": () => [["doc-url", { kind: "host-parecido" }]],
  "doc-porta": () => [["doc-url", { kind: "porta" }]],
  "doc-http-externo": () => [["doc-url", { kind: "http-externo" }]],
  "doc-html": () => [["documento", { kind: "html" }]],
  "doc-grande": () => [["documento", { kind: "grande" }]],
  "doc-truncado": () => [["documento", { kind: "truncado" }]],
  // DR-15: { bytes } is required (a positive integer); see the case-seed control.
  "doc-tamanho": (_n, _ms, bytes) =>
    bytes === undefined ? [] : [["documento", { kind: "tamanho", bytes }]],
  "doc-falha": (n) => [
    ["documento", { kind: "500", ...(n !== undefined && { times: n }) }],
  ],
  "lista-atrasada": (n) => [
    ["lag", { kind: "lista-atrasada", times: 1, reads: n ?? 2 }],
  ],
  "caso-invalido": (n) => [
    ["case", { kind: "invalido", ...(n !== undefined && { times: n }) }],
  ],
  "lista-invalida": (n) => [
    ["list", { kind: "invalido", ...(n !== undefined && { times: n }) }],
  ],
  "link-estranho": () => [["case", { kind: "link-estranho" }]],
  "link-invalido": () => [["request-documents", { kind: "link-invalido" }]],
};

function idsView(records: CaseRecord[]): Record<string, unknown>[] {
  return records.map((record) => ({
    id: record.id,
    kind: record.kind,
    estado: record.estado,
    origem: record.origem,
    razao_social: record.razao_social,
    verification_id: record.verification.id,
    documentos: record.documentos.map((doc) => doc.id),
  }));
}

export const panelCaseControlHandlers: RequestHandler[] = [
  // QA G1: { email, preset } replaces the account's cases (creating it if needed).
  http.post("*/__mock/panel/cases/seed", async ({ request }) => {
    const { email, preset } = await controlBody(request);
    if (typeof email !== "string" || !isCasePreset(preset))
      return new HttpResponse(null, { status: 400 });
    const records = seedCases(email, preset);
    return HttpResponse.json(idsView([...records].sort(bySla)), {
      status: 201,
    });
  }),
  // An account's cases, oldest SLA first (E2E reads ids from here).
  http.get("*/__mock/panel/cases", ({ request }) => {
    const email = (
      new URL(request.url).searchParams.get("email") ?? ""
    ).toLowerCase();
    return HttpResponse.json(idsView(casesOf(email).sort(bySla)));
  }),
  // PC16 / AC 40: { email, kind?, count?, slaInMs? | sla_ate? } creates
  // cases now (QA A40-02: an SLA relative to the account's clock, or an ISO).
  http.post("*/__mock/panel/cases", async ({ request }) => {
    const { email, kind, count, slaInMs, sla_ate } = await controlBody(request);
    const slaAt = typeof sla_ate === "string" ? Date.parse(sla_ate) : undefined;
    if (
      typeof email !== "string" ||
      (kind !== undefined &&
        !(CASE_KINDS as readonly unknown[]).includes(kind)) ||
      (slaInMs !== undefined && typeof slaInMs !== "number") ||
      (sla_ate !== undefined && (slaAt === undefined || Number.isNaN(slaAt)))
    )
      return new HttpResponse(null, { status: 400 });
    const owner = email.toLowerCase();
    const now = caseNow(owner);
    const total =
      typeof count === "number" ? Math.min(Math.max(count, 1), 50) : 1;
    const created: CaseRecord[] = [];
    for (let i = 0; i < total; i++) {
      const record = caseFor((kind as CaseKind | undefined) ?? "link", {
        email: owner,
        n: 500 + casesOf(owner).length,
        now,
        slaInMs:
          slaAt !== undefined
            ? slaAt - now
            : typeof slaInMs === "number"
              ? slaInMs
              : REOPENED_SLA_MS,
      });
      record.criado_em = now;
      record.abertoEm = now;
      addCase(record);
      created.push(record);
    }
    return HttpResponse.json(idsView(created), { status: 201 });
  }),
  // PC17 / AC 39: { tipo? } the seller uploaded: back to aberto + documento_recebido.
  http.post("*/__mock/panel/cases/:id/upload", async ({ request, params }) => {
    const record = panelStore().cases.get(String(params.id));
    if (!record) return new HttpResponse(null, { status: 404 });
    const { tipo, formato } = await controlBody(request);
    const now = caseNow(record.email);
    const docTipo: DocumentoTipo = (
      DOCUMENTO_TIPOS as readonly unknown[]
    ).includes(tipo)
      ? (tipo as DocumentoTipo)
      : "CARTAO_CNPJ";
    record.documentos.push({
      id: crypto.randomUUID(),
      tipo: docTipo,
      enviado_em: ISO(now),
      formato: formato === "png" || formato === "jpeg" ? formato : "pdf",
    });
    record.eventos.push({
      tipo: "documento_recebido",
      em: ISO(now),
      dados: { tipo: docTipo },
    });
    record.estado = "aberto";
    record.abertoEm = now;
    record.sla_ate = now + REOPENED_SLA_MS;
    return new HttpResponse(null, { status: 204 });
  }),
  // PC13 / AC 35: { decisao? } another session decides it.
  http.post(
    "*/__mock/panel/cases/:id/decide-elsewhere",
    async ({ request, params }) => {
      const record = panelStore().cases.get(String(params.id));
      if (!record) return new HttpResponse(null, { status: 404 });
      const { decisao } = await controlBody(request);
      const tipo: DecisaoTipo =
        decisao === "bloquear" || decisao === "manter" ? decisao : "aprovar";
      decide(record, caseNow(record.email), {
        tipo,
        ...(tipo === "bloquear" && { motivo_codigo: "GENERICO" as const }),
      });
      return new HttpResponse(null, { status: 204 });
    },
  ),
  // QA G2: { email, endpoint, fault, ms?, times? } ({ fault: "none" } clears it).
  http.post("*/__mock/panel/case-fault", async ({ request }) => {
    const { email, endpoint, fault, ms, times } = await controlBody(request);
    if (
      typeof email !== "string" ||
      !(CASE_ENDPOINTS as readonly unknown[]).includes(endpoint) ||
      (fault !== "none" &&
        !(CASE_FAULT_KINDS as readonly unknown[]).includes(fault))
    )
      return new HttpResponse(null, { status: 400 });
    setCaseFault(
      email,
      endpoint as CaseEndpoint,
      fault === "none"
        ? undefined
        : {
            kind: fault as CaseFault["kind"],
            ...(typeof ms === "number" && { ms }),
            ...(typeof times === "number" && { times }),
          },
    );
    return new HttpResponse(null, { status: 204 });
  }),
  // T92's named seeds: { email, seed, n?, ms? } (always per account).
  http.post("*/__mock/panel/case-seed", async ({ request }) => {
    const { email, seed, n, ms, bytes } = await controlBody(request);
    const make = typeof seed === "string" ? NAMED_SEEDS[seed] : undefined;
    const size =
      typeof bytes === "number" && Number.isSafeInteger(bytes) && bytes > 0
        ? bytes
        : undefined;
    if (
      typeof email !== "string" ||
      !make ||
      (seed === "doc-tamanho" && size === undefined)
    )
      return new HttpResponse(null, { status: 400 });
    for (const [endpoint, fault] of make(
      typeof n === "number" ? n : undefined,
      typeof ms === "number" ? ms : undefined,
      size,
    ))
      setCaseFault(email, endpoint, fault);
    return new HttpResponse(null, { status: 204 });
  }),
  // QA G4: { email, now: ISO | null } fixes (or frees) the account's clock.
  http.post("*/__mock/panel/case-clock", async ({ request }) => {
    const { email, now } = await controlBody(request);
    if (typeof email !== "string")
      return new HttpResponse(null, { status: 400 });
    const at = typeof now === "string" ? Date.parse(now) : undefined;
    if (at !== undefined && Number.isNaN(at))
      return new HttpResponse(null, { status: 400 });
    setCaseClock(email.toLowerCase(), at);
    return new HttpResponse(null, { status: 204 });
  }),
  // QA G7: a case's seller links, as counts only (never a token).
  http.get("*/__mock/panel/case-links", ({ request }) => {
    const record = panelStore().cases.get(
      new URL(request.url).searchParams.get("caseId") ?? "",
    );
    if (!record) return new HttpResponse(null, { status: 404 });
    return HttpResponse.json({
      active: record.linkToken === undefined ? 0 : 1,
      revoked: record.revokedTokens.length,
    });
  }),
  // QA G10: { email, documentos_habilitados?, webhook_configurado? }.
  http.post("*/__mock/panel/workspace", async ({ request }) => {
    const { email, documentos_habilitados, webhook_configurado } =
      await controlBody(request);
    const account =
      typeof email === "string"
        ? panelStore().accounts.get(email.toLowerCase())
        : undefined;
    if (!account) return new HttpResponse(null, { status: 404 });
    if (Array.isArray(documentos_habilitados))
      account.workspace.documentos_habilitados = documentos_habilitados.filter(
        (tipo): tipo is DocumentoTipo =>
          (DOCUMENTO_TIPOS as readonly unknown[]).includes(tipo),
      );
    if (typeof webhook_configurado === "boolean")
      account.workspace.webhook_configurado = webhook_configurado;
    return new HttpResponse(null, { status: 204 });
  }),
  // F1: the documents origin, so the E2E can search the HTML and RSC payloads for it.
  http.get("*/__mock/panel/docs-origin", () =>
    HttpResponse.json({ origin: new URL(docsOrigin()).origin }),
  ),
];
