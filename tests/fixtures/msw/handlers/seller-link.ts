import {
  http,
  HttpResponse,
  type JsonBodyType,
  type RequestHandler,
} from "msw";

import {
  CASE_TOKENS,
  DOCUMENT_TYPES,
  ERROR_SENTINEL,
  MAX_UPLOAD_BYTES,
  PUBLIC_LINKS,
  RETRY_AFTER_SECONDS,
  SLUGS,
  UPLOAD_MARKERS,
  buildCompany,
  buildFixedCases,
  buildPublicCase,
  caseKindFor,
  isValidCnpj,
  maskEmail,
  scenarioForCnpj,
  type CaseRecord,
  type DocumentType,
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
};

function createStore(): Store {
  return {
    cases: buildFixedCases(),
    idempotency: new Map(),
    recoveredLinks: new Set(),
  };
}

let store = createStore();

/** Back to the starting state: fixed cases only, no uploads, e-mails or idempotency keys. */
export function resetSellerLinkMock(): void {
  store = createStore();
}

/** S3 → S1: the unstable link starts answering. */
export function recoverLink(slug: string): void {
  store.recoveredLinks.add(slug);
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

const linkFor = (slug: string): (typeof PUBLIC_LINKS)[string] | undefined =>
  PUBLIC_LINKS[slug];

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
  if (responsavel.split(/\s+/).filter(Boolean).length < 2) {
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
  http.get("*/public/v/:slug", ({ params }) => {
    const slug = String(params.slug);
    if (slug === SLUGS.unstable && !store.recoveredLinks.has(slug)) {
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
    const result = startVerification(String(params.slug), input);
    if (key !== null) store.idempotency.set(key, result);
    return send(result);
  }),

  // D4: case state
  http.get("*/public/v/:slug/cases/:token", ({ params }) => {
    const slug = String(params.slug);
    const token = String(params.token);
    if (token === CASE_TOKENS.unstable) return apiError(500, "ERRO_INTERNO");
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
      const record = caseFor(String(params.slug), String(params.token));
      if (!record) return apiError(404, "CASO_NAO_ENCONTRADO");
      const input = (await request.json().catch(() => ({}))) as {
        email?: unknown;
      };
      const email = typeof input.email === "string" ? input.email.trim() : "";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return apiError(422, "EMAIL_INVALIDO", { field: "email" });
      }
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
];
