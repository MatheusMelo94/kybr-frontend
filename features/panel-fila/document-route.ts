import "server-only";

import { notFound, redirect } from "next/navigation";

import {
  DOCUMENT_FILE_TYPES,
  documentFilename,
  type DocumentExtension,
} from "@/features/panel-fila/document-file";
import { DEFAULT_TIMEOUT_MS } from "@/lib/api/client";
import { AppError } from "@/lib/api/errors";
import { getDocumentUrl } from "@/lib/api/panel/cases";
import { assertPanelHost } from "@/lib/api/panel/host";
import { requireSession, sessionExpiredUrl } from "@/lib/api/panel/session";
import { isAllowedDocumentUrl } from "@/lib/document-url";
import { env, type ServerEnv } from "@/lib/env";
import { reportMarker } from "@/lib/monitoring";
import { isPanelId } from "@/lib/panel-api-values";

/**
 * F4: the attachment stream's cap. Under Vercel's 4.5 MB function response
 * limit (R7), so a larger upload (the seller link takes 10 MB) is a 502 in
 * this mode; DevOps confirms the figure in T116.
 */
export const DOCUMENT_MAX_BYTES = 4 * 1024 * 1024;

const PRIVATE = "private, no-store";

export type DocumentsSettings = {
  mode: "redirect" | "attachment";
  origin: string | undefined;
  allowLoopbackHttp: boolean;
};

/** Q1: the mode defaults to attachment in production until the F3 check passes (T116). */
export function documentsSettings(source: ServerEnv = env): DocumentsSettings {
  const production = source.NODE_ENV === "production";
  return {
    mode:
      source.PANEL_DOCUMENTS_MODE ?? (production ? "attachment" : "redirect"),
    origin: source.PANEL_DOCUMENTS_ORIGIN,
    allowLoopbackHttp: !production || source.API_ALLOW_LOOPBACK_HTTP === "true",
  };
}

/** Any failure past the checks: no detail in the body (P08). */
const badGateway = (): Response =>
  new Response(null, { status: 502, headers: { "Cache-Control": PRIVATE } });

const endsWith = (bytes: Uint8Array, tail: readonly number[]): boolean =>
  bytes.length >= tail.length &&
  tail.every((byte, i) => bytes[bytes.length - tail.length + i] === byte);

const startsWith = (bytes: Uint8Array, head: readonly number[]): boolean =>
  head.every((byte, i) => bytes[i] === byte);

const PDF_EOF = [0x25, 0x25, 0x45, 0x4f, 0x46]; // %%EOF

/**
 * F4: the type from the magic bytes, and a whole file (a PDF's %%EOF in its
 * last kilobyte, JPEG's EOI, PNG's IEND), so a cut-off body is refused too.
 */
export function sniffDocument(
  bytes: Uint8Array,
): DocumentExtension | undefined {
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) {
    const tail = bytes.subarray(Math.max(0, bytes.length - 1024));
    const found = tail.findIndex((_, i) =>
      PDF_EOF.every((byte, j) => tail[i + j] === byte),
    );
    return found === -1 ? undefined : "pdf";
  }
  if (startsWith(bytes, [0xff, 0xd8, 0xff]))
    return endsWith(bytes, [0xff, 0xd9]) ? "jpg" : undefined;
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    return endsWith(bytes, [0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82])
      ? "png"
      : undefined;
  return undefined;
}

/** The whole body, or undefined past the cap (the rest is cancelled). */
async function readCapped(
  response: Response,
): Promise<Uint8Array<ArrayBuffer> | undefined> {
  if (
    Number(response.headers.get("content-length") ?? "0") > DOCUMENT_MAX_BYTES
  )
    return undefined;
  if (response.body === null) return undefined;
  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = response.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > DOCUMENT_MAX_BYTES) {
      void reader.cancel();
      return undefined;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

/**
 * F4: fetched server-side, buffered and checked before any header is sent.
 * Redirects are errors (the allowlist covered this URL, not another one).
 */
async function attachment(
  url: string,
  tipo: Parameters<typeof documentFilename>[0],
): Promise<Response> {
  let bytes: Uint8Array<ArrayBuffer> | undefined;
  try {
    const upstream = await fetch(url, {
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
    });
    if (upstream.status !== 200) {
      void upstream.body?.cancel();
      return badGateway();
    }
    bytes = await readCapped(upstream);
  } catch {
    return badGateway();
  }
  const ext = bytes === undefined ? undefined : sniffDocument(bytes);
  if (bytes === undefined || ext === undefined) return badGateway();
  return new Response(bytes, {
    status: 200,
    headers: {
      "Content-Type": DOCUMENT_FILE_TYPES[ext],
      "Content-Disposition": `attachment; filename="${documentFilename(tipo, ext)}"`,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox; default-src 'none'",
      "Cross-Origin-Resource-Policy": "same-origin",
      "Cache-Control": PRIVATE,
    },
  });
}

/**
 * The documents handler's body (D6, Q1, F1–F4): host -> ids -> session ->
 * a fresh read of the case -> the allowlist -> a 303 to the signed URL, or
 * the F4 attachment. The signed URL never reaches a log or a marker.
 */
export async function documentResponse(
  caseId: string,
  docId: string,
  settings: DocumentsSettings = documentsSettings(),
): Promise<Response> {
  await assertPanelHost();
  if (!isPanelId(caseId) || !isPanelId(docId)) notFound();
  await requireSession();

  let doc: Awaited<ReturnType<typeof getDocumentUrl>>;
  try {
    doc = await getDocumentUrl(caseId, docId);
  } catch (error) {
    if (!(error instanceof AppError)) throw error;
    if (
      error.code === "CASO_NAO_ENCONTRADO" ||
      error.code === "RECURSO_NAO_ENCONTRADO"
    )
      notFound();
    if (error.code === "SESSAO_EXPIRADA") redirect(await sessionExpiredUrl());
    return badGateway();
  }

  if (!isAllowedDocumentUrl(doc.url, settings)) {
    reportMarker("DOCUMENT_ORIGIN_REFUSED", { caseId });
    notFound();
  }

  if (settings.mode === "attachment") return attachment(doc.url, doc.tipo);
  return new Response(null, {
    status: 303,
    headers: {
      Location: doc.url,
      // The panel's own value (middleware sets it on every panel response).
      "Cache-Control": PRIVATE,
      "Referrer-Policy": "no-referrer",
    },
  });
}
