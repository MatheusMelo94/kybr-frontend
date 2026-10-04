import {
  delay,
  http,
  HttpResponse,
  type JsonBodyType,
  type RequestHandler,
} from "msw";

import {
  CASE_TOKENS,
  DOCUMENT_TYPES,
  ERROR_SENTINEL,
  MAX_FILES_PER_CASE,
  MAX_UPLOAD_BYTES,
  PUBLIC_LINKS,
  REJECTED_EMAIL,
  REJECTED_RESPONSAVEL,
  RETRY_AFTER_SECONDS,
  SLOW_LINK_DELAY_MS,
  FIXED_CASE_CREATED_AT,
  SLUGS,
  UPLOAD_MARKERS,
  buildCompany,
  buildFixedCases,
  buildPublicCase,
  buildResponsavel,
  caseKindFor,
  cnpjFor,
  isSlugVariant,
  isValidCnpj,
  maskEmail,
  scenarioForCnpj,
  type CaseKind,
  type CaseOverride,
  type CaseRecord,
  type DocumentType,
  type PublicCase,
  type PublicLink,
  type UploadState,
} from "../../factories/seller-link.ts";

// Pre-Contract handlers for D1–D6 (contract-request.md). One set serves Vitest
// (tests/fixtures/msw/server.ts) and the HTTP mock API (mock-api.ts).

type Reply = {
  status: number;
  body: JsonBodyType;
  headers: Record<string, string>;
};

type Store = {
  cases: Map<string, CaseRecord>;
  idempotency: Map<string, Reply>;
  recoveredLinks: Set<string>;
  /** tokinstavel-<suffix> tokens that read normally from now on (POST …/cases/:token/recover). */
  recoveredCases: Set<string>;
  disabledLinks: Set<string>;
  /** D4 reads to fail next, per token (POST /__mock/cases/:token/fail). */
  caseFailures: Map<string, { status: number; times: number }>;
  /** D4 latency per token (POST /__mock/cases/:token/delay). */
  caseDelays: Map<string, number>;
  /** D4 reads per token string, whatever the outcome (GET …/reads). */
  caseReads: Map<string, number>;
  /** The last D3 body per slug, as received (GET /__mock/links/:slug/last-verify). */
  lastVerify: Map<string, JsonBodyType>;
  /** D5 saves to fail next, per token (POST /__mock/cases/:token/contact/fail; M3 G3). */
  contactFailures: Map<string, { status: number; times: number }>;
  /** D5 latency per token (POST …/contact/delay; M3 G3). */
  contactDelays: Map<string, number>;
  /** D5 requests per token and the last body, as received (GET …/contact; M3 G3). */
  contactLog: Map<string, { requests: number; last: JsonBodyType }>;
};

function createStore(): Store {
  return {
    cases: buildFixedCases(),
    idempotency: new Map(),
    recoveredLinks: new Set(),
    recoveredCases: new Set(),
    disabledLinks: new Set(),
    caseFailures: new Map(),
    caseDelays: new Map(),
    caseReads: new Map(),
    lastVerify: new Map(),
    contactFailures: new Map(),
    contactDelays: new Map(),
    contactLog: new Map(),
  };
}

let store = createStore();

/** Back to the starting state: fixed cases only, no uploads, e-mails or idempotency keys. */
export function resetSellerLinkMock(): void {
  store = createStore();
}

/** A link disabled mid-journey: D1, D2 and D3 answer 404 LINK_NAO_ENCONTRADO from now on. */
export function disableLink(slug: string): void {
  store.disabledLinks.add(slug);
}

/** S3 → S1: the unstable link starts answering. */
export function recoverLink(slug: string): void {
  store.recoveredLinks.add(slug);
}

/**
 * S12 → a readable case: a per-test tokinstavel-<suffix> token reads as a
 * settled pending case under `slug` from now on. It acts on nothing else (the
 * fixed S12 token never recovers), and says whether it did (review 0013).
 */
