import { DOCUMENTO_TIPOS, type DocumentoTipo } from "@/lib/panel-api-values";

// The Fila's bounds (plan-m6 § 3.2, Security F6).

/** A decide / request-documents call with no result by then is an unknown outcome: re-read, never report done. */
export const DECIDE_TIMEOUT_MS = 15_000;

/** QA-M6-004 (Q4): how long the case an advance landed on ignores pointer activations of its decisions. */
export const ADVANCE_GUARD_MS = 500;

/** Two panes from Tailwind's lg (64rem): matchMedia for the client's choices (D4). */
export const LG_MEDIA = "(min-width: 64rem)";

/** D-C3 / D-C4 nota_vendedor's cap (C-M6-4): the actions' schemas and the dialogs' fields. */
export const NOTA_VENDEDOR_MAX = 280;

/** C-M6-1: the oldest `desde` the new-case poll may send (the API refuses older). */
export const DESDE_MAX_AGE_MS = 7 * 24 * 60 * 60_000;

/**
 * The types Pedir documento offers: /me's documentos_habilitados (C-M6-4),
 * or, until the backend sends it, G10's default four: every type but
 * PROCURACAO (spec J4 "the default four until Regras ships"; P6-008). The
 * action still refuses a disabled type (DOCUMENTO_NAO_HABILITADO).
 */
export function documentosHabilitados(
  fromMe: readonly DocumentoTipo[] | undefined,
): readonly DocumentoTipo[] {
  return fromMe ?? DOCUMENTO_TIPOS.filter((tipo) => tipo !== "PROCURACAO");
}
