import { z } from "zod";

import { meSchema } from "@/lib/api/schemas/panel/me";
import {
  MAX_SESSION_SECONDS,
  SESSION_CLOCK_SKEW_MS,
  SESSION_TOKEN,
} from "@/lib/session-limits";

// The account endpoints added in M8 (C-M8-7, C-M8-8; Pre-Contract).

/** In the future, and at most 7 days (plus the clock skew) ahead. */
function inSessionWindow(iso: string): boolean {
  const left = Date.parse(iso) - Date.now();
  return left > 0 && left <= MAX_SESSION_SECONDS * 1000 + SESSION_CLOCK_SKEW_MS;
}

/**
 * A session the API granted: the login's, the sign-up confirmation's and
 * D-A6's 200 (the rotated session, ADR-0009). The cookie is set only from a
 * body that passes this (Security O-F3): an id in the cookie charset, an
 * ISO expiry with an offset, in the future, ≤ 7 days ahead.
 */
export const sessionGrantSchema = z.object({
  sessao: z.object({
    id: z.string().regex(SESSION_TOKEN),
    expira_em: z.iso.datetime({ offset: true }).refine(inSessionWindow),
  }),
});

export type SessionGrant = z.infer<typeof sessionGrantSchema>;

/** D-W4 PUT /v1/me answers the D-W1 object. */
export const ownNameResponseSchema = meSchema;
