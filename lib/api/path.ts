import "server-only";

import { SLUG_PATTERN, TOKEN_PATTERN } from "@/lib/link-values";
import {
  CASE_TAB_ESTADOS,
  isBatchId,
  isBatchRowStatus,
  isPanelCursor,
  isPanelId,
  type BatchRowStatus,
  type CaseTabEstado,
} from "@/lib/panel-api-values";

// The only place Kybr API paths and queries are built (threat model F01). Every
// segment must match its contract pattern, and is encoded, before it goes into
// a request that carries the BFF key. Anything else throws, so it never reaches
// fetch.

const CNPJ_PATTERN = /^[0-9A-Z]{12}[0-9]{2}$/; // contract X5 wire format

export function isValidSlug(value: string): boolean {
  return SLUG_PATTERN.test(value);
}

export function isValidToken(value: string): boolean {
  return TOKEN_PATTERN.test(value);
}

/** True for an id the panel may put in a URL or an API path (A-X3). Anything else is a 404 with no API call. */
export function isValidPanelId(value: string): boolean {
  return isPanelId(value);
}

function segment(
  kind: string,
  value: string,
  valid: RegExp | ((value: string) => boolean),
): string {
  const ok = typeof valid === "function" ? valid(value) : valid.test(value);
  if (!ok) throw new Error(`Refused API path segment: invalid ${kind}`);
  return encodeURIComponent(value);
}

const slugSegment = (slug: string): string =>
  segment("slug", slug, SLUG_PATTERN);

/** A validated, encoded panel id for an API path (M5+ builders use it). */
export function panelIdSegment(id: string): string {
  return segment("panel id", id, isPanelId);
}

/** D-B3's query: 25 rows, then the status filter and the cursor, each checked. */
function batchRowsQuery(filter: {
  status?: BatchRowStatus | undefined;
  cursor?: string | undefined;
}): string {
  const query = new URLSearchParams({ limit: "25" });
  if (filter.status !== undefined) {
    if (!isBatchRowStatus(filter.status))
      throw new Error("Refused API query: invalid status");
    query.set("status", filter.status);
  }
  if (filter.cursor !== undefined) {
    if (!isPanelCursor(filter.cursor))
      throw new Error("Refused API query: invalid cursor");
    query.set("cursor", filter.cursor);
  }
  return query.toString();
}

// C-M6-1: an ISO 8601 date-time with an offset or Z (the API's own clock).
const ISO_DATE_TIME =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;

/** D-C1's query: the tab, 1..200 items (C-M6-2), then the cursor, each checked. */
function caseListQuery(filter: {
  estado: CaseTabEstado;
  limit: number;
  cursor?: string | undefined;
}): string {
  if (!(CASE_TAB_ESTADOS as readonly string[]).includes(filter.estado))
    throw new Error("Refused API query: invalid estado");
  if (!Number.isInteger(filter.limit) || filter.limit < 1 || filter.limit > 200)
    throw new Error("Refused API query: invalid limit");
  const query = new URLSearchParams({
    estado: filter.estado,
    limit: String(filter.limit),
  });
  if (filter.cursor !== undefined) {
    if (!isPanelCursor(filter.cursor))
      throw new Error("Refused API query: invalid cursor");
    query.set("cursor", filter.cursor);
  }
  return query.toString();
}

function desdeQuery(desde: string): string {
  if (!ISO_DATE_TIME.test(desde) || Number.isNaN(Date.parse(desde)))
    throw new Error("Refused API query: invalid desde");
  return new URLSearchParams({ estado: "aberto", desde }).toString();
}

const casePath = (id: string): string => `/v1/cases/${panelIdSegment(id)}`;

const batchPath = (id: string): string =>
  `/v1/batches/${segment("batch id", id, isBatchId)}`;