export function recoverCase(slug: string, token: string): boolean {
  if (!token.startsWith(`${CASE_TOKENS.unstable}-`)) return false;
  store.recoveredCases.add(token);
  store.cases.set(token, {
    slug,
    kind: "pendente",
    cnpj: cnpjFor("pendente"),
    responsavel: buildResponsavel(token),
    createdAt: Date.parse(FIXED_CASE_CREATED_AT),
    settled: true,
    uploads: new Map(),
  });
  return true;
}

// --- Per-test case controls (QA test plan G1–G6) ------------------------------
// Served only by the HTTP mock API, so parallel E2E projects each own their
// cases (never POST /__mock/reset under fullyParallel).

const CASE_KINDS: readonly CaseKind[] = [
  "aprovado",
  "pendente",
  "bloqueado",
  "sem-dados",
  "sem-dados-documento",
  "sem-dados-aprovado",
  "lento",
  "processando",
  "retido",
  "tudo-recebido",
  "decidido",
];
const ESTADOS: readonly PublicCase["estado"][] = [
  "processing",
  "pending",
  "approved",
  "blocked",
];

export type MockCaseInput = {
  slug?: string;
  /** How the case resolves; default "retido" (held processing, G3). */
  kind?: CaseKind;
  /** Backdates criado_em by this much: the only way to set the server's elapsed time (G1). */
  ageMs?: number;
  /** An explicit estado + resultado, served verbatim. */
  estado?: PublicCase["estado"];
  resultado?: Record<string, unknown>;
  cnpj?: string;
  responsavel?: string;
  /** Files already received per documento_tipo (QA M3 plan G6). */
  uploads?: Record<string, unknown>;
};

function isCaseKind(value: unknown): value is CaseKind {
  return CASE_KINDS.includes(value as CaseKind);
}

function isEstado(value: unknown): value is PublicCase["estado"] {
  return ESTADOS.includes(value as PublicCase["estado"]);
}

/** The override in a body, or undefined; throws for a bad estado. */
function overrideFrom(input: {
  estado?: unknown;
  resultado?: unknown;
}): CaseOverride | undefined {
  if (input.estado === undefined) return undefined;
  if (!isEstado(input.estado)) throw new Error("bad estado");
  const resultado =
    typeof input.resultado === "object" && input.resultado !== null
      ? (input.resultado as Record<string, unknown>)
      : undefined;
  return { estado: input.estado, ...(resultado && { resultado }) };
}

/** The uploads seed in a body (M3 G6); throws for a bad tipo or shape. */
function uploadsFrom(
  input: Record<string, unknown> = {},
): Map<DocumentType, UploadState> {
  const uploads = new Map<DocumentType, UploadState>();
  for (const [tipo, value] of Object.entries(input)) {
    const { files, bytes, format } = (value ?? {}) as Record<string, unknown>;
    if (
      !isDocumentType(tipo) ||
      typeof files !== "number" ||
      typeof bytes !== "number" ||
      (format !== "pdf" && format !== "photos")
    )
      throw new Error("bad uploads");
    uploads.set(tipo, { files, bytes, format });
  }
  return uploads;
}

/** G1: a new case with a fresh X3 token. */
export function createMockCase(input: MockCaseInput = {}): string {
  if (input.kind !== undefined && !isCaseKind(input.kind))
    throw new Error("bad kind");
  const override = overrideFrom(input);
  const uploads = uploadsFrom(input.uploads);
  const token = Buffer.from(
    crypto.getRandomValues(new Uint8Array(18)),
  ).toString("base64url");
  store.cases.set(token, {
    slug: input.slug ?? SLUGS.ok,
    kind: input.kind ?? "retido",
    cnpj: input.cnpj ?? cnpjFor("aprovado"),
    responsavel: input.responsavel ?? buildResponsavel(token),
    createdAt: Date.now() - (input.ageMs ?? 0),
    settled: false,
    uploads,
    ...(override && { override }),
  });
  return token;
}

