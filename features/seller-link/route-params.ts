import "server-only";

import { z } from "zod";

import { isValidSlug, isValidToken } from "@/lib/api/path";

/** `/v/[slug]` params: a slug that fails X3 is a 404 with no API call (plan § 11). */
export const slugParamsSchema = z.object({
  slug: z.string().refine(isValidSlug),
});

/** `/v/[slug]/c/[token]` params: a token that fails X3 is a 404 with no API call. */
export const caseParamsSchema = slugParamsSchema.extend({
  token: z.string().refine(isValidToken),
});
