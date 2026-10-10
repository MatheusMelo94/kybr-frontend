import { z } from "zod";

import { meSchema } from "@/lib/api/schemas/panel/me";

// The account endpoints added in M8 (C-M8-7, C-M8-8; Pre-Contract).

/**
 * A session the API granted: D-A6's 200 (the rotated session, ADR-0009).
 * The cookie is set only from a body that passes this (Security O-F3).
 */
export const sessionGrantSchema = z.object({
  sessao: z.object({
    id: z.string().min(16).max(512),
    expira_em: z.iso.datetime({ offset: true }),
  }),
});

export type SessionGrant = z.infer<typeof sessionGrantSchema>;

/** D-W4 PUT /v1/me answers the D-W1 object. */
export const ownNameResponseSchema = meSchema;