/** G2: a new kind, or an explicit estado + resultado. False for an unknown token. */
export function setMockCaseState(
  token: string,
  change: { kind?: unknown; estado?: unknown; resultado?: unknown },
): boolean {
  const record = store.cases.get(token);
  if (!record) return false;
  const override = overrideFrom(change);
  if (override) {
    record.override = override;
    return true;
  }
  if (!isCaseKind(change.kind)) throw new Error("bad kind");
  record.kind = change.kind;
  record.settled = true;
  delete record.override;
  return true;
}

/** G2: the case is gone; D4 answers CASO_NAO_ENCONTRADO. */
export function deleteMockCase(token: string): void {
  store.cases.delete(token);
}

/** G4: the next `times` D4 reads answer `status`. */
export function failCaseReads(
  token: string,
  status: number,
  times: number,
): void {
  store.caseFailures.set(token, { status, times });
}

/** G5: every D4 read of this token waits `ms`. */
export function delayCaseReads(token: string, ms: number): void {
  store.caseDelays.set(token, ms);
}

/** M3 G3: the next `times` D5 saves answer `status`. */
export function failContactSaves(
  token: string,
  status: number,
  times: number,
): void {
  store.contactFailures.set(token, { status, times });
}

/** M3 G3: every D5 save of this token waits `ms`. */
export function delayContactSaves(token: string, ms: number): void {
  store.contactDelays.set(token, ms);
}

/** G6: how many D4 reads this token string got. */
export function caseReadCount(token: string): number {
  return store.caseReads.get(token) ?? 0;
}

/** True while a case read must fail with 500 (S12 and its per-test variants). */
function isUnstableCase(token: string): boolean {
  return (
    token.startsWith(CASE_TOKENS.unstable) && !store.recoveredCases.has(token)
  );
}

// --- Responses ----------------------------------------------------------------

type Extra = {
  field?: string;
  retryAfter?: number;
  headers?: Record<string, string>;
};

function requestIdHeaders(
  headers: Record<string, string> = {},
): Record<string, string> {
  return { "X-Request-Id": crypto.randomUUID(), ...headers };
}

function okReply(
  body: JsonBodyType,
  status = 200,
  headers?: Record<string, string>,
): Reply {
  return { status, body, headers: requestIdHeaders(headers) };
}

/** X1 envelope: { code, message, field? } + X-Request-Id, and Retry-After on 429. */
function errorReply(status: number, code: string, extra: Extra = {}): Reply {
  return {
    status,
    body: {
      code,
      message: ERROR_SENTINEL,
      ...(extra.field !== undefined && { field: extra.field }),
    },
    headers: requestIdHeaders({
      ...extra.headers,
      ...(extra.retryAfter !== undefined && {
        "Retry-After": String(extra.retryAfter),
      }),
    }),
  };
}

function send({ status, body, headers }: Reply): HttpResponse<JsonBodyType> {
  return HttpResponse.json(body, { status, headers });
}

function ok(
  body: JsonBodyType,
  status = 200,
  headers?: Record<string, string>,
): HttpResponse<JsonBodyType> {
  return send(okReply(body, status, headers));
}

function apiError(
  status: number,
  code: string,
  extra: Extra = {},
): HttpResponse<JsonBodyType> {
  return send(errorReply(status, code, extra));
}

function noContent(headers?: Record<string, string>): HttpResponse<null> {
  return new HttpResponse(null, {
    status: 204,
    headers: requestIdHeaders(headers),
  });
}

// --- D6 CORS ------------------------------------------------------------------

function allowedOrigins(): string[] {
  const configured = process.env.MOCK_API_ALLOWED_ORIGINS;
  return configured
    ? configured.split(",").map((origin) => origin.trim())
    : ["http://localhost:3000", "http://127.0.0.1:3000"];
}

