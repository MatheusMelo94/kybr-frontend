import "server-only";

import { z } from "zod";

import { isValidSlug } from "@/lib/api/path";

/** `/v/[slug]` params: a slug that fails X3 is a 404 with no API call (plan § 11). */
export const slugParamsSchema = z.object({
  slug: z.string().refine(isValidSlug),
});