export const apiPaths = {
  /** D1: link info. */
  publicLink: (slug: string): string => `/public/v/${slugSegment(slug)}`,
  /** D2: company autofill, with the canonical CNPJ as the only query parameter. */
  lookup: (slug: string, cnpj: string): string => {
    const query = new URLSearchParams({
      cnpj: segment("CNPJ", cnpj, CNPJ_PATTERN),
    });
    return `/public/v/${slugSegment(slug)}/lookup?${query.toString()}`;
  },
  /** D3: start a verification. */
  verify: (slug: string): string => `/public/v/${slugSegment(slug)}/verify`,
  /** D4: a case's state and seller-facing result. */
  publicCase: (slug: string, token: string): string =>
    `/public/v/${slugSegment(slug)}/cases/${segment("token", token, TOKEN_PATTERN)}`,
  /** D5: the seller's contact e-mail for a case. */
  caseContact: (slug: string, token: string): string =>
    `${apiPaths.publicCase(slug, token)}/contact`,
  /** D6: a case's document upload, which the browser calls (ADR-0004b). */
  caseDocuments: (slug: string, token: string): string =>
    `${apiPaths.publicCase(slug, token)}/documents`,
  /** The panel's API (contract A-X1): everything under /v1/, never /v1/public/. */
  panel: {
    /** D-W1 */
    me: (): string => "/v1/me",
    /** D-W2 */
    categories: (): string => "/v1/categories",
    /** D-W3 */
    workspace: (): string => "/v1/workspace",
    /** D-A1 */
    signup: (): string => "/v1/auth/signup",
    /** D-A2 */
    confirm: (): string => "/v1/auth/confirm",
    /** D-A3 */
    confirmResend: (): string => "/v1/auth/confirm/resend",
    /** D-A4 */
    login: (): string => "/v1/auth/login",
    logout: (): string => "/v1/auth/logout",
    /** D-A5 */
    passwordReset: (): string => "/v1/auth/password-reset",
    passwordResetConfirm: (): string => "/v1/auth/password-reset/confirm",
    /** M5 batches (D-B1–D-B7); every id is checked (A-X3 + C10) first. */
    batches: {
      /** D-B1 */
      start: (): string => "/v1/batches",
      /** D-B6: the newest ten. */
      history: (): string => "/v1/batches?limit=10",
      /** D-B2 */
      get: (id: string): string => batchPath(id),
      /** D-B3 */
      rows: (
        id: string,
        filter: { status?: BatchRowStatus; cursor?: string } = {},
      ): string => `${batchPath(id)}/rows?${batchRowsQuery(filter)}`,
      /** D-B4 */
      csv: (id: string, kind: "result" | "errors"): string =>
        `${batchPath(id)}/${kind === "result" ? "result" : "errors"}.csv`,
      /** D-B5 */
      toQueue: (id: string): string => `${batchPath(id)}/to-queue`,
      monitor: (id: string): string => `${batchPath(id)}/monitor`,
      /** D-B7 */
      resume: (id: string): string => `${batchPath(id)}/resume`,
    },
    /** M6 cases (D-C1–D-C5); every id is checked (A-X3) first. */
    cases: {
      /** D-C1 (+ C-M6-2 limit ≤ 200) */
      list: (filter: {
        estado: CaseTabEstado;
        limit: number;
        cursor?: string;
      }): string => `/v1/cases?${caseListQuery(filter)}`,
      /** C-M6-1: the cases that entered `aberto` after `desde`. */
      newCount: (desde: string): string => `/v1/cases?${desdeQuery(desde)}`,
      /** D-C2 */
      get: (id: string): string => casePath(id),
      /** D-C3 */
      decide: (id: string): string => `${casePath(id)}/decide`,
      /** D-C4 */
      requestDocuments: (id: string): string =>
        `${casePath(id)}/request-documents`,
      /** C-M6-10 item 3: the mint endpoint, if the backend adds it. */
      documentUrl: (id: string, docId: string): string =>
        `${casePath(id)}/documentos/${panelIdSegment(docId)}/url`,
      /** D-C5: keyed by the verification the case names, never the URL. */
      certificate: (verificationId: string): string =>
        `/v1/verifications/${panelIdSegment(verificationId)}/certificate`,
    },
  },
};