/** Exact-origin CORS, no credentials (contract D6). */
function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("origin");
  if (origin === null || !allowedOrigins().includes(origin))
    return { Vary: "Origin" };
  return {
    Vary: "Origin",
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Expose-Headers": "Retry-After, X-Request-Id",
  };
}

// --- Uploads ------------------------------------------------------------------

async function fileFormat(file: File): Promise<"pdf" | "photo" | undefined> {
  const bytes = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  const starts = (...magic: number[]): boolean =>
    magic.every((byte, index) => bytes[index] === byte);
  if (starts(0x25, 0x50, 0x44, 0x46)) return "pdf"; // %PDF
  if (starts(0xff, 0xd8, 0xff) || starts(0x89, 0x50, 0x4e, 0x47))
    return "photo"; // JPEG, PNG
  return undefined;
}

function isDocumentType(value: unknown): value is DocumentType {
  return (
    typeof value === "string" &&
    (DOCUMENT_TYPES as readonly string[]).includes(value)
  );
}

// --- Handlers -----------------------------------------------------------------

function linkFor(slug: string): PublicLink | undefined {
  if (store.disabledLinks.has(slug)) return undefined;
  if (isSlugVariant(slug, SLUGS.unstable)) return PUBLIC_LINKS[SLUGS.unstable];
  if (isSlugVariant(slug, SLUGS.perTest)) return PUBLIC_LINKS[SLUGS.ok];
  if (isSlugVariant(slug, SLUGS.slow)) return PUBLIC_LINKS[SLUGS.ok];
  return PUBLIC_LINKS[slug];
}

function caseFor(slug: string, token: string): CaseRecord | undefined {
  const record = store.cases.get(token);
  // A token from another slug gets the same 404 as an unknown one (no existence leak).
  return record?.slug === slug ? record : undefined;
}

function startVerification(
  slug: string,
  input: { cnpj?: unknown; responsavel?: unknown },
): Reply {
  if (!linkFor(slug)) return errorReply(404, "LINK_NAO_ENCONTRADO");
  const cnpj = typeof input.cnpj === "string" ? input.cnpj : "";
  const responsavel =
    typeof input.responsavel === "string" ? input.responsavel.trim() : "";

  if (!isValidCnpj(cnpj)) {
    return errorReply(422, "CNPJ_INVALIDO", { field: "cnpj" });
  }
  if (
    responsavel.split(/\s+/).filter(Boolean).length < 2 ||
    responsavel === REJECTED_RESPONSAVEL
  ) {
    return errorReply(422, "RESPONSAVEL_INVALIDO", { field: "responsavel" });
  }
  const scenario = scenarioForCnpj(cnpj);
  if (scenario === "limite-cnpj") {
    return errorReply(429, "LIMITE_CNPJ", {
      retryAfter: RETRY_AFTER_SECONDS.verify,
    });
  }
  if (scenario === "limite-geral") {
    return errorReply(429, "LIMITE_TENTATIVAS", {
      retryAfter: RETRY_AFTER_SECONDS.verify,
    });
  }

  const token = Buffer.from(
    crypto.getRandomValues(new Uint8Array(18)),
  ).toString("base64url");
  store.cases.set(token, {
    slug,
    kind: caseKindFor(cnpj),
    cnpj,
    responsavel,
    createdAt: Date.now(),
    settled: false,
    uploads: new Map(),
  });
  return okReply({ token }, 201);
}

