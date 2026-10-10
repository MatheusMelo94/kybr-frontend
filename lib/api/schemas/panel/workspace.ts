import { z } from "zod";

import { workspaceSchema } from "@/lib/api/schemas/panel/me";
import { CATEGORY_ID_PATTERN } from "@/lib/panel-api-values";

/** D-W2 GET /v1/categories (Pre-Contract). */
export const categoriesSchema = z.array(
  z.object({
    id: z.string().regex(CATEGORY_ID_PATTERN),
    nome: z.string().max(120),
    descricao: z.string().max(400),
  }),
);

export type Category = z.infer<typeof categoriesSchema>[number];

/** D-W3 PUT /v1/workspace answers the D-W1 workspace object. */
export { workspaceSchema };
