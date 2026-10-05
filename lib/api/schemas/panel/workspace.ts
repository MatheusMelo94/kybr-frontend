import { z } from "zod";

import { workspaceSchema } from "@/lib/api/schemas/panel/me";

/** D-W2 GET /v1/categories (Pre-Contract). */
export const categoriesSchema = z.array(
  z.object({
    id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
    nome: z.string().max(120),
    descricao: z.string().max(400),
  }),
);

export type Category = z.infer<typeof categoriesSchema>[number];

/** D-W3 PUT /v1/workspace answers the D-W1 workspace object. */
export { workspaceSchema };