export const sellerLinkHandlers: RequestHandler[] = [
  // D1: link info
  http.get("*/public/v/:slug", async ({ params }) => {
    const slug = String(params.slug);
    if (isSlugVariant(slug, SLUGS.slow)) await delay(SLOW_LINK_DELAY_MS);
    if (
      isSlugVariant(slug, SLUGS.unstable) &&
      !store.recoveredLinks.has(slug)
    ) {
      return apiError(500, "ERRO_INTERNO");
    }
    const link = linkFor(slug);
    return link ? ok(link) : apiError(404, "LINK_NAO_ENCONTRADO");
  }),

  // D2: company lookup
  http.get("*/public/v/:slug/lookup", ({ params, request }) => {
    const slug = String(params.slug);
    if (!linkFor(slug)) return apiError(404, "LINK_NAO_ENCONTRADO");
    // S19: the autofill kill switch (contract X6).
    if (slug === SLUGS.noAutofill) return apiError(503, "AUTOFILL_DESATIVADO");
    const cnpj = new URL(request.url).searchParams.get("cnpj") ?? "";
    if (!isValidCnpj(cnpj))
      return apiError(400, "CNPJ_INVALIDO", { field: "cnpj" });
    switch (scenarioForCnpj(cnpj)) {
      case "sem-dados":
        return apiError(404, "EMPRESA_NAO_ENCONTRADA");
      case "limite-consulta":
        return apiError(429, "LIMITE_CONSULTAS", {
          retryAfter: RETRY_AFTER_SECONDS.lookup,
        });
      default:
        return ok(buildCompany(cnpj));
    }
  }),

  // D3: start a verification (Idempotency-Key replays the first response)
  http.post("*/public/v/:slug/verify", async ({ params, request }) => {
    const key = request.headers.get("idempotency-key");
    const replay = key === null ? undefined : store.idempotency.get(key);
    if (replay) return send(replay);

    const input = (await request.json().catch(() => ({}))) as {
      cnpj?: unknown;
      responsavel?: unknown;
    };
    store.lastVerify.set(String(params.slug), input as JsonBodyType);
    const result = startVerification(String(params.slug), input);
    if (key !== null) store.idempotency.set(key, result);
    return send(result);
  }),

  // D4: case state
  http.get("*/public/v/:slug/cases/:token", async ({ params }) => {
    const slug = String(params.slug);
    const token = String(params.token);
    store.caseReads.set(token, caseReadCount(token) + 1);
    const latency = store.caseDelays.get(token);
    if (latency !== undefined) await delay(latency);
    const failure = store.caseFailures.get(token);
    if (failure !== undefined && failure.times > 0) {
      failure.times -= 1;
      return apiError(failure.status, "ERRO_INTERNO");
    }
    if (isUnstableCase(token)) return apiError(500, "ERRO_INTERNO");
    if (!linkFor(slug)) return apiError(404, "LINK_NAO_ENCONTRADO");
    const record = caseFor(slug, token);
    return record
      ? ok(buildPublicCase(record, Date.now()))
      : apiError(404, "CASO_NAO_ENCONTRADO");
  }),

  // D5: seller contact e-mail
  http.put(
    "*/public/v/:slug/cases/:token/contact",
    async ({ params, request }) => {
      const token = String(params.token);
      const input = (await request.json().catch(() => ({}))) as {
        email?: unknown;
      };
      store.contactLog.set(token, {
        requests: (store.contactLog.get(token)?.requests ?? 0) + 1,
        last: input as JsonBodyType,
      });
      const latency = store.contactDelays.get(token);
      if (latency !== undefined) await delay(latency);
      const failure = store.contactFailures.get(token);
      if (failure !== undefined && failure.times > 0) {
        failure.times -= 1;
        return apiError(failure.status, "ERRO_INTERNO");
      }
      const record = caseFor(String(params.slug), token);
      if (!record) return apiError(404, "CASO_NAO_ENCONTRADO");
      const email = typeof input.email === "string" ? input.email.trim() : "";
      if (
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
        email === REJECTED_EMAIL
      ) {
        return apiError(422, "EMAIL_INVALIDO", { field: "email" });
      }
      // F06a: no change once the case is decided.
      const { estado } = buildPublicCase(record, Date.now());
      if (estado === "approved" || estado === "blocked")
        return apiError(409, "CASO_DECIDIDO");
      record.emailMasked = maskEmail(email);
      return noContent();
    },
  ),

  // D6: CORS preflight
  http.options("*/public/v/:slug/cases/:token/documents", ({ request }) => {
    const cors = corsHeaders(request);
    if (!("Access-Control-Allow-Origin" in cors))
      return new HttpResponse(null, { status: 204, headers: cors });
    return new HttpResponse(null, {
      status: 204,
      headers: {
        ...cors,
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Max-Age": "600",
      },
    });
  }),

  // D6: document upload, called from the browser
  http.post(
    "*/public/v/:slug/cases/:token/documents",
    async ({ params, request }) => {
      const headers = corsHeaders(request);
      const record = caseFor(String(params.slug), String(params.token));
      if (!record) return apiError(404, "CASO_NAO_ENCONTRADO", { headers });

      const form = await request.formData();
      const tipo = form.get("tipo");
      const files = form
        .getAll("arquivos")
        .filter((entry): entry is File => entry instanceof File);
      const names = files.map((file) => file.name).join(" ");

      if (names.includes(UPLOAD_MARKERS.networkDrop))
        return HttpResponse.error();
      if (names.includes(UPLOAD_MARKERS.rateLimited)) {
        return apiError(429, "LIMITE_TENTATIVAS", {
          retryAfter: RETRY_AFTER_SECONDS.upload,
          headers,
        });
      }
      const estado = buildPublicCase(record, Date.now()).estado;
      if (
        names.includes(UPLOAD_MARKERS.decided) ||
        estado === "approved" ||
        estado === "blocked"
      ) {
        return apiError(409, "CASO_DECIDIDO", { headers });
      }
      if (names.includes(UPLOAD_MARKERS.fileLimit))
        return apiError(413, "LIMITE_ARQUIVOS", { headers });
      if (names.includes(UPLOAD_MARKERS.tooLarge))
        return apiError(413, "ARQUIVO_GRANDE", { headers });
      if (
        names.includes(UPLOAD_MARKERS.badFormat) ||
        !isDocumentType(tipo) ||
        files.length === 0
      ) {
        return apiError(415, "FORMATO_INVALIDO", { headers });
      }

      // Exactly one PDF, or one or more JPG/PNG; later calls may add photos only.
      const formats = await Promise.all(files.map(fileFormat));
      const pdfs = formats.filter((format) => format === "pdf").length;
      const photos = formats.filter((format) => format === "photo").length;
      const previous = record.uploads.get(tipo);
      const format = pdfs > 0 ? "pdf" : "photos";
      if (
        pdfs + photos !== files.length ||
        pdfs > 1 ||
        (pdfs === 1 && photos > 0) ||
        (previous !== undefined &&
          (previous.format === "pdf" || format === "pdf"))
      ) {
        return apiError(415, "FORMATO_INVALIDO", { headers });
      }

      const caseFiles = [...record.uploads.values()].reduce(
        (total, upload) => total + upload.files,
        0,
      );
      if (caseFiles + files.length > MAX_FILES_PER_CASE)
        return apiError(413, "LIMITE_ARQUIVOS", { headers });

      const bytes =
        (previous?.bytes ?? 0) +
        files.reduce((total, file) => total + file.size, 0);
      if (bytes > MAX_UPLOAD_BYTES)
        return apiError(413, "ARQUIVO_GRANDE", { headers });

      const uploaded = {
        files: (previous?.files ?? 0) + files.length,
        bytes,
        format,
      } as const;
      record.uploads.set(tipo, uploaded);
      return ok({ tipo, documentos_enviados: uploaded.files }, 201, headers);
    },
  ),
];

