import { HttpResponse, delay, http, type RequestHandler } from "msw";

import {
  AC16,
  BATCH_SETS,
  HOSTILE_EXT_IDS,
  batchOutcomeFor,
  maskedCnpj,
  type BatchLinha,
  type BatchRowStatus,
} from "../../factories/panel.ts";
import { isValidCnpj } from "../../factories/seller-link.ts";
import {
  batchesOf,
  finishBatchAt,
  newBatch,
  ownBatch,
  panelStore,
  scenarioApplies,
  sessionAccount,
  sessionClock,
  setFault,
  takeFault,
  takePollFailure,
  type Account,
  type BatchEndpoint,
  type BatchFault,
  type BatchRecord,
} from "../panel-store.ts";
import { apiError, incoming, networkDrop, ok } from "./panel-common.ts";

// Pre-Contract handlers for D-B1–D-B7 + the M5 additions C1–C7
// (ops-panel contract-request.md § MSW handler contract › M5, PB1–PB18).

const MAX_ROWS = 5000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// C4 caps: the link's F07 name charset (≤ 120) and printable ext_id (≤ 64).
const RESPONSAVEL = /^(?:(?![ᅟᅠㅤﾠ])\p{L}\p{M}{0,2}|[ '.-])+$/u;
const PRINTABLE = /^[\x20-\x7E]+$/;
const LINHA_KEYS = new Set(["cnpj", "responsavel", "ext_id"]);
const STATUSES: readonly BatchRowStatus[] = ["ok", "warn", "bad", "erro"];
const SITUACAO: Record<BatchRowStatus, string> = {
  ok: "Tudo certo",
  warn: "Atenção",
  bad: "Crítico",
  erro: "Não consultado",
};

type Row = BatchLinha & ReturnType<typeof batchOutcomeFor>;

function processedRows(batch: BatchRecord): Row[] {
  return batch.linhas
    .slice(0, batch.processados)
    .map((linha) => ({ ...linha, ...batchOutcomeFor(linha.cnpj) }));
}

function counts(rows: Row[]): Record<BatchRowStatus, number> {
  const result = { ok: 0, warn: 0, bad: 0, erro: 0 };
  for (const row of rows) result[row.status]++;
  return result;
}

function plano(email: string): Account["workspace"]["plano"] {
  return panelStore().accounts.get(email)?.workspace.plano;
}

function available(email: string): number {
  const current = plano(email);
  return current ? Math.max(0, current.limite - current.usadas) : 0;
}

function charge(email: string, rows: number): void {
  const current = plano(email);
  if (current) current.usadas = Math.max(0, current.usadas + rows);
}

/** D-B2 */
function batchView(batch: BatchRecord): Record<string, unknown> {
  const rows = processedRows(batch);
  const done = batch.estado.startsWith("concluido");
  const tagged = (tag: string) =>
    rows.filter((row) => row.tags.includes(tag as never)).length;
  return {
    id: batch.id,
    estado: batch.estado,
    total: batch.linhas.length,
    processados: batch.processados,
    contagens: counts(rows),
    iniciado_em: new Date(batch.startedAt).toISOString(),
    ...(batch.finishedAt !== undefined && {
      concluido_em: new Date(batch.finishedAt).toISOString(),
    }),
    monitorado: batch.monitorado,
    enviado_para_fila: batch.enviado_para_fila,
    ...(batch.criados !== undefined && { casos_criados: batch.criados }),
    ...(done && {
      motivos_contagem: {
        inapta_baixada: tagged("inapta_baixada"),
        sem_ie: tagged("sem_ie"),
        cnae_fora: tagged("cnae_fora"),
      },
    }),
  };
}

/** PB1 / PB4: moves a running batch on, stopping at `failAt`, and settles it. */
export function advanceBatch(batch: BatchRecord, to?: number): void {
  if (batch.estado !== "processando") return;
  const total = batch.linhas.length;
  const limit = batch.failAt ?? total;
  const next = to ?? batch.processados + Math.ceil(total / 4);
  batch.processados = Math.max(0, Math.min(next, limit));
  if (batch.processados < limit) return;
  if (batch.processados < total) {
    // Stopped midway: the rows not checked don't consume checks (J3.5.2).
    batch.estado = "falhou";
    charge(batch.email, -(total - batch.processados));
    return;
  }
  // Done: the erro rows are released (AC 21).
  const erro = counts(processedRows(batch)).erro;
  batch.estado = erro > 0 ? "concluido_com_erros" : "concluido";
  batch.finishedAt = finishBatchAt(batch);
  charge(batch.email, -erro);
}

/** The first VALOR_INVALIDO field of a D-B1 body, or undefined (C4). */
function invalidField(linhas: unknown[]): string | undefined {
  const seen = new Set<string>();
  for (const [index, raw] of linhas.entries()) {
    const at = `linhas[${index}]`;
    if (typeof raw !== "object" || raw === null) return at;
    const linha = raw as Record<string, unknown>;
    if (Object.keys(linha).some((key) => !LINHA_KEYS.has(key))) return at;
    if (typeof linha.cnpj !== "string" || !isValidCnpj(linha.cnpj))
      return `${at}.cnpj`;
    if (seen.has(linha.cnpj)) return `${at}.cnpj`;
    seen.add(linha.cnpj);
    const { responsavel, ext_id } = linha;
    if (
      responsavel !== undefined &&
      (typeof responsavel !== "string" ||
        responsavel.length > 120 ||
        !RESPONSAVEL.test(responsavel))
    )
      return `${at}.responsavel`;
    if (
      ext_id !== undefined &&
      (typeof ext_id !== "string" ||
        ext_id.length > 64 ||
        !PRINTABLE.test(ext_id))
    )
      return `${at}.ext_id`;
  }
  return undefined;
}

function hasValidCnpj(linhas: unknown[]): boolean {
  return linhas.some(
    (linha) =>
      typeof linha === "object" &&
      linha !== null &&
      typeof (linha as { cnpj?: unknown }).cnpj === "string" &&
      isValidCnpj((linha as { cnpj: string }).cnpj),
  );
}

/** A-X7 per workspace: the first reply for this key and body, a 422 for another body. */
function idempotent(
  email: string,
  key: string,
  fingerprint: string,
): { replay?: unknown; conflict?: boolean } {
  const entry = panelStore().batchKeys.get(`${email}|${key}`);
  if (!entry) return {};
  return entry.fingerprint === fingerprint
    ? { replay: entry.reply }
    : { conflict: true };
}

function remember(
  email: string,
  key: string,
  fingerprint: string,
  reply: unknown,
): void {
  panelStore().batchKeys.set(`${email}|${key}`, { fingerprint, reply });
}

// C2: an opaque cursor (base64url of the offset).
function encodeCursor(offset: number): string {
  return btoa(`o:${offset}`).replace(/\+/g, "-").replace(/\//g, "_");
}

function decodeCursor(cursor: string): number | undefined {
  try {
    const match = /^o:(\d+)$/.exec(
      atob(cursor.replace(/-/g, "+").replace(/_/g, "/")),
    );
    return match ? Number(match[1]) : undefined;
  } catch {
    return undefined;
  }
}

// D-B4 / CR-P8: every field quoted, quotes doubled, a formula-like cell
// prefixed with ' (unless the csv-sem-escape seed, PB8, turns that off).
function csvCell(value: string, escape: boolean): string {
  const safe = escape && /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

function csvBody(lines: string[][], escape: boolean): string {
  return `﻿${lines
    .map((cells) => cells.map((cell) => csvCell(cell, escape)).join(";"))
    .join("\r\n")}\r\n`;
}

function csvFile(
  batch: BatchRecord,
  kind: "result" | "errors",
  escape: boolean,
): string {
  const rows = processedRows(batch);
  if (kind === "errors")
    return csvBody(
      [
        ["CNPJ", "Responsável", "ID na plataforma"],
        ...rows
          .filter((row) => row.status === "erro")
          .map((row) => [
            maskedCnpj(row.cnpj),
            row.responsavel ?? "",
            row.ext_id ?? "",
          ]),
      ],
      escape,
    );
  return csvBody(
    [
      [
        "CNPJ",
        "Razão social",
        "Situação",
        "Motivos",
        "Responsável",
        "ID na plataforma",
      ],
      ...rows.map((row) => [
        maskedCnpj(row.cnpj),
        row.razao_social ?? "",
        SITUACAO[row.status],
        row.motivos.join(", "),
        row.responsavel ?? "",
        row.ext_id ?? "",
      ]),
    ],
    escape,
  );
}

/**
 * The session's account (annotating the call log with its e-mail), or a
 * reply to send. QA G4: the account's fault for this endpoint applies here:
 * a delay waits, 500 / drop answer; the CSV and status faults come back in
 * `fault` for the handler.
 */
async function authed(
  request: Request,
  endpoint: BatchEndpoint,
  touch = true,
): Promise<
  | {
      account: Account;
      body: Record<string, unknown>;
      call: Awaited<ReturnType<typeof incoming>>["call"];
      fault: BatchFault | undefined;
    }
  | { reply: Response }
> {
  const { body, token, refused, call } = await incoming(request);
  if (refused) return { reply: refused };
  const account = sessionAccount(token, touch);
  if (!account) return { reply: apiError(401, "SESSAO_EXPIRADA") };
  call.email = account.email;
  const fault = takeFault(account.email, endpoint);
  if (fault?.kind === "delay") await delay(fault.ms ?? 1_000);
  if (fault?.kind === "500") return { reply: apiError(500, "ERRO_INTERNO") };
  if (fault?.kind === "drop") return { reply: networkDrop() };
  return { account, body, call, fault };
}

const notFound = (): Response => apiError(404, "LOTE_NAO_ENCONTRADO");

const CSV_HEADERS = {
  "Content-Type": "text/csv; charset=utf-8",
};

/** QA G4 / C9: a CSV the download handler must refuse (502, no partial body). */
function csvFault(fault: BatchFault | undefined): Response | undefined {
  const reply = (body: string, type = CSV_HEADERS["Content-Type"]) =>
    new HttpResponse(body, {
      status: 200,
      headers: { "Content-Type": type, "X-Request-Id": crypto.randomUUID() },
    });
  switch (fault?.kind) {
    case "csv-grande":
      return reply("x".repeat(5 * 1024 * 1024 + 1));
    case "csv-html":
      return reply("<html><body>erro</body></html>", "text/html");
    case "csv-aspas":
      return reply(
        '\uFEFF"CNPJ";"Situação"\r\n"11.222.333/0001-81";"aberta\r\n',
      );
    case "csv-virgula":
      return reply(
        '\uFEFF"CNPJ","Situação"\r\n"11.222.333/0001-81","Tudo certo"\r\n',
      );
    case "csv-irregular":
      return reply('\uFEFF"CNPJ";"Situação"\r\n"11.222.333/0001-81"\r\n');
    default:
      return undefined;
  }
}

function batchAction(action: "to-queue" | "monitor"): RequestHandler {
  return http.post(
    `*/v1/batches/:id/${action}`,
    async ({ request, params }) => {
      const auth = await authed(request, action);
      if ("reply" in auth) return auth.reply;
      const { account } = auth;
      const batch = ownBatch(String(params.id), account.email);
      if (!batch) return notFound();
      const key = request.headers.get("idempotency-key") ?? "";
      if (!UUID.test(key))
        return apiError(422, "VALOR_INVALIDO", { field: "Idempotency-Key" });
      if (batch.estado === "processando")
        return apiError(409, "LOTE_EM_ANDAMENTO");
      const fingerprint = `${action}:${batch.id}`;
      const previous = idempotent(account.email, key, fingerprint);
      if (previous.conflict)
        return apiError(422, "VALOR_INVALIDO", { field: "Idempotency-Key" });
      if (previous.replay !== undefined) return ok(previous.replay as never);

      const tally = counts(processedRows(batch));
      let reply: Record<string, number>;
      if (action === "to-queue") {
        // Per batch too: a second call returns the first result (AC 23).
        if (batch.criados === undefined) {
          batch.criados = tally.warn + tally.bad;
          batch.enviado_para_fila = true;
          const contagens = account.workspace.contagens;
          if (contagens) contagens.fila_abertos += batch.criados;
        }
        reply = { criados: batch.criados };
      } else {
        if (batch.monitorados === undefined) {
          batch.monitorados = tally.ok + tally.warn + tally.bad;
          batch.monitorado = true;
        }
        reply = { monitorados: batch.monitorados };
      }
      remember(account.email, key, fingerprint, reply);
      return ok(reply);
    },
  );
}

export const panelBatchHandlers: RequestHandler[] = [
  // D-B1
  http.post("*/v1/batches", async ({ request }) => {
    const auth = await authed(request, "start");
    if ("reply" in auth) return auth.reply;
    const { account, body, call } = auth;
    // The key is logged first, even for a dropped call (a retry is compared to it).
    const key = request.headers.get("idempotency-key") ?? "";
    call.idempotencyKey = key;
    if (scenarioApplies("queda-de-rede-lote", account.email))
      return networkDrop();
    if (!UUID.test(key))
      return apiError(422, "VALOR_INVALIDO", { field: "Idempotency-Key" });
    const extra = Object.keys(body).find((name) => name !== "linhas");
    if (extra !== undefined)
      return apiError(422, "VALOR_INVALIDO", { field: extra });
    if (!Array.isArray(body.linhas))
      return apiError(422, "VALOR_INVALIDO", { field: "linhas" });
    const linhas = body.linhas as unknown[];
    call.rows = linhas.length;
    // QA G1: shapes only, never values.
    const keys = new Set<string>();
    let withResponsavel = 0;
    let withExtId = 0;
    for (const linha of linhas) {
      if (typeof linha !== "object" || linha === null) continue;
      for (const key of Object.keys(linha)) keys.add(key);
      if ("responsavel" in linha) withResponsavel++;
      if ("ext_id" in linha) withExtId++;
    }
    call.rowKeys = [...keys].sort();
    call.withResponsavel = withResponsavel;
    call.withExtId = withExtId;
    if (linhas.length > MAX_ROWS) return apiError(422, "MUITAS_LINHAS");
    if (!hasValidCnpj(linhas)) return apiError(422, "SEM_CNPJ_VALIDO");
    const field = invalidField(linhas);
    if (field !== undefined) return apiError(422, "VALOR_INVALIDO", { field });

    const fingerprint = JSON.stringify(linhas);
    const previous = idempotent(account.email, key, fingerprint);
    if (previous.conflict)
      return apiError(422, "VALOR_INVALIDO", { field: "Idempotency-Key" });
    if (previous.replay !== undefined) return ok(previous.replay as never, 201);

    // P01 G1: an atomic reservation of every valid row, or nothing.
    const left = available(account.email);
    if (linhas.length > left)
      return apiError(402, "SEM_SALDO", { disponiveis: left });
    charge(account.email, linhas.length);
    const batch = newBatch(account.email, linhas as BatchLinha[]);
    const reply = { id: batch.id };
    remember(account.email, key, fingerprint, reply);
    return ok(reply, 201);
  }),
  // D-B6
  http.get("*/v1/batches", async ({ request }) => {
    const auth = await authed(request, "history");
    if ("reply" in auth) return auth.reply;
    if (scenarioApplies("historico-falha", auth.account.email))
      return apiError(500, "ERRO_INTERNO");
    return ok(
      batchesOf(auth.account.email)
        .slice(0, 10)
        .map((batch) => ({
          id: batch.id,
          total: batch.linhas.length,
          estado: batch.estado,
          iniciado_em: new Date(batch.startedAt).toISOString(),
          ...(batch.finishedAt !== undefined && {
            concluido_em: new Date(batch.finishedAt).toISOString(),
          }),
        })),
    );
  }),
  // D-B2: each read advances a running batch (PB1); a poll doesn't slide the
  // session's idle clock (C7).
  http.get("*/v1/batches/:id", async ({ request, params }) => {
    const auth = await authed(
      request,
      "status",
      request.headers.get("x-kybr-poll") !== "1",
    );
    if ("reply" in auth) return auth.reply;
    const batch = ownBatch(String(params.id), auth.account.email);
    if (!batch) return notFound();
    if (takePollFailure(auth.account.email))
      return apiError(503, "INDISPONIVEL");
    if (!batch.held) advanceBatch(batch);
    const view = batchView(batch);
    // QA G4: a contract violation the schema must refuse.
    if (auth.fault?.kind === "processados-acima")
      return ok({ ...view, processados: batch.linhas.length + 1 } as never);
    return ok(view as never);
  }),
  // D-B3 (+ C2)
  http.get("*/v1/batches/:id/rows", async ({ request, params }) => {
    const auth = await authed(request, "rows");
    if ("reply" in auth) return auth.reply;
    const batch = ownBatch(String(params.id), auth.account.email);
    if (!batch) return notFound();
    const query = new URL(request.url).searchParams;
    const status = query.get("status");
    const cursor = query.get("cursor");
    const limit = Number(query.get("limit") ?? "25");
    if (!Number.isInteger(limit) || limit < 1 || limit > 25)
      return apiError(422, "VALOR_INVALIDO", { field: "limit" });
    if (status !== null && !STATUSES.includes(status as BatchRowStatus))
      return apiError(422, "VALOR_INVALIDO", { field: "status" });
    const rows = processedRows(batch).filter(
      (row) => status === null || row.status === status,
    );
    const offset = cursor === null ? 0 : decodeCursor(cursor);
    if (offset === undefined || offset > rows.length)
      return apiError(422, "VALOR_INVALIDO", { field: "cursor" });
    const page = rows.slice(offset, offset + limit);
    return ok({
      itens: page.map((row) => ({
        cnpj: row.cnpj,
        ...(row.razao_social !== undefined && {
          razao_social: row.razao_social,
        }),
        status: row.status,
        motivos: row.motivos,
        ...(row.status === "erro" && { erro_codigo: "CONSULTA_FALHOU" }),
      })),
      proximo_cursor:
        offset + limit < rows.length ? encodeCursor(offset + limit) : null,
      total: rows.length,
    });
  }),
  // D-B4 (+ C3)
  http.get("*/v1/batches/:id/:file", async ({ request, params }) => {
    const file = String(params.file);
    if (file !== "result.csv" && file !== "errors.csv") return undefined;
    const auth = await authed(request, file);
    if ("reply" in auth) return auth.reply;
    const batch = ownBatch(String(params.id), auth.account.email);
    if (!batch) return notFound();
    const escape = !scenarioApplies("csv-sem-escape", auth.account.email);
    const faulty = csvFault(auth.fault);
    if (faulty !== undefined) return faulty;
    return new HttpResponse(
      csvFile(batch, file === "result.csv" ? "result" : "errors", escape),
      {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "X-Request-Id": crypto.randomUUID(),
        },
      },
    );
  }),
  // D-B5 (+ C5)
  batchAction("to-queue"),
  batchAction("monitor"),
  // D-B7 (+ C6)
  http.post("*/v1/batches/:id/resume", async ({ request, params }) => {
    const auth = await authed(request, "resume");
    if ("reply" in auth) return auth.reply;
    const batch = ownBatch(String(params.id), auth.account.email);
    if (!batch) return notFound();
    if (batch.estado === "falhou") {
      const remaining = batch.linhas.length - batch.processados;
      const left = available(auth.account.email);
      if (remaining > left)
        return apiError(402, "SEM_SALDO", { disponiveis: left });
      charge(auth.account.email, remaining);
      batch.failAt = undefined;
      batch.estado = "processando";
    }
    return new HttpResponse(null, {
      status: 202,
      headers: { "X-Request-Id": crypto.randomUUID() },
    });
  }),
];

const SETS: Record<string, () => BatchLinha[]> = {
  ac16: () => AC16.linhas,
  "tudo-ok": () => BATCH_SETS.tudoOk.map((cnpj) => ({ cnpj })),
  "tudo-erro": () => BATCH_SETS.tudoErro.map((cnpj) => ({ cnpj })),
  falha: () =>
    [...BATCH_SETS.tudoOk, BATCH_SETS.falha, ...BATCH_SETS.tudoErro].map(
      (cnpj) => ({ cnpj }),
    ),
  "misto-sem-erro": () => BATCH_SETS.mistoSemErro.map((cnpj) => ({ cnpj })),
  "um-atencao": () => BATCH_SETS.umAtencao.map((cnpj) => ({ cnpj })),
  // G7 / C9: hostile ext_ids ride in the rows (the CSVs echo them).
  hostil: () =>
    BATCH_SETS.hostil.map((cnpj, i) => ({
      cnpj,
      responsavel: "Pessoa Exemplo",
      ext_id: HOSTILE_EXT_IDS[i] ?? "id",
    })),
};

async function controlBody(request: Request): Promise<Record<string, unknown>> {
  const body = (await request.json().catch(() => ({}))) as unknown;
  return typeof body === "object" && body !== null
    ? (body as Record<string, unknown>)
    : {};
}

/** Test controls for batches, served only by the HTTP mock API (loopback). */
export const panelBatchControlHandlers: RequestHandler[] = [
  // PB1: a held batch doesn't advance on reads ({ hold: false } lets it go).
  http.post("*/__mock/panel/batches/:id/hold", async ({ request, params }) => {
    const batch = panelStore().batches.get(String(params.id));
    if (!batch) return new HttpResponse(null, { status: 404 });
    batch.held = (await controlBody(request)).hold !== false;
    return new HttpResponse(null, { status: 204 });
  }),
  // PB1: moves a batch to `processados`, or one step.
  http.post(
    "*/__mock/panel/batches/:id/advance",
    async ({ request, params }) => {
      const batch = panelStore().batches.get(String(params.id));
      if (!batch) return new HttpResponse(null, { status: 404 });
      const { processados } = await controlBody(request);
      advanceBatch(
        batch,
        typeof processados === "number" ? processados : undefined,
      );
      return new HttpResponse(null, { status: 204 });
    },
  ),
  // An account's batches, newest first (E2E reads ids from here).
  http.get("*/__mock/panel/batches", ({ request }) => {
    const email = (
      new URL(request.url).searchParams.get("email") ?? ""
    ).toLowerCase();
    return HttpResponse.json(
      batchesOf(email).map((batch) => ({
        id: batch.id,
        estado: batch.estado,
        processados: batch.processados,
        total: batch.linhas.length,
      })),
    );
  }),
  // A batch made directly for an account (no allowance check; its rows are
  // charged like a start, so the releases add up): `set` is
  // ac16 / tudo-ok / tudo-erro / falha; `finish` runs it to its end state.
  http.post("*/__mock/panel/batches", async ({ request }) => {
    const { email, set, finish, hold, iniciadoEm, duracaoMs } =
      await controlBody(request);
    const linhas = typeof set === "string" ? SETS[set] : undefined;
    if (typeof email !== "string" || !linhas)
      return new HttpResponse(null, { status: 400 });
    const batch = newBatch(email.toLowerCase(), linhas());
    // QA G11: a fixed start and duration for {duracao}, dates and filenames.
    if (typeof iniciadoEm === "string" && !Number.isNaN(Date.parse(iniciadoEm)))
      batch.startedAt = Date.parse(iniciadoEm);
    if (typeof duracaoMs === "number") batch.durationMs = duracaoMs;
    charge(batch.email, batch.linhas.length);
    if (finish === true)
      for (let i = 0; i < 8 && batch.estado === "processando"; i++)
        advanceBatch(batch);
    batch.held = hold === true;
    return HttpResponse.json({ id: batch.id }, { status: 201 });
  }),
  // QA G4: a per-account fault on one endpoint ({ fault: "none" } clears it).
  http.post("*/__mock/panel/batch-fault", async ({ request }) => {
    const { email, endpoint, fault, ms, times } = await controlBody(request);
    if (
      typeof email !== "string" ||
      typeof endpoint !== "string" ||
      typeof fault !== "string"
    )
      return new HttpResponse(null, { status: 400 });
    setFault(
      email,
      endpoint as BatchEndpoint,
      fault === "none"
        ? undefined
        : {
            kind: fault as BatchFault["kind"],
            ...(typeof ms === "number" && { ms }),
            ...(typeof times === "number" && { times }),
          },
    );
    return new HttpResponse(null, { status: 204 });
  }),
  // QA G6: a session's clocks (proves a poll doesn't slide idle, C7).
  http.get("*/__mock/panel/session", ({ request }) => {
    const id = new URL(request.url).searchParams.get("id") ?? "";
    const clock = sessionClock(id);
    return clock
      ? HttpResponse.json(clock)
      : new HttpResponse(null, { status: 404 });
  }),
  // PB4 / PB16 (QA G10 calls it /plan): sets an account's plan usage or limit.
  http.post("*/__mock/panel/plan*", async ({ request }) => {
    const { email, usadas, limite } = await controlBody(request);
    const current =
      typeof email === "string" ? plano(email.toLowerCase()) : undefined;
    if (!current) return new HttpResponse(null, { status: 404 });
    if (typeof usadas === "number") current.usadas = usadas;
    if (typeof limite === "number") current.limite = limite;
    return new HttpResponse(null, { status: 204 });
  }),
];