/** Test controls served only by the HTTP mock API (pnpm mock:api). */
export const mockControlHandlers: RequestHandler[] = [
  http.get("*/__mock/health", () => HttpResponse.json({ ok: true })),
  http.post("*/__mock/reset", () => {
    resetSellerLinkMock();
    return new HttpResponse(null, { status: 204 });
  }),
  http.post("*/__mock/links/:slug/recover", ({ params }) => {
    recoverLink(String(params.slug));
    return new HttpResponse(null, { status: 204 });
  }),
  http.post("*/__mock/links/:slug/cases/:token/recover", ({ params }) => {
    const recovered = recoverCase(String(params.slug), String(params.token));
    return new HttpResponse(null, { status: recovered ? 204 : 404 });
  }),
  http.post("*/__mock/cases", async ({ request }) => {
    const input = (await request.json().catch(() => ({}))) as MockCaseInput;
    try {
      return HttpResponse.json(
        { token: createMockCase(input) },
        { status: 201 },
      );
    } catch {
      return new HttpResponse(null, { status: 400 });
    }
  }),
  http.post("*/__mock/cases/:token/state", async ({ params, request }) => {
    const change = (await request.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    try {
      return new HttpResponse(null, {
        status: setMockCaseState(String(params.token), change) ? 204 : 404,
      });
    } catch {
      return new HttpResponse(null, { status: 400 });
    }
  }),
  http.delete("*/__mock/cases/:token", ({ params }) => {
    deleteMockCase(String(params.token));
    return new HttpResponse(null, { status: 204 });
  }),
  http.post("*/__mock/cases/:token/fail", async ({ params, request }) => {
    const body = (await request.json().catch(() => ({}))) as {
      status?: unknown;
      times?: unknown;
    };
    failCaseReads(
      String(params.token),
      typeof body.status === "number" ? body.status : 500,
      typeof body.times === "number" ? body.times : 1,
    );
    return new HttpResponse(null, { status: 204 });
  }),
  http.post("*/__mock/cases/:token/delay", async ({ params, request }) => {
    const body = (await request.json().catch(() => ({}))) as { ms?: unknown };
    delayCaseReads(
      String(params.token),
      typeof body.ms === "number" ? body.ms : 0,
    );
    return new HttpResponse(null, { status: 204 });
  }),
  http.post(
    "*/__mock/cases/:token/contact/fail",
    async ({ params, request }) => {
      const body = (await request.json().catch(() => ({}))) as {
        status?: unknown;
        times?: unknown;
      };
      failContactSaves(
        String(params.token),
        typeof body.status === "number" ? body.status : 500,
        typeof body.times === "number" ? body.times : 1,
      );
      return new HttpResponse(null, { status: 204 });
    },
  ),
  http.post(
    "*/__mock/cases/:token/contact/delay",
    async ({ params, request }) => {
      const body = (await request.json().catch(() => ({}))) as {
        ms?: unknown;
      };
      delayContactSaves(
        String(params.token),
        typeof body.ms === "number" ? body.ms : 0,
      );
      return new HttpResponse(null, { status: 204 });
    },
  ),
  http.get("*/__mock/cases/:token/contact", ({ params }) =>
    HttpResponse.json(
      store.contactLog.get(String(params.token)) ?? {
        requests: 0,
        last: null,
      },
    ),
  ),
  http.get("*/__mock/cases/:token/reads", ({ params }) =>
    HttpResponse.json({ reads: caseReadCount(String(params.token)) }),
  ),
  http.post("*/__mock/links/:slug/disable", ({ params }) => {
    disableLink(String(params.slug));
    return new HttpResponse(null, { status: 204 });
  }),
  // What D3 received last for this slug: lets E2E assert the URL → page →
  // form → action → D3 leg (AC 12 ref / ext_id; review M1 v1 finding 0002).
  http.get("*/__mock/links/:slug/last-verify", ({ params }) => {
    const body = store.lastVerify.get(String(params.slug));
    return body === undefined
      ? new HttpResponse(null, { status: 404 })
      : HttpResponse.json(body);
  }),
];
